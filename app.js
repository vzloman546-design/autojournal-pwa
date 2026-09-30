import { loadState, saveState, clearState } from './db.js';

const APP_VERSION = 6;
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nowISO = () => new Date().toISOString().slice(0,10);
const fmtNum = (n, digits=0) => new Intl.NumberFormat('ru-RU', {maximumFractionDigits:digits}).format(Number(n||0));
const money = n => `${fmtNum(n)} ₽`;
const fmtDate = v => v ? new Intl.DateTimeFormat('ru-RU').format(new Date(`${v}T12:00:00`)) : '—';
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
const nonneg = (v, fallback=0) => { const n=Number(v); return Number.isFinite(n) ? Math.max(0,n) : fallback; };
const plural = (n,one,few,many) => { const v=Math.abs(Math.trunc(Number(n)||0))%100, d=v%10; return v>10&&v<20?many:d===1?one:d>=2&&d<=4?few:many; };
const safeImageData = (v='') => /^data:image\/(?:png|jpe?g|webp|gif|heic|heif);base64,/i.test(String(v)) ? String(v) : '';
const safeStoredFileData = (v='') => /^data:(?:image\/(?:png|jpe?g|webp|gif|heic|heif)|application\/pdf|text\/plain(?:;charset=[^;,]+)?);base64,/i.test(String(v)) ? String(v) : '';
const dateOK = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime());
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const addMonths = (dateStr, months) => {
  if (!dateOK(dateStr) || !Number(months)) return null;
  const src = new Date(`${dateStr}T12:00:00`);
  const day = src.getDate();
  const target = new Date(src.getFullYear(), src.getMonth() + Number(months), 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(day,lastDay));
  return target.toISOString().slice(0,10);
};
const addDays = (dateStr, days) => {
  if(!dateOK(dateStr)) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate()+Number(days));
  return d.toISOString().slice(0,10);
};
const daysBetween = (a,b) => dateOK(a)&&dateOK(b) ? Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`))/86400000) : 0;
const today = () => nowISO();

const icons = {
  home:`<svg class="icon" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11h13V9"/><path d="M9.5 20v-6h5v6"/></svg>`,
  history:`<svg class="icon" viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.1-5.6"/><path d="M3.5 4.5v5h5"/><path d="M12 7.5V12l3 2"/></svg>`,
  wrench:`<svg class="icon" viewBox="0 0 24 24"><path d="M14.5 6.2a5 5 0 0 0-6.7 6.7L3.5 17.2a2.3 2.3 0 1 0 3.3 3.3l4.3-4.3a5 5 0 0 0 6.7-6.7l-3.1 3.1-3.3-.8-.8-3.3 3.9-2.3Z"/></svg>`,
  wallet:`<svg class="icon" viewBox="0 0 24 24"><path d="M4 6.5h14.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h12"/><path d="M16 11h4.5v4H16a2 2 0 1 1 0-4Z"/></svg>`,
  more:`<svg class="icon" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>`,
  plus:`<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
  bell:`<svg class="icon" viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z"/><path d="M9.5 20h5"/></svg>`,
  car:`<svg class="icon" viewBox="0 0 24 24"><path d="m5 16-1.5-1.2V11l2-5h13l2 5v3.8L19 16"/><path d="M5 11h15M7 16h10"/><circle cx="7" cy="16" r="1.5"/><circle cx="17" cy="16" r="1.5"/></svg>`,
  speed:`<svg class="icon" viewBox="0 0 24 24"><path d="M4.2 18a9 9 0 1 1 15.6 0"/><path d="m12 12 4-4"/><path d="M7 18h10"/></svg>`,
  doc:`<svg class="icon" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></svg>`,
  chart:`<svg class="icon" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  gear:`<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2.1-.8-.7-1.7.9-2-2.1-2.1-2 .9-1.7-.7L10.5 2h-3l-.8 2.1-1.7.7-2-.9L.9 6l.9 2-.7 1.7L-1 10.5v3l2.1.8.7 1.7-.9 2L3 20.1l2-.9 1.7.7.8 2.1h3l.8-2.1 1.7-.7 2 .9 2.1-2.1-.9-2 .7-1.7z" transform="translate(3) scale(.75)"/></svg>`,
  close:`<svg class="icon" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>`,
  search:`<svg class="icon" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>`,
  alert:`<svg class="icon" viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17.5h.01"/></svg>`,
  check:`<svg class="icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>`,
  trash:`<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14"/></svg>`,
  edit:`<svg class="icon" viewBox="0 0 24 24"><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg>`,
  export:`<svg class="icon" viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v6h14v-6"/></svg>`,
  import:`<svg class="icon" viewBox="0 0 24 24"><path d="M12 15V3M7 10l5 5 5-5"/><path d="M5 14v6h14v-6"/></svg>`,
  fuel:`<svg class="icon" viewBox="0 0 24 24"><path d="M5 21V4h9v17M4 21h12"/><path d="M7 7h5v4H7zM14 8h2l3 3v7a2 2 0 0 0 4 0v-8l-3-3"/></svg>`,
  calendar:`<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>`,
};

const defaultState = () => ({
  version: APP_VERSION,
  settings: {
    theme: 'system',
    defaultWarnKm: 1000,
    defaultWarnDays: 14,
    currency: 'RUB',
    lastBackupAt: ''
  },
  activeCarId: null,
  nextSeq: 1,
  cars: [],
  odometerLogs: [],
  serviceEntries: [],
  components: [],
  expenses: [],
  documents: [],
  refuels: []
});

let state = defaultState();
let ui = { view:'home', sheet:null, sheetId:null, search:'', historyType:'all', expenseFilter:'all', notificationTab:'auto', analyticsTab:'expenses', analyticsPeriod:'month', reportMode:'short' };
const primaryViews=new Set(['home','records','refuels','notifications']);
const secondaryTitles={profile:'Профиль',carcard:'Паспорт автомобиля',report:'Отчёт автомобиля',analytics:'Статистика',documents:'Документы',parts:'Контроль обслуживания',more:'Настройки'};
let navStack=[];
let nextTransition='';

function car() { return state.cars.find(c=>c.id===state.activeCarId) || null; }
function carItems(list) { const c=car(); return c ? list.filter(x=>x.carId===c.id) : []; }
function totalServiceCost(e) { return Number(e.partsCost||0)+Number(e.laborCost||0)+Number(e.otherCost||0); }
function currentKm() { return Number(car()?.currentOdometer||0); }

function effectiveTheme() {
  if (state.settings.theme==='light' || state.settings.theme==='dark') return state.settings.theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme() {
  const t=state.settings.theme;
  document.documentElement.removeAttribute('data-theme');
  if (t==='light' || t==='dark') document.documentElement.setAttribute('data-theme',t);
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', effectiveTheme()==='dark' ? '#0b0b0d' : '#f5f5f7');
}
function nextSeq(){ const n=Number(state.nextSeq||1); state.nextSeq=n+1; return n; }

function migrate(raw) {
  if (!raw || typeof raw!=='object') return defaultState();
  const base=defaultState(), rs=raw.settings&&typeof raw.settings==='object'?raw.settings:{};
  const cars=(Array.isArray(raw.cars)?raw.cars:[]).map(c=>({
    ...c,id:String(c.id||uid()),make:String(c.make||''),model:String(c.model||''),year:String(c.year||''),engine:String(c.engine||''),plate:String(c.plate||''),vin:String(c.vin||''),
    photo:safeImageData(c.photo),trim:String(c.trim||''),fuelType:String(c.fuelType||''),engineVolume:String(c.engineVolume||''),transmission:String(c.transmission||''),powerHp:nonneg(c.powerHp),tireSize:String(c.tireSize||''),engineOil:String(c.engineOil||''),engineOilVolume:String(c.engineOilVolume||''),coolantVolume:String(c.coolantVolume||''),transmissionOilVolume:String(c.transmissionOilVolume||''),brakeFluidVolume:String(c.brakeFluidVolume||''),steeringFluidVolume:String(c.steeringFluidVolume||''),customSpecs:String(c.customSpecs||''),
    initialOdometer:nonneg(c.initialOdometer),currentOdometer:nonneg(c.currentOdometer),purchasePrice:nonneg(c.purchasePrice),purchaseDate:String(c.purchaseDate||''),trackingStartDate:String(c.trackingStartDate||c.purchaseDate||'')
  }));
  let odometerLogs=(Array.isArray(raw.odometerLogs)?raw.odometerLogs:[]).filter(x=>!['Из сервисной записи','Из расхода'].includes(x?.note)).map(x=>({...x,id:String(x.id||uid()),carId:String(x.carId||''),date:String(x.date||''),value:nonneg(x.value),note:String(x.note||''),sourceType:String(x.sourceType||'manual'),sourceId:String(x.sourceId||x.id||uid())}));
  let seq=1;
  const serviceEntries=(Array.isArray(raw.serviceEntries)?raw.serviceEntries:[]).map((x,index)=>({
    ...x,id:String(x.id||uid()),carId:String(x.carId||''),date:String(x.date||''),odometer:nonneg(x.odometer),type:String(x.type||'other'),title:String(x.title||''),category:String(x.category||''),faultKey:String(x.faultKey||''),
    workText:String(x.workText||''),partsText:String(x.partsText||''),partsCost:nonneg(x.partsCost),laborCost:nonneg(x.laborCost),otherCost:nonneg(x.otherCost),componentId:String(x.componentId||''),componentAction:String(x.componentAction||''),notes:String(x.notes||''),
    photos:Array.isArray(x.photos)?x.photos.filter(f=>f&&safeImageData(f.data)).map(f=>({id:String(f.id||uid()),name:String(f.name||'Фото'),data:safeImageData(f.data)})):[],
    createdAt:String(x.createdAt||`${String(x.date||'0000-00-00')}T00:00:00.000Z#${String(index).padStart(8,'0')}`),seq:nonneg(x.seq,seq++)
  }));
  const components=(Array.isArray(raw.components)?raw.components:[]).map(x=>({
    ...x,id:String(x.id||uid()),carId:String(x.carId||''),name:String(x.name||''),category:String(x.category||''),brand:String(x.brand||''),partNumber:String(x.partNumber||''),
    baseInstalledDate:String(x.baseInstalledDate||x.installedDate||nowISO()),baseInstalledOdometer:nonneg(x.baseInstalledOdometer??x.installedOdometer),
    installedDate:String(x.installedDate||x.baseInstalledDate||nowISO()),installedOdometer:nonneg(x.installedOdometer??x.baseInstalledOdometer),lifeKm:nonneg(x.lifeKm),lifeMonths:nonneg(x.lifeMonths),inspectKm:nonneg(x.inspectKm),inspectMonths:nonneg(x.inspectMonths),
    warnKm:x.warnKm==null?base.settings.defaultWarnKm:nonneg(x.warnKm),warnDays:x.warnDays==null?base.settings.defaultWarnDays:nonneg(x.warnDays),cost:nonneg(x.cost),notes:String(x.notes||''),sourceEntryId:String(x.sourceEntryId||''),lastInspectionDate:String(x.lastInspectionDate||''),lastInspectionOdometer:nonneg(x.lastInspectionOdometer)
  }));
  const expenses=(Array.isArray(raw.expenses)?raw.expenses:[]).map(x=>({...x,id:String(x.id||uid()),carId:String(x.carId||''),date:String(x.date||''),odometer:nonneg(x.odometer),category:String(x.category||'Другое'),amount:nonneg(x.amount),description:String(x.description||''),note:String(x.note||''),linkedServiceId:String(x.linkedServiceId||''),linkedRefuelId:String(x.linkedRefuelId||'')}));
  const documents=(Array.isArray(raw.documents)?raw.documents:[]).map(x=>({...x,id:String(x.id||uid()),carId:String(x.carId||''),title:String(x.title||''),type:String(x.type||''),number:String(x.number||''),issueDate:String(x.issueDate||''),expiryDate:String(x.expiryDate||''),remindDays:x.remindDays==null?30:nonneg(x.remindDays),files:Array.isArray(x.files)?x.files.filter(f=>f&&safeStoredFileData(f.data)).map(f=>({id:String(f.id||uid()),name:String(f.name||'Файл'),type:String(f.type||''),size:nonneg(f.size),data:safeStoredFileData(f.data)})):[]}));
  const hasSource=(carId,type,id)=>odometerLogs.some(x=>x.carId===carId&&x.sourceType===type&&x.sourceId===id);
  for(const e of serviceEntries) if(e.carId&&e.odometer>0&&!hasSource(e.carId,'service',e.id)) odometerLogs.push({id:uid(),carId:e.carId,date:e.date,value:e.odometer,note:'Восстановлено из сервисной истории',sourceType:'service',sourceId:e.id});
  for(const c of components) if(c.carId&&c.baseInstalledOdometer>0&&!hasSource(c.carId,'component',c.id)) odometerLogs.push({id:uid(),carId:c.carId,date:c.baseInstalledDate,value:c.baseInstalledOdometer,note:'Восстановлено из установки узла',sourceType:'component',sourceId:c.id});
  for(const e of expenses) if(e.carId&&e.odometer>0&&!e.linkedServiceId&&!hasSource(e.carId,'expense',e.id)) odometerLogs.push({id:uid(),carId:e.carId,date:e.date,value:e.odometer,note:'Восстановлено из расхода',sourceType:'expense',sourceId:e.id});
  for(const c of cars){ const vals=odometerLogs.filter(x=>x.carId===c.id).map(x=>Number(x.value)).filter(Number.isFinite); const loggedMax=vals.length?Math.max(...vals):0; if(c.currentOdometer>Math.max(c.initialOdometer,loggedMax)) odometerLogs.push({id:uid(),carId:c.id,date:c.trackingStartDate||today(),value:c.currentOdometer,note:'Восстановлено из текущего пробега',sourceType:'manual',sourceId:`legacy-current-${c.id}`}); const allVals=odometerLogs.filter(x=>x.carId===c.id).map(x=>nonneg(x.value)); c.currentOdometer=Math.max(c.initialOdometer,...(allVals.length?allVals:[0])); if(!c.trackingStartDate){const dates=odometerLogs.filter(x=>x.carId===c.id&&dateOK(x.date)).map(x=>x.date).sort();c.trackingStartDate=dates[0]||today();} }
  const theme=['system','light','dark'].includes(rs.theme)?rs.theme:base.settings.theme;
  const settings={...base.settings,theme,defaultWarnKm:nonneg(rs.defaultWarnKm??base.settings.defaultWarnKm,base.settings.defaultWarnKm),defaultWarnDays:nonneg(rs.defaultWarnDays??base.settings.defaultWarnDays,base.settings.defaultWarnDays),currency:'RUB',lastBackupAt:String(rs.lastBackupAt||'')};
  const next=Math.max(nonneg(raw.nextSeq,1),...serviceEntries.map(x=>nonneg(x.seq)+1),1);
  const refuels=(Array.isArray(raw.refuels)?raw.refuels:[]).map(x=>({...x,id:String(x.id||uid()),carId:String(x.carId||''),date:String(x.date||''),odometer:nonneg(x.odometer),fuelType:String(x.fuelType||'Бензин'),amount:nonneg(x.amount),liters:nonneg(x.liters),pricePerLiter:nonneg(x.pricePerLiter),fullTank:Boolean(x.fullTank),station:String(x.station||''),address:String(x.address||''),notes:String(x.notes||''),createdAt:String(x.createdAt||new Date().toISOString())}));
  const activeCarId=cars.some(c=>c.id===raw.activeCarId)?raw.activeCarId:(cars[0]?.id||null);
  return {...base,...raw,version:APP_VERSION,nextSeq:next,activeCarId,settings,cars,odometerLogs,serviceEntries,components,expenses,documents,refuels};
}

async function persist() { await saveState(state); }

function compareLifecycle(a,b){ return String(a.date||'').localeCompare(String(b.date||'')) || Number(a.odometer||0)-Number(b.odometer||0) || String(a.createdAt||'').localeCompare(String(b.createdAt||'')) || Number(a.seq||0)-Number(b.seq||0) || String(a.id||'').localeCompare(String(b.id||'')); }
function componentState(comp){
  let installedDate=comp.baseInstalledDate||comp.installedDate||today(), installedOdometer=nonneg(comp.baseInstalledOdometer??comp.installedOdometer);
  let lastInspectionDate=installedDate, lastInspectionOdometer=installedOdometer;
  const actions=state.serviceEntries.filter(e=>e.componentId===comp.id&&['inspect','replace'].includes(e.componentAction)).sort(compareLifecycle);
  for(const e of actions){ if(e.componentAction==='replace'){installedDate=e.date;installedOdometer=nonneg(e.odometer);lastInspectionDate=e.date;lastInspectionOdometer=nonneg(e.odometer);} else {lastInspectionDate=e.date;lastInspectionOdometer=nonneg(e.odometer);} }
  return {installedDate,installedOdometer,lastInspectionDate,lastInspectionOdometer};
}
function removeMileageSource(type,id){ state.odometerLogs=state.odometerLogs.filter(x=>!(x.sourceType===type&&x.sourceId===id)); const cid=car()?.id||state.serviceEntries.find(x=>x.id===id)?.carId||state.expenses.find(x=>x.id===id)?.carId; if(cid) recalculateCurrentOdometer(cid); }
function recordMileageObservation(value,date,note,sourceType,sourceId){ const c=car(); const carId=c?.id || state.serviceEntries.find(x=>x.id===sourceId)?.carId || state.expenses.find(x=>x.id===sourceId)?.carId; if(!carId)return; state.odometerLogs=state.odometerLogs.filter(x=>!(x.sourceType===sourceType&&x.sourceId===sourceId)); const n=nonneg(value); if(n>0)state.odometerLogs.push({id:uid(),carId,date,value:n,note,sourceType,sourceId}); recalculateCurrentOdometer(carId); }
function recalculateCurrentOdometer(carId){ const c=state.cars.find(x=>x.id===carId); if(!c)return 0; const vals=[nonneg(c.initialOdometer),...state.odometerLogs.filter(x=>x.carId===carId).map(x=>nonneg(x.value))]; c.currentOdometer=Math.max(...vals); return c.currentOdometer; }
function odometerTimeline(c=car()){
  if(!c)return[]; const byDate=new Map();
  const startDate=c.trackingStartDate||today(), initial=nonneg(c.initialOdometer); byDate.set(startDate,initial);
  for(const x of state.odometerLogs.filter(x=>x.carId===c.id&&dateOK(x.date)&&x.date>=startDate&&nonneg(x.value)>=initial)){const v=nonneg(x.value);byDate.set(x.date,Math.max(v,byDate.get(x.date)??-Infinity));}
  const current=nonneg(c.currentOdometer), loggedMax=byDate.size?Math.max(...byDate.values()):-Infinity; if(!byDate.size||current>loggedMax)byDate.set(today(),Math.max(current,byDate.get(today())??-Infinity));
  return [...byDate.entries()].map(([date,value])=>({date,value})).sort((a,b)=>a.date.localeCompare(b.date));
}
function linkedMileageFloor(carId=car()?.id){ if(!carId)return 0; const vals=[0]; for(const x of state.serviceEntries)if(x.carId===carId&&nonneg(x.odometer)>0)vals.push(nonneg(x.odometer)); for(const x of state.expenses)if(x.carId===carId&&nonneg(x.odometer)>0)vals.push(nonneg(x.odometer)); for(const x of state.components)if(x.carId===carId&&nonneg(x.baseInstalledOdometer)>0)vals.push(nonneg(x.baseInstalledOdometer)); return Math.max(...vals); }
function mileageConsistencyError(value,date,ignoreType='',ignoreId=''){
  const c=car(); if(!c||!dateOK(date))return null; const n=nonneg(value), logs=state.odometerLogs.filter(x=>x.carId===c.id&&!(x.sourceType===ignoreType&&x.sourceId===ignoreId)&&dateOK(x.date));
  const prev=logs.filter(x=>x.date<date).sort((a,b)=>b.date.localeCompare(a.date))[0]; const next=logs.filter(x=>x.date>date).sort((a,b)=>a.date.localeCompare(b.date))[0];
  if(prev&&n<nonneg(prev.value))return `На более раннюю дату уже записан пробег ${fmtNum(prev.value)} км. Проверь дату или показание.`;
  if(next&&n>nonneg(next.value))return `На более позднюю дату уже записан пробег ${fmtNum(next.value)} км. Проверь дату или показание.`;
  return null;
}
function trackedExpenses(c=car()){ if(!c)return[]; const start=c.trackingStartDate||''; return state.expenses.filter(x=>x.carId===c.id).filter(x=>(!start||!dateOK(x.date)||x.date>=start)&&(!x.odometer||nonneg(x.odometer)>=nonneg(c.initialOdometer))); }

function toast(message) {
  const root=$('#toast-root');
  const el=document.createElement('div');
  el.className='toast'; el.textContent=message; root.append(el);
  setTimeout(()=>{el.classList.add('hide'); setTimeout(()=>el.remove(),200)},2200);
}

function averageKmPerDay(c=car()) {
  const logs=odometerTimeline(c); if(logs.length<2)return 0; const first=logs[0], last=logs[logs.length-1]; const days=Math.max(1,daysBetween(first.date,last.date)); const delta=nonneg(last.value)-nonneg(first.value); return delta>0&&days>=7?delta/days:0;
}

function eventStatus({dueKm,dueDate,warnKm,warnDays}) {
  const km=currentKm(), t=today(); const kmOver=dueKm!=null&&km>dueKm, kmDue=dueKm!=null&&km===dueKm; const dateOver=dueDate&&t>dueDate, dateDue=dueDate&&t===dueDate;
  if(kmOver||dateOver)return 'overdue'; if(kmDue||dateDue)return 'due';
  const wk=Number(warnKm??state.settings.defaultWarnKm), wd=Number(warnDays??state.settings.defaultWarnDays);
  const kmSoon=dueKm!=null&&wk>0&&(dueKm-km)<=wk; const dateSoon=dueDate&&wd>0&&daysBetween(t,dueDate)<=wd; return kmSoon||dateSoon?'soon':'ok';
}

function describeDue(ev) {
  const bits=[];
  if (ev.dueKm!=null) {
    const rem=ev.dueKm-currentKm();
    bits.push(rem<=0 ? `просрочено на ${fmtNum(Math.abs(rem))} км` : `через ${fmtNum(rem)} км`);
  }
  if (ev.dueDate) {
    const d=daysBetween(today(),ev.dueDate);
    bits.push(d<=0 ? `дата ${fmtDate(ev.dueDate)} прошла` : `${fmtDate(ev.dueDate)} (${d} дн.)`);
  }
  if (!bits.length) return 'срок не задан';
  return bits.join(' · ');
}

function componentEvents(comp) {
  const events=[], cs=componentState(comp);
  if(nonneg(comp.lifeKm)>0||nonneg(comp.lifeMonths)>0){const dueKm=nonneg(comp.lifeKm)>0?cs.installedOdometer+nonneg(comp.lifeKm):null;const dueDate=nonneg(comp.lifeMonths)>0?addMonths(cs.installedDate,comp.lifeMonths):null;const ev={kind:'replace',componentId:comp.id,title:`Замена: ${comp.name}`,dueKm,dueDate,warnKm:comp.warnKm,warnDays:comp.warnDays};ev.status=eventStatus(ev);events.push(ev);}
  if(nonneg(comp.inspectKm)>0||nonneg(comp.inspectMonths)>0){const dueKm=nonneg(comp.inspectKm)>0?cs.lastInspectionOdometer+nonneg(comp.inspectKm):null;const dueDate=nonneg(comp.inspectMonths)>0?addMonths(cs.lastInspectionDate,comp.inspectMonths):null;const ev={kind:'inspect',componentId:comp.id,title:`Проверка: ${comp.name}`,dueKm,dueDate,warnKm:comp.warnKm,warnDays:comp.warnDays};ev.status=eventStatus(ev);events.push(ev);}
  return events;
}

function allReminders(includeOk=false) {
  if(!car())return[]; const list=[]; for(const comp of carItems(state.components))list.push(...componentEvents(comp)); for(const doc of carItems(state.documents)){const ev=documentEvent(doc);if(ev)list.push(ev);} const rank={overdue:0,due:1,soon:2,ok:3}; return list.filter(x=>includeOk||x.status!=='ok').sort((a,b)=>rank[a.status]-rank[b.status]||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||(a.dueKm??1e15)-(b.dueKm??1e15));
}
function componentOverall(comp){const evs=componentEvents(comp);if(!evs.length)return'neutral';if(evs.some(x=>x.status==='overdue'))return'overdue';if(evs.some(x=>x.status==='due'))return'due';if(evs.some(x=>x.status==='soon'))return'soon';return'ok';}
function componentProgress(comp){const cs=componentState(comp);if(!nonneg(comp.lifeKm)&&!nonneg(comp.lifeMonths))return 0;let ratios=[];if(nonneg(comp.lifeKm)>0)ratios.push((currentKm()-cs.installedOdometer)/nonneg(comp.lifeKm));if(nonneg(comp.lifeMonths)>0){const end=addMonths(cs.installedDate,comp.lifeMonths);const total=Math.max(1,daysBetween(cs.installedDate,end));ratios.push(daysBetween(cs.installedDate,today())/total);}return clamp(Math.max(...ratios,0),0,1.15);}

function pageHeaderTitle() {
  return ({home:'АвтоЖурнал',history:'История',parts:'Узлы',expenses:'Расходы',analytics:'Аналитика',documents:'Документы',more:'Ещё'})[ui.view] || 'АвтоЖурнал';
}

function topbar() {
  if(secondaryTitles[ui.view]){
    return `<header class="v5-subbar"><button class="v5-back" data-action="go-back" aria-label="Назад">‹</button><div class="v5-subbar-title">${secondaryTitles[ui.view]}</div><div class="v5-subbar-spacer"></div></header>`;
  }
  const c=car();
  const title=c?`${esc(c.make)} ${esc(c.model)}`:'АвтоЖурнал';
  const sub=c?(c.plate?esc(c.plate):`${fmtNum(c.currentOdometer)} км`):'Локальная сервисная книжка';
  return `<header class="v5-topbar">
    <button class="v5-car-head" data-action="${c?'car-switch':'add-car'}">
      <div class="v5-car-title">${title}<span class="v5-chevron">⌄</span></div>
      <div class="v5-car-sub">${sub}</div>
    </button>
    <button class="v5-avatar" data-action="open-profile" aria-label="Профиль">AJ</button>
  </header>`;
}

const tabs=[['home','Главная',icons.home],['records','Записи',icons.history],['refuels','Заправки',icons.fuel],['notifications','Уведомления',icons.bell]];
function tabbar(){
  const attention=allReminders().length;
  return `<div class="v5-tab-wrap"><nav class="v5-tabbar">
    ${tabs.map(([id,label,ic])=>`<button class="v5-tab ${ui.view===id?'active':''}" data-view="${id}" ${ui.view===id?'aria-current="page"':''}>${ic}<span>${label}</span>${id==='notifications'&&attention?'<i class="v5-unread"></i>':''}</button>`).join('')}
  </nav></div>`;
}

function emptyState(title,text,action,label,icon=icons.car){ return `<div class="empty"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-text">${text}</div>${action?`<button class="btn primary" data-action="${action}">${label}</button>`:''}</div>`; }
function statusPill(status){ const t={ok:'В норме',soon:'Скоро',due:'Срок наступил',overdue:'Просрочено',neutral:'Нет срока'}[status]||status; return `<span class="status-pill ${status}"><span class="status-dot"></span>${t}</span>`; }

function homePage(){
  const c=car();
  if(!c)return `<main class="v5-main"><div class="v5-page">
    <section class="v5-welcome">
      <div class="v5-welcome-icon">${icons.car}</div>
      <h1>Добавьте автомобиль</h1>
      <p>Ведите обслуживание, проверки, заправки, расходы и документы в одном месте.</p>
      <button class="v5-primary" data-action="add-car">Добавить автомобиль</button>
      <div class="v5-local-note">Все данные хранятся только на этом устройстве и доступны офлайн.</div>
    </section>
  </div></main>`;
  const entries=carItems(state.serviceEntries).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const docs=carItems(state.documents);
  const refs=carItems(state.refuels||[]);
  const ex=carItems(state.expenses);
  const monthKey=nowISO().slice(0,7);
  const monthExpenses=ex.filter(x=>String(x.date||'').startsWith(monthKey)).reduce((s,x)=>s+Number(x.amount||0),0);
  const driven=Math.max(0,currentKm()-nonneg(c.initialOdometer));
  const reminders=allReminders();
  return `<main class="v5-main"><div class="v5-page">
    <section class="v5-mileage-card">
      <div class="v5-mileage-label">Текущий пробег</div>
      <div class="v5-mileage-row"><div><strong>${fmtNum(c.currentOdometer)}</strong><span>км</span></div><button data-action="add-odometer">Изменить</button></div>
    </section>

    <section class="v5-section">
      <h2>Быстрый доступ</h2>
      <div class="v5-quick-two">
        <button class="v5-quick-card" data-action="add-entry"><div class="v5-round-icon">${icons.plus}</div><div><strong>Добавить запись</strong><span>Сервис, ТО, расходы и заметки</span></div><b>›</b></button>
        <button class="v5-quick-card" data-view="documents"><div class="v5-round-icon">${icons.doc}</div><div><strong>Документы</strong><span>${docs.length?`${docs.length} ${plural(docs.length,'документ','документа','документов')}`:'Нет документов'}</span></div><b>›</b></button>
      </div>
    </section>

    <section class="v5-section">
      <h2>Статистика</h2>
      <button class="v5-stats-card" data-view="analytics" aria-label="Открыть статистику">
        <div><span>Расходы</span><strong>${money(monthExpenses)}</strong><small>за этот месяц</small></div>
        <div><span>Пробег</span><strong>${fmtNum(driven)} км</strong><small>с начала учёта</small></div>
        <div><span>Заправки</span><strong>${refs.length}</strong><small>всего записей</small></div>
      </button>
    </section>

    ${reminders.length?`<section class="v5-section"><div class="v5-section-head"><h2>Требует внимания</h2><button data-view="notifications">Все</button></div><div class="v5-stack">${reminders.slice(0,2).map(reminderCard).join('')}</div></section>`:''}

    <section class="v5-section">
      <div class="v5-section-head"><h2>Последние записи</h2><button data-view="records">Все</button></div>
      ${entries.length?`<div class="v5-list">${entries.slice(0,3).map(entryRow).join('')}</div>`:emptyState('Записей пока нет','Добавьте первое обслуживание или заметку.','add-entry','Добавить запись',icons.history)}
    </section>
  </div></main>`;
}

function reminderCard(r){ return `<button class="reminder-card" data-action="reminder-open" data-id="${r.componentId||r.documentId||''}" data-kind="${r.kind}"><div class="reminder-symbol ${r.status}">${r.status==='overdue'?icons.alert:icons.calendar}</div><div><div class="reminder-title">${esc(r.title)}</div><div class="reminder-sub">${esc(describeDue(r))}</div></div>${statusPill(r.status)}</button>`; }

function entryRow(e){
  const meta=[fmtDate(e.date),nonneg(e.odometer)>0?`${fmtNum(e.odometer)} км`:'',e.category?esc(e.category):''].filter(Boolean).join(' · ');
  return `<button class="list-row" data-action="entry-detail" data-id="${e.id}"><div class="row-icon">${e.type==='repair'?icons.wrench:e.type==='inspection'?icons.check:icons.history}</div><div class="row-main"><div class="row-title">${esc(e.title)}</div><div class="row-sub">${meta}</div></div><div class="row-side">${totalServiceCost(e)?`<div class="row-value">${money(totalServiceCost(e))}</div>`:''}<div class="row-sub">›</div></div></button>`;
}

function historyPage(){
  if(!car())return `<main class="v5-main"><div class="v5-page">${emptyState('Сначала добавьте автомобиль','Записи привязываются к конкретной машине.','add-car','Добавить автомобиль')}</div></main>`;
  let items=carItems(state.serviceEntries).sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.seq||0)-Number(a.seq||0));
  if(ui.historyType!=='all')items=items.filter(x=>x.type===ui.historyType);
  if(ui.search.trim()){
    const q=ui.search.toLowerCase();
    items=items.filter(x=>[x.title,x.category,x.notes,x.workText,x.partsText].some(v=>String(v||'').toLowerCase().includes(q)));
  }
  return `<main class="v5-main"><div class="v5-page">
    <h1 class="v5-title">Записи</h1>
    <button class="v5-add-record" data-action="add-entry"><span>${icons.plus}</span><div><strong>Добавить запись</strong><small>Сервис, ТО, расходы и заметки</small></div><b>›</b></button>
    <div class="v5-record-tools">
      <label class="v5-search">${icons.search}<input data-input="history-search" value="${esc(ui.search)}" placeholder="Поиск"/></label>
      <select data-input="history-type">
        <option value="all">Все</option>
        <option value="maintenance" ${ui.historyType==='maintenance'?'selected':''}>ТО</option>
        <option value="repair" ${ui.historyType==='repair'?'selected':''}>Ремонт</option>
        <option value="replacement" ${ui.historyType==='replacement'?'selected':''}>Замена</option>
        <option value="inspection" ${ui.historyType==='inspection'?'selected':''}>Проверка</option>
        <option value="other" ${ui.historyType==='other'?'selected':''}>Другое</option>
      </select>
    </div>
    ${items.length?`<div class="v5-list">${items.map(entryRow).join('')}</div>`:emptyState('Ничего не найдено','Измените фильтр или добавьте новую запись.','add-entry','Добавить запись',icons.history)}
  </div></main>`;
}

function partsPage(){
  if(!car()) return `<main class="main-scroll"><div class="page">${emptyState('Сначала добавь автомобиль','Узлы и расходники привязываются к конкретной машине.','add-car','Добавить автомобиль')}</div></main>`;
  const comps=carItems(state.components).sort((a,b)=>({overdue:0,due:1,soon:2,ok:3,neutral:4}[componentOverall(a)]-({overdue:0,due:1,soon:2,ok:3,neutral:4}[componentOverall(b)])));
  return `<main class="main-scroll"><div class="page"><h1 class="page-title">Узлы и расходники</h1><p class="page-lead">Срок службы и график проверки работают независимо. Проверка сбрасывает только следующий осмотр, замена — весь цикл.</p>${comps.length?comps.map(componentCard).join(''):emptyState('Добавь первый узел','Например: масло, тормозные колодки, свечи, ремень ГРМ, аккумулятор или направляющие суппорта.','add-component','Добавить узел',icons.wrench)}</div><button class="fab" data-action="add-component">${icons.plus}</button></main>`;
}

function componentCard(c){ const st=componentOverall(c), p=componentProgress(c), rank={overdue:0,due:1,soon:2,ok:3}; const cs=componentState(c); const next=componentEvents(c).sort((a,b)=>rank[a.status]-rank[b.status]||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||(a.dueKm??1e15)-(b.dueKm??1e15))[0]; return `<button class="component-card" style="width:100%;text-align:left" data-action="component-detail" data-id="${c.id}"><div class="component-top"><div><div class="component-name">${esc(c.name)}</div><div class="component-meta">${[c.brand,c.partNumber,c.category].filter(Boolean).map(esc).join(' · ')||'Без дополнительной информации'}</div></div>${statusPill(st)}</div>${Number(c.lifeKm)||Number(c.lifeMonths)?`<div class="progress ${st}"><span style="width:${Math.min(100,p*100)}%"></span></div>`:''}<div class="component-detail"><span>${cs.installedOdometer!==''?`Установлено: ${fmtNum(cs.installedOdometer)} км`:'Пробег установки не указан'}</span><span>${next?esc(describeDue(next)):'Без интервалов'}</span></div></button>`; }

function expensesPage(){
  if(!car()) return `<main class="main-scroll"><div class="page">${emptyState('Сначала добавь автомобиль','Расходы будут храниться отдельно для каждой машины.','add-car','Добавить автомобиль')}</div></main>`;
  let items=carItems(state.expenses).sort((a,b)=>b.date.localeCompare(a.date));
  if(ui.expenseFilter!=='all') items=items.filter(x=>x.category===ui.expenseFilter);
  const total=items.reduce((s,x)=>s+Number(x.amount||0),0);
  const cats=[...new Set(carItems(state.expenses).map(x=>x.category).filter(Boolean))].sort();
  return `<main class="main-scroll"><div class="page"><h1 class="page-title">Расходы</h1><div class="stats-grid"><div class="stat-card"><div class="stat-value">${money(total)}</div><div class="stat-label">за выбранный фильтр</div></div><div class="stat-card"><div class="stat-value">${items.length}</div><div class="stat-label">операций</div></div></div><section class="section"><div class="toolbar"><select class="select-compact" style="max-width:none;flex:1" data-input="expense-filter"><option value="all">Все категории</option>${cats.map(c=>`<option ${ui.expenseFilter===c?'selected':''}>${esc(c)}</option>`).join('')}</select><button class="btn" data-view="analytics">Аналитика</button></div>${items.length?`<div class="list">${items.map(expenseRow).join('')}</div>`:emptyState('Расходов пока нет','Записывай топливо, ремонт, обслуживание, страховку, налоги и другие траты.','add-expense','Добавить расход',icons.wallet)}</section></div><button class="fab" data-action="add-expense">${icons.plus}</button></main>`;
}
function expenseRow(x){ return `<button class="list-row" data-action="expense-detail" data-id="${x.id}"><div class="row-icon">${x.category==='Топливо'?icons.fuel:icons.wallet}</div><div class="row-main"><div class="row-title">${esc(x.description||x.category)}</div><div class="row-sub">${fmtDate(x.date)} · ${esc(x.category||'Другое')}${x.odometer?` · ${fmtNum(x.odometer)} км`:''}</div></div><div class="row-side"><div class="row-value">${money(x.amount)}</div><div class="row-sub">›</div></div></button>`; }

function dateISO(d){return new Date(d).toISOString().slice(0,10);}
function analyticsPeriodBounds(key=ui.analyticsPeriod||'month'){
  const now=new Date(`${today()}T12:00:00`);
  if(key==='all')return {key,start:null,end:null,label:'Всё время'};
  if(key==='month'){const start=new Date(now.getFullYear(),now.getMonth(),1,12);return {key,start:dateISO(start),end:today(),label:'Этот месяц'};}
  if(key==='lastMonth'){const start=new Date(now.getFullYear(),now.getMonth()-1,1,12),end=new Date(now.getFullYear(),now.getMonth(),0,12);return {key,start:dateISO(start),end:dateISO(end),label:'Прошлый месяц'};}
  if(key==='90'){const start=new Date(now);start.setDate(start.getDate()-89);return {key,start:dateISO(start),end:today(),label:'Последние 90 дней'};}
  if(key==='year')return {key,start:`${now.getFullYear()}-01-01`,end:today(),label:'Этот год'};
  return {key:'all',start:null,end:null,label:'Всё время'};
}
function dateInAnalyticsPeriod(date,bounds){if(!dateOK(date))return !bounds.start;return (!bounds.start||date>=bounds.start)&&(!bounds.end||date<=bounds.end);}
function analyticsMileage(c,bounds){
  if(!c)return {distance:0,avg:0,startValue:0,endValue:0,logs:[]};
  const logs=odometerTimeline(c);
  if(!bounds.start)return {distance:Math.max(0,currentKm()-nonneg(c.initialOdometer)),avg:averageKmPerDay(c),startValue:nonneg(c.initialOdometer),endValue:currentKm(),logs:logs.slice().reverse()};
  const end=logs.filter(x=>x.date<=bounds.end).at(-1);let start=logs.filter(x=>x.date<=bounds.start).at(-1);
  if(!start)start=logs.find(x=>x.date>=bounds.start&&x.date<=bounds.end)||null;
  const periodLogs=logs.filter(x=>dateInAnalyticsPeriod(x.date,bounds)).reverse();
  if(!end||!start||end.date<start.date)return {distance:0,avg:0,startValue:start?.value||0,endValue:end?.value||0,logs:periodLogs};
  const distance=Math.max(0,nonneg(end.value)-nonneg(start.value)),days=Math.max(1,daysBetween(bounds.start,bounds.end)+1);
  return {distance,avg:distance/days,startValue:start.value,endValue:end.value,logs:periodLogs};
}

function analyticsPage(){
  if(!car())return `<main class="v5-main"><div class="v5-page">${emptyState('Нет автомобиля','Для статистики нужны данные конкретной машины.','add-car','Добавить автомобиль')}</div></main>`;
  const c=car(),bounds=analyticsPeriodBounds(),allEx=carItems(state.expenses),allRefs=carItems(state.refuels||[]);
  const ex=allEx.filter(x=>dateInAnalyticsPeriod(x.date,bounds)),refs=allRefs.filter(x=>dateInAnalyticsPeriod(x.date,bounds));
  const total=ex.reduce((sum,x)=>sum+Number(x.amount||0),0),mileage=analyticsMileage(c,bounds),cpk=mileage.distance>0?total/mileage.distance:0;
  const liters=refs.reduce((sum,x)=>sum+Number(x.liters||0),0),fuelSpend=refs.reduce((sum,x)=>sum+Number(x.amount||0),0),avgPrice=liters>0?fuelSpend/liters:0;
  const catMap={};ex.forEach(x=>catMap[x.category||'Другое']=(catMap[x.category||'Другое']||0)+Number(x.amount||0));
  const cats=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,8),tab=ui.analyticsTab||'expenses';let content='';
  if(tab==='mileage')content=`<div class="v5-analytics-grid"><div class="stat-card"><div class="stat-value">${fmtNum(mileage.distance)} км</div><div class="stat-label">пробег за период</div></div><div class="stat-card"><div class="stat-value">${mileage.avg?`${fmtNum(mileage.avg,1)} км`:'—'}</div><div class="stat-label">в среднем за день</div></div><div class="stat-card"><div class="stat-value">${fmtNum(c.currentOdometer)} км</div><div class="stat-label">текущий одометр</div></div></div><section class="section"><div class="section-title">История пробега</div>${mileage.logs.length?`<div class="v5-list">${mileage.logs.slice(0,16).map(x=>`<div class="list-row"><div class="row-icon">${icons.speed}</div><div class="row-main"><div class="row-title">${fmtNum(x.value)} км</div><div class="row-sub">${fmtDate(x.date)}</div></div></div>`).join('')}</div>`:emptyState('Нет показаний за период','Измените период или обновите пробег.',null,null,icons.speed)}</section>`;
  else if(tab==='refuels'){const fuelAll=fuelJournalStats(allRefs),periodCycles=fuelAll.cycles.filter(x=>dateInAnalyticsPeriod(x.endDate,bounds)),periodFuel=fuelCycleSummary(periodCycles),stationMap=new Map();refs.forEach(x=>{const name=String(x.station||'').trim();if(name)stationMap.set(name,(stationMap.get(name)||0)+1);});const favorite=[...stationMap.entries()].sort((a,b)=>b[1]-a[1])[0];content=`<div class="v5-analytics-grid"><div class="stat-card"><div class="stat-value">${refs.length}</div><div class="stat-label">заправок</div></div><div class="stat-card"><div class="stat-value">${fuelConsumptionText(periodFuel.consumption)}</div><div class="stat-label">средний расход</div></div><div class="stat-card"><div class="stat-value">${fuelCost100Text(periodFuel.cost100)}</div><div class="stat-label">стоимость 100 км</div></div><div class="stat-card"><div class="stat-value">${avgPrice?`${fmtNum(avgPrice,2)} ₽/л`:'—'}</div><div class="stat-label">средняя цена</div></div><div class="stat-card"><div class="stat-value">${favorite?esc(favorite[0]):'—'}</div><div class="stat-label">любимая АЗС</div></div><div class="stat-card"><div class="stat-value">${money(fuelSpend)}</div><div class="stat-label">потрачено</div></div></div><section class="section"><div class="section-title">Заправки за период</div>${refs.length?`<div class="v5-list">${refs.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,16).map(refuelRow).join('')}</div>`:emptyState('Заправок за период нет','Измените период или добавьте заправку.',null,null,icons.fuel)}</section>`;}
  else content=`<div class="v5-analytics-grid"><div class="stat-card"><div class="stat-value">${money(total)}</div><div class="stat-label">расходы за период</div></div><div class="stat-card"><div class="stat-value">${cpk?`${fmtNum(cpk,2)} ₽`:'—'}</div><div class="stat-label">стоимость 1 км</div></div><div class="stat-card"><div class="stat-value">${ex.length}</div><div class="stat-label">операций</div></div></div><section class="section"><div class="section-title">По категориям</div>${cats.length?`<div class="v5-list">${cats.map(([name,value])=>`<div class="list-row"><div class="row-icon">${icons.wallet}</div><div class="row-main"><div class="row-title">${esc(name)}</div></div><div class="row-value">${money(value)}</div></div>`).join('')}</div>`:emptyState('Расходов за период нет','Измените период или добавьте запись.',null,null,icons.chart)}</section>`;
  return `<main class="v5-main"><div class="v5-page v5-secondary-page"><div class="v5-analytics-toolbar"><label><span>Период</span><select data-input="analytics-period"><option value="month" ${ui.analyticsPeriod==='month'?'selected':''}>Этот месяц</option><option value="lastMonth" ${ui.analyticsPeriod==='lastMonth'?'selected':''}>Прошлый месяц</option><option value="90" ${ui.analyticsPeriod==='90'?'selected':''}>Последние 90 дней</option><option value="year" ${ui.analyticsPeriod==='year'?'selected':''}>Этот год</option><option value="all" ${ui.analyticsPeriod==='all'?'selected':''}>Всё время</option></select></label></div><div class="v5-segment v5-stat-segment"><button class="${tab==='mileage'?'active':''}" data-action="analytics-tab" data-value="mileage">Пробег</button><button class="${tab==='expenses'?'active':''}" data-action="analytics-tab" data-value="expenses">Расходы</button><button class="${tab==='refuels'?'active':''}" data-action="analytics-tab" data-value="refuels">Заправки</button></div>${content}</div></main>`;
}

function documentsPage(){
  if(!car())return `<main class="v5-main"><div class="v5-page">${emptyState('Нет автомобиля','Документы привязываются к машине.','add-car','Добавить автомобиль')}</div></main>`;
  const docs=carItems(state.documents).sort((a,b)=>(a.expiryDate||'9999').localeCompare(b.expiryDate||'9999')),attention=docs.filter(d=>{const ev=documentEvent(d);return ev&&ev.status!=='ok';}),regular=docs.filter(d=>!attention.some(a=>a.id===d.id));
  return `<main class="v5-main"><div class="v5-page v5-secondary-page"><p class="v5-secondary-lead">Страховки, диагностические карты и другие файлы. Всё хранится локально.</p>${attention.length?`<section class="section v5-doc-attention"><div class="section-title">Скоро истечёт срок</div><div class="v5-list">${attention.map(docRow).join('')}</div></section>`:''}<section class="section"><div class="section-title">${attention.length?'Остальные документы':'Документы'}</div>${regular.length?`<div class="v5-list">${regular.map(docRow).join('')}</div>`:attention.length?'':emptyState('Документов пока нет','Добавьте первый документ.','add-document','Добавить документ',icons.doc)}</section><button class="v5-primary v5-wide v5-secondary-action" data-action="add-document">${icons.plus} Добавить документ</button></div></main>`;
}
function documentEvent(d){
  if(!d?.expiryDate)return null;
  const ev={kind:'document',documentId:d.id,title:`Документ: ${d.title}`,dueDate:d.expiryDate,dueKm:null,warnDays:Number(d.remindDays??30),warnKm:0};
  ev.status=eventStatus(ev);return ev;
}
function docRow(d){
  const ev=documentEvent(d);
  return `<button class="list-row" data-action="document-detail" data-id="${d.id}"><div class="row-icon">${icons.doc}</div><div class="row-main"><div class="row-title">${esc(d.title)}</div><div class="row-sub">${esc(d.type||'Документ')}${d.expiryDate?` · до ${fmtDate(d.expiryDate)}`:''}</div></div><div class="row-side">${ev?statusPill(ev.status):''}<div class="row-sub">${(d.files||[]).length} ${plural((d.files||[]).length,'файл','файла','файлов')}</div></div></button>`;
}

async function storageInfoText(){ try{if(!navigator.storage?.estimate)return 'Недоступно'; const {usage=0,quota=0}=await navigator.storage.estimate(); return `${fmtNum(usage/1024/1024,1)} из ${fmtNum(quota/1024/1024,0)} МБ`; }catch{return 'Недоступно';}}

function morePage(){
  return `<main class="v5-main"><div class="v5-page"><h1 class="v5-title">Настройки</h1><div class="v5-menu-page"><div class="v5-setting-row"><div><strong>Тема</strong><span>Системная, светлая или тёмная</span></div><select data-input="theme"><option value="system" ${state.settings.theme==='system'?'selected':''}>Система</option><option value="light" ${state.settings.theme==='light'?'selected':''}>Светлая</option><option value="dark" ${state.settings.theme==='dark'?'selected':''}>Тёмная</option></select></div><button data-action="calendar-export">${icons.calendar}<span><strong>Экспорт напоминаний</strong><small>Файл .ics для системного календаря</small></span><b>›</b></button><button data-action="backup-export">${icons.export}<span><strong>Резервная копия</strong><small>Все локальные данные в JSON</small></span><b>›</b></button><button data-action="backup-import">${icons.import}<span><strong>Восстановить копию</strong><small>Заменит текущие данные после подтверждения</small></span><b>›</b></button><button data-action="persist-storage">${icons.check}<span><strong>Защитить хранилище</strong><small>Запросить persistent storage</small></span><b>›</b></button></div><section class="section"><button class="btn danger block" data-action="reset-all">Удалить все локальные данные</button></section></div><input id="backup-input" type="file" accept="application/json,.json" hidden></main>`;
}


function orderedRefuels(items=carItems(state.refuels||[])){
  return [...items].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))||nonneg(a.odometer)-nonneg(b.odometer));
}
function fuelCycles(items=carItems(state.refuels||[])){
  const list=orderedRefuels(items),cycles=[];let prevFull=-1;
  for(let i=0;i<list.length;i++){
    const cur=list[i];
    if(!cur.fullTank||nonneg(cur.odometer)<=0)continue;
    if(prevFull>=0){
      const prev=list[prevFull],distance=nonneg(cur.odometer)-nonneg(prev.odometer);
      const segment=list.slice(prevFull+1,i+1);
      const liters=segment.reduce((sum,x)=>sum+nonneg(x.liters),0);
      const amount=segment.reduce((sum,x)=>sum+nonneg(x.amount),0);
      if(distance>0&&liters>0)cycles.push({
        startRefuelId:prev.id,endRefuelId:cur.id,startDate:prev.date,endDate:cur.date,
        startOdometer:nonneg(prev.odometer),endOdometer:nonneg(cur.odometer),
        distance,liters,amount,consumption:liters/distance*100,cost100:amount/distance*100,
        station:cur.station||'',fuelType:cur.fuelType||''
      });
    }
    prevFull=i;
  }
  return cycles;
}
function fuelCycleSummary(cycles){
  const distance=cycles.reduce((s,x)=>s+x.distance,0),liters=cycles.reduce((s,x)=>s+x.liters,0),amount=cycles.reduce((s,x)=>s+x.amount,0);
  return {distance,liters,amount,consumption:distance>0?liters/distance*100:0,cost100:distance>0?amount/distance*100:0};
}
function fuelJournalStats(items=carItems(state.refuels||[])){
  const list=orderedRefuels(items),cycles=fuelCycles(list),now=today(),month=now.slice(0,7),year=now.slice(0,4);
  const all=fuelCycleSummary(cycles),monthSummary=fuelCycleSummary(cycles.filter(x=>String(x.endDate).startsWith(month))),yearSummary=fuelCycleSummary(cycles.filter(x=>String(x.endDate).startsWith(year)));
  const priced=list.filter(x=>nonneg(x.liters)>0&&nonneg(x.amount)>0),priceLiters=priced.reduce((s,x)=>s+nonneg(x.liters),0),priceAmount=priced.reduce((s,x)=>s+nonneg(x.amount),0);
  const stationMap=new Map();
  for(const x of list){const name=String(x.station||'').trim();if(!name)continue;const v=stationMap.get(name)||{name,count:0,amount:0,liters:0};v.count++;v.amount+=nonneg(x.amount);v.liters+=nonneg(x.liters);stationMap.set(name,v);}
  const stations=[...stationMap.values()].sort((a,b)=>b.count-a.count||b.amount-a.amount);
  const tanks=list.filter(x=>x.fullTank&&nonneg(x.amount)>0).sort((a,b)=>nonneg(a.amount)-nonneg(b.amount));
  return {
    list,cycles,all,month:monthSummary,year:yearSummary,
    avgPrice:priceLiters>0?priceAmount/priceLiters:0,
    favoriteStation:stations[0]||null,
    cheapestTank:tanks[0]||null,
    expensiveTank:tanks.at(-1)||null,
    cycleByRefuel:new Map(cycles.map(x=>[x.endRefuelId,x]))
  };
}
function fuelConsumptionText(v){return v>0?`${fmtNum(v,2)} л/100 км`:'—';}
function fuelCost100Text(v){return v>0?`${fmtNum(v,0)} ₽/100 км`:'—';}

function refuelRow(x){
  const cycle=fuelJournalStats().cycleByRefuel.get(x.id);
  return `<button class="list-row" data-action="refuel-detail" data-id="${x.id}">
    <div class="row-icon">${icons.fuel}</div>
    <div class="row-main"><div class="row-title">${esc(x.station||x.fuelType||'Заправка')}${x.fullTank?' · полный бак':''}</div><div class="row-sub">${fmtDate(x.date)} · ${fmtNum(x.odometer)} км${x.liters?` · ${fmtNum(x.liters,2)} л`:''}${cycle?` · ${fuelConsumptionText(cycle.consumption)}`:''}</div></div>
    <div class="row-side"><div class="row-value">${money(x.amount)}</div><div class="row-sub">›</div></div>
  </button>`;
}

function refuelsPage(){
  if(!car())return `<main class="v5-main"><div class="v5-page">${emptyState('Сначала добавьте автомобиль','Заправки привязываются к конкретной машине.','add-car','Добавить автомобиль')}</div></main>`;
  const items=carItems(state.refuels||[]).sort((a,b)=>String(b.date).localeCompare(String(a.date))),stats=fuelJournalStats(items);
  const liters=items.reduce((sum,x)=>sum+nonneg(x.liters),0),total=items.reduce((sum,x)=>sum+nonneg(x.amount),0);
  const cheap=stats.cheapestTank,expensive=stats.expensiveTank;
  return `<main class="v5-main"><div class="v5-page">
    <h1 class="v5-title">Заправки</h1>
    <button class="v5-primary v5-wide" data-action="add-refuel">${icons.plus} Добавить заправку</button>
    <div class="v5-fuel-summary"><div><span>Заправок</span><strong>${items.length}</strong></div><div><span>Топливо</span><strong>${fmtNum(liters,1)} л</strong></div><div><span>Сумма</span><strong>${money(total)}</strong></div></div>

    <section class="v5-section"><h2>Расход топлива</h2>
      <div class="v5-fuel-metrics">
        <div><span>Всё время</span><strong>${fuelConsumptionText(stats.all.consumption)}</strong><small>${stats.all.distance?`${fmtNum(stats.all.distance)} км по полным бакам`:'Нужно минимум 2 полных бака'}</small></div>
        <div><span>Этот месяц</span><strong>${fuelConsumptionText(stats.month.consumption)}</strong><small>по завершённым циклам</small></div>
        <div><span>Этот год</span><strong>${fuelConsumptionText(stats.year.consumption)}</strong><small>по завершённым циклам</small></div>
        <div><span>Стоимость 100 км</span><strong>${fuelCost100Text(stats.all.cost100)}</strong><small>между полными баками</small></div>
      </div>
      <div class="v5-fuel-note">Расход считается методом «полный бак → полный бак». Все промежуточные неполные заправки между ними тоже учитываются.</div>
    </section>

    <section class="v5-section"><h2>Топливная статистика</h2>
      <div class="v5-fuel-facts">
        <div><span>Средняя цена литра</span><strong>${stats.avgPrice?`${fmtNum(stats.avgPrice,2)} ₽/л`:'—'}</strong></div>
        <div><span>Любимая АЗС</span><strong>${stats.favoriteStation?esc(stats.favoriteStation.name):'—'}</strong><small>${stats.favoriteStation?`${stats.favoriteStation.count} ${plural(stats.favoriteStation.count,'заправка','заправки','заправок')}`:''}</small></div>
        <div><span>Самый дешёвый полный бак</span><strong>${cheap?money(cheap.amount):'—'}</strong><small>${cheap?`${esc(cheap.station||cheap.fuelType)} · ${fmtDate(cheap.date)}`:''}</small></div>
        <div><span>Самый дорогой полный бак</span><strong>${expensive?money(expensive.amount):'—'}</strong><small>${expensive?`${esc(expensive.station||expensive.fuelType)} · ${fmtDate(expensive.date)}`:''}</small></div>
      </div>
    </section>

    <section class="v5-section"><h2>История</h2>
      ${items.length?`<div class="v5-list">${items.map(refuelRow).join('')}</div>`:emptyState('Заправок пока нет','Добавьте первую заправку вручную.','add-refuel','Добавить заправку',icons.fuel)}
    </section>
  </div></main>`;
}

function appNotifications(){
  const out=[],last=state.settings.lastBackupAt?new Date(state.settings.lastBackupAt):null,age=last?Math.floor((Date.now()-last.getTime())/86400000):Infinity;
  if(!last||age>=30)out.push({id:'backup',title:last?'Обновите резервную копию':'Создайте резервную копию',text:last?`Последняя копия создана ${age} дн. назад.`:'Локальные данные лучше периодически сохранять в JSON-файл.',date:last?fmtDate(state.settings.lastBackupAt.slice(0,10)):'Не создана',icon:icons.export,action:'backup-export',status:'soon'});
  out.push({id:'local',title:'Данные хранятся локально',text:'AutoJournal работает без аккаунта и облака. Данные остаются на этом устройстве.',date:'Всегда',icon:icons.check,status:'ok'});return out;
}

function autoNotifications(){
  const out=allReminders().map((x,i)=>({id:`rem-${i}`,title:x.title,text:describeDue(x),date:x.dueDate?fmtDate(x.dueDate):(x.dueKm!=null?`${fmtNum(x.dueKm)} км`:'Сейчас'),event:x,status:x.status,icon:x.kind==='document'?icons.doc:x.kind==='inspect'?icons.check:icons.wrench}));
  const c=car();if(c){const logs=odometerTimeline(c),last=logs.at(-1);if(last&&daysBetween(last.date,today())>=14)out.unshift({id:'odo',title:'Обновить пробег',text:`Последнее показание: ${fmtNum(last.value)} км. Актуальный пробег помогает точнее рассчитывать сроки.`,date:fmtDate(last.date),icon:icons.speed,action:'add-odometer',status:'soon'});}return out;
}

function notificationsPage(){
  const items=ui.notificationTab==='app'?appNotifications():autoNotifications(),statusText={overdue:'Просрочено',due:'Срок наступил',soon:'Скоро',ok:'В порядке'};
  return `<main class="v5-main"><div class="v5-page"><h1 class="v5-title">Уведомления</h1><div class="v5-segment"><button class="${ui.notificationTab==='app'?'active':''}" data-action="notif-tab" data-value="app">Приложение</button><button class="${ui.notificationTab==='auto'?'active':''}" data-action="notif-tab" data-value="auto">Авто</button></div>${items.length?`<div class="v5-notify-list">${items.map(n=>`<button class="v5-notify-card ${n.status?`status-${n.status}`:''}" ${n.event?`data-action="reminder-open" data-kind="${n.event.kind}" data-id="${n.event.documentId||n.event.componentId||''}"`:n.action?`data-action="${n.action}"`:''}><div class="v5-notify-icon">${n.icon}</div><div><div class="v5-notify-title-row"><strong>${esc(n.title)}</strong>${n.status?`<span class="v5-notify-status">${statusText[n.status]||''}</span>`:''}</div><p>${esc(n.text)}</p><span>${esc(n.date)}</span></div></button>`).join('')}</div>`:emptyState('Уведомлений нет','Здесь появятся сроки обслуживания, документов и полезные напоминания.',null,null,icons.bell)}</div></main>`;
}

function carSpecValue(v,suffix=''){return String(v||'').trim()?`${esc(v)}${suffix}`:'—';}
function customSpecRows(text=''){
  return String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const i=line.indexOf(':');return i>0?[line.slice(0,i).trim(),line.slice(i+1).trim()]:[line,''];});
}
function carCardPage(){
  const c=car();if(!c)return `<main class="v5-main"><div class="v5-page">${emptyState('Нет автомобиля','Добавьте автомобиль, чтобы открыть его паспорт.','add-car','Добавить автомобиль')}</div></main>`;
  const custom=customSpecRows(c.customSpecs);
  return `<main class="v5-main"><div class="v5-page v5-secondary-page">
    <section class="v5-car-passport-hero">${c.photo?`<img src="${c.photo}" alt="${esc(c.make)} ${esc(c.model)}">`:`<div class="v5-car-passport-placeholder">${icons.car}</div>`}<div><h1>${esc(c.make)} ${esc(c.model)}</h1><p>${[c.year,c.trim,c.plate].filter(Boolean).map(esc).join(' · ')||'Паспорт автомобиля'}</p><strong>${fmtNum(c.currentOdometer)} км</strong></div></section>
    <div class="v5-passport-actions"><button class="v5-primary" data-action="edit-current-car">${icons.edit} Изменить</button><button class="btn" data-view="report">${icons.doc} Отчёт</button></div>
    <section class="v5-passport-section"><h2>Основные данные</h2><div class="v5-spec-grid">
      <div><span>VIN</span><strong>${carSpecValue(c.vin)}</strong></div><div><span>Госномер</span><strong>${carSpecValue(c.plate)}</strong></div>
      <div><span>Комплектация</span><strong>${carSpecValue(c.trim)}</strong></div><div><span>Год</span><strong>${carSpecValue(c.year)}</strong></div>
      <div><span>Двигатель</span><strong>${carSpecValue(c.engine)}</strong></div><div><span>Объём</span><strong>${carSpecValue(c.engineVolume,c.engineVolume?' л':'')}</strong></div>
      <div><span>Мощность</span><strong>${c.powerHp?`${fmtNum(c.powerHp)} л.с.`:'—'}</strong></div><div><span>Коробка</span><strong>${carSpecValue(c.transmission)}</strong></div>
      <div><span>Топливо</span><strong>${carSpecValue(c.fuelType)}</strong></div><div><span>Шины</span><strong>${carSpecValue(c.tireSize)}</strong></div>
    </div></section>
    <section class="v5-passport-section"><h2>Масла и жидкости</h2><div class="v5-spec-grid">
      <div><span>Моторное масло</span><strong>${carSpecValue(c.engineOil)}</strong></div><div><span>Объём масла</span><strong>${carSpecValue(c.engineOilVolume,c.engineOilVolume?' л':'')}</strong></div>
      <div><span>Охлаждающая жидкость</span><strong>${carSpecValue(c.coolantVolume,c.coolantVolume?' л':'')}</strong></div><div><span>Масло КПП</span><strong>${carSpecValue(c.transmissionOilVolume,c.transmissionOilVolume?' л':'')}</strong></div>
      <div><span>Тормозная жидкость</span><strong>${carSpecValue(c.brakeFluidVolume,c.brakeFluidVolume?' л':'')}</strong></div><div><span>Жидкость ГУР</span><strong>${carSpecValue(c.steeringFluidVolume,c.steeringFluidVolume?' л':'')}</strong></div>
    </div></section>
    ${custom.length?`<section class="v5-passport-section"><h2>Дополнительные характеристики</h2><div class="v5-spec-list">${custom.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v||'—')}</strong></div>`).join('')}</div></section>`:''}
    <section class="v5-passport-section"><h2>Покупка и учёт</h2><div class="v5-spec-grid"><div><span>Дата покупки</span><strong>${fmtDate(c.purchaseDate)}</strong></div><div><span>Цена покупки</span><strong>${c.purchasePrice?money(c.purchasePrice):'—'}</strong></div><div><span>Пробег начала учёта</span><strong>${fmtNum(c.initialOdometer)} км</strong></div><div><span>Текущий пробег</span><strong>${fmtNum(c.currentOdometer)} км</strong></div></div></section>
  </div></main>`;
}
function reportTable(title,headers,rows){
  if(!rows.length)return `<section class="v5-report-section"><h2>${esc(title)}</h2><div class="v5-report-empty">Нет записей</div></section>`;
  return `<section class="v5-report-section"><h2>${esc(title)}</h2><div class="v5-report-table-wrap"><table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}
function reportPage(){
  const c=car();if(!c)return `<main class="v5-main"><div class="v5-page">${emptyState('Нет автомобиля','Для отчёта нужен автомобиль.','add-car','Добавить автомобиль')}</div></main>`;
  const full=ui.reportMode==='full',entries=carItems(state.serviceEntries).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))),replacements=entries.filter(x=>x.componentAction==='replace'||x.type==='replacement'),components=carItems(state.components),docs=carItems(state.documents),expenses=carItems(state.expenses),refs=carItems(state.refuels||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))),fuel=fuelJournalStats(refs),totalExpenses=expenses.reduce((sum,x)=>sum+nonneg(x.amount),0),reminders=allReminders();
  const specs=[[c.trim,'Комплектация'],[c.engine,'Двигатель'],[c.engineVolume&&`${c.engineVolume} л`,'Объём двигателя'],[c.powerHp&&`${fmtNum(c.powerHp)} л.с.`,'Мощность'],[c.transmission,'Коробка'],[c.fuelType,'Топливо'],[c.tireSize,'Шины'],[c.engineOil,'Моторное масло']].filter(x=>x[0]);
  return `<main class="v5-main v5-report-main"><div class="v5-page v5-secondary-page v5-report-page">
    <div class="v5-report-controls"><div class="v5-segment v5-report-mode"><button class="${!full?'active':''}" data-action="report-mode" data-value="short">Короткий</button><button class="${full?'active':''}" data-action="report-mode" data-value="full">Полный</button></div><button class="v5-primary v5-wide" data-action="print-report">${icons.export} Сохранить PDF</button><p>Откроется системное окно печати. На iPhone из предпросмотра можно сохранить или отправить PDF.</p></div>
    <article class="v5-report-paper">
      <header class="v5-report-header">${c.photo?`<img src="${c.photo}" alt="">`:''}<div><div class="v5-report-brand">AutoJournal</div><h1>${esc(c.make)} ${esc(c.model)}</h1><p>${[c.year,c.trim,c.plate].filter(Boolean).map(esc).join(' · ')}</p><strong>${fmtNum(c.currentOdometer)} км</strong></div></header>
      <section class="v5-report-section"><h2>Паспорт автомобиля</h2><div class="v5-report-specs"><div><span>VIN</span><strong>${esc(c.vin||'—')}</strong></div>${specs.map(([v,k])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div></section>
      <section class="v5-report-section"><h2>Сводка эксплуатации</h2><div class="v5-report-kpis"><div><span>Расходы</span><strong>${money(totalExpenses)}</strong></div><div><span>Сервисных записей</span><strong>${entries.length}</strong></div><div><span>Средний расход</span><strong>${fuelConsumptionText(fuel.all.consumption)}</strong></div><div><span>Стоимость 100 км</span><strong>${fuelCost100Text(fuel.all.cost100)}</strong></div><div><span>Заправок</span><strong>${refs.length}</strong></div><div><span>Требует внимания</span><strong>${reminders.filter(x=>x.status!=='ok').length}</strong></div></div></section>
      ${reportTable('Ближайшее обслуживание',['Событие','Срок'],reminders.slice(0,8).map(x=>[x.title,describeDue(x)]))}
      ${full?reportTable('История обслуживания',['Дата','Пробег','Запись','Стоимость'],entries.map(x=>[fmtDate(x.date),x.odometer?`${fmtNum(x.odometer)} км`:'—',x.title,money(totalServiceCost(x))])):''}
      ${full?reportTable('Замены деталей',['Дата','Пробег','Деталь / работа','Стоимость'],replacements.map(x=>[fmtDate(x.date),x.odometer?`${fmtNum(x.odometer)} км`:'—',x.title,money(totalServiceCost(x))])):''}
      ${full?reportTable('Узлы и детали',['Узел','Установлено','Пробег установки','Ресурс / проверка'],components.map(x=>[x.name,fmtDate(x.installedDate),`${fmtNum(x.installedOdometer)} км`,[x.lifeKm?`${fmtNum(x.lifeKm)} км`:'',x.lifeMonths?`${fmtNum(x.lifeMonths)} мес.`:'',x.inspectKm?`проверка ${fmtNum(x.inspectKm)} км`:'',x.inspectMonths?`проверка ${fmtNum(x.inspectMonths)} мес.`:''].filter(Boolean).join(' · ')])):''}
      ${full?reportTable('Документы',['Документ','Номер','Выдан','Действует до'],docs.map(x=>[x.title,x.number||'—',fmtDate(x.issueDate),fmtDate(x.expiryDate)])):''}
      ${full?reportTable('Расходы',['Дата','Категория','Описание','Сумма'],expenses.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>[fmtDate(x.date),x.category,x.description||'',money(x.amount)])):''}
      ${full?reportTable('Заправки',['Дата','Пробег','АЗС','Топливо','Объём','Сумма'],refs.map(x=>[fmtDate(x.date),`${fmtNum(x.odometer)} км`,x.station||'—',x.fuelType,`${fmtNum(x.liters,2)} л`,money(x.amount)])):''}
      <footer class="v5-report-footer">Сформировано в AutoJournal · ${fmtDate(today())}</footer>
    </article>
  </div></main>`;
}

function profilePage(){
  const c=car();
  return `<main class="v5-main"><div class="v5-page v5-secondary-page">
    <div class="v5-profile-card"><div class="v5-profile-avatar">AJ</div><div><strong>AutoJournal</strong><span>${c?`${esc(c.make)} ${esc(c.model)}`:'Локальное приложение'}</span></div></div>
    <div class="v5-menu">
      <button data-view="carcard">${icons.car}<span><strong>Паспорт автомобиля</strong><small>Фото, комплектация, жидкости и характеристики</small></span><b>›</b></button>
      <button data-view="report">${icons.doc}<span><strong>Отчёт автомобиля</strong><small>Короткий или полный отчёт в PDF</small></span><b>›</b></button>
      <button data-view="documents">${icons.doc}<span><strong>Документы</strong><small>Файлы и сроки действия</small></span><b>›</b></button>
      <button data-view="analytics">${icons.chart}<span><strong>Статистика</strong><small>Пробег, расходы и заправки</small></span><b>›</b></button>
      <button data-view="parts">${icons.wrench}<span><strong>Контроль обслуживания</strong><small>Срок службы и графики проверок</small></span><b>›</b></button>
      <button data-action="car-switch">${icons.car}<span><strong>Автомобили</strong><small>${state.cars.length} ${plural(state.cars.length,'автомобиль','автомобиля','автомобилей')}</small></span><b>›</b></button>
      <button data-view="more">${icons.gear}<span><strong>Настройки</strong><small>Тема, резервная копия, календарь</small></span><b>›</b></button>
    </div>
  </div></main>`;
}

function profileSheet(){
  const c=car();
  return sheetWrap('Профиль',`<div class="v5-profile-card"><div class="v5-profile-avatar">AJ</div><div><strong>AutoJournal</strong><span>${c?`${esc(c.make)} ${esc(c.model)}`:'Локальное приложение'}</span></div></div>
  <div class="v5-menu">
    <button data-view="documents">${icons.doc}<span><strong>Документы</strong><small>Файлы и сроки действия</small></span><b>›</b></button>
    <button data-view="analytics">${icons.chart}<span><strong>Статистика</strong><small>Расходы, пробег и заправки</small></span><b>›</b></button>
    <button data-view="parts">${icons.wrench}<span><strong>Контроль обслуживания</strong><small>Срок службы и графики проверок</small></span><b>›</b></button>
    <button data-action="car-switch">${icons.car}<span><strong>Автомобили</strong><small>${state.cars.length} ${plural(state.cars.length,'автомобиль','автомобиля','автомобилей')}</small></span><b>›</b></button>
    <button data-view="more">${icons.gear}<span><strong>Настройки</strong><small>Тема, резервная копия, календарь</small></span><b>›</b></button>
  </div>`);
}

function refuelSheet(id=null){
  const x=id?(state.refuels||[]).find(v=>v.id===id):null;
  const initialAuto=x?.amount&&x?.liters&&x?.pricePerLiter?'pricePerLiter':'';
  const body=`<form id="refuel-form" data-refuel-auto="${initialAuto}" data-refuel-manual="">
    <input type="hidden" name="id" value="${x?.id||''}">
    <div class="form-section"><div class="field-grid two">${inputField('Дата','date',x?.date||nowISO(),'date','required')}${inputField('Пробег, км','odometer',x?.odometer??currentKm(),'number','min="0" inputmode="numeric" required')}</div></div>
    <div class="form-section"><div class="field-grid">
      ${selectField('Топливо','fuelType',['АИ-92','АИ-95','АИ-98','АИ-100','Дизель','Газ','Электричество','Другое'],x?.fuelType||'АИ-95')}
      <div class="field-grid two v5-refuel-calc">
        ${inputField('Сумма, ₽','amount',x?.amount||'','number','min="0" step="0.01" inputmode="decimal"')}
        ${inputField('Объём, л','liters',x?.liters||'','number','min="0" step="0.001" inputmode="decimal"')}
        ${inputField('Цена за литр, ₽','pricePerLiter',x?.pricePerLiter||'','number','min="0" step="0.01" inputmode="decimal"')}
      </div>
      <div class="helper v5-refuel-calc-status" data-refuel-calc-status aria-live="polite">Введите любые два значения — третье заполнится автоматически сразу в форме.</div>
    </div></div>
    <div class="form-section"><label class="v5-switch-row"><span><strong>Полный бак</strong><small>Нужно для точного расчёта расхода топлива</small></span><input type="checkbox" name="fullTank" ${x?.fullTank?'checked':''}></label></div>
    <div class="form-section"><div class="field-grid">${inputField('АЗС','station',x?.station||'','text','placeholder="Например: Лукойл"')}${inputField('Адрес','address',x?.address||'')}<div class="field"><label>Заметки</label><textarea class="input" name="notes">${esc(x?.notes||'')}</textarea></div></div></div>
  </form>`;
  return sheetWrap(x?'Редактировать заправку':'Новая заправка',body,`<button class="btn primary block" form="refuel-form">Сохранить</button>`);
}

function refuelDetailSheet(id){
  const x=(state.refuels||[]).find(v=>v.id===id);if(!x)return'';
  const cycle=fuelJournalStats().cycleByRefuel.get(x.id);
  return sheetWrap('Заправка',`<div class="detail-hero"><div class="detail-title">${esc(x.station||x.fuelType||'Заправка')}</div><div class="detail-sub">${fmtDate(x.date)} · ${fmtNum(x.odometer)} км</div><div class="detail-grid"><div class="detail-item"><div class="detail-label">Сумма</div><div class="detail-value">${money(x.amount)}</div></div><div class="detail-item"><div class="detail-label">Объём</div><div class="detail-value">${x.liters?`${fmtNum(x.liters,2)} л`:'—'}</div></div><div class="detail-item"><div class="detail-label">Цена/л</div><div class="detail-value">${x.pricePerLiter?`${fmtNum(x.pricePerLiter,2)} ₽`:'—'}</div></div><div class="detail-item"><div class="detail-label">Полный бак</div><div class="detail-value">${x.fullTank?'Да':'Нет'}</div></div></div></div>${cycle?`<section class="section"><div class="form-title">Расход от предыдущего полного бака</div><div class="v5-fuel-cycle"><strong>${fuelConsumptionText(cycle.consumption)}</strong><span>${fmtNum(cycle.distance)} км · ${fmtNum(cycle.liters,2)} л · ${fuelCost100Text(cycle.cost100)}</span></div></section>`:''}${x.address?`<div class="section"><div class="note-box">${esc(x.address)}</div></div>`:''}${x.notes?`<div class="section"><div class="note-box">${esc(x.notes)}</div></div>`:''}`,`<div class="btn-row"><button class="btn" data-action="edit-refuel" data-id="${x.id}">Изменить</button><button class="btn danger" data-action="delete-refuel" data-id="${x.id}">Удалить</button></div>`);
}

function syncRefuelExpense(r){
  let ex=state.expenses.find(x=>x.linkedRefuelId===r.id);
  if(r.amount>0){
    const obj={id:ex?.id||uid(),carId:r.carId,date:r.date,odometer:r.odometer,category:'Топливо',amount:r.amount,description:r.station||r.fuelType||'Заправка',note:'Создано из заправки',linkedServiceId:'',linkedRefuelId:r.id};
    if(ex)Object.assign(ex,obj);else state.expenses.push(obj);
  }else if(ex)state.expenses=state.expenses.filter(x=>x.id!==ex.id);
}

function remindersSheet(){ const list=allReminders(); return sheetWrap('Напоминания', list.length?`<div>${list.map(reminderCard).join('')}</div><div class="install-note" style="margin-top:16px"><strong>Важно:</strong> километровые сроки обновляются, когда ты вносишь текущий пробег. Если есть история пробега, экспорт в Календарь также прогнозирует дату по среднему километражу в день.</div>`:emptyState('Всё в порядке','Сейчас нет приближающихся или просроченных событий.',null,null,icons.check)); }

function sheetWrap(title,body,foot=''){ return `<div class="sheet-backdrop" data-action="close-sheet"></div><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><div class="sheet-handle"></div><div class="sheet-title-row"><div class="sheet-title" id="sheet-title">${title}</div><button class="sheet-close" data-action="close-sheet" aria-label="Закрыть">${icons.close}</button></div></div><div class="sheet-body">${body}</div>${foot?`<div class="sheet-foot">${foot}</div>`:''}</section>`; }
function inputField(label,name,value='',type='text',extra=''){ return `<div class="field"><label for="${name}">${label}</label><input class="input" id="${name}" name="${name}" type="${type}" value="${esc(value??'')}" ${extra}></div>`; }
function selectField(label,name,options,value=''){ return `<div class="field"><label for="${name}">${label}</label><select class="input" id="${name}" name="${name}">${options.map(o=>{const [v,t]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`}).join('')}</select></div>`; }

function carSheet(id=null){
  const x=id?state.cars.find(c=>c.id===id):null;
  const body=`<form id="car-form"><input type="hidden" name="id" value="${x?.id||''}">
    <div class="form-section">
      <div class="form-title">Автомобиль</div>
      <div class="field-grid two">${inputField('Марка','make',x?.make||'','text','required')}${inputField('Модель','model',x?.model||'','text','required')}</div>
      <div class="field-grid two" style="margin-top:8px">${inputField('Год','year',x?.year||'','number','inputmode="numeric"')}${inputField('Комплектация','trim',x?.trim||'','text','placeholder="Comfort, Style…"')}</div>
      <div class="field" style="margin-top:8px"><label>Фото автомобиля</label>${x?.photo?`<img class="v5-car-form-photo" src="${x.photo}" alt="Фото автомобиля">`:''}<input class="input" id="carPhoto" name="carPhoto" type="file" accept="image/*">${x?.photo?'<label class="v5-check-line"><input type="checkbox" name="removePhoto"> Удалить текущее фото</label>':''}</div>
    </div>
    <div class="form-section"><div class="form-title">Двигатель и трансмиссия</div>
      <div class="field-grid two">${inputField('Код / модификация двигателя','engine',x?.engine||'')}${inputField('Объём двигателя, л','engineVolume',x?.engineVolume||'','number','min="0" step="0.1" inputmode="decimal"')}</div>
      <div class="field-grid two" style="margin-top:8px">${inputField('Мощность, л.с.','powerHp',x?.powerHp||'','number','min="0" inputmode="numeric"')}${selectField('Коробка передач','transmission',['','МКПП','АКПП','Робот','Вариатор','Другое'],x?.transmission||'')}</div>
      <div class="field-grid two" style="margin-top:8px">${selectField('Основное топливо','fuelType',['','АИ-92','АИ-95','АИ-98','АИ-100','Дизель','Газ','Электричество','Гибрид','Другое'],x?.fuelType||'')}${inputField('Размер шин','tireSize',x?.tireSize||'','text','placeholder="205/60 R16"')}</div>
    </div>
    <div class="form-section"><div class="form-title">Масла и жидкости</div>
      <div class="field-grid two">${inputField('Масло двигателя','engineOil',x?.engineOil||'','text','placeholder="5W-40, допуск…"')}${inputField('Масло двигателя, л','engineOilVolume',x?.engineOilVolume||'','number','min="0" step="0.1" inputmode="decimal"')}</div>
      <div class="field-grid two" style="margin-top:8px">${inputField('Охлаждающая жидкость, л','coolantVolume',x?.coolantVolume||'','number','min="0" step="0.1" inputmode="decimal"')}${inputField('Масло КПП, л','transmissionOilVolume',x?.transmissionOilVolume||'','number','min="0" step="0.1" inputmode="decimal"')}</div>
      <div class="field-grid two" style="margin-top:8px">${inputField('Тормозная жидкость, л','brakeFluidVolume',x?.brakeFluidVolume||'','number','min="0" step="0.1" inputmode="decimal"')}${inputField('Жидкость ГУР, л','steeringFluidVolume',x?.steeringFluidVolume||'','number','min="0" step="0.1" inputmode="decimal"')}</div>
    </div>
    <div class="form-section"><div class="form-title">Идентификация</div><div class="field-grid two">${inputField('Госномер','plate',x?.plate||'')}${inputField('VIN','vin',x?.vin||'')}</div></div>
    <div class="form-section"><div class="form-title">Пробег</div><div class="field-grid two">${inputField('Пробег при начале учёта, км','initialOdometer',x?.initialOdometer??0,'number','min="0" inputmode="numeric"')}${inputField('Текущий пробег, км','currentOdometer',x?.currentOdometer??0,'number','min="0" inputmode="numeric" required')}</div></div>
    <div class="form-section"><div class="field-grid two">${inputField('Дата покупки','purchaseDate',x?.purchaseDate||'','date')}${inputField('Цена покупки, ₽','purchasePrice',x?.purchasePrice||'','number','min="0" step="0.01" inputmode="decimal"')}</div></div>
    <div class="form-section"><div class="field"><label>Пользовательские характеристики</label><textarea class="input" name="customSpecs" placeholder="По одной характеристике на строку, например:&#10;Клиренс: 155 мм&#10;Аккумулятор: 60 А·ч">${esc(x?.customSpecs||'')}</textarea></div></div>
  </form>`;
  const foot=`<button class="btn primary block" form="car-form" type="submit">${x?'Сохранить':'Добавить автомобиль'}</button>${x?`<button class="btn danger block" style="margin-top:8px" data-action="delete-car" data-id="${x.id}">Удалить автомобиль</button>`:''}`;
  return sheetWrap(x?'Автомобиль':'Новый автомобиль',body,foot);
}

function garageSheet(){
  const body=`${state.cars.length?`<div class="list">${state.cars.map(c=>`<button class="list-row" data-action="activate-car" data-id="${c.id}"><div class="row-icon v5-garage-photo">${c.photo?`<img src="${c.photo}" alt="">`:icons.car}</div><div class="row-main"><div class="row-title">${esc(c.make)} ${esc(c.model)}</div><div class="row-sub">${c.trim?`${esc(c.trim)} · `:''}${fmtNum(c.currentOdometer)} км${c.plate?` · ${esc(c.plate)}`:''}</div></div>${c.id===state.activeCarId?statusPill('ok'):'<span class="row-chevron">›</span>'}</button>`).join('')}</div>`:''}<button class="btn primary block" style="margin-top:16px" data-action="add-car">Добавить автомобиль</button>${car()?`<button class="btn block" style="margin-top:8px" data-action="edit-current-car">Изменить текущий</button>`:''}`;
  return sheetWrap('Гараж',body);
}

function odometerSheet(){
  const c=car(), last=nonneg(c?.currentOdometer);
  return sheetWrap('Обновить пробег',
    `<form id="odometer-form"><div class="field-grid">${inputField('Текущий пробег, км','value','','number',`min="${last}" inputmode="numeric" placeholder="${last}" required`)}</div><div class="helper">Последний сохранённый пробег: ${fmtNum(last)} км. Дата обновления определится автоматически.</div></form>`,
    `<button class="btn primary block" form="odometer-form">Сохранить пробег</button>`
  );
}

function entrySheet(id=null){
  const x=id?state.serviceEntries.find(e=>e.id===id):null;
  const comp=x?.componentId?state.components.find(c=>c.id===x.componentId):null;
  const odoValue=x&&nonneg(x.odometer)>0?x.odometer:'';
  const lastKm=currentKm();
  const body=`<form id="entry-form"><input type="hidden" name="id" value="${x?.id||''}">
    <div class="form-section"><div class="field-grid">
      ${inputField('Название','title',x?.title||'','text','placeholder="Например: моторное масло" required')}
      ${selectField('Тип записи','type',[['maintenance','Техническое обслуживание'],['repair','Ремонт'],['replacement','Замена'],['inspection','Проверка'],['other','Другое']],x?.type||'maintenance')}
    </div></div>
    <div class="form-section"><div class="form-title">Когда</div><div class="field-grid two">
      ${inputField('Дата','date',x?.date||nowISO(),'date','required')}
      ${inputField('Пробег, км · необязательно','odometer',odoValue,'number',`min="0" inputmode="numeric" placeholder="${lastKm}"`)}
    </div><div class="helper">Последний сохранённый пробег: ${fmtNum(lastKm)} км. Можно оставить поле пустым.</div></div>
    <div class="form-section"><div class="form-title">Стоимость</div><div class="field-grid two">
      ${inputField('Товар / детали, ₽','partsCost',x?.partsCost||'','number','min="0" inputmode="decimal"')}
      ${inputField('Работа, ₽','laborCost',x?.laborCost||'','number','min="0" inputmode="decimal"')}
    </div></div>
    <div class="form-section"><div class="form-title">Контроль обслуживания <span class="v5-optional">необязательно</span></div><div class="field-grid two">
      ${inputField('Срок службы, км','lifeKm',comp?.lifeKm||'','number','min="0" inputmode="numeric" placeholder="40000"')}
      ${inputField('Срок службы, мес.','lifeMonths',comp?.lifeMonths||'','number','min="0" inputmode="numeric"')}
      ${inputField('Проверять каждые, км','inspectKm',comp?.inspectKm||'','number','min="0" inputmode="numeric" placeholder="10000"')}
      ${inputField('Проверять каждые, мес.','inspectMonths',comp?.inspectMonths||'','number','min="0" inputmode="numeric"')}
      ${inputField('Предупредить за, км','warnKm',comp?.warnKm??state.settings.defaultWarnKm,'number','min="0" inputmode="numeric"')}
      ${inputField('Предупредить за, дней','warnDays',comp?.warnDays??state.settings.defaultWarnDays,'number','min="0" inputmode="numeric"')}
    </div><div class="helper">Срок службы и период проверки независимы друг от друга.</div></div>
    <div class="form-section"><div class="field-grid">
      ${inputField('Категория / узел','category',x?.category||'','text','placeholder="Двигатель, тормоза…"')}
      <div class="field"><label>Выполненные работы</label><textarea class="input" name="workText">${esc(x?.workText||'')}</textarea></div>
      <div class="field"><label>Запчасти / материалы</label><textarea class="input" name="partsText">${esc(x?.partsText||'')}</textarea></div>
      <div class="field"><label>Комментарий</label><textarea class="input" name="notes">${esc(x?.notes||'')}</textarea></div>
      <div class="field"><label>Фото</label><input class="input" name="photos" type="file" accept="image/*" multiple></div>
    </div></div>
  </form>`;
  return sheetWrap(x?'Изменить запись':'Новая запись',body,`<button class="btn primary block" form="entry-form">${x?'Сохранить':'Добавить запись'}</button>`);
}

function componentSheet(id=null){ const x=id?state.components.find(c=>c.id===id):null; const body=`<form id="component-form"><input type="hidden" name="id" value="${x?.id||''}"><div class="form-section"><div class="field-grid">${inputField('Название узла / расходника','name',x?.name||'','text','placeholder="Например: передние тормозные колодки" required')}<div class="field-grid two">${inputField('Категория','category',x?.category||'')}${inputField('Бренд','brand',x?.brand||'')}</div>${inputField('Артикул','partNumber',x?.partNumber||'')}</div></div><div class="form-section"><div class="form-title">Установка</div><div class="field-grid two">${inputField('Дата','installedDate',x?.installedDate||nowISO(),'date','required')}${inputField('Пробег, км','installedOdometer',x?.installedOdometer??currentKm(),'number','min="0" inputmode="numeric" required')}</div></div><div class="form-section"><div class="form-title">Срок службы</div><div class="field-grid two">${inputField('Ресурс, км','lifeKm',x?.lifeKm||'','number','min="0" inputmode="numeric" placeholder="например 40000"')}${inputField('Ресурс, месяцев','lifeMonths',x?.lifeMonths||'','number','min="0" inputmode="numeric" placeholder="например 24"')}</div><div class="helper">Если заданы оба значения, предупреждение сработает по тому лимиту, который наступит раньше.</div></div><div class="form-section"><div class="form-title">График проверки</div><div class="field-grid two">${inputField('Проверять каждые, км','inspectKm',x?.inspectKm||'','number','min="0" inputmode="numeric" placeholder="например 10000"')}${inputField('Проверять каждые, месяцев','inspectMonths',x?.inspectMonths||'','number','min="0" inputmode="numeric" placeholder="например 6"')}</div></div><div class="form-section"><div class="form-title">Предупреждать заранее</div><div class="field-grid two">${inputField('За сколько км','warnKm',x?.warnKm??state.settings.defaultWarnKm,'number','min="0" inputmode="numeric"')}${inputField('За сколько дней','warnDays',x?.warnDays??state.settings.defaultWarnDays,'number','min="0" inputmode="numeric"')}</div></div><div class="form-section">${inputField('Стоимость детали, ₽','cost',x?.cost||'','number','min="0" inputmode="decimal"')}<div class="field" style="margin-top:8px"><label for="notes">Заметки</label><textarea class="input" id="notes" name="notes">${esc(x?.notes||'')}</textarea></div></div></form>`; return sheetWrap(x?'Редактировать узел':'Новый узел',body,`<button class="btn primary block" form="component-form">Сохранить</button>`); }

function expenseSheet(id=null){
  const x=id?state.expenses.find(e=>e.id===id):null;
  if(x?.linkedServiceId)return sheetWrap('Связанный расход',`<div class="install-note"><strong>Этот расход синхронизирован с сервисной записью.</strong><br>Измените стоимость в сервисной записи — сумма обновится автоматически.</div>`,`<button class="btn primary block" data-action="open-linked-entry" data-id="${x.linkedServiceId}">Открыть сервисную запись</button>`);
  if(x?.linkedRefuelId)return sheetWrap('Связанный расход',`<div class="install-note"><strong>Этот расход синхронизирован с заправкой.</strong><br>Измените сумму в записи заправки — расход обновится автоматически.</div>`,`<button class="btn primary block" data-action="open-linked-refuel" data-id="${x.linkedRefuelId}">Открыть заправку</button>`);
  const categories=['Топливо','Обслуживание','Ремонт','Страховка','Налог','Парковка','Мойка','Платная дорога','Тюнинг','Другое'];
  const body=`<form id="expense-form"><input type="hidden" name="id" value="${x?.id||''}"><div class="field-grid two">${inputField('Дата','date',x?.date||nowISO(),'date','required')}${inputField('Пробег, км','odometer',x?.odometer??currentKm(),'number','min="0" inputmode="numeric"')}</div><div class="field-grid" style="margin-top:8px">${selectField('Категория','category',categories,x?.category||'Обслуживание')}${inputField('Сумма, ₽','amount',x?.amount||'','number','min="0" step="0.01" inputmode="decimal" required')}${inputField('Описание','description',x?.description||'','text','placeholder="Что оплачено"')}<div class="field"><label for="note">Заметки</label><textarea class="input" id="note" name="note">${esc(x?.note||'')}</textarea></div></div></form>`;
  return sheetWrap(x?'Редактировать расход':'Новый расход',body,`<button class="btn primary block" form="expense-form">Сохранить</button>`);
}

function documentSheet(id=null){ const x=id?state.documents.find(d=>d.id===id):null; const body=`<form id="document-form"><input type="hidden" name="id" value="${x?.id||''}"><div class="field-grid">${inputField('Название','title',x?.title||'','text','placeholder="Например: ОСАГО" required')}${inputField('Тип','type',x?.type||'')}${inputField('Номер','number',x?.number||'')}</div><div class="field-grid two" style="margin-top:8px">${inputField('Дата выдачи','issueDate',x?.issueDate||'','date')}${inputField('Действует до','expiryDate',x?.expiryDate||'','date')}</div><div class="field-grid" style="margin-top:8px">${inputField('Предупредить за, дней','remindDays',x?.remindDays??30,'number','min="0" inputmode="numeric"')}<div class="field"><label for="files">Файлы</label><input class="input" id="files" name="files" type="file" multiple accept="image/*,application/pdf,text/plain"></div></div>${x?.files?.length?`<div style="margin-top:8px">${x.files.map((f,i)=>`<div class="file-chip"><span>${icons.doc}</span><span class="file-name">${esc(f.name)}</span><button type="button" class="text-btn" data-action="open-stored-file" data-doc="${x.id}" data-index="${i}">Открыть</button><button type="button" class="text-btn" data-action="share-stored-file" data-doc="${x.id}" data-index="${i}">Поделиться</button><button type="button" class="text-btn danger-text" data-action="remove-stored-file" data-doc="${x.id}" data-index="${i}">Удалить</button></div>`).join('')}</div>`:''}</form>`; return sheetWrap(x?'Редактировать документ':'Новый документ',body,`<button class="btn primary block" form="document-form">Сохранить</button>`); }

function entryDetailSheet(id){
  const e=state.serviceEntries.find(x=>x.id===id); if(!e)return '';
  const comp=e.componentId?state.components.find(c=>c.id===e.componentId):null;
  const intervalBits=[];
  if(comp?.lifeKm)intervalBits.push(`Срок службы: ${fmtNum(comp.lifeKm)} км`);
  if(comp?.lifeMonths)intervalBits.push(`Срок службы: ${fmtNum(comp.lifeMonths)} мес.`);
  if(comp?.inspectKm)intervalBits.push(`Проверять каждые ${fmtNum(comp.inspectKm)} км`);
  if(comp?.inspectMonths)intervalBits.push(`Проверять каждые ${fmtNum(comp.inspectMonths)} мес.`);
  if(comp?.warnKm)intervalBits.push(`Предупреждать за ${fmtNum(comp.warnKm)} км`);
  if(comp?.warnDays)intervalBits.push(`Предупреждать за ${fmtNum(comp.warnDays)} дн.`);
  return sheetWrap('Запись',
    `<div class="detail-hero"><div class="detail-title">${esc(e.title)}</div><div class="detail-sub">${[fmtDate(e.date),nonneg(e.odometer)>0?`${fmtNum(e.odometer)} км`:``].filter(Boolean).join(` · `)}</div><div class="detail-grid"><div class="detail-item"><div class="detail-label">Тип</div><div class="detail-value">${esc(e.type)}</div></div><div class="detail-item"><div class="detail-label">Стоимость</div><div class="detail-value">${money(totalServiceCost(e))}</div></div><div class="detail-item"><div class="detail-label">Запчасти</div><div class="detail-value">${money(e.partsCost)}</div></div><div class="detail-item"><div class="detail-label">Работа</div><div class="detail-value">${money(e.laborCost)}</div></div></div></div>${intervalBits.length?`<div class="section"><div class="form-title">Контроль обслуживания</div><div class="note-box">${intervalBits.map(esc).join('<br>')}</div></div>`:''}${e.workText?`<div class="section"><div class="form-title">Выполненные работы</div><div class="note-box">${esc(e.workText)}</div></div>`:''}${e.partsText?`<div class="section"><div class="form-title">Установленные запчасти</div><div class="note-box">${esc(e.partsText)}</div></div>`:''}${e.notes?`<div class="section"><div class="form-title">Заметки</div><div class="note-box">${esc(e.notes)}</div></div>`:''}${e.photos?.length?`<div class="section"><div class="form-title">Фото</div><div class="preview-grid">${e.photos.map(p=>`<img src="${p.data}" data-action="open-image" alt="Фото">`).join('')}</div></div>`:''}`,
    `<div class="btn-row"><button class="btn" data-action="edit-entry" data-id="${e.id}">${icons.edit} Изменить</button><button class="btn danger" data-action="delete-entry" data-id="${e.id}">${icons.trash} Удалить</button></div>`
  );
}

function intervalText(km, months){ const bits=[]; if(Number(km)>0)bits.push(`${fmtNum(km)} км`); if(Number(months)>0)bits.push(`${fmtNum(months)} мес.`); return bits.join(' / ')||'—'; }

function componentDetailSheet(id){ const c=state.components.find(x=>x.id===id); if(!c)return ''; const evs=componentEvents(c), cs=componentState(c); return sheetWrap(c.name,`<div class="detail-hero"><div class="detail-title">${esc(c.name)}</div><div class="detail-sub">${[c.brand,c.partNumber,c.category].filter(Boolean).map(esc).join(' · ')||'Узел автомобиля'}</div><div class="detail-grid"><div class="detail-item"><div class="detail-label">Установлено</div><div class="detail-value">${fmtDate(cs.installedDate)} · ${fmtNum(cs.installedOdometer)} км</div></div><div class="detail-item"><div class="detail-label">Состояние</div><div class="detail-value">${statusPill(componentOverall(c))}</div></div><div class="detail-item"><div class="detail-label">Ресурс</div><div class="detail-value">${intervalText(c.lifeKm,c.lifeMonths)}</div></div><div class="detail-item"><div class="detail-label">Проверка</div><div class="detail-value">${intervalText(c.inspectKm,c.inspectMonths)}</div></div></div></div><section class="section"><div class="section-title" style="margin-bottom:8px">Следующие события</div>${evs.length?evs.map(reminderCard).join(''):emptyState('Интервалы не заданы','Добавь ресурс или график проверки в настройках узла.',null,null,icons.calendar)}</section>${c.notes?`<section class="section"><div class="form-title">Заметки</div><div class="note-box">${esc(c.notes)}</div></section>`:''}`,`<div class="btn-row"><button class="btn primary" data-action="mark-inspection" data-id="${c.id}">Проверено</button><button class="btn" data-action="mark-replacement" data-id="${c.id}">Заменено</button></div><div class="btn-row" style="margin-top:8px"><button class="btn" data-action="edit-component" data-id="${c.id}">Изменить</button><button class="btn danger" data-action="delete-component" data-id="${c.id}">Удалить</button></div>`); }

function expenseDetailSheet(id){
  const x=state.expenses.find(e=>e.id===id);if(!x)return '';const linkedService=x.linkedServiceId?state.serviceEntries.find(e=>e.id===x.linkedServiceId):null,linkedRefuel=x.linkedRefuelId?(state.refuels||[]).find(r=>r.id===x.linkedRefuelId):null;
  let foot=`<div class="btn-row"><button class="btn" data-action="edit-expense" data-id="${x.id}">Изменить</button><button class="btn danger" data-action="delete-expense" data-id="${x.id}">Удалить</button></div>`,linkedNote='';
  if(linkedService){foot=`<button class="btn primary block" data-action="open-linked-entry" data-id="${linkedService.id}">Открыть сервисную запись</button>`;linkedNote='<section class="section"><div class="install-note"><strong>Связано с сервисной записью.</strong><br>Сумма обновляется автоматически.</div></section>';}
  if(linkedRefuel){foot=`<button class="btn primary block" data-action="open-linked-refuel" data-id="${linkedRefuel.id}">Открыть заправку</button>`;linkedNote='<section class="section"><div class="install-note"><strong>Связано с заправкой.</strong><br>Сумма обновляется автоматически.</div></section>';}
  return sheetWrap('Расход',`<div class="detail-hero"><div class="detail-title">${money(x.amount)}</div><div class="detail-sub">${esc(x.description||x.category)} · ${fmtDate(x.date)}</div><div class="detail-grid"><div class="detail-item"><div class="detail-label">Категория</div><div class="detail-value">${esc(x.category)}</div></div><div class="detail-item"><div class="detail-label">Пробег</div><div class="detail-value">${x.odometer?`${fmtNum(x.odometer)} км`:'—'}</div></div></div></div>${linkedNote}${x.note?`<section class="section"><div class="note-box">${esc(x.note)}</div></section>`:''}`,foot);
}

function documentDetailSheet(id){
  const d=state.documents.find(x=>x.id===id);if(!d)return '';const ev=documentEvent(d);
  return sheetWrap(d.title,`<div class="detail-hero"><div class="detail-title">${esc(d.title)}</div><div class="detail-sub">${esc(d.type||'Документ')}</div><div class="detail-grid"><div class="detail-item"><div class="detail-label">Номер</div><div class="detail-value">${esc(d.number||'—')}</div></div><div class="detail-item"><div class="detail-label">Дата выдачи</div><div class="detail-value">${fmtDate(d.issueDate)}</div></div><div class="detail-item"><div class="detail-label">Действует до</div><div class="detail-value">${fmtDate(d.expiryDate)}</div></div><div class="detail-item"><div class="detail-label">Напомнить</div><div class="detail-value">${d.expiryDate?`за ${fmtNum(d.remindDays??30)} дн.`:'—'}</div></div></div>${ev?`<div style="margin-top:12px">${statusPill(ev.status)} <span class="row-sub">${esc(describeDue(ev))}</span></div>`:''}</div>${d.files?.length?`<section class="section"><div class="form-title">Файлы</div>${d.files.map((f,i)=>`<div class="file-chip"><span>${icons.doc}</span><span class="file-name">${esc(f.name)}</span><button class="text-btn" data-action="open-stored-file" data-doc="${d.id}" data-index="${i}">Открыть</button><button class="text-btn" data-action="share-stored-file" data-doc="${d.id}" data-index="${i}">Поделиться</button></div>`).join('')}</section>`:''}`,`<div class="btn-row"><button class="btn" data-action="edit-document" data-id="${d.id}">Изменить</button><button class="btn danger" data-action="delete-document" data-id="${d.id}">Удалить</button></div>`);
}

function renderSheet(){if(!ui.sheet)return '';if(ui.sheet==='profile')return profileSheet();if(ui.sheet==='reminders')return remindersSheet();if(ui.sheet==='car')return carSheet(ui.sheetId);if(ui.sheet==='garage')return garageSheet();if(ui.sheet==='odometer')return odometerSheet();if(ui.sheet==='entry')return entrySheet(ui.sheetId);if(ui.sheet==='component')return componentSheet(ui.sheetId);if(ui.sheet==='expense')return expenseSheet(ui.sheetId);if(ui.sheet==='document')return documentSheet(ui.sheetId);if(ui.sheet==='refuel')return refuelSheet(ui.sheetId);if(ui.sheet==='entry-detail')return entryDetailSheet(ui.sheetId);if(ui.sheet==='component-detail')return componentDetailSheet(ui.sheetId);if(ui.sheet==='expense-detail')return expenseDetailSheet(ui.sheetId);if(ui.sheet==='document-detail')return documentDetailSheet(ui.sheetId);if(ui.sheet==='refuel-detail')return refuelDetailSheet(ui.sheetId);return '';}

function navigateTo(view,{replace=false}={}){
  if(!view)return;
  if(view===ui.view){ui.sheet=null;render();return;}
  if(!replace){navStack.push(ui.view);if(navStack.length>30)navStack.shift();}
  ui.view=view;ui.sheet=null;ui.sheetId=null;nextTransition='forward';render();
}
function goBack(){
  if(ui.sheet){ui.sheet=null;ui.sheetId=null;nextTransition='back';render();return;}
  const prev=navStack.pop()||'home';
  if(prev===ui.view)return;
  ui.view=prev;nextTransition='back';render();
}
function render(){
  const root=$('#app');
  const page={home:homePage,records:historyPage,refuels:refuelsPage,notifications:notificationsPage,profile:profilePage,carcard:carCardPage,report:reportPage,parts:partsPage,analytics:analyticsPage,documents:documentsPage,more:morePage}[ui.view]||homePage;
  const secondary=!primaryViews.has(ui.view);
  root.dataset.secondary=secondary?'true':'false';
  root.innerHTML=`${topbar()}${page()}${secondary?'':tabbar()}${renderSheet()}`;
  if(nextTransition){
    const main=root.querySelector('.v5-main,.main-scroll');
    if(main){const cls=nextTransition==='back'?'v5-enter-back':nextTransition==='fade'?'v5-enter-fade':'v5-enter-forward';main.classList.add(cls);setTimeout(()=>main.classList.remove('v5-enter-back','v5-enter-forward','v5-enter-fade'),280);}
    nextTransition='';
  }
}

async function fileToDataURL(file, compressImage=false){
  const canCanvasCompress=compressImage && /^image\/(?:jpeg|png|webp|gif)$/i.test(file.type||'');
  if(canCanvasCompress){
    const src=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
    const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
    canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.82);
  }
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
}

function formObject(form){ return Object.fromEntries(new FormData(form).entries()); }
function updateCarMileage(value,date=nowISO(),note=''){ const c=car(); if(!c)return false; const n=Number(value); if(!Number.isFinite(n)||n<nonneg(c.currentOdometer)){toast('Текущий пробег не может быть меньше предыдущего');return false;} const err=mileageConsistencyError(n,date,'manual',''); if(err){toast(err);return false;} c.currentOdometer=n; state.odometerLogs.push({id:uid(),carId:c.id,date,value:n,note,sourceType:'manual',sourceId:uid()}); return true; }

function syncEntryExpense(entry){
  const amount=totalServiceCost(entry);
  let ex=state.expenses.find(x=>x.linkedServiceId===entry.id);
  if(amount>0){ const obj={id:ex?.id||uid(),carId:entry.carId,date:entry.date,odometer:entry.odometer,category:entry.type==='repair'?'Ремонт':'Обслуживание',amount,description:entry.title,note:'Создано из сервисной записи',linkedServiceId:entry.id,linkedRefuelId:''}; if(ex)Object.assign(ex,obj); else state.expenses.push(obj); }
  else if(ex) state.expenses=state.expenses.filter(x=>x.id!==ex.id);
}


async function handleSubmit(e){
  const f=e.target;
  // A control named "id" shadows HTMLFormElement.id in Safari and Chromium.
  const formId=f.getAttribute('id');
  if(formId==='car-form'){
    const d=formObject(f),id=d.id||uid();let x=state.cars.find(c=>c.id===id);const initial=nonneg(d.initialOdometer),requested=nonneg(d.currentOdometer);
    if(!d.make.trim()||!d.model.trim()){toast('Укажи марку и модель автомобиля');return;}
    if(requested<initial){toast('Текущий пробег не может быть меньше пробега начала учёта');return;}
    if(d.year&&(Number(d.year)<1886||Number(d.year)>new Date().getFullYear()+1)){toast('Проверь год автомобиля');return;}
    let photo=x?.photo||'';
    if(d.removePhoto)photo='';
    const photoFile=f.elements.carPhoto?.files?.[0];
    if(photoFile){
      if(photoFile.size>12*1024*1024){toast('Фото автомобиля больше 12 МБ');return;}
      try{const data=await fileToDataURL(photoFile,true);if(!safeImageData(data)){toast('Не удалось обработать фото автомобиля');return;}photo=data;}catch{toast('Не удалось обработать фото автомобиля');return;}
    }
    const details={id,make:d.make.trim(),model:d.model.trim(),year:d.year,engine:d.engine,plate:d.plate.trim(),vin:d.vin.trim(),photo,trim:String(d.trim||'').trim(),fuelType:String(d.fuelType||''),engineVolume:String(d.engineVolume||''),transmission:String(d.transmission||''),powerHp:nonneg(d.powerHp),tireSize:String(d.tireSize||'').trim(),engineOil:String(d.engineOil||'').trim(),engineOilVolume:String(d.engineOilVolume||''),coolantVolume:String(d.coolantVolume||''),transmissionOilVolume:String(d.transmissionOilVolume||''),brakeFluidVolume:String(d.brakeFluidVolume||''),steeringFluidVolume:String(d.steeringFluidVolume||''),customSpecs:String(d.customSpecs||'').trim(),initialOdometer:initial,purchaseDate:d.purchaseDate,purchasePrice:nonneg(d.purchasePrice)};
    if(x){
      const floor=linkedMileageFloor(id);if(requested<floor){toast(`В истории есть запись на ${fmtNum(floor)} км. Сначала исправь её.`);return;}
      Object.assign(x,details);
      state.odometerLogs=state.odometerLogs.filter(v=>!(v.carId===id&&v.sourceType==='manual'&&nonneg(v.value)>requested));
      state.odometerLogs.push({id:uid(),carId:id,date:nowISO(),value:requested,note:'Из карточки автомобиля',sourceType:'manual',sourceId:uid()});
      recalculateCurrentOdometer(id);
    }else{
      const obj={...details,currentOdometer:requested,trackingStartDate:nowISO()};state.cars.push(obj);state.activeCarId=id;
      state.odometerLogs.push({id:uid(),carId:id,date:nowISO(),value:requested,note:'Начало учёта',sourceType:'car-start',sourceId:id});
    }
    await persist();ui.sheet=null;toast('Автомобиль сохранён');render();return;
  }
  if(formId==='odometer-form'){const d=formObject(f);if(!updateCarMileage(d.value,nowISO(),'Обновление пробега'))return;await persist();ui.sheet=null;toast('Пробег обновлён');render();return;}
  if(formId==='entry-form'){
    const d=formObject(f), id=d.id||uid();
    let x=state.serviceEntries.find(v=>v.id===id);
    const oldComponentId=x?.componentId||'';
    const photos=x?.photos?[...x.photos]:[];
    for(const file of f.elements.photos.files){
      if(file.size>12*1024*1024){toast(`Фото ${file.name} слишком большое`);continue;}
      try{
        const data=await fileToDataURL(file,true);
        if(safeImageData(data))photos.push({id:uid(),name:file.name,data});
        else toast(`Формат ${file.name} не поддерживается`);
      }catch{toast(`Не удалось обработать ${file.name}`);}
    }
    const hasMileage=String(d.odometer??'').trim()!=='';
    const obj={
      id,carId:car().id,date:d.date,odometer:hasMileage?nonneg(d.odometer):0,type:d.type,
      title:String(d.title||'').trim(),category:String(d.category||'').trim(),
      faultKey:x?.faultKey||'',workText:d.workText||'',partsText:d.partsText||'',
      partsCost:nonneg(d.partsCost),laborCost:nonneg(d.laborCost),otherCost:x?.otherCost||0,
      componentId:x?.componentId||'',componentAction:x?.componentAction||'',
      notes:d.notes||'',photos,createdAt:x?.createdAt||new Date().toISOString(),
      seq:x?.seq!=null?nonneg(x.seq):nextSeq()
    };
    if(!obj.title){toast('Укажите название записи');return;}
    if(!dateOK(obj.date)){toast('Укажите корректную дату');return;}
    const err=hasMileage?mileageConsistencyError(obj.odometer,obj.date,'service',id):null;
    if(err&&obj.odometer>nonneg(car().initialOdometer)){toast(err);return;}
    if(x)Object.assign(x,obj);else state.serviceEntries.push(obj);

    const lifeKm=nonneg(d.lifeKm), lifeMonths=nonneg(d.lifeMonths),
          inspectKm=nonneg(d.inspectKm), inspectMonths=nonneg(d.inspectMonths),
          warnKm=nonneg(d.warnKm), warnDays=nonneg(d.warnDays);
    if(lifeKm||lifeMonths||inspectKm||inspectMonths){
      let comp=obj.componentId?state.components.find(c=>c.id===obj.componentId):null;
      if(!comp){
        comp={
          id:uid(),carId:obj.carId,name:obj.title,category:obj.category||'',brand:'',partNumber:'',
          baseInstalledDate:obj.date,baseInstalledOdometer:hasMileage?obj.odometer:currentKm(),
          installedDate:obj.date,installedOdometer:hasMileage?obj.odometer:currentKm(),
          lifeKm,lifeMonths,inspectKm,inspectMonths,warnKm,warnDays,
          cost:obj.partsCost,notes:'Создано из записи',sourceEntryId:obj.id,
          lastInspectionDate:obj.date,lastInspectionOdometer:hasMileage?obj.odometer:currentKm()
        };
        state.components.push(comp);
        obj.componentId=comp.id;
      }else{
        const sourceOwned=comp.sourceEntryId===obj.id||(!comp.sourceEntryId&&comp.notes==='Создано из записи'&&obj.componentId===comp.id);
        Object.assign(comp,{name:obj.title||comp.name,category:obj.category||comp.category,lifeKm,lifeMonths,inspectKm,inspectMonths,warnKm,warnDays,cost:obj.partsCost||comp.cost,sourceEntryId:sourceOwned?obj.id:comp.sourceEntryId});
        if(sourceOwned){const baselineKm=hasMileage?obj.odometer:currentKm();Object.assign(comp,{baseInstalledDate:obj.date,baseInstalledOdometer:baselineKm,installedDate:obj.date,installedOdometer:baselineKm});if(!state.serviceEntries.some(e=>e.id!==obj.id&&e.componentId===comp.id&&e.componentAction==='inspect')){comp.lastInspectionDate=obj.date;comp.lastInspectionOdometer=baselineKm;}}
      }
    }else if(oldComponentId&&obj.componentId){
      const comp=state.components.find(c=>c.id===obj.componentId);
      if(comp){const sourceOwned=comp.sourceEntryId===obj.id||(!comp.sourceEntryId&&comp.notes==='Создано из записи'),otherRefs=state.serviceEntries.filter(e=>e.id!==obj.id&&e.componentId===comp.id);if(sourceOwned&&!otherRefs.length){state.components=state.components.filter(c=>c.id!==comp.id);obj.componentId='';removeMileageSource('component',comp.id);}else if(sourceOwned)Object.assign(comp,{lifeKm:0,lifeMonths:0,inspectKm:0,inspectMonths:0,warnKm:0,warnDays:0,sourceEntryId:''});else Object.assign(comp,{name:obj.title||comp.name,category:obj.category||comp.category});}
    }

    syncEntryExpense(obj);
    if(hasMileage)recordMileageObservation(obj.odometer,obj.date,'Из сервисной записи','service',id);else removeMileageSource('service',id);
    await persist();ui.sheet=null;toast('Запись сохранена');render();return;
  }
  if(formId==='component-form'){
    const d=formObject(f), id=d.id||uid(); let x=state.components.find(v=>v.id===id); const installKm=nonneg(d.installedOdometer); if(installKm>currentKm()){toast('Пробег установки не может быть больше текущего пробега');return;} if(d.installedDate>today()){toast('Дата установки не может быть в будущем');return;}
    const obj={id,carId:car().id,name:d.name.trim(),category:d.category,brand:d.brand,partNumber:d.partNumber,baseInstalledDate:d.installedDate,baseInstalledOdometer:installKm,installedDate:d.installedDate,installedOdometer:installKm,lifeKm:nonneg(d.lifeKm),lifeMonths:nonneg(d.lifeMonths),inspectKm:nonneg(d.inspectKm),inspectMonths:nonneg(d.inspectMonths),warnKm:nonneg(d.warnKm),warnDays:nonneg(d.warnDays),cost:nonneg(d.cost),notes:d.notes,sourceEntryId:x?.sourceEntryId||'',lastInspectionDate:d.installedDate,lastInspectionOdometer:installKm}; if(x)Object.assign(x,obj);else state.components.push(obj); recordMileageObservation(installKm,d.installedDate,'Установка узла','component',id); await persist();ui.sheet=null;toast('Узел сохранён');render();return;
  }
  if(formId==='expense-form'){
    const d=formObject(f), id=d.id||uid(); let x=state.expenses.find(v=>v.id===id); if(x?.linkedServiceId){toast('Связанный расход изменяется через сервисную запись');return;} const obj={id,carId:car().id,date:d.date,odometer:nonneg(d.odometer),category:d.category,amount:nonneg(d.amount),description:d.description.trim(),note:d.note,linkedServiceId:''}; if(!dateOK(obj.date)){toast('Укажи корректную дату');return;} const err=obj.odometer?mileageConsistencyError(obj.odometer,obj.date,'expense',id):null;if(err&&obj.odometer>nonneg(car().initialOdometer)){toast(err);return;} if(x)Object.assign(x,obj);else state.expenses.push(obj); if(obj.odometer)recordMileageObservation(obj.odometer,obj.date,'Из расхода','expense',id);else removeMileageSource('expense',id); await persist();ui.sheet=null;toast('Расход сохранён');render();return;
  }
  if(formId==='refuel-form'){
    const d=formObject(f), id=d.id||uid();
    let x=(state.refuels||[]).find(v=>v.id===id);
    let amount=nonneg(d.amount), liters=nonneg(d.liters), price=nonneg(d.pricePerLiter);
    if(!amount&&liters&&price)amount=liters*price;
    else if(!liters&&amount&&price)liters=amount/price;
    else if(!price&&amount&&liters)price=amount/liters;
    const obj={
      id,carId:car().id,date:d.date,odometer:nonneg(d.odometer),
      fuelType:d.fuelType||'АИ-95',amount,liters,pricePerLiter:price,
      fullTank:Boolean(d.fullTank),station:String(d.station||'').trim(),
      address:String(d.address||'').trim(),notes:String(d.notes||''),
      createdAt:x?.createdAt||new Date().toISOString()
    };
    if(!dateOK(obj.date)){toast('Укажите корректную дату');return;}
    const err=mileageConsistencyError(obj.odometer,obj.date,'refuel',id);
    if(err&&obj.odometer>nonneg(car().initialOdometer)){toast(err);return;}
    if(!obj.amount&&!obj.liters){toast('Укажите сумму или объём топлива');return;}
    state.refuels ||= [];
    if(x)Object.assign(x,obj);else state.refuels.push(obj);
    syncRefuelExpense(obj);
    recordMileageObservation(obj.odometer,obj.date,'Из заправки','refuel',id);
    await persist();ui.sheet=null;toast('Заправка сохранена');render();return;
  }
  if(formId==='document-form'){
    const d=formObject(f), id=d.id||uid(); let x=state.documents.find(v=>v.id===id); if(d.issueDate&&d.expiryDate&&d.expiryDate<d.issueDate){toast('Дата окончания не может быть раньше даты выдачи');return;} const files=x?.files?[...x.files]:[]; for(const file of f.elements.files.files){if(file.size>15*1024*1024){toast(`Файл ${file.name} больше 15 МБ`);continue;}try{const data=await fileToDataURL(file,file.type.startsWith('image/'));if(safeStoredFileData(data))files.push({id:uid(),name:file.name,type:file.type||'',size:file.size,data});else toast(`Формат ${file.name} не поддерживается`);}catch{toast(`Не удалось обработать ${file.name}`);}} const obj={id,carId:car().id,title:d.title.trim(),type:d.type,number:d.number,issueDate:d.issueDate,expiryDate:d.expiryDate,remindDays:nonneg(d.remindDays,30),files}; if(x)Object.assign(x,obj);else state.documents.push(obj); await persist();ui.sheet=null;toast('Документ сохранён');render();return;
  }
}

document.addEventListener('submit',async e=>{
  const form=e.target;
  if(!(form instanceof HTMLFormElement))return;
  e.preventDefault();
  if(form.dataset.saving==='true')return;
  form.dataset.saving='true';
  const button=e.submitter;
  const label=button?.textContent;
  const previousState=structuredClone(state);
  if(button){button.disabled=true;button.textContent='Сохранение…';}
  try{
    await handleSubmit(e);
  }catch(err){
    state=previousState;
    console.error('Could not save form',err);
    toast('Не удалось сохранить. Попробуй ещё раз — заполненные поля остались в форме.');
  }finally{
    delete form.dataset.saving;
    if(button){button.disabled=false;button.textContent=label;}
  }
});

function refuelNumberValue(input){
  const raw=String(input?.value??'').trim().replace(',','.');
  const n=Number(raw);
  return Number.isFinite(n)&&n>0?n:0;
}
function refuelFormatValue(name,value){
  if(!Number.isFinite(value)||value<=0)return '';
  const digits=name==='liters'?3:2;
  return value.toFixed(digits).replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'');
}
function updateRefuelCalculator(changedInput){
  const form=changedInput?.closest?.('#refuel-form');
  if(!form||!['amount','liters','pricePerLiter'].includes(changedInput.name))return;

  const previousAuto=form.dataset.refuelAuto||'';
  let manual=String(form.dataset.refuelManual||'').split(',').filter(Boolean);
  manual=manual.filter(name=>name!==changedInput.name);
  manual.push(changedInput.name);
  manual=manual.slice(-2);
  form.dataset.refuelManual=manual.join(',');

  const fields={
    amount:form.elements.amount,
    liters:form.elements.liters,
    pricePerLiter:form.elements.pricePerLiter
  };
  const names=['amount','liters','pricePerLiter'];

  // The field the user is touching becomes manual even if it was auto-calculated before.
  if(form.dataset.refuelAuto===changedInput.name)form.dataset.refuelAuto='';
  for(const [name,input] of Object.entries(fields)){
    input.classList.remove('is-auto-calculated');
    input.removeAttribute('data-auto-calculated');
  }

  // For an existing record, one manual change is enough: keep the other sensible source
  // and recalculate the former derived price field.
  if(manual.length===1&&form.dataset.refuelAuto){
    const auto=form.dataset.refuelAuto;
    const source=names.find(name=>name!==auto&&name!==manual[0]&&refuelNumberValue(fields[name])>0);
    if(source)manual=[source,manual[0]];
  }

  if(manual.length<2){
    const status=form.querySelector('[data-refuel-calc-status]');
    if(status)status.textContent='Введите ещё одно значение — третье заполнится автоматически.';
    return;
  }

  const autoName=names.find(name=>!manual.includes(name));
  if(!autoName)return;
  const a=manual[0],b=manual[1];
  const av=refuelNumberValue(fields[a]),bv=refuelNumberValue(fields[b]);
  const status=form.querySelector('[data-refuel-calc-status]');
  if(!av||!bv){
    if(previousAuto&&!manual.includes(previousAuto)&&fields[previousAuto]){
      fields[previousAuto].value='';
      form.dataset.refuelAuto='';
    }
    if(status)status.textContent='Введите два значения больше нуля — третье заполнится автоматически.';
    return;
  }

  let result=0;
  if(autoName==='amount'){
    const liters=refuelNumberValue(fields.liters),price=refuelNumberValue(fields.pricePerLiter);
    if(liters&&price)result=liters*price;
  }else if(autoName==='liters'){
    const amount=refuelNumberValue(fields.amount),price=refuelNumberValue(fields.pricePerLiter);
    if(amount&&price)result=amount/price;
  }else{
    const amount=refuelNumberValue(fields.amount),liters=refuelNumberValue(fields.liters);
    if(amount&&liters)result=amount/liters;
  }
  if(!result||!Number.isFinite(result))return;

  const target=fields[autoName];
  target.value=refuelFormatValue(autoName,result);
  target.classList.add('is-auto-calculated');
  target.setAttribute('data-auto-calculated','true');
  form.dataset.refuelAuto=autoName;

  const labels={amount:'Сумма рассчитана',liters:'Объём рассчитан',pricePerLiter:'Цена за литр рассчитана'};
  const units={amount:' ₽',liters:' л',pricePerLiter:' ₽/л'};
  if(status)status.textContent=`${labels[autoName]} автоматически: ${target.value}${units[autoName]}`;
}

document.addEventListener('input', e=>{
  updateRefuelCalculator(e.target);
  const key=e.target.dataset.input;
  if(key==='history-search'){ui.search=e.target.value; const pos=$('.v5-main')?.scrollTop||0; render(); const ms=$('.v5-main'); if(ms)ms.scrollTop=pos; $('#app input[data-input="history-search"]')?.focus();}
});
document.addEventListener('change', async e=>{
  const key=e.target.dataset.input;
  if(key==='history-type'){ui.historyType=e.target.value;render();}
  if(key==='expense-filter'){ui.expenseFilter=e.target.value;render();}
  if(key==='analytics-period'){ui.analyticsPeriod=e.target.value;nextTransition='fade';render();}
  if(key==='theme'){state.settings.theme=e.target.value;applyTheme();await persist();render();}
  if(e.target.id==='backup-input') await importBackupFile(e.target.files[0]);
});

document.addEventListener('click', async e=>{
  const view=e.target.closest('[data-view]')?.dataset.view;
  if(view){navigateTo(view);return;}
  const el=e.target.closest('[data-action]'); if(!el)return; const a=el.dataset.action,id=el.dataset.id;
  if(a==='close-sheet'){const sheet=document.querySelector('.sheet'),backdrop=document.querySelector('.sheet-backdrop');if(sheet)closeSheetAfterGesture(sheet,backdrop);else{ui.sheet=null;ui.sheetId=null;render();}return;}
  if(a==='open-reminders'){ui.sheet='reminders';render();return;}
  if(a==='open-profile'){navigateTo('profile');return;}
  if(a==='go-back'){goBack();return;}
  if(a==='analytics-tab'){ui.analyticsTab=el.dataset.value||'expenses';nextTransition='fade';render();return;}
  if(a==='report-mode'){ui.reportMode=el.dataset.value==='full'?'full':'short';nextTransition='fade';render();return;}
  if(a==='print-report'){const old=document.title,c=car();document.title=`AutoJournal-${c?.make||'auto'}-${c?.model||'report'}-${today()}`;document.body.classList.add('v5-print-report');setTimeout(()=>{window.print();setTimeout(()=>{document.body.classList.remove('v5-print-report');document.title=old;},200);},60);return;}
  if(a==='notif-tab'){ui.notificationTab=el.dataset.value||'auto';render();return;}
  if(a==='add-car'){ui.sheet='car';ui.sheetId=null;render();return;}
  if(a==='edit-current-car'){ui.sheet='car';ui.sheetId=state.activeCarId;render();return;}
  if(a==='car-switch'){ui.sheet='garage';ui.sheetId=null;render();return;}
  if(a==='activate-car'){state.activeCarId=id;await persist();ui.sheet=null;toast('Автомобиль выбран');render();return;}
  if(a==='add-odometer'){if(!car())return;ui.sheet='odometer';render();return;}
  if(a==='add-entry'){if(!car()){ui.sheet='car';render();return;}ui.sheet='entry';ui.sheetId=null;render();return;}
  if(a==='add-refuel'){if(!car()){ui.sheet='car';render();return;}ui.sheet='refuel';ui.sheetId=null;render();return;}
  if(a==='refuel-detail'){ui.sheet='refuel-detail';ui.sheetId=id;render();return;}
  if(a==='edit-refuel'){ui.sheet='refuel';ui.sheetId=id;render();return;}
  if(a==='entry-detail'){ui.sheet='entry-detail';ui.sheetId=id;render();return;}
  if(a==='edit-entry'){ui.sheet='entry';ui.sheetId=id;render();return;}
  if(a==='add-component'){if(!car()){ui.sheet='car';render();return;}ui.sheet='component';ui.sheetId=null;render();return;}
  if(a==='component-detail'){ui.sheet='component-detail';ui.sheetId=id;render();return;}
  if(a==='edit-component'){ui.sheet='component';ui.sheetId=id;render();return;}
  if(a==='add-expense'){if(!car()){ui.sheet='car';render();return;}ui.sheet='expense';ui.sheetId=null;render();return;}
  if(a==='expense-detail'){ui.sheet='expense-detail';ui.sheetId=id;render();return;}
  if(a==='edit-expense'){const x=state.expenses.find(v=>v.id===id);if(x?.linkedServiceId){ui.sheet='entry-detail';ui.sheetId=x.linkedServiceId;}else if(x?.linkedRefuelId){ui.sheet='refuel-detail';ui.sheetId=x.linkedRefuelId;}else{ui.sheet='expense';ui.sheetId=id;}render();return;}
  if(a==='open-linked-entry'){ui.sheet='entry-detail';ui.sheetId=id;render();return;}
  if(a==='open-linked-refuel'){ui.sheet='refuel-detail';ui.sheetId=id;render();return;}
  if(a==='add-document'){if(!car()){ui.sheet='car';render();return;}ui.sheet='document';ui.sheetId=null;render();return;}
  if(a==='document-detail'){ui.sheet='document-detail';ui.sheetId=id;render();return;}
  if(a==='edit-document'){ui.sheet='document';ui.sheetId=id;render();return;}
  if(a==='reminder-open'){if(el.dataset.kind==='document'){ui.sheet='document-detail';ui.sheetId=id;}else{ui.sheet='component-detail';ui.sheetId=id;}render();return;}
  if(a==='delete-car'){if(confirm('Удалить автомобиль и все связанные записи? Это необратимо.')){const cid=id;state.cars=state.cars.filter(x=>x.id!==cid);for(const k of ['odometerLogs','serviceEntries','components','expenses','documents','refuels'])state[k]=state[k].filter(x=>x.carId!==cid);state.activeCarId=state.cars[0]?.id||null;await persist();ui.sheet=null;render();toast('Автомобиль удалён');}return;}
  if(a==='delete-entry'){if(confirm('Удалить сервисную запись?')){const entry=state.serviceEntries.find(x=>x.id===id),comp=entry?.componentId?state.components.find(c=>c.id===entry.componentId):null;state.serviceEntries=state.serviceEntries.filter(x=>x.id!==id);state.expenses=state.expenses.filter(x=>x.linkedServiceId!==id);if(comp&&comp.sourceEntryId===id){const refs=state.serviceEntries.filter(e=>e.componentId===comp.id);if(!refs.length){state.components=state.components.filter(c=>c.id!==comp.id);removeMileageSource('component',comp.id);}else comp.sourceEntryId='';}removeMileageSource('service',id);await persist();ui.sheet=null;render();toast('Запись удалена');}return;}
  if(a==='delete-component'){if(confirm('Удалить узел и его интервалы? История работ сохранится.')){state.components=state.components.filter(x=>x.id!==id);state.serviceEntries.filter(x=>x.componentId===id).forEach(x=>{x.componentId='';x.componentAction='';});removeMileageSource('component',id);await persist();ui.sheet=null;render();toast('Узел удалён');}return;}
  if(a==='delete-expense'){const x=state.expenses.find(v=>v.id===id);if(x?.linkedServiceId){toast('Связанный расход удаляется вместе с сервисной записью');return;}if(x?.linkedRefuelId){toast('Связанный расход удаляется вместе с заправкой');return;}if(confirm('Удалить расход?')){state.expenses=state.expenses.filter(v=>v.id!==id);removeMileageSource('expense',id);await persist();ui.sheet=null;render();toast('Расход удалён');}return;}
  if(a==='delete-document'){if(confirm('Удалить документ и сохранённые в нём файлы?')){state.documents=state.documents.filter(x=>x.id!==id);await persist();ui.sheet=null;render();toast('Документ удалён');}return;}
  if(a==='delete-refuel'){if(confirm('Удалить запись о заправке?')){state.refuels=(state.refuels||[]).filter(x=>x.id!==id);state.expenses=state.expenses.filter(x=>x.linkedRefuelId!==id);removeMileageSource('refuel',id);await persist();ui.sheet=null;render();toast('Заправка удалена');}return;}
  if(a==='mark-inspection'){await markComponent(id,'inspect');return;}
  if(a==='mark-replacement'){await markComponent(id,'replace');return;}
  if(a==='open-stored-file'){openStoredFile(el.dataset.doc,Number(el.dataset.index));return;}
  if(a==='share-stored-file'){await shareStoredFile(el.dataset.doc,Number(el.dataset.index));return;}
  if(a==='remove-stored-file'){const d=state.documents.find(x=>x.id===el.dataset.doc),i=Number(el.dataset.index);if(d?.files?.[i]&&confirm(`Удалить файл «${d.files[i].name}»?`)){d.files.splice(i,1);await persist();render();toast('Файл удалён');}return;}
  if(a==='open-image'){window.open(el.getAttribute('src'),'_blank');return;}
  if(a==='backup-export'){await exportBackup();return;}
  if(a==='backup-import'){$('#backup-input')?.click();return;}
  if(a==='calendar-export'){exportCalendar();return;}
  if(a==='enable-notifications'){await showCurrentNotification();return;}
  if(a==='persist-storage'){await requestPersistentStorage();return;}
  if(a==='reset-all'){if(confirm('Удалить ВСЕ автомобили, историю, фото, документы и настройки с этого устройства?')){await clearState();state=defaultState();applyTheme();ui={view:'home',sheet:null,sheetId:null,search:'',historyType:'all',expenseFilter:'all',notificationTab:'auto',analyticsTab:'expenses',analyticsPeriod:'month',reportMode:'short'};navStack=[];render();toast('Все данные удалены');}return;}
});

let edgeSwipe=null;
document.addEventListener('touchstart',e=>{
  if(ui.sheet)return; // bottom sheets use their own downward gesture
  if(e.touches.length!==1)return;
  const t=e.touches[0];
  if(t.clientX>28)return;
  if(!navStack.length&&!secondaryTitles[ui.view])return;
  edgeSwipe={x:t.clientX,y:t.clientY,dx:0,active:false};
},{passive:true});
document.addEventListener('touchmove',e=>{
  if(!edgeSwipe||e.touches.length!==1)return;
  const t=e.touches[0],dx=Math.max(0,t.clientX-edgeSwipe.x),dy=Math.abs(t.clientY-edgeSwipe.y);
  if(!edgeSwipe.active&&dx>10&&dx>dy*1.15)edgeSwipe.active=true;
  if(!edgeSwipe.active)return;
  edgeSwipe.dx=dx;
  e.preventDefault();
  document.body.dataset.swipeTarget='page';
  document.body.classList.add('v5-swiping');
  document.documentElement.style.setProperty('--v5-swipe-x',`${Math.min(dx,window.innerWidth)}px`);
},{passive:false});
function finishEdgeSwipe(commit){
  if(!edgeSwipe)return;
  if(commit){
    document.body.classList.add('v5-swipe-finish');
    document.documentElement.style.setProperty('--v5-swipe-x','100vw');
    setTimeout(()=>{document.body.classList.remove('v5-swiping','v5-swipe-finish');document.body.removeAttribute('data-swipe-target');document.documentElement.style.removeProperty('--v5-swipe-x');edgeSwipe=null;goBack();},150);
  }else{
    document.body.classList.add('v5-swipe-finish');
    document.documentElement.style.setProperty('--v5-swipe-x','0px');
    setTimeout(()=>{document.body.classList.remove('v5-swiping','v5-swipe-finish');document.body.removeAttribute('data-swipe-target');document.documentElement.style.removeProperty('--v5-swipe-x');edgeSwipe=null;},170);
  }
}
document.addEventListener('touchend',()=>{if(edgeSwipe)finishEdgeSwipe(edgeSwipe.active&&edgeSwipe.dx>72);},{passive:true});
document.addEventListener('touchcancel',()=>{if(edgeSwipe)finishEdgeSwipe(false);},{passive:true});

let sheetSwipe=null;
function resetSheetSwipeVisuals(sheet,backdrop){
  if(sheet){sheet.style.removeProperty('transform');sheet.style.removeProperty('transition');}
  if(backdrop){backdrop.style.removeProperty('opacity');backdrop.style.removeProperty('transition');}
  document.body.classList.remove('v5-sheet-dragging','v5-sheet-settling');
}
function closeSheetAfterGesture(sheet,backdrop){
  if(!sheet||!ui.sheet)return;
  document.body.classList.add('v5-sheet-settling');
  sheet.style.transition='transform .2s cubic-bezier(.22,.61,.36,1)';
  sheet.style.transform='translate3d(0,105%,0)';
  if(backdrop){backdrop.style.transition='opacity .18s ease-out';backdrop.style.opacity='0';}
  setTimeout(()=>{
    ui.sheet=null;ui.sheetId=null;sheetSwipe=null;
    resetSheetSwipeVisuals(sheet,backdrop);
    render();
  },190);
}
function snapSheetBack(sheet,backdrop){
  if(!sheet)return;
  document.body.classList.add('v5-sheet-settling');
  sheet.style.transition='transform .2s cubic-bezier(.22,.61,.36,1)';
  sheet.style.transform='translate3d(0,0,0)';
  if(backdrop){backdrop.style.transition='opacity .2s ease-out';backdrop.style.opacity='1';}
  setTimeout(()=>{resetSheetSwipeVisuals(sheet,backdrop);sheetSwipe=null;},210);
}
document.addEventListener('touchstart',e=>{
  if(!ui.sheet||e.touches.length!==1)return;
  const sheet=e.target.closest('.sheet');
  if(!sheet)return;
  const body=sheet.querySelector('.sheet-body');
  const inHead=!!e.target.closest('.sheet-head');
  const interactive=!!e.target.closest('input,textarea,select,button,a,label,[contenteditable="true"]');
  const bodyAtTop=!body||body.scrollTop<=0;
  if(!inHead&&(!bodyAtTop||interactive))return;
  const t=e.touches[0];
  sheetSwipe={
    sheet,
    backdrop:document.querySelector('.sheet-backdrop'),
    startX:t.clientX,startY:t.clientY,lastY:t.clientY,lastTime:performance.now(),
    dy:0,velocity:0,active:false
  };
},{passive:true});
document.addEventListener('touchmove',e=>{
  if(!sheetSwipe||e.touches.length!==1)return;
  const t=e.touches[0];
  const dx=Math.abs(t.clientX-sheetSwipe.startX);
  const dy=t.clientY-sheetSwipe.startY;
  if(dy<=0)return;
  if(!sheetSwipe.active&&dy>8&&dy>dx*1.15){
    sheetSwipe.active=true;
    document.body.classList.add('v5-sheet-dragging');
  }
  if(!sheetSwipe.active)return;
  e.preventDefault();
  const now=performance.now(),dt=Math.max(1,now-sheetSwipe.lastTime);
  sheetSwipe.velocity=(t.clientY-sheetSwipe.lastY)/dt;
  sheetSwipe.lastY=t.clientY;sheetSwipe.lastTime=now;sheetSwipe.dy=dy;
  const eased=Math.min(dy,window.innerHeight);
  sheetSwipe.sheet.style.transform=`translate3d(0,${eased}px,0)`;
  if(sheetSwipe.backdrop)sheetSwipe.backdrop.style.opacity=String(Math.max(0,1-eased/(window.innerHeight*.72)));
},{passive:false});
document.addEventListener('touchend',()=>{
  if(!sheetSwipe)return;
  if(!sheetSwipe.active){sheetSwipe=null;return;}
  const shouldClose=sheetSwipe.dy>90||(sheetSwipe.dy>34&&sheetSwipe.velocity>.65);
  if(shouldClose)closeSheetAfterGesture(sheetSwipe.sheet,sheetSwipe.backdrop);
  else snapSheetBack(sheetSwipe.sheet,sheetSwipe.backdrop);
},{passive:true});
document.addEventListener('touchcancel',()=>{
  if(sheetSwipe?.active)snapSheetBack(sheetSwipe.sheet,sheetSwipe.backdrop);
  else sheetSwipe=null;
},{passive:true});

async function markComponent(id,action){ const c=state.components.find(x=>x.id===id); if(!c)return; const km=currentKm(), date=nowISO(); const entry={id:uid(),carId:c.carId,date,odometer:km,type:action==='inspect'?'inspection':'replacement',title:`${action==='inspect'?'Проверка':'Замена'}: ${c.name}`,category:c.category||'',faultKey:'',workText:'',partsText:action==='replace'?[c.brand,c.partNumber].filter(Boolean).join(' · '):'',partsCost:action==='replace'?nonneg(c.cost):0,laborCost:0,otherCost:0,componentId:c.id,componentAction:action,notes:'Отмечено из карточки узла',photos:[],createdAt:new Date().toISOString(),seq:nextSeq()}; state.serviceEntries.push(entry); syncEntryExpense(entry); recordMileageObservation(km,date,'Из сервисной записи','service',entry.id); await persist();toast(action==='inspect'?'Проверка отмечена':'Замена отмечена, циклы сброшены');ui.sheet='component-detail';render(); }

function openStoredFile(docId,index){ const d=state.documents.find(x=>x.id===docId); const f=d?.files?.[index]; if(!f)return; const a=document.createElement('a');a.href=f.data;a.download=f.name;a.target='_blank';document.body.append(a);a.click();a.remove(); }

async function shareStoredFile(docId,index){ const d=state.documents.find(x=>x.id===docId); const f=d?.files?.[index]; if(!f)return; try{ const res=await fetch(f.data); const blob=await res.blob(); const file=new File([blob],f.name,{type:f.type||blob.type||'application/octet-stream'}); if(navigator.canShare?.({files:[file]})){ await navigator.share({title:d.title,files:[file]}); } else { openStoredFile(docId,index); toast('Системный Share для файлов недоступен — файл открыт'); } }catch{ openStoredFile(docId,index); } }

function downloadText(name,text,type='application/json'){ const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
async function exportBackup(){state.settings.lastBackupAt=new Date().toISOString();await persist();downloadText(`autojournal-backup-${nowISO()}.json`,JSON.stringify(state,null,2));toast('Резервная копия создана');}
async function importBackupFile(file){
  if(!file)return;if(file.size>80*1024*1024){toast('Резервная копия слишком большая');return;}
  try{const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.cars)||!Array.isArray(data.serviceEntries)||!Array.isArray(data.expenses||[])||!Array.isArray(data.documents||[])||!Array.isArray(data.refuels||[]))throw new Error('invalid');if(!confirm('Восстановление заменит все текущие данные. Продолжить?'))return;state=migrate(data);await persist();applyTheme();navStack=[];ui.view='home';ui.sheet=null;ui.sheetId=null;render();toast('Резервная копия восстановлена');}catch{toast('Не удалось прочитать резервную копию');}
}

function predictedDateForKm(dueKm){ const avg=averageKmPerDay(); if(!avg || dueKm==null)return null; const rem=dueKm-currentKm(); if(rem<=0)return today(); return addDays(today(),Math.ceil(rem/avg)); }
function icsDate(date){return date.replaceAll('-','');}
function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');}
function icsFold(line){const enc=new TextEncoder(),parts=[];let part='';for(const ch of String(line)){const n=part+ch;if(enc.encode(n).length>73){parts.push(part);part=ch}else part=n}if(part||!parts.length)parts.push(part);return parts.join('\r\n ');}
function exportCalendar(){ if(!car()){toast('Сначала добавь автомобиль');return;} const events=allReminders(true); if(!events.length){toast('Нет сроков для экспорта');return;} const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AutoJournal//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH']; let count=0; const avg=averageKmPerDay(); for(const ev of events){let due=ev.dueDate, pred=predictedDateForKm(ev.dueKm);if(!due||(pred&&pred<due))due=pred;if(!due)continue;const overdue=due<today(), originalDue=due;const leadDays=Math.max(0,Number(ev.warnDays??state.settings.defaultWarnDays),(ev.dueKm!=null&&avg&&Number(ev.warnKm??0)>0)?Math.ceil(Number(ev.warnKm)/avg):0);const identity=ev.kind==='document'?`document-${ev.documentId}`:`${ev.kind}-${ev.componentId}`,uidv=`autojournal-${car().id}-${identity}@local`,summary=`${overdue?'Просрочено: ':''}${ev.title}`,description=`${overdue?`Исходный срок: ${fmtDate(originalDue)}. `:''}${describeDue(ev)}. Авто: ${car().make} ${car().model}.`;lines.push('BEGIN:VEVENT',`UID:${uidv}`,`DTSTART;VALUE=DATE:${icsDate(due)}`,`DTEND;VALUE=DATE:${icsDate(addDays(due,1))}`,`SUMMARY:${icsEscape(summary)}`,`DESCRIPTION:${icsEscape(description)}`);if(leadDays>0)lines.push('BEGIN:VALARM',`TRIGGER:-P${leadDays}D`,'ACTION:DISPLAY',`DESCRIPTION:${icsEscape(ev.title)}`,'END:VALARM');lines.push('END:VEVENT');count++;}lines.push('END:VCALENDAR');if(!count){toast('Не хватает дат или истории пробега для прогноза');return;}downloadText(`autojournal-reminders-${nowISO()}.ics`,lines.map(icsFold).join('\r\n'),'text/calendar;charset=utf-8');toast(`Экспортировано событий: ${count}`);}

async function showCurrentNotification(){
  const reminders=allReminders(); if(!('Notification' in window) || !navigator.serviceWorker){toast('Web-уведомления не поддерживаются этим режимом браузера');return;}
  try{const perm=await Notification.requestPermission(); if(perm!=='granted'){toast('Разрешение на уведомления не выдано');return;} const reg=await navigator.serviceWorker.ready; await reg.showNotification('АвтоЖурнал',{body:reminders.length?`${reminders.length} событий требуют внимания`:'Все сроки в порядке',icon:'./icons/icon-192.png',badge:'./icons/icon-192.png'});toast('Уведомление отправлено');}catch{toast('Не удалось показать уведомление');}
}
async function requestPersistentStorage(){ try{if(!navigator.storage?.persist){toast('Persistent storage не поддерживается');return;} const ok=await navigator.storage.persist(); const info=await storageInfoText(); toast(ok?`Хранилище защищено · ${info}`:`Браузер не предоставил защиту · ${info}`);}catch{toast('Не удалось запросить защиту хранилища');} }

async function init(){
  state=migrate(await loadState());
  state.refuels ||= [];
  ui.analyticsTab ||= 'expenses';
  ui.analyticsPeriod ||= 'month';
  if(state.activeCarId && !state.cars.some(c=>c.id===state.activeCarId))state.activeCarId=state.cars[0]?.id||null;
  applyTheme();
  render();
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch(err){console.warn('SW registration failed',err);}}
  window.addEventListener('online',()=>toast('Интернет доступен'));
  window.addEventListener('offline',()=>toast('Офлайн-режим: данные остаются доступны'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.theme==='system')applyTheme();});
}

init().catch(err=>{console.error(err);$('#app').innerHTML=`<main class="main-scroll"><div class="page"><div class="empty"><div class="empty-title">Не удалось открыть локальную базу</div><div class="empty-text">${esc(err.message||String(err))}</div></div></div></main>`;});
