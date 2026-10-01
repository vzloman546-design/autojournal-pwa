const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

async function clearApp(page){
  await page.goto('./');
  await page.evaluate(async()=>{ const db=await import('./db.js'); await db.clearState(); });
  await page.reload();
}
async function state(page){
  return page.evaluate(async()=>{ const db=await import('./db.js'); return await db.loadState(); });
}
async function addCar(page,{make='Hyundai',model='Sonata',initial='200000',current='210000'}={}){
  await page.locator('[data-action="add-car"]').first().click();
  await page.locator('#make').fill(make);
  await page.locator('#model').fill(model);
  await page.locator('#year').fill('2008');
  await page.locator('#initialOdometer').fill(initial);
  await page.locator('#currentOdometer').fill(current);
  await page.locator('button[form="car-form"]').click();
  await expect(page.locator('.v5-car-title')).toContainText(make);
}
async function openProfile(page){
  await page.locator('[data-action="open-profile"]').click();
  await expect(page.locator('.v5-subbar-title')).toHaveText('Профиль');
}
async function gotoSecondary(page,view){
  await openProfile(page);
  await page.locator('.v5-menu [data-view="'+view+'"]').click();
}
async function closeSheet(page){
  const close=page.locator('.sheet-close');
  if(await close.count()) await close.click();
}
async function chooseVehicleSystem(page,query,key){
  await page.locator('#systemKeySearch').fill(query);
  await expect(page.locator('[data-system-key="'+key+'"]')).toBeVisible();
  await page.locator('[data-system-key="'+key+'"]').click();
  await expect(page.locator('#systemKey')).toHaveValue(key);
}
function isoOffset(days){
  const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}
async function installSyncRelayMock(page){
  await page.evaluate(()=>{
    localStorage.setItem('autojournal-sync-api','https://sync.test');
    const realFetch=window.fetch.bind(window);
    window.__syncMock={sessions:{},vaults:{}};
    window.fetch=async(input,init={})=>{
      const rawUrl=typeof input==='string'?input:input.url;
      if(!String(rawUrl).startsWith('https://sync.test'))return realFetch(input,init);
      const parsedUrl=new URL(rawUrl),method=String(init.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();
      const path=parsedUrl.pathname;
      const headers=new Headers(init.headers||(typeof input!=='string'?input.headers:undefined));
      const auth=headers.get('Authorization')||'';
      const json=(status,value)=>Promise.resolve(new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}));
      const text=(status,value)=>Promise.resolve(new Response(value,{status,headers:{'Content-Type':'text/plain'}}));

      if(path==='/v1/vaults'&&method==='POST'){
        const body=JSON.parse(String(init.body||'{}')),id=body.id;
        const existing=window.__syncMock.vaults[id];
        if(existing&&existing.verifier!==body.verifier)return json(409,{error:'vault_conflict'});
        window.__syncMock.vaults[id]=existing||{id,verifier:body.verifier,revision:0,records:{},authHeaders:[]};
        return json(existing?200:201,{ok:true,id,revision:window.__syncMock.vaults[id].revision,created:!existing});
      }
      const vaultMatch=path.match(/^\/v1\/vaults\/([^/]+)(?:\/(.*))?$/);
      if(vaultMatch){
        const id=vaultMatch[1],tail=vaultMatch[2]||'',v=window.__syncMock.vaults[id];
        if(!v)return json(404,{error:'vault_not_found'});
        if(auth)v.authHeaders.push(auth);
        if(!tail&&method==='GET')return json(200,{id,revision:v.revision});
        if(tail==='records'&&method==='PUT'){
          const body=JSON.parse(String(init.body||'{}'));v.revision++;
          for(const rec of body.records||[]){
            v.records[rec.collection+':'+rec.id]={
              collection:rec.collection,id:rec.id,deleted:Boolean(rec.deleted),iv:rec.iv||null,
              chunks:Array.isArray(rec.chunks)?rec.chunks:[],version:v.revision,deviceId:body.deviceId||''
            };
          }
          return json(200,{ok:true,revision:v.revision,records:(body.records||[]).length});
        }
        if(tail==='changes'&&method==='GET'){
          const since=Number(parsedUrl.searchParams.get('since')||0);
          const records=Object.values(v.records).filter(x=>x.version>since).map(x=>({...x}));
          return json(200,{ok:true,revision:v.revision,records});
        }
        return json(404,{error:'not_found'});
      }

      if(path==='/v1/sessions'&&method==='POST'){
        const body=JSON.parse(String(init.body||'{}')),id=body.id;
        window.__syncMock.sessions[id]={id,status:'waiting',mode:null,chunks:{},pairing:null,totalChunks:null,iv:null,sender:null,authHeaders:[],expiresAt:Date.now()+600000};
        return json(201,{ok:true,expiresAt:Date.now()+600000});
      }
      const match=path.match(/^\/v1\/sessions\/([^/]+)(?:\/(.*))?$/);
      if(!match)return json(404,{error:'not_found'});
      const id=match[1],tail=match[2]||'',s=window.__syncMock.sessions[id];
      if(!s)return json(404,{error:'not_found'});
      if(auth)s.authHeaders.push(auth);
      if(!tail&&method==='GET')return json(200,{id,status:s.status,mode:s.mode,totalChunks:s.totalChunks,iv:s.iv,sender:s.sender,expiresAt:s.expiresAt});
      if(tail==='pairing'&&method==='PUT'){
        const body=JSON.parse(String(init.body||'{}'));s.pairing={payload:body.payload,iv:body.iv};return json(200,{ok:true});
      }
      if(tail==='pairing'&&method==='GET'){
        if(!s.pairing)return json(409,{error:'pairing_not_ready'});
        return json(200,s.pairing);
      }
      if(tail==='request'&&method==='POST'){
        const body=JSON.parse(String(init.body||'{}'));s.mode=body.mode;s.status='requested';
        return json(200,{ok:true,mode:s.mode,status:s.status});
      }
      const chunk=tail.match(/^chunks\/(\d+)$/);
      if(chunk&&method==='PUT'){s.chunks[Number(chunk[1])]=String(init.body||'');s.status='uploading';return json(200,{ok:true});}
      if(chunk&&method==='GET')return text(200,s.chunks[Number(chunk[1])]||'');
      if(tail==='complete'&&method==='POST'){
        const body=JSON.parse(String(init.body||'{}'));s.totalChunks=body.totalChunks;s.iv=body.iv;s.sender=body.sender;s.status='ready';
        return json(200,{ok:true,status:'ready'});
      }
      if(tail==='consume'&&method==='POST'){s.status='consumed';s.chunks={};s.pairing=null;return json(200,{ok:true,status:'consumed'});}
      return json(404,{error:'not_found'});
    };
  });
}

async function addRefuel(page,{date,odometer,amount,liters,station='АЗС',fullTank=false}){
  await page.locator('.v5-tabbar [data-view="refuels"]').click();
  await page.locator('[data-action="add-refuel"]').first().click();
  await page.locator('#date').fill(date);
  await page.locator('#odometer').fill(String(odometer));
  await page.locator('#amount').fill(String(amount));
  await page.locator('#liters').fill(String(liters));
  await page.locator('#station').fill(station);
  if(fullTank)await page.locator('input[name="fullTank"]').check();
  await page.locator('button[form="refuel-form"]').click();
  await expect(page.locator('#refuel-form')).toHaveCount(0);
}

test.beforeEach(async({page})=>{ await clearApp(page); });

test('service entry without mileage syncs one expense through edit and delete', async({page})=>{
  await addCar(page);
  await page.locator('[data-action="add-entry"]').first().first().click();
  await page.locator('#title').fill('Тестовое ТО');
  await expect(page.locator('#odometer')).toHaveValue('');
  await expect(page.locator('#odometer')).toHaveAttribute('placeholder','210000');
  await page.locator('#partsCost').fill('4000');
  await page.locator('#laborCost').fill('1000');
  await chooseVehicleSystem(page,'масло двигателя','engine_oil');
  await page.locator('#lifeKm').fill('40000');
  await page.locator('#inspectKm').fill('10000');
  await page.locator('button[form="entry-form"]').click();

  let s=await state(page);
  expect(s.serviceEntries).toHaveLength(1);
  expect(s.serviceEntries[0].odometer).toBe(0);
  expect(s.expenses.filter(x=>x.linkedServiceId===s.serviceEntries[0].id)).toHaveLength(1);
  expect(s.expenses.find(x=>x.linkedServiceId===s.serviceEntries[0].id).amount).toBe(5000);
  expect(s.components).toHaveLength(1);
  expect(s.components[0].baseInstalledOdometer).toBe(210000);

  await page.locator('.v5-tabbar [data-view="records"]').click();
  await page.locator('[data-action="entry-detail"]',{hasText:'Тестовое ТО'}).click();
  await page.locator('[data-action="edit-entry"]').click();
  await page.locator('#partsCost').fill('4500');
  await page.locator('button[form="entry-form"]').click();
  s=await state(page);
  const linked=s.expenses.filter(x=>x.linkedServiceId===s.serviceEntries[0].id);
  expect(linked).toHaveLength(1);
  expect(linked[0].amount).toBe(5500);

  await page.locator('[data-action="entry-detail"]',{hasText:'Тестовое ТО'}).click();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-action="delete-entry"]').click();
  s=await state(page);
  expect(s.serviceEntries).toHaveLength(0);
  expect(s.expenses.filter(x=>x.linkedServiceId)).toHaveLength(0);
  expect(s.components).toHaveLength(0);
});

test('refuel live math and linked expense remain one-to-one', async({page})=>{
  await addCar(page);
  await page.locator('.v5-tabbar [data-view="refuels"]').click();
  await page.locator('[data-action="add-refuel"]').first().click();
  const amount=page.locator('#amount'), liters=page.locator('#liters'), price=page.locator('#pricePerLiter');

  await amount.fill('3000'); await liters.fill('50');
  await expect(price).toHaveValue('60');
  await expect(page.locator('[data-refuel-calc-status]')).toContainText('Цена за литр рассчитана');

  await amount.fill(''); await liters.fill('50'); await price.fill('60');
  await expect(amount).toHaveValue('3000');

  await liters.fill(''); await amount.fill('3000'); await price.fill('60');
  await expect(liters).toHaveValue('50');

  await page.locator('#station').fill('Лукойл');
  await page.locator('button[form="refuel-form"]').click();
  let s=await state(page);
  expect(s.refuels).toHaveLength(1);
  expect(s.expenses.filter(x=>x.linkedRefuelId===s.refuels[0].id)).toHaveLength(1);

  await page.locator('[data-action="refuel-detail"]').click();
  await page.locator('[data-action="edit-refuel"]').click();
  await page.locator('#amount').fill('3300');
  await page.locator('#liters').fill('50');
  await expect(page.locator('#pricePerLiter')).toHaveValue('66');
  await page.locator('button[form="refuel-form"]').click();
  s=await state(page);
  const linked=s.expenses.filter(x=>x.linkedRefuelId===s.refuels[0].id);
  expect(linked).toHaveLength(1);
  expect(linked[0].amount).toBe(3300);

  await page.locator('[data-action="refuel-detail"]').click();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-action="delete-refuel"]').click();
  s=await state(page);
  expect(s.refuels).toHaveLength(0);
  expect(s.expenses.filter(x=>x.linkedRefuelId)).toHaveLength(0);
});

test('document file, expiry reminder, edit and delete full cycle', async({page})=>{
  await addCar(page);
  await gotoSecondary(page,'documents');
  await page.locator('[data-action="add-document"]').last().click();
  await page.locator('#title').fill('ОСАГО QA');
  await page.locator('#type').fill('Страховка');
  await page.locator('#number').fill('QA-123');
  await page.locator('#issueDate').fill(isoOffset(0));
  await page.locator('#expiryDate').fill(isoOffset(10));
  await page.locator('#remindDays').fill('30');
  await page.locator('#files').setInputFiles({name:'policy.txt',mimeType:'text/plain',buffer:Buffer.from('policy qa')});
  await page.locator('button[form="document-form"]').click();
  await expect(page.locator('#document-form')).toHaveCount(0);

  let s=await state(page);
  expect(s.documents).toHaveLength(1);
  expect(s.documents[0].files).toHaveLength(1);
  expect(s.documents[0].files[0].name).toBe('policy.txt');
  await expect(page.getByText('Скоро истечёт срок')).toBeVisible();

  await page.locator('[data-action="document-detail"]',{hasText:'ОСАГО QA'}).click();
  await expect(page.getByText('QA-123')).toBeVisible();
  await expect(page.getByText('policy.txt')).toBeVisible();
  await page.locator('[data-action="edit-document"]').click();
  await page.locator('#title').fill('ОСАГО QA изменено');
  await page.locator('button[form="document-form"]').click();
  await expect(page.locator('#document-form')).toHaveCount(0);
  await expect(page.getByText('ОСАГО QA изменено',{exact:true})).toBeVisible();

  await page.locator('[data-action="go-back"]').click();
  await page.locator('[data-action="go-back"]').click();
  await page.locator('.v5-tabbar [data-view="notifications"]').click();
  await expect(page.getByText(/Документ: ОСАГО QA изменено/)).toBeVisible();

  await openProfile(page); await page.locator('.v5-menu [data-view="documents"]').click();
  await page.locator('[data-action="document-detail"]',{hasText:'ОСАГО QA изменено'}).click();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-action="delete-document"]').click();
  s=await state(page);
  expect(s.documents).toHaveLength(0);
});

test('maintenance inspect and replace reset independent cycles', async({page})=>{
  await addCar(page);
  await gotoSecondary(page,'parts');
  await page.locator('[data-action="add-component"]').last().click();
  await chooseVehicleSystem(page,'передние колодки','front_brake_pads');
  await page.locator('#installedDate').fill(isoOffset(-30));
  await page.locator('#installedOdometer').fill('200000');
  await page.locator('#lifeKm').fill('40000');
  await page.locator('#lifeMonths').fill('24');
  await page.locator('#inspectKm').fill('10000');
  await page.locator('#inspectMonths').fill('6');
  await page.locator('#warnKm').fill('1500');
  await page.locator('#warnDays').fill('14');
  await page.locator('button[form="component-form"]').click();

  await page.locator('[data-action="component-detail"]',{hasText:'Передние тормозные колодки'}).click();
  await page.locator('[data-action="mark-inspection"]').click();
  let s=await state(page);
  let actions=s.serviceEntries.filter(x=>x.componentAction);
  expect(actions).toHaveLength(1);
  expect(actions[0].componentAction).toBe('inspect');
  const comp=s.components[0];
  expect(comp.baseInstalledOdometer).toBe(200000);

  await page.locator('[data-action="mark-replacement"]').click();
  s=await state(page);
  actions=s.serviceEntries.filter(x=>x.componentAction);
  expect(actions.filter(x=>x.componentAction==='replace')).toHaveLength(1);
  expect(actions.filter(x=>x.componentAction==='inspect')).toHaveLength(1);
  await expect(page.locator('.sheet')).toContainText('через 40 000 км');
  await expect(page.locator('.sheet')).toContainText('через 10 000 км');
  await expect(page.locator('.sheet')).toContainText('210 000 км');
});

test('multiple cars are isolated', async({page})=>{
  await addCar(page,{make:'Hyundai',model:'Sonata',initial:'200000',current:'210000'});
  await page.locator('[data-action="add-entry"]').first().click();
  await page.locator('#title').fill('Только Sonata');
  await page.locator('#partsCost').fill('1000');
  await page.locator('button[form="entry-form"]').click();

  await page.locator('[data-action="car-switch"]').click();
  await page.locator('[data-action="add-car"]').click();
  await page.locator('#make').fill('Ford'); await page.locator('#model').fill('Focus');
  await page.locator('#initialOdometer').fill('50000'); await page.locator('#currentOdometer').fill('53000');
  await page.locator('button[form="car-form"]').click();
  await page.locator('.v5-tabbar [data-view="records"]').click();
  await expect(page.getByText('Только Sonata',{exact:true})).toHaveCount(0);

  await page.locator('[data-action="add-entry"]').first().click();
  await page.locator('#title').fill('Только Focus'); await page.locator('#partsCost').fill('2000');
  await page.locator('button[form="entry-form"]').click();
  await page.locator('[data-action="car-switch"]').click();
  await page.locator('[data-action="activate-car"]',{hasText:'Hyundai Sonata'}).click();
  await page.locator('.v5-tabbar [data-view="records"]').click();
  await expect(page.getByText('Только Sonata',{exact:true})).toBeVisible();
  await expect(page.getByText('Только Focus',{exact:true})).toHaveCount(0);
});

test('statistics categories and periods render without cross-period leakage', async({page})=>{
  await addCar(page);
  const seed=await state(page);
  const carId=seed.cars[0].id;
  seed.odometerLogs.push(
    {id:'old-odo',carId,date:'2026-01-01',value:200000,note:'',sourceType:'manual',sourceId:'old'},
    {id:'now-odo',carId,date:isoOffset(0),value:210000,note:'',sourceType:'manual',sourceId:'now'}
  );
  seed.expenses.push(
    {id:'old-exp',carId,date:'2026-01-05',odometer:0,category:'Ремонт',amount:9999,description:'Старый расход',note:'',linkedServiceId:'',linkedRefuelId:''},
    {id:'now-exp',carId,date:isoOffset(0),odometer:0,category:'Мойка',amount:777,description:'Новый расход',note:'',linkedServiceId:'',linkedRefuelId:''}
  );
  await page.evaluate(async data=>{const db=await import('./db.js');await db.saveState(data);},seed);
  await page.reload();

  await page.locator('button.v5-stats-card').click();
  await expect(page.locator('[data-input="analytics-period"]')).toBeVisible();
  for(const v of ['mileage','expenses','refuels']){
    await page.locator('[data-action="analytics-tab"][data-value="'+v+'"]').click();
  }
  await page.locator('[data-action="analytics-tab"][data-value="expenses"]').click();
  await page.locator('[data-input="analytics-period"]').selectOption('all');
  await expect(page.locator('.v5-main')).toContainText('10 776');
  await page.locator('[data-input="analytics-period"]').selectOption('month');
  await expect(page.locator('.v5-main')).toContainText('777');
  await expect(page.locator('.v5-main')).not.toContainText('10 776');
});

test('backup roundtrip and calendar export', async({page})=>{
  await addCar(page);
  await page.locator('[data-action="add-entry"]').first().click();
  await page.locator('#title').fill('Backup marker');
  await chooseVehicleSystem(page,'масло двигателя','engine_oil');
  await page.locator('#lifeMonths').fill('12');
  await page.locator('#warnDays').fill('30');
  await page.locator('button[form="entry-form"]').click();
  const original=await state(page);

  await openProfile(page); await page.locator('.v5-menu [data-view="more"]').click();
  const [backup]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="backup-export"]').click()]);
  const backupPath=await backup.path();
  expect(backupPath).toBeTruthy();
  const backupText=await fs.readFile(backupPath,'utf8');
  const parsed=JSON.parse(backupText);
  expect(parsed.cars).toHaveLength(1);
  expect(parsed.serviceEntries.some(x=>x.title==='Backup marker')).toBe(true);

  const [cal]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="calendar-export"]').click()]);
  const calPath=await cal.path();
  const ics=await fs.readFile(calPath,'utf8');
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('BEGIN:VALARM');

  await page.evaluate(async()=>{const db=await import('./db.js');await db.clearState();});
  await page.reload();
  await openProfile(page); await page.locator('.v5-menu [data-view="more"]').click();
  page.once('dialog',d=>d.accept());
  await page.locator('#backup-input').setInputFiles(backupPath);
  await expect(page.locator('.v5-car-title')).toContainText('Hyundai');
  const restored=await state(page);
  expect(restored.cars).toHaveLength(original.cars.length);
  expect(restored.serviceEntries.some(x=>x.title==='Backup marker')).toBe(true);
});

test('secondary screens hide bottom nav and no horizontal overflow at mobile widths', async({page})=>{
  await addCar(page);
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('[data-action="open-profile"]').click();
    await expect(page.locator('.v5-tabbar')).toHaveCount(0);
    for(const view of ['analytics','documents','parts','more']){
      await page.locator('[data-view="'+view+'"]').click();
      await expect(page.locator('.v5-tabbar')).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.locator('[data-action="go-back"]').click();
    }
    await page.locator('[data-action="go-back"]').click();
    await expect(page.locator('.v5-tabbar')).toBeVisible();
  }
});

test('notifications surface maintenance/document/backup states', async({page})=>{
  await addCar(page);
  const s=await state(page),carId=s.cars[0].id;
  s.components.push({id:'cmp',carId,name:'Ремень QA',category:'Двигатель',brand:'',partNumber:'',baseInstalledDate:isoOffset(-400),baseInstalledOdometer:190000,installedDate:isoOffset(-400),installedOdometer:190000,lifeKm:10000,lifeMonths:12,inspectKm:0,inspectMonths:0,warnKm:1000,warnDays:30,cost:0,notes:'',sourceEntryId:'',lastInspectionDate:isoOffset(-400),lastInspectionOdometer:190000});
  s.documents.push({id:'doc',carId,title:'ОСАГО уведомление',type:'Страховка',number:'',issueDate:isoOffset(-30),expiryDate:isoOffset(5),remindDays:30,files:[]});
  await page.evaluate(async data=>{const db=await import('./db.js');await db.saveState(data);},s);
  await page.reload();
  await page.locator('.v5-tabbar [data-view="notifications"]').click();
  await expect(page.getByText(/Ремень QA/)).toBeVisible();
  await expect(page.getByText(/ОСАГО уведомление/)).toBeVisible();
  await page.locator('[data-action="notif-tab"][data-value="app"]').click();
  await expect(page.getByText(/резервную копию/i)).toBeVisible();
});


test('iPhone-like layout handles long content, themes and safe-area inputs', async({page,context,browserName})=>{
  await addCar(page,{make:'Mercedes-Benz',model:'C-Class Очень длинное название автомобиля',initial:'9000000',current:'9999999'});
  await page.setViewportSize({width:320,height:568});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.v5-car-title')).toBeVisible();

  await page.locator('[data-action="add-entry"]').first().click();
  const fontSizes=await page.locator('.sheet input,.sheet textarea,.sheet select').evaluateAll(nodes=>nodes.map(n=>parseFloat(getComputedStyle(n).fontSize)||0));
  expect(fontSizes.every(v=>v>=16)).toBe(true);
  await page.locator('.sheet-close').click();

  await openProfile(page);
  await page.locator('.v5-menu [data-view="more"]').click();
  await page.locator('[data-input="theme"]').selectOption('dark');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.getAttribute('data-theme'))).toBe('dark');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

  const edge=await page.evaluate(()=>({
    shield:getComputedStyle(document.querySelector('#ios-edge-shield')).position,
    shieldHeight:document.querySelector('#ios-edge-shield').getBoundingClientRect().height,
    bodyAfter:getComputedStyle(document.body,'::after').display,
    htmlBg:getComputedStyle(document.documentElement).backgroundColor,
    bodyBg:getComputedStyle(document.body).backgroundColor
  }));
  expect(edge.shield).toBe('fixed');
  expect(edge.shieldHeight).toBeGreaterThanOrEqual(6);
  expect(edge.bodyAfter).toBe('none');
  expect(edge.htmlBg).toBe(edge.bodyBg);

  if(browserName==='chromium'){
    await page.locator('[data-action="go-back"]').click();
    await page.locator('[data-action="go-back"]').click();
    await expect(page.locator('.v5-tab-wrap')).toBeVisible();
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:47,bottom:34,left:0,right:0}});
    const metrics=await page.locator('.v5-tab-wrap').evaluate(el=>({bottom:el.getBoundingClientRect().bottom,height:innerHeight}));
    expect(Math.abs(metrics.bottom-metrics.height)).toBeLessThan(1);
  }
});


test('fuel journal calculates full-tank consumption with partial fills', async({page})=>{
  await addCar(page,{initial:'100000',current:'100700'});
  await addRefuel(page,{date:isoOffset(-2),odometer:100000,amount:3000,liters:50,station:'Лукойл',fullTank:true});
  await addRefuel(page,{date:isoOffset(-1),odometer:100300,amount:1800,liters:30,station:'Роснефть',fullTank:false});
  await addRefuel(page,{date:isoOffset(0),odometer:100700,amount:2100,liters:35,station:'Лукойл',fullTank:true});

  await page.locator('.v5-tabbar [data-view="refuels"]').click();
  await expect(page.locator('.v5-main')).toContainText('9,29 л/100 км');
  await expect(page.locator('.v5-main')).toContainText('557 ₽/100 км');
  await expect(page.locator('.v5-main')).toContainText('60 ₽/л');
  await expect(page.locator('.v5-main')).toContainText('Любимая АЗС');
  await expect(page.locator('.v5-main')).toContainText('Лукойл');
  await expect(page.locator('.v5-main')).toContainText('2 100 ₽');
  await expect(page.locator('.v5-main')).toContainText('3 000 ₽');

  const rows=page.locator('[data-action="refuel-detail"]');
  await rows.first().click();
  await expect(page.locator('.sheet')).toContainText('Расход от предыдущего полного бака');
  await expect(page.locator('.sheet')).toContainText('9,29 л/100 км');
  await closeSheet(page);

  await openProfile(page);
  await page.locator('.v5-menu [data-view="analytics"]').click();
  await page.locator('[data-action="analytics-tab"][data-value="refuels"]').click();
  await page.locator('[data-input="analytics-period"]').selectOption('all');
  await expect(page.locator('.v5-main')).toContainText('9,29 л/100 км');
  await expect(page.locator('.v5-main')).toContainText('557 ₽/100 км');
});

test('service record links to standard node and early replacement resets existing resource', async({page})=>{
  await addCar(page,{initial:'100000',current:'109000'});
  await openProfile(page);
  await page.locator('.v5-menu [data-view="parts"]').click();
  await page.locator('[data-action="add-component"]').last().click();
  await expect(page.locator('#systemKey optgroup')).toHaveCount(25);
  expect(await page.locator('#systemKey option').count()).toBeGreaterThan(180);
  await page.locator('#systemKeySearch').fill('свеч');
  await expect(page.locator('[data-system-combobox-list]')).toBeVisible();
  await expect(page.locator('[data-system-key="spark_plugs"]')).toContainText('Свечи зажигания');
  expect(await page.locator('.v5-combobox-option').count()).toBeLessThan(12);
  await page.locator('[data-system-key="spark_plugs"]').click();
  await expect(page.locator('#systemKey')).toHaveValue('spark_plugs');
  await expect(page.locator('#systemKeySearch')).toHaveValue('Свечи зажигания');
  await expect(page.locator('[data-system-combobox-list]')).toBeHidden();
  await page.locator('#installedOdometer').fill('100000');
  await page.locator('#lifeKm').fill('10000');
  await page.locator('button[form="component-form"]').click();
  await expect(page.locator('#component-form')).toHaveCount(0);

  let s=await state(page);
  expect(s.components).toHaveLength(1);
  expect(s.components[0].systemKey).toBe('spark_plugs');
  expect(s.components[0].lifeKm).toBe(10000);

  await page.locator('[data-action="go-back"]').click();
  await page.locator('[data-action="go-back"]').click();
  await page.locator('[data-action="add-entry"]').first().click();
  await page.locator('#title').fill('Ранняя замена свечей');
  await page.locator('#systemKeySearch').fill('свечи');
  await expect(page.locator('[data-system-key="spark_plugs"]')).toBeVisible();
  await page.locator('[data-system-key="spark_plugs"]').click();
  await expect(page.locator('#systemKey')).toHaveValue('spark_plugs');
  await page.locator('#componentActionChoice').selectOption('replace');
  await expect(page.locator('#system-link-hint')).toContainText('уже отслеживается');
  await expect(page.locator('#lifeKm')).toHaveValue('10000');
  // Simulate a user not re-entering/reconfirming the existing interval in the replacement record.
  await page.locator('#lifeKm').fill('');
  await page.locator('button[form="entry-form"]').click();
  await expect(page.locator('#entry-form')).toHaveCount(0);

  s=await state(page);
  expect(s.components).toHaveLength(1);
  const entry=s.serviceEntries.find(x=>x.title==='Ранняя замена свечей');
  expect(entry.systemKey).toBe('spark_plugs');
  expect(entry.componentId).toBe(s.components[0].id);
  expect(entry.componentAction).toBe('replace');
  expect(entry.odometer).toBe(0);
  expect(entry.componentEventOdometer).toBe(109000);
  expect(s.components[0].lifeKm).toBe(10000);

  await openProfile(page);
  await page.locator('.v5-menu [data-view="parts"]').click();
  await page.locator('[data-action="component-detail"]',{hasText:'Свечи зажигания'}).click();
  await expect(page.locator('.sheet')).toContainText('109 000 км');
  await expect(page.locator('.sheet')).toContainText('через 10 000 км');
});

test('expanded passport stores spark plug tank and detailed technical data', async({page})=>{
  await addCar(page);
  await page.locator('[data-action="car-switch"]').click();
  await page.locator('[data-action="edit-current-car"]').click();

  await page.locator('.v5-spec-editor summary',{hasText:'Свечи и зажигание'}).click();
  await page.locator('#spec__sparkPlugModel').fill('Denso IK16TT');
  await page.locator('#spec__sparkPlugThread').fill('M14x1.25');
  await page.locator('#spec__sparkPlugHexMm').fill('16');
  await page.locator('#spec__sparkPlugGapMm').fill('1.1');
  await page.locator('#spec__sparkPlugTorqueNm').fill('25');

  await page.locator('.v5-spec-editor summary',{hasText:'Топливная система'}).click();
  await page.locator('#spec__fuelTankCapacityL').fill('65');
  await page.locator('#spec__recommendedOctane').fill('95');

  await page.locator('.v5-spec-editor summary',{hasText:'Моторное масло и фильтры'}).click();
  await page.locator('#engineOil').fill('5W-40');
  await page.locator('#spec__engineOilSpec').fill('ACEA A3/B4');
  await page.locator('#engineOilVolume').fill('4.0');
  await page.locator('#spec__oilDrainPlugTorqueNm').fill('35');

  await page.locator('.v5-spec-editor summary',{hasText:'Колёса и шины'}).click();
  await page.locator('#spec__pcd').fill('5x114.3');
  await page.locator('#spec__wheelBoltThread').fill('M12x1.5');
  await page.locator('#spec__wheelTorqueNm').fill('110');

  await page.locator('button[form="car-form"]').click();
  await expect(page.locator('#car-form')).toHaveCount(0);

  const s=await state(page),c=s.cars[0];
  expect(c.specs.sparkPlugThread).toBe('M14x1.25');
  expect(c.specs.fuelTankCapacityL).toBe('65');
  expect(c.specs.engineOilSpec).toBe('ACEA A3/B4');
  expect(c.specs.wheelBoltThread).toBe('M12x1.5');

  await openProfile(page);
  await page.locator('.v5-menu [data-view="carcard"]').click();
  for(const text of ['Denso IK16TT','M14x1.25','Размер ключа свечи, мм','65','ACEA A3/B4','5x114.3','M12x1.5','110']){
    await expect(page.locator('.v5-main')).toContainText(text);
  }
});

test('vehicle passport stores photo and technical specifications', async({page})=>{
  await addCar(page);
  await page.locator('[data-action="car-switch"]').click();
  await page.locator('[data-action="edit-current-car"]').click();
  await page.locator('#trim').fill('Style');
  await page.locator('.v5-spec-editor summary',{hasText:'Двигатель'}).click();
  await page.locator('#engineVolume').fill('2.0');
  await page.locator('#powerHp').fill('137');
  await page.locator('.v5-spec-editor summary',{hasText:'Трансмиссия'}).click();
  await page.locator('#transmission').selectOption('МКПП');
  await page.locator('.v5-spec-editor summary',{hasText:'Топливная система'}).click();
  await page.locator('#fuelType').selectOption('АИ-95');
  await page.locator('.v5-spec-editor summary',{hasText:'Колёса и шины'}).click();
  await page.locator('#tireSize').fill('205/60 R16');
  await page.locator('.v5-spec-editor summary',{hasText:'Моторное масло и фильтры'}).click();
  await page.locator('#engineOil').fill('5W-40');
  await page.locator('#engineOilVolume').fill('4.0');
  await page.locator('.v5-spec-editor summary',{hasText:'Охлаждение'}).click();
  await page.locator('#coolantVolume').fill('7.0');
  await page.locator('#transmissionOilVolume').fill('2.0');
  await page.locator('.v5-spec-editor summary',{hasText:'Тормозная система'}).click();
  await page.locator('#brakeFluidVolume').fill('0.8');
  await page.locator('.v5-spec-editor summary',{hasText:'Рулевое управление'}).click();
  await page.locator('#steeringFluidVolume').fill('1.0');
  await page.locator('textarea[name="customSpecs"]').fill('Клиренс: 155 мм\nАккумулятор: 60 А·ч');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  await page.locator('#carPhoto').setInputFiles({name:'car.png',mimeType:'image/png',buffer:png});
  await page.locator('button[form="car-form"]').click();
  await expect(page.locator('#car-form')).toHaveCount(0);

  const s=await state(page),c=s.cars[0];
  expect(c.trim).toBe('Style');
  expect(c.powerHp).toBe(137);
  expect(c.transmission).toBe('МКПП');
  expect(c.fuelType).toBe('АИ-95');
  expect(c.photo).toMatch(/^data:image\//);

  await openProfile(page);
  await page.locator('.v5-menu [data-view="carcard"]').click();
  await expect(page.locator('.v5-subbar-title')).toHaveText('Паспорт автомобиля');
  await expect(page.locator('.v5-car-passport-hero img')).toBeVisible();
  const actionLayout=await page.locator('.v5-passport-action').first().evaluate(el=>({
    display:getComputedStyle(el).display,
    align:getComputedStyle(el).alignItems,
    justify:getComputedStyle(el).justifyContent,
    icon:el.querySelector('.v5-passport-action-icon')?.getBoundingClientRect(),
    label:el.querySelector('.v5-passport-action-label')?.getBoundingClientRect()
  }));
  expect(actionLayout.display).toBe('flex');
  expect(actionLayout.align).toBe('center');
  expect(actionLayout.justify).toBe('center');
  expect(Math.abs((actionLayout.icon.y+actionLayout.icon.height/2)-(actionLayout.label.y+actionLayout.label.height/2))).toBeLessThan(2);
  for(const text of ['Style','Мощность, л.с.','137','МКПП','АИ-95','205/60 R16','5W-40','Клиренс','155 мм','Аккумулятор','60 А·ч']){
    await expect(page.locator('.v5-main')).toContainText(text);
  }
  await expect(page.locator('.v5-tabbar')).toHaveCount(0);
});

test('vehicle passport fallback is a recognizable dedicated car silhouette', async({page})=>{
  await addCar(page);
  await openProfile(page);
  await page.locator('.v5-menu [data-view="carcard"]').click();
  await expect(page.locator('.v5-car-passport-placeholder .v5-car-silhouette')).toBeVisible();
  await expect(page.locator('.v5-car-passport-placeholder')).toContainText('Нет фото автомобиля');
  const box=await page.locator('.v5-car-silhouette').boundingBox();
  expect(box.width).toBeGreaterThan(80);
  expect(box.width).toBeGreaterThan(box.height);
});

test('short and full vehicle reports render and download a real PDF file', async({page})=>{
  await addCar(page);
  await page.locator('[data-action="add-entry"]').first().click();
  await page.locator('#title').fill('Замена масла для отчёта');
  await page.locator('#partsCost').fill('3000');
  await page.locator('#laborCost').fill('1000');
  await page.locator('button[form="entry-form"]').click();

  await page.evaluate(()=>{window.print=()=>{window.__unexpectedSystemPrint=true;};});
  await openProfile(page);
  await page.locator('.v5-menu [data-view="report"]').click();
  await expect(page.locator('.v5-subbar-title')).toHaveText('Отчёт автомобиля');
  await expect(page.locator('.v5-report-paper')).toContainText('Паспорт автомобиля');
  await expect(page.locator('.v5-report-paper')).toContainText('Сводка эксплуатации');
  await expect(page.locator('.v5-report-paper')).not.toContainText('История обслуживания');

  await page.locator('[data-action="report-mode"][data-value="full"]').click();
  await expect(page.locator('.v5-report-paper')).toContainText('История обслуживания');
  await expect(page.locator('.v5-report-paper')).toContainText('Замены деталей');
  await expect(page.locator('.v5-report-paper')).toContainText('Замена масла для отчёта');
  await expect(page.locator('.v5-report-paper')).toContainText('Расходы');
  await expect(page.locator('.v5-report-paper')).toContainText('Заправки');

  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="print-report"]').click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^AutoJournal-.*\.pdf$/);
  const pdfPath=await download.path();
  expect(pdfPath).toBeTruthy();
  const pdf=await fs.readFile(pdfPath);
  expect(pdf.subarray(0,5).toString('ascii')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(10000);
  expect(await page.evaluate(()=>window.__unexpectedSystemPrint===true)).toBe(false);
  await expect(page.locator('.v5-tabbar')).toHaveCount(0);
});

test('iPhone standalone PDF prepares a native shareable PDF file', async({page,browserName})=>{
  test.skip(browserName!=='webkit','Standalone iPhone share path is WebKit-specific.');
  await addCar(page);
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true});
    navigator.canShare=data=>Array.isArray(data?.files)&&data.files[0]?.type==='application/pdf';
    navigator.share=async data=>{
      const file=data.files[0];
      window.__sharedPdf={name:file.name,type:file.type,size:file.size};
    };
  });
  await openProfile(page);
  await page.locator('.v5-menu [data-view="report"]').click();
  await page.locator('[data-action="print-report"]').click();
  await expect(page.locator('.sheet')).toContainText('PDF готов');
  await expect(page.locator('[data-action="share-ready-pdf"]')).toBeVisible();
  await page.locator('[data-action="share-ready-pdf"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__sharedPdf?.type)).toBe('application/pdf');
  const shared=await page.evaluate(()=>window.__sharedPdf);
  expect(shared.name).toMatch(/^AutoJournal-.*\.pdf$/);
  expect(shared.size).toBeGreaterThan(10000);
});

test.describe('offline PWA',()=>{
  test.use({serviceWorkers:'allow'});
  test('cached shell and IndexedDB remain usable offline',async({page,context,browserName})=>{
    test.skip(browserName==='webkit','Offline browser-context emulation is unreliable in Playwright WebKit.');
    await addCar(page);
    await page.evaluate(async()=>{
      await navigator.serviceWorker.ready;
      if(navigator.serviceWorker.controller)return;
      await new Promise(resolve=>{
        const timer=setTimeout(resolve,3000);
        navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});
      });
    });
    if(!await page.evaluate(()=>!!navigator.serviceWorker.controller))await page.reload();
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:10000}).toBe(true);
    await expect.poll(()=>page.evaluate(()=>caches.keys())).toContain('autojournal-v5.10.1');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.v5-car-title')).toContainText('Hyundai');
    await page.locator('[data-action="add-odometer"]').click();
    await page.locator('#value').fill('211000');
    await page.locator('button[form="odometer-form"]').click();
    await expect(page.locator('.v5-mileage-card')).toContainText('211 000');
    await page.reload();
    await expect(page.locator('.v5-mileage-card')).toContainText('211 000');
    await context.setOffline(false);
  });
});


test('QR transfer exposes directional modes and generates one-time QR session', async({page})=>{
  await installSyncRelayMock(page);
  await openProfile(page);
  await page.locator('.v5-menu [data-view="more"]').click();
  await page.locator('[data-action="sync-open"]').click();
  await expect(page.locator('.sheet')).toContainText('Передача данных');
  await expect(page.locator('.sheet')).toContainText('Получение данных');
  await page.locator('[data-action="sync-scan-push"]').click();
  await expect(page.locator('.sheet')).toContainText('Передача данных');
  await expect(page.locator('[data-action="sync-camera-start"]')).toBeVisible();
  await page.locator('[data-action="close-sheet"]').last().click();

  await page.locator('[data-action="sync-open"]').click();
  await page.locator('[data-action="sync-show-qr"]').click();
  await expect(page.locator('[data-sync-qr] svg')).toBeVisible();
  await expect(page.locator('[data-sync-status]')).toContainText('Ждём сканирования');
  const sessions=await page.evaluate(()=>Object.values(window.__syncMock.sessions));
  expect(sessions).toHaveLength(1);
  expect(sessions[0].id.length).toBeGreaterThan(20);
});

test('QR relay payload is encrypted and relay auth is not the QR encryption secret', async({page})=>{
  await installSyncRelayMock(page);
  const result=await page.evaluate(async()=>{
    const sync=await import(new URL('./sync.js',location.href).href);
    const pair=await sync.createSyncSession();
    await sync.requestSyncMode(pair,'push');
    const sample={version:7,cars:[{id:'car-secret',make:'SecretMake',model:'SecretModel'}],serviceEntries:[],components:[],expenses:[],documents:[],refuels:[],odometerLogs:[],settings:{theme:'system'},nextSeq:1,activeCarId:'car-secret'};
    await sync.uploadSyncState(pair,sample,'scanner');
    const envelope=await sync.downloadSyncState(pair);
    const relay=window.__syncMock.sessions[pair.id];
    return {secret:pair.secret,state:envelope.state,authHeaders:relay.authHeaders,ciphertext:Object.keys(relay.chunks).sort((a,b)=>Number(a)-Number(b)).map(k=>relay.chunks[k]).join('')};
  });
  expect(result.state.cars[0].make).toBe('SecretMake');
  expect(result.authHeaders.length).toBeGreaterThan(0);
  expect(result.authHeaders).not.toContain(`Bearer ${result.secret}`);
  expect(result.ciphertext).not.toContain('SecretMake');
  expect(result.ciphertext).not.toContain('SecretModel');
});


test('persistent vault auto-sync pushes local changes and pulls remote changes', async({page})=>{
  await installSyncRelayMock(page);
  await addCar(page);
  const linked=await page.evaluate(async()=>{
    const sync=await import(new URL('./sync.js',location.href).href);
    const vault=sync.createSyncVaultLink();
    await sync.registerSyncVault(vault);
    await sync.adoptSyncVault(vault);
    window.__qaVault={id:vault.id,secret:vault.secret,api:vault.api};
    return {id:vault.id};
  });
  expect(linked.id.length).toBeGreaterThan(20);

  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>page.evaluate(()=>{
    const v=Object.values(window.__syncMock.vaults)[0];
    return Object.keys(v?.records||{}).some(k=>k.startsWith('cars:'));
  }),{timeout:10000}).toBe(true);

  await page.locator('[data-action="add-odometer"]').click();
  await page.locator('#value').fill('211234');
  await page.locator('button[form="odometer-form"]').click();
  await expect.poll(()=>page.evaluate(()=>{
    const v=Object.values(window.__syncMock.vaults)[0];
    return Object.keys(v?.records||{}).some(k=>k.startsWith('odometerLogs:'));
  }),{timeout:10000}).toBe(true);

  await gotoSecondary(page,'documents');
  await page.locator('[data-action="add-document"]').last().click();
  await page.locator('#title').fill('Документ для автосинхронизации');
  await page.locator('#type').fill('Прочее');
  await page.locator('#number').fill('SYNC-DOC-1');
  await page.locator('#files').setInputFiles({name:'sync-note.txt',mimeType:'text/plain',buffer:Buffer.from('persistent sync document attachment')});
  await page.locator('button[form="document-form"]').click();
  await expect.poll(()=>page.evaluate(()=>{
    const v=Object.values(window.__syncMock.vaults)[0];
    return Object.keys(v?.records||{}).some(k=>k.startsWith('documents:'));
  }),{timeout:10000}).toBe(true);

  const carId=(await state(page)).cars[0].id;
  await page.evaluate(async carId=>{
    const sync=await import(new URL('./sync.js',location.href).href);
    const base=window.__qaVault;
    const remote={...base,deviceId:'remote-device',lastRevision:0,shadow:{}};
    const entry={
      id:'remote-service-entry',carId,date:new Date().toISOString().slice(0,10),odometer:211234,
      type:'maintenance',title:'Запись с другого устройства',category:'',faultKey:'',workText:'',
      partsText:'',partsCost:0,laborCost:0,otherCost:0,systemKey:'',componentId:'',
      componentAction:'',componentEventOdometer:211234,notes:'',photos:[],createdAt:new Date().toISOString(),seq:999
    };
    const hash=await sync.hashSyncData(entry);
    await sync.pushVaultChanges(remote,[{collection:'serviceEntries',id:entry.id,data:entry,hash,deleted:false}]);
  },carId);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(async()=>{
    const s=await state(page);
    return s.serviceEntries.some(x=>x.id==='remote-service-entry'&&x.title==='Запись с другого устройства');
  },{timeout:10000}).toBe(true);

  await page.locator('[data-action="go-back"]').click();
  await expect(page.locator('.v5-subbar-title')).toHaveText('Профиль');
  await page.locator('.v5-menu [data-view="more"]').click();
  await page.locator('[data-action="sync-open"]').click();
  await expect(page.locator('.sheet')).toContainText('Автосинхронизация включена');
});
