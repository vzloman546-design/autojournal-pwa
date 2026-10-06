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
  if(view==='parts'){
    await page.locator('[data-action="go-back"]').click();
    await page.locator('.v5-quick-card[data-view="parts"]').click();
    return;
  }
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

async function installSharedVaultRelay(context,vaults={}){
  if(!Object.prototype.hasOwnProperty.call(vaults,'__sessions'))Object.defineProperty(vaults,'__sessions',{value:{},enumerable:false,writable:true});
  const sessions=vaults.__sessions;
  await context.route('**/__sync_test__/**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method().toUpperCase(),path=url.pathname.replace(/^\/__sync_test__/,'');
    const json=(status,value)=>route.fulfill({status,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
    const text=(status,value)=>route.fulfill({status,headers:{'Content-Type':'text/plain'},body:String(value||'')});
    if(method==='OPTIONS')return route.fulfill({status:204,body:''});
    if(path==='/v1/sessions'&&method==='POST'){
      const body=JSON.parse(req.postData()||'{}'),id=body.id;
      sessions[id]={id,status:'waiting',mode:null,chunks:{},pairing:null,totalChunks:null,iv:null,sender:null,expiresAt:Date.now()+600000};
      return json(201,{ok:true,expiresAt:sessions[id].expiresAt});
    }
    const sessionMatch=path.match(/^\/v1\/sessions\/([^/]+)(?:\/(.*))?$/);
    if(sessionMatch){
      const id=sessionMatch[1],tail=sessionMatch[2]||'',item=sessions[id];
      if(!item)return json(404,{error:'session_not_found'});
      if(!tail&&method==='GET')return json(200,{id,status:item.status,mode:item.mode,totalChunks:item.totalChunks,iv:item.iv,sender:item.sender,expiresAt:item.expiresAt});
      if(tail==='pairing'&&method==='PUT'){const body=JSON.parse(req.postData()||'{}');item.pairing={payload:body.payload,iv:body.iv};return json(200,{ok:true});}
      if(tail==='pairing'&&method==='GET'){if(!item.pairing)return json(409,{error:'pairing_not_ready'});return json(200,item.pairing);}
      if(tail==='request'&&method==='POST'){const body=JSON.parse(req.postData()||'{}');item.mode=body.mode;item.status='requested';return json(200,{ok:true,mode:item.mode,status:item.status});}
      const chunk=tail.match(/^chunks\/(\d+)$/);
      if(chunk&&method==='PUT'){item.chunks[Number(chunk[1])]=req.postData()||'';item.status='uploading';return json(200,{ok:true});}
      if(chunk&&method==='GET')return text(200,item.chunks[Number(chunk[1])]||'');
      if(tail==='complete'&&method==='POST'){const body=JSON.parse(req.postData()||'{}');item.totalChunks=body.totalChunks;item.iv=body.iv;item.sender=body.sender;item.status='ready';return json(200,{ok:true,status:'ready'});}
      if(tail==='consume'&&method==='POST'){item.status='consumed';item.chunks={};item.pairing=null;return json(200,{ok:true,status:'consumed'});}
      return json(404,{error:'not_found'});
    }
    if(path==='/v1/vaults'&&method==='POST'){
      const body=JSON.parse(req.postData()||'{}'),id=body.id,existing=vaults[id];
      if(existing&&existing.verifier!==body.verifier)return json(409,{error:'vault_conflict'});
      vaults[id]=existing||{id,verifier:body.verifier,revision:0,records:{}};
      return json(existing?200:201,{ok:true,id,revision:vaults[id].revision,created:!existing});
    }
    const match=path.match(/^\/v1\/vaults\/([^/]+)(?:\/(.*))?$/);
    if(!match)return json(404,{error:'not_found'});
    const id=match[1],tail=match[2]||'',vault=vaults[id];
    if(!vault)return json(404,{error:'vault_not_found'});
    if(tail==='records'&&method==='PUT'){
      const body=JSON.parse(req.postData()||'{}');vault.revision++;
      for(const rec of body.records||[]){
        vault.records[rec.collection+':'+rec.id]={
          collection:rec.collection,id:rec.id,deleted:Boolean(rec.deleted),iv:rec.iv||null,
          chunks:Array.isArray(rec.chunks)?rec.chunks:[],version:vault.revision,deviceId:body.deviceId||''
        };
      }
      return json(200,{ok:true,revision:vault.revision,records:(body.records||[]).length});
    }
    if(tail==='changes'&&method==='GET'){
      const since=Number(url.searchParams.get('since')||0);
      const records=Object.values(vault.records).filter(x=>x.version>since).map(x=>({...x}));
      return json(200,{ok:true,revision:vault.revision,records});
    }
    return json(404,{error:'not_found'});
  });
  await context.addInitScript(()=>localStorage.setItem('autojournal-sync-api',location.origin+'/__sync_test__'));
  return vaults;
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


test('first launch offers device-aware QR connection or a new journal', async({page})=>{
  await expect(page.locator('.v5-first-run')).toBeVisible();
  await expect(page.getByRole('button',{name:/Сканировать QR/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Новый журнал/})).toBeVisible();
  await expect(page.locator('.v5-topbar')).toHaveCount(0);
  await expect(page.locator('.v5-tabbar')).toHaveCount(0);
});

test('new journal from first launch opens vehicle form immediately', async({page})=>{
  await page.getByRole('button',{name:/Новый журнал/}).click();
  await expect(page.locator('#car-form')).toBeVisible();
  await expect(page.locator('#make')).toBeVisible();
  await expect(page.locator('#model')).toBeVisible();
  await page.locator('#make').fill('Hyundai');
  await page.locator('#model').fill('Sonata');
  await page.locator('#year').fill('2008');
  await page.locator('#initialOdometer').fill('200000');
  await page.locator('#currentOdometer').fill('210000');
  await page.locator('button[form="car-form"]').click();
  await expect(page.locator('.v5-first-run')).toHaveCount(0);
  await expect(page.locator('.v5-car-title')).toContainText('Hyundai');
});

test('mobile first launch opens universal QR scanner', async({page})=>{
  await page.evaluate(()=>{
    const mediaDevices=navigator.mediaDevices||{};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
      ...mediaDevices,
      getUserMedia:async()=>{throw new DOMException('No camera in QA','NotAllowedError');}
    }});
  });
  await page.getByRole('button',{name:/Сканировать QR/}).click();
  await expect(page.locator('.sheet')).toContainText('Подключение устройства');
  await expect(page.locator('[data-sync-video]')).toBeVisible();
  await expect(page.locator('[data-action="sync-photo-open"]')).toBeVisible();
  await expect(page.locator('[data-sync-manual]')).toBeVisible();
});

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

test('latest home records include newest same-day entry without mileage', async({page})=>{
  await addCar(page);
  for(let i=1;i<=4;i++){
    await page.locator('[data-action="add-entry"]').first().click();
    await page.locator('#title').fill('Запись без пробега '+i);
    await expect(page.locator('#odometer')).toHaveValue('');
    await page.locator('button[form="entry-form"]').click();
    await expect(page.locator('#entry-form')).toHaveCount(0);
  }

  await page.locator('.v5-tabbar [data-view="home"]').click();
  const recent=page.locator('.v5-section').filter({has:page.getByRole('heading',{name:'Последние записи'})});
  await expect(recent).toContainText('Запись без пробега 4');
  await expect(recent).toContainText('Запись без пробега 3');
  await expect(recent).toContainText('Запись без пробега 2');
  await expect(recent).not.toContainText('Запись без пробега 1');

  await page.locator('.v5-tabbar [data-view="records"]').click();
  const titles=await page.locator('.v5-list .row-title').evaluateAll(nodes=>nodes.slice(0,4).map(n=>n.textContent?.trim()));
  expect(titles).toEqual([
    'Запись без пробега 4',
    'Запись без пробега 3',
    'Запись без пробега 2',
    'Запись без пробега 1'
  ]);
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

  await gotoSecondary(page,'documents');
  await page.locator('[data-action="document-detail"]',{hasText:'ОСАГО QA изменено'}).click();
  page.once('dialog',d=>d.accept());
  await page.locator('[data-action="delete-document"]').click();
  s=await state(page);
  expect(s.documents).toHaveLength(0);
});


test('document detail shows thumbnail, opens by thumbnail and has one share button', async({page})=>{
  await addCar(page);
  await gotoSecondary(page,'documents');
  await page.locator('[data-action="add-document"]').last().click();
  await page.locator('#title').fill('PDF документ QA');
  await page.locator('#type').fill('Страховка');
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  await page.locator('#files').setInputFiles({name:'policy-preview.pdf',mimeType:'application/pdf',buffer:pdf});
  await page.locator('button[form="document-form"]').click();

  await page.locator('[data-action="document-detail"]',{hasText:'PDF документ QA'}).click();
  const card=page.locator('.v5-stored-file-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('policy-preview.pdf');
  await expect(card.locator('.v5-stored-file-preview')).toBeVisible();
  await expect(card.locator('.v5-stored-file-preview-pdf')).toHaveCount(1);
  await expect(card.getByRole('button',{name:'Поделиться',exact:true})).toHaveCount(1);
  await expect(card.locator('button[data-action="open-stored-file"]')).toHaveCount(0);

  const order=await card.evaluate(el=>[...el.children].map(x=>x.className));
  expect(String(order[0])).toContain('v5-stored-file-open');
  expect(String(order[1])).toContain('v5-stored-file-share');

  await page.evaluate(()=>{
    window.__storedOpenProbe=[];
    window.__origAnchorClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){
      window.__storedOpenProbe.push({href:this.href,target:this.target,download:this.download,rel:this.rel});
    };
  });
  await card.locator('.v5-stored-file-open').click();
  const opened=await page.evaluate(()=>window.__storedOpenProbe?.[0]||null);
  expect(opened).toBeTruthy();
  expect(opened.href).toMatch(/^blob:/);
  expect(opened.target).toBe('_blank');
  expect(opened.download).toBe('');
  expect(opened.rel).toContain('noopener');
  await page.evaluate(()=>{if(window.__origAnchorClick)HTMLAnchorElement.prototype.click=window.__origAnchorClick;});

  await page.evaluate(()=>{
    window.__sharedStoredFile=null;
    Object.defineProperty(navigator,'canShare',{configurable:true,value:opts=>Boolean(opts?.files?.length)});
    Object.defineProperty(navigator,'share',{configurable:true,value:async opts=>{
      const f=opts.files?.[0];
      window.__sharedStoredFile={title:opts.title,name:f?.name,type:f?.type,size:f?.size};
    }});
  });
  await card.getByRole('button',{name:'Поделиться'}).click();
  const shared=await page.evaluate(()=>window.__sharedStoredFile);
  expect(shared.name).toBe('policy-preview.pdf');
  expect(shared.type).toBe('application/pdf');
  expect(shared.size).toBeGreaterThan(0);
});

test('new health component creates journal entry and linked expense', async({page})=>{
  await addCar(page);
  await gotoSecondary(page,'parts');
  await page.locator('[data-action="add-component"]').last().click();
  await chooseVehicleSystem(page,'передние колодки','front_brake_pads');
  await page.locator('#brand').fill('TRW');
  await page.locator('#partNumber').fill('GDB-TEST');
  await page.locator('#installedDate').fill(isoOffset(-1));
  await page.locator('#installedOdometer').fill('209900');
  await page.locator('#cost').fill('3500');
  await page.locator('button[form="component-form"]').click();

  const s=await state(page);
  expect(s.components).toHaveLength(1);
  const comp=s.components[0];
  const entry=s.serviceEntries.find(x=>x.componentId===comp.id&&x.title==='Установка: Передние тормозные колодки');
  expect(entry).toBeTruthy();
  expect(entry.type).toBe('replacement');
  expect(entry.componentAction).toBe('replace');
  expect(entry.partsText).toBe('TRW · GDB-TEST');
  expect(entry.partsCost).toBe(3500);
  expect(entry.odometer).toBe(209900);

  const expense=s.expenses.find(x=>x.linkedServiceId===entry.id);
  expect(expense).toBeTruthy();
  expect(expense.amount).toBe(3500);
  expect(expense.description).toBe('Установка: Передние тормозные колодки');

  await page.locator('[data-action="go-back"]').click();
  await page.locator('.v5-tabbar [data-view="records"]').click();
  await expect(page.getByText('Установка: Передние тормозные колодки',{exact:true})).toBeVisible();
});

test('health replacement is visible in journal even after stale filters', async({page})=>{
  await addCar(page);
  await gotoSecondary(page,'parts');
  await page.locator('[data-action="add-component"]').last().click();
  await chooseVehicleSystem(page,'передние колодки','front_brake_pads');
  await page.locator('#installedDate').fill(isoOffset(-30));
  await page.locator('#installedOdometer').fill('200000');
  await page.locator('button[form="component-form"]').click();

  await page.locator('[data-action="go-back"]').click();
  await page.locator('.v5-tabbar [data-view="records"]').click();
  await page.locator('[data-input="history-type"]').selectOption('repair');
  await page.locator('[data-input="history-search"]').fill('несуществующий фильтр');
  await page.locator('.v5-tabbar [data-view="home"]').click();
  await page.locator('.v5-quick-card[data-view="parts"]').click();

  await page.locator('[data-action="component-detail"]',{hasText:'Передние тормозные колодки'}).click();
  await page.locator('[data-action="mark-replacement"]').click();
  await expect(page.getByText(/запись добавлена в журнал/i).last()).toBeVisible();

  await page.locator('.sheet-close').click();
  await page.locator('[data-action="go-back"]').click();
  await page.locator('.v5-tabbar [data-view="records"]').click();

  await expect(page.locator('[data-input="history-type"]')).toHaveValue('all');
  await expect(page.locator('[data-input="history-search"]')).toHaveValue('');
  await expect(page.getByText('Замена: Передние тормозные колодки',{exact:true})).toBeVisible();
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
  expect(actions).toHaveLength(2);
  expect(actions.filter(x=>x.componentAction==='replace')).toHaveLength(1);
  expect(actions.filter(x=>x.componentAction==='inspect')).toHaveLength(1);
  const comp=s.components[0];
  expect(comp.baseInstalledOdometer).toBe(200000);

  await page.locator('[data-action="mark-replacement"]').click();
  s=await state(page);
  actions=s.serviceEntries.filter(x=>x.componentAction);
  expect(actions.filter(x=>x.componentAction==='replace')).toHaveLength(2);
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

test('7-day weather forecast creates tire-change notification at 5C threshold', async({page,browserName})=>{
  test.skip(browserName==='webkit','Cross-origin Open-Meteo interception is unreliable in Playwright WebKit; weather UI remains covered by WebKit tests.');
  await addCar(page);
  const dates=[0,1,2,3,4,5,6].map(isoOffset);
  await page.route('https://api.open-meteo.com/**',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      latitude:55.75,longitude:37.62,timezone:'Europe/Moscow',
      daily:{time:dates,temperature_2m_mean:[9.2,7.1,4.8,3.9,6.2,7.0,8.1]},
      daily_units:{temperature_2m_mean:'°C'}
    })});
  });
  const seeded=await state(page);
  seeded.settings.weatherTireEnabled=true;
  seeded.settings.weatherTireThreshold=5;
  seeded.settings.weatherTireLat=55.75;
  seeded.settings.weatherTireLon=37.62;
  seeded.settings.weatherLastCheckAt='';
  await page.evaluate(async data=>{const db=await import('./db.js');await db.saveState(data);},seeded);
  await page.reload();

  await gotoSecondary(page,'more');
  await page.locator('[data-action="weather-open"]').click();
  await page.locator('[data-action="weather-check"]').click();
  await expect.poll(async()=>((await state(page)).settings.weatherTireTriggerDate||''),{timeout:10000}).toBe(dates[2]);
  const saved=await state(page);
  expect(saved.settings.weatherTireTriggerTemp).toBe(4.8);
  expect(saved.settings.weatherTireForecast).toHaveLength(7);
  await expect(page.locator('.sheet')).toContainText('Прогноз на 7 дней');
  await expect(page.locator('.sheet')).toContainText('Порог достигнут');
  await expect(page.locator('.sheet')).toContainText('Open-Meteo');

  await page.locator('.sheet-close').click();
  await page.locator('[data-action="go-back"]').click();
  await page.locator('[data-action="go-back"]').click();
  await page.locator('.v5-tabbar [data-view="notifications"]').click();
  await expect(page.getByText('Пора планировать смену шин',{exact:true})).toBeVisible();
  await expect(page.getByText(/4,8 °C/)).toBeVisible();
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



test('corrected service date ignores stale derived mileage cache', async({page})=>{
  await addCar(page,{initial:'210000',current:'210141'});
  const seeded=await state(page),carId=seeded.cars[0].id;
  seeded.cars[0].trackingStartDate=isoOffset(-40);
  seeded.serviceEntries=[{
    id:'svc-corrected',carId,date:isoOffset(-6),odometer:210097,type:'maintenance',
    title:'Предыдущая сервисная запись',category:'',faultKey:'',workText:'',partsText:'',
    partsCost:0,laborCost:0,otherCost:0,systemKey:'',componentId:'',componentAction:'',
    componentEventOdometer:210097,notes:'',photos:[],createdAt:new Date().toISOString(),seq:1
  }];
  seeded.odometerLogs=[
    {id:'start',carId,date:isoOffset(-40),value:210000,note:'Начало учёта',sourceType:'car-start',sourceId:carId},
    {id:'manual',carId,date:isoOffset(-3),value:210141,note:'Обновление пробега',sourceType:'manual',sourceId:'manual'},
    {id:'stale-service',carId,date:isoOffset(24),value:210097,note:'Из сервисной записи',sourceType:'service',sourceId:'svc-corrected'}
  ];
  await page.evaluate(async data=>{const db=await import('./db.js');await db.saveState(data);},seeded);
  await page.reload();

  const migrated=await state(page);
  expect(migrated.odometerLogs.some(x=>x.sourceType==='service'&&x.date===isoOffset(24))).toBe(false);

  await page.locator('[data-action="add-entry"]').first().click();
  await page.locator('#title').fill('Замена жидкости ГУР');
  await page.locator('#date').fill(isoOffset(-1));
  await page.locator('#odometer').fill('210197');
  await page.locator('button[form="entry-form"]').click();

  await expect(page.locator('#entry-form')).toHaveCount(0);
  const saved=await state(page);
  const entry=saved.serviceEntries.find(x=>x.title==='Замена жидкости ГУР');
  expect(entry?.odometer).toBe(210197);
  expect(saved.cars[0].currentOdometer).toBe(210197);
});

test('service records cannot be created with a future date', async({page})=>{
  await addCar(page,{initial:'200000',current:'210000'});
  await page.locator('[data-action="add-entry"]').first().click();
  await expect(page.locator('#date')).toHaveAttribute('max',isoOffset(0));
  await page.locator('#title').fill('Будущая запись');
  await page.locator('#date').fill(isoOffset(1));
  await page.locator('#odometer').fill('210001');
  await page.evaluate(()=>{document.querySelector('#entry-form').noValidate=true;});
  await page.locator('button[form="entry-form"]').click();
  await expect(page.getByText('Дата записи не может быть в будущем',{exact:true})).toBeVisible();
  const saved=await state(page);
  expect(saved.serviceEntries.some(x=>x.title==='Будущая запись')).toBe(false);
});

test('refuel records cannot be created with a future date', async({page})=>{
  await addCar(page,{initial:'200000',current:'210000'});
  await page.locator('.v5-tabbar [data-view="refuels"]').click();
  await page.locator('[data-action="add-refuel"]').first().click();
  await expect(page.locator('#date')).toHaveAttribute('max',isoOffset(0));
  await page.locator('#date').fill(isoOffset(1));
  await page.locator('#odometer').fill('210001');
  await page.locator('#amount').fill('1000');
  await page.locator('#liters').fill('20');
  await page.evaluate(()=>{document.querySelector('#refuel-form').noValidate=true;});
  await page.locator('button[form="refuel-form"]').click();
  await expect(page.getByText('Дата заправки не может быть в будущем',{exact:true})).toBeVisible();
  const saved=await state(page);
  expect(saved.refuels).toHaveLength(0);
});

test('current mileage accepts a higher real reading despite a lower future-dated log', async({page})=>{
  await addCar(page,{initial:'210000',current:'210097'});
  const seeded=await state(page),carId=seeded.cars[0].id;
  seeded.odometerLogs.push({
    id:'future-lower-odo',carId,date:isoOffset(1),value:210097,
    note:'Поздняя запись с меньшим пробегом',sourceType:'service',sourceId:'future-service'
  });
  await page.evaluate(async data=>{const db=await import('./db.js');await db.saveState(data);},seeded);
  await page.reload();

  await page.locator('[data-action="add-odometer"]').click();
  await page.locator('#value').fill('210156');
  await page.locator('button[form="odometer-form"]').click();

  await expect(page.locator('.v5-mileage-card')).toContainText('210 156');
  const saved=await state(page);
  expect(saved.cars[0].currentOdometer).toBe(210156);
  expect(saved.odometerLogs.some(x=>x.sourceType==='manual'&&x.value===210156)).toBe(true);
});

test('analytics keeps same-day mileage delta stable across period switches', async({page})=>{
  await addCar(page,{initial:'200000',current:'200000'});
  await page.locator('[data-action="add-odometer"]').click();
  await page.locator('#value').fill('200123');
  await page.locator('button[form="odometer-form"]').click();

  await page.locator('button.v5-stats-card').click();
  await page.locator('[data-action="analytics-tab"][data-value="mileage"]').click();

  const distance=page.locator('[data-stat="mileage-distance"]');
  await expect(distance).toContainText('123 км');
  await expect(distance).toContainText('200 000 → 200 123 км');

  for(const period of ['year','90','all','month','all','month']){
    await page.locator('[data-input="analytics-period"]').selectOption(period);
    await expect(distance).toContainText('123 км');
    await expect(distance).toContainText('200 000 → 200 123 км');
  }

  await page.locator('[data-input="analytics-period"]').selectOption('lastMonth');
  await expect(distance).toContainText('0 км');
  await page.locator('[data-input="analytics-period"]').selectOption('month');
  await expect(distance).toContainText('123 км');
});

test('analytics period boundaries stay consistent for mileage expenses and refuels', async({page})=>{
  await addCar(page,{initial:'100000',current:'100000'});
  const seeded=await state(page),carId=seeded.cars[0].id;
  const now=new Date();
  const y=now.getFullYear(),m=now.getMonth();
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const prevStart=ymd(new Date(y,m-1,1,12));
  const prevMid=ymd(new Date(y,m-1,15,12));
  const currentDate=ymd(new Date(y,m,Math.max(1,Math.min(now.getDate(),15)),12));

  seeded.cars[0].trackingStartDate=prevStart;
  seeded.cars[0].initialOdometer=100000;
  seeded.cars[0].currentOdometer=100700;
  seeded.odometerLogs=[
    {id:'prev-odo',carId,date:prevMid,value:100500,note:'prev',sourceType:'manual',sourceId:'prev-odo'},
    {id:'current-odo',carId,date:currentDate,value:100700,note:'current',sourceType:'manual',sourceId:'current-odo'}
  ];
  seeded.expenses=[
    {id:'prev-exp',carId,date:prevMid,odometer:100500,category:'Ремонт',amount:1000,description:'Предыдущий месяц',note:'',linkedServiceId:'',linkedRefuelId:''},
    {id:'current-exp',carId,date:currentDate,odometer:100700,category:'Мойка',amount:400,description:'Текущий месяц',note:'',linkedServiceId:'',linkedRefuelId:''}
  ];
  seeded.refuels=[
    {id:'prev-ref',carId,date:prevMid,odometer:100500,fuelType:'Бензин',amount:3000,liters:50,pricePerLiter:60,fullTank:false,station:'АЗС prev',address:'',notes:'',createdAt:new Date().toISOString()},
    {id:'current-ref',carId,date:currentDate,odometer:100700,fuelType:'Бензин',amount:1200,liters:20,pricePerLiter:60,fullTank:false,station:'АЗС current',address:'',notes:'',createdAt:new Date().toISOString()}
  ];
  await page.evaluate(async data=>{const db=await import('./db.js');await db.saveState(data);},seeded);
  await page.reload();

  await page.locator('button.v5-stats-card').click();
  await page.locator('[data-action="analytics-tab"][data-value="mileage"]').click();

  await page.locator('[data-input="analytics-period"]').selectOption('lastMonth');
  await expect(page.locator('[data-stat="mileage-distance"]')).toContainText('500 км');
  await expect(page.locator('[data-stat="mileage-distance"]')).toContainText('100 000 → 100 500 км');

  await page.locator('[data-input="analytics-period"]').selectOption('month');
  await expect(page.locator('[data-stat="mileage-distance"]')).toContainText('200 км');
  await expect(page.locator('[data-stat="mileage-distance"]')).toContainText('100 500 → 100 700 км');

  await page.locator('[data-action="analytics-tab"][data-value="expenses"]').click();
  await expect(page.locator('[data-stat="expense-total"]')).toContainText('400');
  await expect(page.locator('[data-stat="expense-count"]')).toContainText('1');
  await expect(page.locator('[data-stat="expense-per-km"]')).toContainText('2');

  await page.locator('[data-input="analytics-period"]').selectOption('lastMonth');
  await expect(page.locator('[data-stat="expense-total"]')).toContainText('1 000');
  await expect(page.locator('[data-stat="expense-count"]')).toContainText('1');
  await expect(page.locator('[data-stat="expense-per-km"]')).toContainText('2');

  await page.locator('[data-action="analytics-tab"][data-value="refuels"]').click();
  await expect(page.locator('[data-stat="refuel-count"]')).toContainText('1');
  await expect(page.locator('[data-stat="refuel-spend"]')).toContainText('3 000');

  await page.locator('[data-input="analytics-period"]').selectOption('month');
  await expect(page.locator('[data-stat="refuel-count"]')).toContainText('1');
  await expect(page.locator('[data-stat="refuel-spend"]')).toContainText('1 200');

  await page.locator('[data-input="analytics-period"]').selectOption('all');
  await page.locator('[data-action="analytics-tab"][data-value="mileage"]').click();
  await expect(page.locator('[data-stat="mileage-distance"]')).toContainText('700 км');
  await page.locator('[data-action="analytics-tab"][data-value="expenses"]').click();
  await expect(page.locator('[data-stat="expense-total"]')).toContainText('1 400');
  await page.locator('[data-action="analytics-tab"][data-value="refuels"]').click();
  await expect(page.locator('[data-stat="refuel-count"]')).toContainText('2');
  await expect(page.locator('[data-stat="refuel-spend"]')).toContainText('4 200');
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
  await addCar(page,{make:'Temporary',model:'Restore',initial:'1',current:'1'});
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
    for(const view of ['analytics','documents','more']){
      await page.locator('[data-view="'+view+'"]').click();
      await expect(page.locator('.v5-tabbar')).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.locator('[data-action="go-back"]').click();
    }
    await page.locator('[data-action="go-back"]').click();
    await expect(page.locator('.v5-tabbar')).toBeVisible();
    await page.locator('.v5-quick-card[data-view="parts"]').click();
    await expect(page.locator('.v5-tabbar')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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

test('profile exposes Documents while Vehicle Health stays in home quick access', async({page})=>{
  await addCar(page,{initial:'200000',current:'200000'});
  await openProfile(page);
  const menu=page.locator('.v5-menu');
  await expect(menu.getByText('Документы',{exact:true})).toBeVisible();
  await expect(menu.getByText('Здоровье автомобиля',{exact:true})).toHaveCount(0);
  await expect(page.locator('.v5-menu-page [data-view="documents"]')).toHaveCount(0);

  await menu.locator('[data-view="documents"]').click();
  await expect(page.locator('.v5-subbar-title')).toHaveText('Документы');
  await page.locator('[data-action="go-back"]').click();
  await page.locator('[data-action="go-back"]').click();

  const healthShortcut=page.locator('.v5-quick-card[data-view="parts"]');
  await expect(healthShortcut).toContainText('Здоровье автомобиля');
  await healthShortcut.click();
  await expect(page.locator('.v5-subbar-title')).toHaveText('Здоровье автомобиля');
  await expect(page.locator('.v5-health-hero')).toContainText('Базовый план заполнен: 0 из');
  await expect(page.locator('.v5-health-list').first()).toContainText('Моторное масло');
  await expect(page.locator('[data-action="add-health-component"][data-health-system-key="engine_oil"]')).toBeVisible();

  await page.locator('[data-action="add-health-component"][data-health-system-key="engine_oil"]').click();
  await expect(page.locator('#component-form')).toBeVisible();
  await expect(page.locator('#systemKey')).toHaveValue('engine_oil');
  await expect(page.locator('#systemKeySearch')).toHaveValue('Моторное масло');
  await page.locator('#installedOdometer').fill('200000');
  await page.locator('#lifeKm').fill('10000');
  await page.locator('button[form="component-form"]').click();

  await expect(page.locator('.v5-health-hero')).toContainText('Базовый план заполнен: 1 из');
  const oil=page.locator('[data-action="component-detail"]',{hasText:'Моторное масло'});
  await expect(oil).toBeVisible();
  await expect(oil).toContainText('В норме');
});

test('service record links to standard node and early replacement resets existing resource', async({page})=>{
  await addCar(page,{initial:'100000',current:'109000'});
  await page.locator('.v5-quick-card[data-view="parts"]').click();
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

  await page.locator('.v5-quick-card[data-view="parts"]').click();
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

test('profile places Sync and QR immediately after vehicle report and removes it from Settings', async({page})=>{
  await addCar(page);
  await openProfile(page);

  const labels=await page.locator('.v5-menu > button').evaluateAll(btns=>btns.map(b=>b.querySelector('strong')?.textContent?.trim()||''));
  const reportIndex=labels.indexOf('Отчёт автомобиля');
  const syncIndex=labels.indexOf('Синхронизация и QR');
  expect(reportIndex).toBeGreaterThanOrEqual(0);
  expect(syncIndex).toBe(reportIndex+1);

  await page.locator('.v5-menu [data-view="more"]').click();
  await expect(page.getByText('Синхронизация и QR',{exact:true})).toHaveCount(0);
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
    await expect.poll(()=>page.evaluate(()=>caches.keys())).toContain('autojournal-v5.14.0');
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


test('mobile sync UI prefers scanning, starts camera immediately and still allows showing QR', async({page})=>{
  await installSyncRelayMock(page);
  await page.evaluate(()=>{
    window.__cameraCalls=0;
    const mediaDevices=navigator.mediaDevices||{};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
      ...mediaDevices,
      getUserMedia:async()=>{window.__cameraCalls++;throw new DOMException('No camera in QA','NotAllowedError');}
    }});
  });
  await addCar(page);
  await openProfile(page);
  await page.locator('[data-action="sync-open"]').click();
  await expect(page.locator('[data-action="sync-scan-link"]')).toHaveText('Сканировать QR другого устройства');
  await expect(page.locator('[data-action="sync-show-qr"]')).toHaveText('Показать QR на этом устройстве');
  await page.locator('[data-action="sync-scan-link"]').click();
  await expect(page.locator('.sheet')).toContainText('Подключение устройства');
  await expect.poll(()=>page.evaluate(()=>window.__cameraCalls)).toBe(1);
  await expect(page.locator('[data-action="sync-camera-start"]')).toBeVisible();
  await page.locator('[data-action="close-sheet"]').last().click();

  await page.locator('[data-action="sync-open"]').click();
  await page.locator('[data-action="sync-show-qr"]').click();
  await expect(page.locator('[data-sync-qr] svg')).toBeVisible();
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


test('new desktop can show QR and linked phone can attach it to the existing vault', async({page,context,browser,browserName})=>{
  test.skip(browserName==='webkit','Cross-context QR screenshot pairing is covered on Chromium.');
  const relay={};
  await installSharedVaultRelay(context,relay);
  await page.reload();
  await addCar(page,{current:'210555'});
  const phoneVault=await page.evaluate(async()=>{
    const sync=await import(new URL('./sync.js?qa-pc-pair=1',location.href).href);
    const vault=sync.createSyncVaultLink();
    await sync.registerSyncVault(vault);
    await sync.adoptSyncVault(vault);
    return {id:vault.id,secret:vault.secret,api:vault.api};
  });
  await page.reload();
  await expect.poll(()=>Object.values(relay)[0]?.revision||0,{timeout:10000}).toBeGreaterThan(0);

  const desktopContext=await browser.newContext({
    viewport:{width:1440,height:900},
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
    isMobile:false,hasTouch:false
  });
  await installSharedVaultRelay(desktopContext,relay);
  const desktop=await desktopContext.newPage();
  await desktop.goto(page.url());
  await expect(desktop.locator('.v5-first-run')).toBeVisible();
  await expect(desktop.getByRole('button',{name:/Показать QR/})).toBeVisible();
  await desktop.getByRole('button',{name:/Показать QR/}).click();
  await expect(desktop.locator('[data-sync-qr] svg')).toBeVisible();
  await expect(desktop.locator('.sheet')).toContainText('уже подключённом устройстве');
  const qr=await desktop.locator('[data-sync-qr] svg').screenshot();

  await openProfile(page);
  await page.locator('[data-action="sync-open"]').click();
  await page.locator('[data-action="sync-scan-link"]').click();
  await page.locator('[data-sync-photo]').setInputFiles({name:'pair.png',mimeType:'image/png',buffer:qr});

  await expect(desktop.locator('.sheet')).toContainText('Получен зашифрованный журнал',{timeout:15000});
  await desktop.locator('[data-action="sync-import-merge"]').click();
  await expect(desktop.locator('.sheet')).toContainText('Устройства связаны',{timeout:10000});

  const desktopVault=await desktop.evaluate(async()=>{
    const sync=await import(new URL('./sync.js?qa-pc-pair=1',location.href).href);
    return sync.loadSyncVault();
  });
  expect(desktopVault?.id).toBe(phoneVault.id);
  await expect.poll(async()=>((await state(desktop)).cars[0]?.currentOdometer||0),{timeout:10000}).toBe(210555);

  await desktopContext.close();
});

test('linked device refuses to switch silently to another sync vault', async({page})=>{
  await installSyncRelayMock(page);
  const result=await page.evaluate(async()=>{
    const sync=await import(new URL('./sync.js?qa-vault-guard=1',location.href).href);
    const first=sync.createSyncVaultLink();
    await sync.registerSyncVault(first);
    await sync.adoptSyncVault(first);
    const second=sync.createSyncVaultLink();
    await sync.registerSyncVault(second);
    let error='';
    try{await sync.adoptSyncVault(second);}catch(err){error=String(err?.message||err);}
    const active=sync.loadSyncVault();
    return {first:first.id,second:second.id,active:active?.id||'',error};
  });
  expect(result.first).not.toBe(result.second);
  expect(result.active).toBe(result.first);
  expect(result.error).toContain('VAULT_SWITCH_BLOCKED');
});

test('three linked devices stay in one vault and receive the same changes', async({page,context,browser,browserName})=>{
  test.skip(browserName==='webkit','Shared multi-context relay scenario runs on Chromium; persistent sync itself is covered on WebKit.');
  const relay={};
  await installSharedVaultRelay(context,relay);
  await page.reload();
  await addCar(page);

  const link=await page.evaluate(async()=>{
    const sync=await import(new URL('./sync.js?qa-three-device=1',location.href).href);
    const vault=sync.createSyncVaultLink();
    await sync.registerSyncVault(vault);
    await sync.adoptSyncVault(vault);
    return {id:vault.id,secret:vault.secret,api:vault.api};
  });
  await page.reload();
  await expect.poll(()=>Object.values(relay)[0]?.revision||0,{timeout:10000}).toBeGreaterThan(0);

  const homeContext=await browser.newContext();
  const workContext=await browser.newContext();
  await installSharedVaultRelay(homeContext,relay);
  await installSharedVaultRelay(workContext,relay);
  const homePc=await homeContext.newPage();
  const workPc=await workContext.newPage();

  const connect=async p=>{
    await p.goto(page.url());
    await p.evaluate(async link=>{
      const sync=await import(new URL('./sync.js?qa-three-device=1',location.href).href);
      await sync.adoptSyncVault(link);
    },link);
    await p.reload();
    await expect.poll(async()=>((await state(p)).cars||[]).length,{timeout:10000}).toBe(1);
  };

  await connect(homePc);
  await connect(workPc);

  for(let i=0;i<5;i++){
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await homePc.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await workPc.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(450);
  }

  await expect.poll(async()=>((await state(page)).syncDevices||[]).length,{timeout:10000}).toBe(3);
  await expect.poll(async()=>((await state(homePc)).syncDevices||[]).length,{timeout:10000}).toBe(3);
  await expect.poll(async()=>((await state(workPc)).syncDevices||[]).length,{timeout:10000}).toBe(3);

  const ids=await Promise.all([page,homePc,workPc].map(async p=>p.evaluate(async()=>{
    const sync=await import(new URL('./sync.js?qa-three-device=1',location.href).href);
    return sync.loadSyncVault()?.id||'';
  })));
  expect(new Set(ids).size).toBe(1);
  expect(ids[0]).toBe(link.id);

  await openProfile(page);
  await page.locator('[data-action="sync-open"]').click();
  await expect(page.locator('.sheet')).toContainText('Подключённые устройства · 3');
  await expect(page.locator('.sheet')).toContainText('AJ-');
  await expect(page.locator('[data-action="sync-show-qr"]')).toHaveText('Показать QR на этом устройстве');

  await homeContext.close();
  await workContext.close();
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
  await page.locator('[data-action="sync-open"]').click();
  await expect(page.locator('.sheet')).toContainText('Автосинхронизация включена');
});


test('two linked devices sync a document with attachment from PC to phone', async({page,context,browserName})=>{
  test.skip(browserName==='webkit','WebKit service-worker routing makes the shared relay mock unreliable; persistent sync is covered separately on WebKit and this two-device scenario runs on Chromium.');
  const relay=await installSharedVaultRelay(context);
  await page.evaluate(()=>localStorage.setItem('autojournal-sync-api',location.origin+'/__sync_test__'));
  await page.reload();
  await addCar(page);

  const link=await page.evaluate(async()=>{
    let sync,lastError;
    for(let i=0;i<3;i++){
      try{sync=await import(new URL('./sync.js?qa-two-device=1',location.href).href);break;}
      catch(err){lastError=err;await new Promise(r=>setTimeout(r,250));}
    }
    if(!sync)throw lastError||new Error('sync module did not load');
    const vault=sync.createSyncVaultLink();
    await sync.registerSyncVault(vault);
    await sync.adoptSyncVault(vault);
    window.dispatchEvent(new Event('focus'));
    return {id:vault.id,secret:vault.secret,api:vault.api};
  });
  await expect.poll(()=>Object.values(relay)[0]?.revision||0,{timeout:10000}).toBeGreaterThan(0);

  const phone=await context.newPage();
  await phone.goto('/');
  await phone.evaluate(async link=>{
    localStorage.setItem('autojournal-sync-api',location.origin+'/__sync_test__');
    let sync,lastError;
    for(let i=0;i<3;i++){
      try{sync=await import(new URL('./sync.js?qa-two-device=1',location.href).href);break;}
      catch(err){lastError=err;await new Promise(r=>setTimeout(r,250));}
    }
    if(!sync)throw lastError||new Error('sync module did not load');
    await sync.adoptSyncVault(link);
    window.dispatchEvent(new Event('focus'));
  },link);
  await expect.poll(async()=>((await state(phone)).cars||[]).length,{timeout:10000}).toBe(1);

  await gotoSecondary(page,'documents');
  await page.locator('[data-action="add-document"]').last().click();
  await page.locator('#title').fill('Документ с ПК на телефон');
  await page.locator('#type').fill('Прочее');
  await page.locator('#number').fill('PC-PHONE-1');
  await page.locator('#files').setInputFiles({
    name:'pc-phone.txt',mimeType:'text/plain',buffer:Buffer.from('encrypted attachment from pc to phone')
  });
  await page.locator('button[form="document-form"]').click();

  await expect.poll(()=>Object.values(Object.values(relay)[0]?.records||{}).some(x=>x.collection==='documents'),{timeout:10000}).toBe(true);
  await phone.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(async()=>{
    const s=await state(phone);
    const doc=s.documents.find(x=>x.title==='Документ с ПК на телефон');
    return doc?{number:doc.number,files:doc.files?.map(f=>f.name)||[]}:null;
  },{timeout:10000}).toEqual({number:'PC-PHONE-1',files:['pc-phone.txt']});
  await phone.close();
});
