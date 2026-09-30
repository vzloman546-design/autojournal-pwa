import { loadState, saveState, clearState } from './db.js';

const APP_VERSION = 3;
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
    currency: 'RUB'
  },
  activeCarId: null,
  nextSeq: 1,
  cars: [],
  odometerLogs: [],
  serviceEntries: [],
  components: [],
  expenses: [],
  documents: []
});

let state = defaultState();
let ui = { view:'home', sheet:null, sheetId:null, search:'', historyType:'all', expenseFilter:'all' };

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
    warnKm:x.warnKm==null?base.settings.defaultWarnKm:nonneg(x.warnKm),warnDays:x.warnDays==null?base.settings.defaultWarnDays:nonneg(x.warnDays),cost:nonneg(x.cost),notes:String(x.notes||''),lastInspectionDate:String(x.lastInspectionDate||''),lastInspectionOdometer:nonneg(x.lastInspectionOdometer)
  }));
  const expenses=(Array.isArray(raw.expenses)?raw.expenses:[]).map(x=>({...x,id:String(x.id||uid()),carId:String(x.carId||''),date:String(x.date||''),odometer:nonneg(x.odometer),category:String(x.category||'Другое'),amount:nonneg(x.amount),description:String(x.description||''),note:String(x.note||''),linkedServiceId:String(x.linkedServiceId||'')}));
  const documents=(Array.isArray(raw.documents)?raw.documents:[]).map(x=>({...x,id:String(x.id||uid()),carId:String(x.carId||''),title:String(x.title||''),type:String(x.type||''),number:String(x.number||''),issueDate:String(x.issueDate||''),expiryDate:String(x.expiryDate||''),remindDays:x.remindDays==null?30:nonneg(x.remindDays),files:Array.isArray(x.files)?x.files.filter(f=>f&&safeStoredFileData(f.data)).map(f=>({id:String(f.id||uid()),name:String(f.name||'Файл'),type:String(f.type||''),size:nonneg(f.size),data:safeStoredFileData(f.data)})):[]}));
  const hasSource=(carId,type,id)=>odometerLogs.some(x=>x.carId===carId&&x.sourceType===type&&x.sourceId===id);
  for(const e of serviceEntries) if(e.carId&&e.odometer>0&&!hasSource(e.carId,'service',e.id)) odometerLogs.push({id:uid(),carId:e.carId,date:e.date,value:e.odometer,note:'Восстановлено из сервисной истории',sourceType:'service',sourceId:e.id});
  for(const c of components) if(c.carId&&c.baseInstalledOdometer>0&&!hasSource(c.carId,'component',c.id)) odometerLogs.push({id:uid(),carId:c.carId,date:c.baseInstalledDate,value:c.baseInstalledOdometer,note:'Восстановлено из установки узла',sourceType:'component',sourceId:c.id});
  for(const e of expenses) if(e.carId&&e.odometer>0&&!e.linkedServiceId&&!hasSource(e.carId,'expense',e.id)) odometerLogs.push({id:uid(),carId:e.carId,date:e.date,value:e.odometer,note:'Восстановлено из расхода',sourceType:'expense',sourceId:e.id});
  for(const c of cars){ const vals=odometerLogs.filter(x=>x.carId===c.id).map(x=>Number(x.value)).filter(Number.isFinite); const loggedMax=vals.length?Math.max(...vals):0; if(c.currentOdometer>Math.max(c.initialOdometer,loggedMax)) odometerLogs.push({id:uid(),carId:c.id,date:c.trackingStartDate||today(),value:c.currentOdometer,note:'Восстановлено из текущего пробега',sourceType:'manual',sourceId:`legacy-current-${c.id}`}); const allVals=odometerLogs.filter(x=>x.carId===c.id).map(x=>nonneg(x.value)); c.currentOdometer=Math.max(c.initialOdometer,...(allVals.length?allVals:[0])); if(!c.trackingStartDate){const dates=odometerLogs.filter(x=>x.carId===c.id&&dateOK(x.date)).map(x=>x.date).sort();c.trackingStartDate=dates[0]||today();} }
  const theme=['system','light','dark'].includes(rs.theme)?rs.theme:base.settings.theme;
  const settings={...base.settings,theme,defaultWarnKm:nonneg(rs.defaultWarnKm??base.settings.defaultWarnKm,base.settings.defaultWarnKm),defaultWarnDays:nonneg(rs.defaultWarnDays??base.settings.defaultWarnDays,base.settings.defaultWarnDays),currency:'RUB'};
  const next=Math.max(nonneg(raw.nextSeq,1),...serviceEntries.map(x=>nonneg(x.seq)+1),1);
  return {...base,...raw,version:APP_VERSION,nextSeq:next,settings,cars,odometerLogs,serviceEntries,components,expenses,documents};
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
  if(!car())return[]; const list=[]; for(const comp of carItems(state.components))list.push(...componentEvents(comp)); for(const doc of carItems(state.documents)){if(!doc.expiryDate)continue;const ev={kind:'document',documentId:doc.id,title:`Документ: ${doc.title}`,dueDate:doc.expiryDate,dueKm:null,warnDays:Number(doc.remindDays??30),warnKm:0};ev.status=eventStatus(ev);list.push(ev);} const rank={overdue:0,due:1,soon:2,ok:3}; return list.filter(x=>includeOk||x.status!=='ok').sort((a,b)=>rank[a.status]-rank[b.status]||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||(a.dueKm??1e15)-(b.dueKm??1e15));
}
function componentOverall(comp){const evs=componentEvents(comp);if(!evs.length)return'neutral';if(evs.some(x=>x.status==='overdue'))return'overdue';if(evs.some(x=>x.status==='due'))return'due';if(evs.some(x=>x.status==='soon'))return'soon';return'ok';}
function componentProgress(comp){const cs=componentState(comp);if(!nonneg(comp.lifeKm)&&!nonneg(comp.lifeMonths))return 0;let ratios=[];if(nonneg(comp.lifeKm)>0)ratios.push((currentKm()-cs.installedOdometer)/nonneg(comp.lifeKm));if(nonneg(comp.lifeMonths)>0){const end=addMonths(cs.installedDate,comp.lifeMonths);const total=Math.max(1,daysBetween(cs.installedDate,end));ratios.push(daysBetween(cs.installedDate,today())/total);}return clamp(Math.max(...ratios,0),0,1.15);}

function pageHeaderTitle() {
  return ({home:'АвтоЖурнал',history:'История',parts:'Узлы',expenses:'Расходы',analytics:'Аналитика',documents:'Документы',more:'Ещё'})[ui.view] || 'АвтоЖурнал';
}

function topbar() {
  const c=car(); const reminders=allReminders();
  return `<header class="topbar"><div class="topbar-row">
    <div class="brand">
      <div class="brand-mark">AJ</div>
      <div class="brand-copy"><div class="brand-title">АвтоЖурнал</div><div class="brand-subtitle">${c?`${esc(c.make)} ${esc(c.model)} · ${fmtNum(c.currentOdometer)} км`:'Локально на этом устройстве'}</div></div>
    </div>
    <div class="top-actions">
      <button class="icon-btn" data-action="open-reminders" aria-label="Напоминания" style="position:relative">${icons.bell}${reminders.length?'<span class="badge-dot"></span>':''}</button>
    </div>
  </div></header>`;
}

const tabs=[['home','Главная',icons.home],['history','История',icons.history],['parts','Узлы',icons.wrench],['expenses','Расходы',icons.wallet],['more','Ещё',icons.more]];
function tabbar(){ return `<div class="tabbar-wrap"><nav class="tabbar" aria-label="Основная навигация">${tabs.map(([id,label,ic])=>{const active=ui.view===id||(id==='more'&&['analytics','documents'].includes(ui.view));return `<button class="tab ${active?'active':''}" data-view="${id}" ${active?'aria-current="page"':''}>${ic}<span class="tab-label">${label}</span></button>`}).join('')}</nav></div>`; }

function emptyState(title,text,action,label,icon=icons.car){ return `<div class="empty"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-text">${text}</div>${action?`<button class="btn primary" data-action="${action}">${label}</button>`:''}</div>`; }
function statusPill(status){ const t={ok:'В норме',soon:'Скоро',due:'Срок наступил',overdue:'Просрочено',neutral:'Нет срока'}[status]||status; return `<span class="status-pill ${status}"><span class="status-dot"></span>${t}</span>`; }

function homePage(){
  const c=car();
  if(!c) return `<main class="main-scroll"><div class="page page-welcome">
    <section class="welcome-card card">
      <div class="welcome-head">
        <div class="welcome-icon">${icons.car}</div>
        <div class="welcome-copy">
          <div class="welcome-eyebrow">Сервисная книжка</div>
          <h1 class="welcome-title">Добавьте автомобиль</h1>
          <p class="welcome-text">Ведите обслуживание, проверки, расходы и документы в одном месте.</p>
        </div>
      </div>
      <button class="btn primary block welcome-action" data-action="add-car">Добавить автомобиль</button>
      <div class="welcome-privacy">${icons.lock || ''}<span>Данные хранятся только на этом устройстве и доступны офлайн.</span></div>
    </section>
  </div></main>`;
  const ex=carItems(state.expenses); const total=ex.reduce((s,x)=>s+Number(x.amount||0),0);
  const reminders=allReminders();
  const avg=averageKmPerDay(c);
  const recent=carItems(state.serviceEntries).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
  return `<main class="main-scroll"><div class="page">
    <section class="hero-card card">
      <div class="vehicle-row"><div><div class="vehicle-name">${esc(c.make)} ${esc(c.model)}</div><div class="vehicle-meta">${[c.year,c.engine,c.plate].filter(Boolean).map(esc).join(' · ')||'Карточка автомобиля'}</div></div><button class="vehicle-switch" data-action="car-switch">${state.cars.length>1?'Сменить':'Гараж'}</button></div>
      <div class="odo-block"><div><div><span class="odo-number">${fmtNum(c.currentOdometer)}</span><span class="odo-unit">км</span></div><div class="odo-caption">Текущий пробег${avg?` · ≈ ${fmtNum(avg,1)} км/день`:''}</div></div><button class="icon-btn" data-action="add-odometer" aria-label="Обновить пробег">${icons.speed}</button></div>
    </section>
    <div class="metrics">
      <div class="metric"><div class="metric-value">${money(total)}</div><div class="metric-label">учтено расходов</div></div>
      <div class="metric"><div class="metric-value">${carItems(state.serviceEntries).length}</div><div class="metric-label">${plural(carItems(state.serviceEntries).length,'запись в истории','записи в истории','записей в истории')}</div></div>
      <div class="metric"><div class="metric-value">${reminders.length}</div><div class="metric-label">${reminders.length===1?'требует внимания':'требуют внимания'}</div></div>
    </div>
    <section class="section"><div class="section-head"><div class="section-title">Быстрые действия</div></div><div class="quick-grid">
      <button class="quick-action" data-action="add-entry"><div class="quick-icon">${icons.wrench}</div><div class="quick-label">Работа</div></button>
      <button class="quick-action" data-action="add-expense"><div class="quick-icon">${icons.wallet}</div><div class="quick-label">Расход</div></button>
      <button class="quick-action" data-action="add-component"><div class="quick-icon">${icons.plus}</div><div class="quick-label">Узел</div></button>
      <button class="quick-action" data-action="add-document"><div class="quick-icon">${icons.doc}</div><div class="quick-label">Документ</div></button>
    </div></section>
    <section class="section"><div class="section-head"><div class="section-title">Ближайшее</div><button class="text-btn" data-action="open-reminders">Все</button></div>
      ${reminders.length?reminders.slice(0,3).map(reminderCard).join(''):emptyState('Всё спокойно','Просроченных и приближающихся сроков сейчас нет.',null,null,icons.check)}
    </section>
    <section class="section"><div class="section-head"><div class="section-title">Последние работы</div><button class="text-btn" data-view="history">История</button></div>
      ${recent.length?`<div class="list">${recent.map(entryRow).join('')}</div>`:emptyState('История пока пустая','Добавь замену масла, ремонт, диагностику или любую выполненную работу.','add-entry','Добавить запись',icons.history)}
    </section>
  </div></main>`;
}

function reminderCard(r){ return `<button class="reminder-card" data-action="reminder-open" data-id="${r.componentId||r.documentId||''}" data-kind="${r.kind}"><div class="reminder-symbol ${r.status}">${r.status==='overdue'?icons.alert:icons.calendar}</div><div><div class="reminder-title">${esc(r.title)}</div><div class="reminder-sub">${esc(describeDue(r))}</div></div>${statusPill(r.status)}</button>`; }

function entryRow(e){ return `<button class="list-row" data-action="entry-detail" data-id="${e.id}"><div class="row-icon">${e.type==='repair'?icons.wrench:e.type==='inspection'?icons.check:icons.history}</div><div class="row-main"><div class="row-title">${esc(e.title)}</div><div class="row-sub">${fmtDate(e.date)} · ${fmtNum(e.odometer)} км${e.category?` · ${esc(e.category)}`:''}</div></div><div class="row-side">${totalServiceCost(e)?`<div class="row-value">${money(totalServiceCost(e))}</div>`:''}<div class="row-sub">›</div></div></button>`; }

function historyPage(){
  if(!car()) return `<main class="main-scroll"><div class="page">${emptyState('Сначала добавь автомобиль','История обслуживания привязывается к конкретной машине.','add-car','Добавить автомобиль')}</div></main>`;
  let items=carItems(state.serviceEntries).sort((a,b)=>b.date.localeCompare(a.date));
  if(ui.historyType!=='all') items=items.filter(x=>x.type===ui.historyType);
  if(ui.search.trim()){const q=ui.search.toLowerCase();items=items.filter(x=>[x.title,x.category,x.notes].some(v=>String(v||'').toLowerCase().includes(q)));}
  return `<main class="main-scroll"><div class="page"><h1 class="page-title">История</h1><div class="toolbar"><label class="search">${icons.search}<input data-input="history-search" value="${esc(ui.search)}" placeholder="Поиск по работам" /></label><select class="select-compact" data-input="history-type"><option value="all" ${ui.historyType==='all'?'selected':''}>Все</option><option value="maintenance" ${ui.historyType==='maintenance'?'selected':''}>ТО</option><option value="repair" ${ui.historyType==='repair'?'selected':''}>Ремонт</option><option value="replacement" ${ui.historyType==='replacement'?'selected':''}>Замена</option><option value="inspection" ${ui.historyType==='inspection'?'selected':''}>Проверка</option></select></div>${items.length?`<div class="list">${items.map(entryRow).join('')}</div>`:emptyState('Ничего не найдено','Измени фильтр или добавь новую запись.','add-entry','Добавить запись',icons.history)}</div><button class="fab" data-action="add-entry" aria-label="Добавить запись">${icons.plus}</button></main>`;
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

function analyticsPage(){
  if(!car()) return `<main class="main-scroll"><div class="page">${emptyState('Нет автомобиля','Для аналитики нужны данные конкретной машины.','add-car','Добавить автомобиль')}</div></main>`;
  const ex=carItems(state.expenses); const total=ex.reduce((s,x)=>s+Number(x.amount||0),0); const c=car(), tracked=trackedExpenses(c), trackedTotal=tracked.reduce((s,x)=>s+Number(x.amount||0),0); const driven=Math.max(0,Number(c.currentOdometer||0)-Number(c.initialOdometer||0)); const cpk=driven>0?trackedTotal/driven:0;
  const months=[]; const d=new Date(); for(let i=5;i>=0;i--){const m=new Date(d.getFullYear(),d.getMonth()-i,1); const key=`${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`; months.push({key,label:new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(m),value:ex.filter(x=>x.date?.startsWith(key)).reduce((s,x)=>s+Number(x.amount||0),0)});}
  const max=Math.max(...months.map(x=>x.value),1);
  const catMap={}; ex.forEach(x=>catMap[x.category||'Другое']=(catMap[x.category||'Другое']||0)+Number(x.amount||0)); const cats=Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const colors=['#0a84ff','#30d158','#ff9f0a','#ff453a','#bf5af2','#64d2ff','#ffd60a','#8e8e93'];
  let acc=0; const grads=cats.length?cats.map(([_,v],i)=>{const s=acc;acc+=v/Math.max(total,1)*100;return `${colors[i%colors.length]} ${s}% ${acc}%`;}).join(','):'#8e8e93 0 100%';
  const repairs=carItems(state.serviceEntries).filter(x=>x.type==='repair'); const rep={}; repairs.forEach(x=>{const k=(x.faultKey||x.category||x.title||'Ремонт').trim().toLowerCase(); (rep[k] ||= {label:x.faultKey||x.category||x.title,count:0,cost:0}).count++; rep[k].cost+=totalServiceCost(x);}); const repeated=Object.values(rep).filter(x=>x.count>1).sort((a,b)=>b.count-a.count);
  const yearly=ex.filter(x=>x.date?.startsWith(String(new Date().getFullYear()))).sort((a,b)=>b.amount-a.amount).slice(0,5);
  return `<main class="main-scroll"><div class="page"><h1 class="page-title">Аналитика владения</h1><p class="page-lead">Все расчёты выполняются локально по твоим записям.</p><div class="stats-grid"><div class="stat-card"><div class="stat-value">${money(total)}</div><div class="stat-label">все учтённые расходы</div></div><div class="stat-card"><div class="stat-value">${cpk?`${fmtNum(cpk,2)} ₽`:'—'}</div><div class="stat-label">стоимость 1 км${driven?` · ${fmtNum(driven)} км учтено`:''}</div></div><div class="stat-card"><div class="stat-value">${money(ex.length?total/ex.length:0)}</div><div class="stat-label">средняя операция</div></div><div class="stat-card"><div class="stat-value">${averageKmPerDay()?`${fmtNum(averageKmPerDay(),1)} км`:'—'}</div><div class="stat-label">средний пробег в день</div></div></div>
    <section class="section"><div class="section-head"><div class="section-title">Расходы за 6 месяцев</div></div><div class="chart-card"><div class="bar-chart">${months.map(m=>`<div class="bar-col"><div class="bar" title="${money(m.value)}" style="height:${Math.max(2,m.value/max*100)}%"></div><div class="bar-label">${esc(m.label)}</div></div>`).join('')}</div></div></section>
    <section class="section"><div class="section-head"><div class="section-title">По категориям</div></div>${cats.length?`<div class="chart-card"><div class="donut-wrap"><div class="donut" style="background:conic-gradient(${grads})"></div><div class="legend">${cats.slice(0,7).map(([n,v],i)=>`<div class="legend-row"><span class="legend-dot" style="background:${colors[i%colors.length]}"></span><span class="legend-name">${esc(n)}</span><span class="legend-value">${money(v)}</span></div>`).join('')}</div></div></div>`:emptyState('Недостаточно данных','Добавь расходы — диаграмма появится автоматически.',null,null,icons.chart)}</section>
    <section class="section"><div class="section-head"><div class="section-title">Повторяющиеся ремонты</div></div>${repeated.length?`<div class="list">${repeated.map(x=>`<div class="list-row"><div class="row-icon">${icons.wrench}</div><div class="row-main"><div class="row-title">${esc(x.label)}</div><div class="row-sub">Повторялось ${x.count} раза</div></div><div class="row-value">${money(x.cost)}</div></div>`).join('')}</div>`:emptyState('Повторов не обнаружено','Здесь появятся узлы или неисправности, которые ремонтировались больше одного раза.',null,null,icons.check)}</section>
    <section class="section"><div class="section-head"><div class="section-title">Самые дорогие позиции в ${new Date().getFullYear()}</div></div>${yearly.length?`<div class="list">${yearly.map(expenseRow).join('')}</div>`:emptyState('Нет расходов за этот год','После добавления трат здесь появятся самые крупные позиции.',null,null,icons.wallet)}</section>
  </div></main>`;
}

function documentsPage(){
  if(!car()) return `<main class="main-scroll"><div class="page">${emptyState('Нет автомобиля','Документы привязываются к машине.','add-car','Добавить автомобиль')}</div></main>`;
  const docs=carItems(state.documents).sort((a,b)=>(a.expiryDate||'9999').localeCompare(b.expiryDate||'9999'));
  return `<main class="main-scroll"><div class="page"><h1 class="page-title">Документы</h1><p class="page-lead">Страховки, диагностические карты, чеки, заказ-наряды и любые файлы. Всё хранится локально.</p>${docs.length?`<div class="list">${docs.map(docRow).join('')}</div>`:emptyState('Документов пока нет','Добавь ОСАГО, диагностическую карту, чек или заказ-наряд.','add-document','Добавить документ',icons.doc)}</div><button class="fab" data-action="add-document">${icons.plus}</button></main>`;
}
function docRow(d){ const ev=d.expiryDate?{dueDate:d.expiryDate,dueKm:null,warnDays:d.remindDays??30,warnKm:0}:null; if(ev)ev.status=eventStatus(ev); return `<button class="list-row" data-action="document-detail" data-id="${d.id}"><div class="row-icon">${icons.doc}</div><div class="row-main"><div class="row-title">${esc(d.title)}</div><div class="row-sub">${esc(d.type||'Документ')}${d.expiryDate?` · до ${fmtDate(d.expiryDate)}`:''}</div></div><div class="row-side">${ev?statusPill(ev.status):''}<div class="row-sub">${(d.files||[]).length} файл.</div></div></button>`; }

async function storageInfoText(){ try{if(!navigator.storage?.estimate)return 'Недоступно'; const {usage=0,quota=0}=await navigator.storage.estimate(); return `${fmtNum(usage/1024/1024,1)} из ${fmtNum(quota/1024/1024,0)} МБ`; }catch{return 'Недоступно';}}

function morePage(){
  const c=car();
  return `<main class="main-scroll"><div class="page"><h1 class="page-title">Ещё</h1>
    <div class="menu-card">
      <button class="menu-row" data-view="analytics"><div class="menu-icon">${icons.chart}</div><div class="menu-copy"><div class="menu-title">Аналитика владения</div><div class="menu-sub">Динамика расходов, цена километра, повторные ремонты</div></div><span class="row-chevron">›</span></button>
      <button class="menu-row" data-view="documents"><div class="menu-icon">${icons.doc}</div><div class="menu-copy"><div class="menu-title">Документы</div><div class="menu-sub">Файлы и сроки действия</div></div><span class="row-chevron">›</span></button>
      <button class="menu-row" data-action="car-switch"><div class="menu-icon">${icons.car}</div><div class="menu-copy"><div class="menu-title">Гараж</div><div class="menu-sub">${state.cars.length?`${state.cars.length} авто · ${c?`${esc(c.make)} ${esc(c.model)}`:''}`:'Добавить автомобиль'}</div></div><span class="row-chevron">›</span></button>
    </div>
    <section class="section"><div class="section-head"><div class="section-title">Напоминания</div></div><div class="menu-card">
      <button class="menu-row" data-action="calendar-export"><div class="menu-icon">${icons.calendar}</div><div class="menu-copy"><div class="menu-title">Экспорт в Календарь (.ics)</div><div class="menu-sub">Создать локальный календарный файл по срокам и прогнозу пробега</div></div><span class="row-chevron">›</span></button>
      <button class="menu-row" data-action="enable-notifications"><div class="menu-icon">${icons.bell}</div><div class="menu-copy"><div class="menu-title">Показать уведомление сейчас</div><div class="menu-sub">Запросить разрешение и вывести текущие предупреждения</div></div><span class="row-chevron">›</span></button>
    </div></section>
    <section class="section"><div class="section-head"><div class="section-title">Внешний вид</div></div><div class="menu-card"><div class="menu-row"><div class="menu-icon">${icons.gear}</div><div class="menu-copy"><div class="menu-title">Тема</div><div class="menu-sub">Системная, светлая или тёмная</div></div><select class="select-compact" data-input="theme" style="height:44px;max-width:128px"><option value="system" ${state.settings.theme==='system'?'selected':''}>Система</option><option value="light" ${state.settings.theme==='light'?'selected':''}>Светлая</option><option value="dark" ${state.settings.theme==='dark'?'selected':''}>Тёмная</option></select></div></div></section>
    <section class="section"><div class="section-head"><div class="section-title">Данные</div></div><div class="menu-card">
      <button class="menu-row" data-action="backup-export"><div class="menu-icon">${icons.export}</div><div class="menu-copy"><div class="menu-title">Резервная копия</div><div class="menu-sub">Скачать JSON со всеми автомобилями, фото и документами</div></div><span class="row-chevron">›</span></button>
      <button class="menu-row" data-action="backup-import"><div class="menu-icon">${icons.import}</div><div class="menu-copy"><div class="menu-title">Восстановить копию</div><div class="menu-sub">Заменит текущие данные после подтверждения</div></div><span class="row-chevron">›</span></button>
      <button class="menu-row" data-action="persist-storage"><div class="menu-icon">${icons.check}</div><div class="menu-copy"><div class="menu-title">Защитить локальное хранилище</div><div class="menu-sub">Запросить persistent storage, если браузер поддерживает</div></div><span class="row-chevron">›</span></button>
    </div></section>
    <section class="section"><div class="install-note"><strong>Для iPhone:</strong> открой опубликованный сайт в Safari → «Поделиться» → «На экран “Домой”». После первого открытия приложение кэшируется и работает без интернета. Фоновые запланированные web‑уведомления без push‑сервера iOS не гарантирует, поэтому внутри есть центр напоминаний и экспорт .ics в системный Календарь.</div></section>
    <section class="section"><button class="btn danger block" data-action="reset-all">Удалить все локальные данные</button></section>
  </div><input id="backup-input" type="file" accept="application/json,.json" hidden /></main>`;
}

function remindersSheet(){ const list=allReminders(); return sheetWrap('Напоминания', list.length?`<div>${list.map(reminderCard).join('')}</div><div class="install-note" style="margin-top:16px"><strong>Важно:</strong> километровые сроки обновляются, когда ты вносишь текущий пробег. Если есть история пробега, экспорт в Календарь также прогнозирует дату по среднему километражу в день.</div>`:emptyState('Всё в порядке','Сейчас нет приближающихся или просроченных событий.',null,null,icons.check)); }

function sheetWrap(title,body,foot=''){ return `<div class="sheet-backdrop" data-action="close-sheet"></div><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><div class="sheet-handle"></div><div class="sheet-title-row"><div class="sheet-title" id="sheet-title">${title}</div><button class="sheet-close" data-action="close-sheet" aria-label="Закрыть">${icons.close}</button></div></div><div class="sheet-body">${body}</div>${foot?`<div class="sheet-foot">${foot}</div>`:''}</section>`; }
function inputField(label,name,value='',type='text',extra=''){ return `<div class="field"><label for="${name}">${label}</label><input class="input" id="${name}" name="${name}" type="${type}" value="${esc(value??'')}" ${extra}></div>`; }
function selectField(label,name,options,value=''){ return `<div class="field"><label for="${name}">${label}</label><select class="input" id="${name}" name="${name}">${options.map(o=>{const [v,t]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`}).join('')}</select></div>`; }

function carSheet(id=null){ const x=id?state.cars.find(c=>c.id===id):null; const body=`<form id="car-form"><input type="hidden" name="id" value="${x?.id||''}"><div class="form-section"><div class="field-grid two">${inputField('Марка','make',x?.make||'','text','required')}${inputField('Модель','model',x?.model||'','text','required')}</div><div class="field-grid two" style="margin-top:8px">${inputField('Год','year',x?.year||'','number','inputmode="numeric"')}${inputField('Двигатель','engine',x?.engine||'')}</div></div><div class="form-section"><div class="form-title">Идентификация</div><div class="field-grid two">${inputField('Госномер','plate',x?.plate||'')}${inputField('VIN','vin',x?.vin||'')}</div></div><div class="form-section"><div class="form-title">Пробег</div><div class="field-grid two">${inputField('Пробег при начале учёта, км','initialOdometer',x?.initialOdometer??0,'number','min="0" inputmode="numeric"')}${inputField('Текущий пробег, км','currentOdometer',x?.currentOdometer??0,'number','min="0" inputmode="numeric" required')}</div></div><div class="form-section"><div class="field-grid two">${inputField('Дата покупки','purchaseDate',x?.purchaseDate||'','date')}${inputField('Цена покупки, ₽','purchasePrice',x?.purchasePrice||'','number','min="0" step="0.01" inputmode="decimal"')}</div></div></form>`; const foot=`<button class="btn primary block" form="car-form" type="submit">${x?'Сохранить':'Добавить автомобиль'}</button>${x?`<button class="btn danger block" style="margin-top:8px" data-action="delete-car" data-id="${x.id}">Удалить автомобиль</button>`:''}`; return sheetWrap(x?'Автомобиль':'Новый автомобиль',body,foot); }

function garageSheet(){ const body=`${state.cars.length?`<div class="list">${state.cars.map(c=>`<button class="list-row" data-action="activate-car" data-id="${c.id}"><div class="row-icon">${icons.car}</div><div class="row-main"><div class="row-title">${esc(c.make)} ${esc(c.model)}</div><div class="row-sub">${fmtNum(c.currentOdometer)} км${c.plate?` · ${esc(c.plate)}`:''}</div></div>${c.id===state.activeCarId?statusPill('ok'):'<span class="row-chevron">›</span>'}</button>`).join('')}</div>`:''}<button class="btn primary block" style="margin-top:16px" data-action="add-car">Добавить автомобиль</button>${car()?`<button class="btn block" style="margin-top:8px" data-action="edit-current-car">Изменить текущий</button>`:''}`; return sheetWrap('Гараж',body); }

function odometerSheet(){ const c=car(); return sheetWrap('Обновить пробег',`<form id="odometer-form"><div class="field-grid">${inputField('Текущий пробег, км','value',c?.currentOdometer||0,'number',`min="${c?.currentOdometer||0}" inputmode="numeric" required`)}${inputField('Дата','date',nowISO(),'date','required')}<div class="field"><label for="note">Примечание</label><textarea class="input" id="note" name="note" placeholder="Например: показания после поездки"></textarea></div></div></form>`,`<button class="btn primary block" form="odometer-form">Сохранить пробег</button>`); }

function entrySheet(id=null){ const x=id?state.serviceEntries.find(e=>e.id===id):null; const comps=carItems(state.components); const body=`<form id="entry-form"><input type="hidden" name="id" value="${x?.id||''}"><div class="form-section"><div class="field-grid two">${inputField('Дата','date',x?.date||nowISO(),'date','required')}${inputField('Пробег, км','odometer',x?.odometer??currentKm(),'number','min="0" inputmode="numeric" required')}</div></div><div class="form-section"><div class="field-grid">${selectField('Тип записи','type',[['maintenance','Плановое ТО'],['repair','Ремонт'],['replacement','Замена'],['inspection','Проверка'],['other','Другое']],x?.type||'maintenance')}${inputField('Название','title',x?.title||'','text','placeholder="Например: замена передних колодок" required')}${inputField('Категория / узел','category',x?.category||'','text','placeholder="Тормозная система, двигатель…"')}${inputField('Ключ неисправности','faultKey',x?.faultKey||'','text','placeholder="Для группировки повторных ремонтов"')}<div class="field"><label for="workText">Выполненные работы</label><textarea class="input" id="workText" name="workText" placeholder="Что именно сделали">${esc(x?.workText||'')}</textarea></div><div class="field"><label for="partsText">Установленные запчасти</label><textarea class="input" id="partsText" name="partsText" placeholder="Название, бренд, артикул">${esc(x?.partsText||'')}</textarea></div></div></div><div class="form-section"><div class="form-title">Стоимость</div><div class="field-grid two">${inputField('Запчасти, ₽','partsCost',x?.partsCost||'','number','min="0" inputmode="decimal"')}${inputField('Работа, ₽','laborCost',x?.laborCost||'','number','min="0" inputmode="decimal"')}${inputField('Прочее, ₽','otherCost',x?.otherCost||'','number','min="0" inputmode="decimal"')}</div></div>${comps.length?`<div class="form-section"><div class="form-title">Связать с узлом</div><div class="field-grid">${selectField('Узел','componentId',[['','Не связывать'],...comps.map(c=>[c.id,c.name])],x?.componentId||'')}${selectField('Действие с узлом','componentAction',[['','Только запись'],['inspect','Отметить проверку'],['replace','Отметить замену']],x?.componentAction||'')}</div><div class="helper">«Проверка» переносит только следующий осмотр. «Замена» начинает заново и срок службы, и график проверок.</div></div>`:''}<div class="form-section"><div class="field"><label for="notes">Заметки</label><textarea class="input" id="notes" name="notes">${esc(x?.notes||'')}</textarea></div><div class="field" style="margin-top:8px"><label for="photos">Фото</label><input class="input" id="photos" name="photos" type="file" accept="image/*" multiple></div>${x?.photos?.length?`<div class="preview-grid">${x.photos.map(p=>`<img src="${p.data}" alt="Фото записи">`).join('')}</div>`:''}</div></form>`; const foot=`<button class="btn primary block" form="entry-form">${x?'Сохранить':'Добавить запись'}</button>`; return sheetWrap(x?'Редактировать запись':'Новая запись',body,foot); }

function componentSheet(id=null){ const x=id?state.components.find(c=>c.id===id):null; const body=`<form id="component-form"><input type="hidden" name="id" value="${x?.id||''}"><div class="form-section"><div class="field-grid">${inputField('Название узла / расходника','name',x?.name||'','text','placeholder="Например: передние тормозные колодки" required')}<div class="field-grid two">${inputField('Категория','category',x?.category||'')}${inputField('Бренд','brand',x?.brand||'')}</div>${inputField('Артикул','partNumber',x?.partNumber||'')}</div></div><div class="form-section"><div class="form-title">Установка</div><div class="field-grid two">${inputField('Дата','installedDate',x?.installedDate||nowISO(),'date','required')}${inputField('Пробег, км','installedOdometer',x?.installedOdometer??currentKm(),'number','min="0" inputmode="numeric" required')}</div></div><div class="form-section"><div class="form-title">Срок службы</div><div class="field-grid two">${inputField('Ресурс, км','lifeKm',x?.lifeKm||'','number','min="0" inputmode="numeric" placeholder="например 40000"')}${inputField('Ресурс, месяцев','lifeMonths',x?.lifeMonths||'','number','min="0" inputmode="numeric" placeholder="например 24"')}</div><div class="helper">Если заданы оба значения, предупреждение сработает по тому лимиту, который наступит раньше.</div></div><div class="form-section"><div class="form-title">График проверки</div><div class="field-grid two">${inputField('Проверять каждые, км','inspectKm',x?.inspectKm||'','number','min="0" inputmode="numeric" placeholder="например 10000"')}${inputField('Проверять каждые, месяцев','inspectMonths',x?.inspectMonths||'','number','min="0" inputmode="numeric" placeholder="например 6"')}</div></div><div class="form-section"><div class="form-title">Предупреждать заранее</div><div class="field-grid two">${inputField('За сколько км','warnKm',x?.warnKm??state.settings.defaultWarnKm,'number','min="0" inputmode="numeric"')}${inputField('За сколько дней','warnDays',x?.warnDays??state.settings.defaultWarnDays,'number','min="0" inputmode="numeric"')}</div></div><div class="form-section">${inputField('Стоимость детали, ₽','cost',x?.cost||'','number','min="0" inputmode="decimal"')}<div class="field" style="margin-top:8px"><label for="notes">Заметки</label><textarea class="input" id="notes" name="notes">${esc(x?.notes||'')}</textarea></div></div></form>`; return sheetWrap(x?'Редактировать узел':'Новый узел',body,`<button class="btn primary block" form="component-form">Сохранить</button>`); }

function expenseSheet(id=null){ const x=id?state.expenses.find(e=>e.id===id):null; if(x?.linkedServiceId)return sheetWrap('Связанный расход',`<div class="install-note"><strong>Этот расход синхронизирован с сервисной записью.</strong><br>Измени стоимость в сервисной записи — сумма обновится автоматически.</div>`,`<button class="btn primary block" data-action="open-linked-entry" data-id="${x.linkedServiceId}">Открыть сервисную запись</button>`); const categories=['Топливо','Обслуживание','Ремонт','Страховка','Налог','Парковка','Мойка','Платная дорога','Тюнинг','Другое']; const body=`<form id="expense-form"><input type="hidden" name="id" value="${x?.id||''}"><div class="field-grid two">${inputField('Дата','date',x?.date||nowISO(),'date','required')}${inputField('Пробег, км','odometer',x?.odometer??currentKm(),'number','min="0" inputmode="numeric"')}</div><div class="field-grid" style="margin-top:8px">${selectField('Категория','category',categories,x?.category||'Обслуживание')}${inputField('Сумма, ₽','amount',x?.amount||'','number','min="0" step="0.01" inputmode="decimal" required')}${inputField('Описание','description',x?.description||'','text','placeholder="Что оплачено"')}<div class="field"><label for="note">Заметки</label><textarea class="input" id="note" name="note">${esc(x?.note||'')}</textarea></div></div></form>`; return sheetWrap(x?'Редактировать расход':'Новый расход',body,`<button class="btn primary block" form="expense-form">Сохранить</button>`); }

function documentSheet(id=null){ const x=id?state.documents.find(d=>d.id===id):null; const body=`<form id="document-form"><input type="hidden" name="id" value="${x?.id||''}"><div class="field-grid">${inputField('Название','title',x?.title||'','text','placeholder="Например: ОСАГО" required')}${inputField('Тип','type',x?.type||'')}${inputField('Номер','number',x?.number||'')}</div><div class="field-grid two" style="margin-top:8px">${inputField('Дата выдачи','issueDate',x?.issueDate||'','date')}${inputField('Действует до','expiryDate',x?.expiryDate||'','date')}</div><div class="field-grid" style="margin-top:8px">${inputField('Предупредить за, дней','remindDays',x?.remindDays??30,'number','min="0" inputmode="numeric"')}<div class="field"><label for="files">Файлы</label><input class="input" id="files" name="files" type="file" multiple accept="image/*,application/pdf,text/plain"></div></div>${x?.files?.length?`<div style="margin-top:8px">${x.files.map((f,i)=>`<div class="file-chip"><span>${icons.doc}</span><span class="file-name">${esc(f.name)}</span><button type="button" class="text-btn" data-action="open-stored-file" data-doc="${x.id}" data-index="${i}">Открыть</button><button type="button" class="text-btn" data-action="share-stored-file" data-doc="${x.id}" data-index="${i}">Поделиться</button><button type="button" class="text-btn danger-text" data-action="remove-stored-file" data-doc="${x.id}" data-index="${i}">Удалить</button></div>`).join('')}</div>`:''}</form>`; return sheetWrap(x?'Редактировать документ':'Новый документ',body,`<button class="btn primary block" form="document-form">Сохранить</button>`); }

function entryDetailSheet(id){ const e=state.serviceEntries.find(x=>x.id===id); if(!e)return ''; return sheetWrap('Запись',`<div class="detail-hero"><div class="detail-title">${esc(e.title)}</div><div class="detail-sub">${fmtDate(e.date)} · ${fmtNum(e.odometer)} км</div><div class="detail-grid"><div class="detail-item"><div class="detail-label">Тип</div><div class="detail-value">${esc(e.type)}</div></div><div class="detail-item"><div class="detail-label">Стоимость</div><div class="detail-value">${money(totalServiceCost(e))}</div></div><div class="detail-item"><div class="detail-label">Запчасти</div><div class="detail-value">${money(e.partsCost)}</div></div><div class="detail-item"><div class="detail-label">Работа</div><div class="detail-value">${money(e.laborCost)}</div></div></div></div>${e.workText?`<div class="section"><div class="form-title">Выполненные работы</div><div class="note-box">${esc(e.workText)}</div></div>`:''}${e.partsText?`<div class="section"><div class="form-title">Установленные запчасти</div><div class="note-box">${esc(e.partsText)}</div></div>`:''}${e.notes?`<div class="section"><div class="form-title">Заметки</div><div class="note-box">${esc(e.notes)}</div></div>`:''}${e.photos?.length?`<div class="section"><div class="form-title">Фото</div><div class="preview-grid">${e.photos.map(p=>`<img src="${p.data}" data-action="open-image" alt="Фото">`).join('')}</div></div>`:''}`,`<div class="btn-row"><button class="btn" data-action="edit-entry" data-id="${e.id}">${icons.edit} Изменить</button><button class="btn danger" data-action="delete-entry" data-id="${e.id}">${icons.trash} Удалить</button></div>`); }

function intervalText(km, months){ const bits=[]; if(Number(km)>0)bits.push(`${fmtNum(km)} км`); if(Number(months)>0)bits.push(`${fmtNum(months)} мес.`); return bits.join(' / ')||'—'; }

function componentDetailSheet(id){ const c=state.components.find(x=>x.id===id); if(!c)return ''; const evs=componentEvents(c), cs=componentState(c); return sheetWrap(c.name,`<div class="detail-hero"><div class="detail-title">${esc(c.name)}</div><div class="detail-sub">${[c.brand,c.partNumber,c.category].filter(Boolean).map(esc).join(' · ')||'Узел автомобиля'}</div><div class="detail-grid"><div class="detail-item"><div class="detail-label">Установлено</div><div class="detail-value">${fmtDate(cs.installedDate)} · ${fmtNum(cs.installedOdometer)} км</div></div><div class="detail-item"><div class="detail-label">Состояние</div><div class="detail-value">${statusPill(componentOverall(c))}</div></div><div class="detail-item"><div class="detail-label">Ресурс</div><div class="detail-value">${intervalText(c.lifeKm,c.lifeMonths)}</div></div><div class="detail-item"><div class="detail-label">Проверка</div><div class="detail-value">${intervalText(c.inspectKm,c.inspectMonths)}</div></div></div></div><section class="section"><div class="section-title" style="margin-bottom:8px">Следующие события</div>${evs.length?evs.map(reminderCard).join(''):emptyState('Интервалы не заданы','Добавь ресурс или график проверки в настройках узла.',null,null,icons.calendar)}</section>${c.notes?`<section class="section"><div class="form-title">Заметки</div><div class="note-box">${esc(c.notes)}</div></section>`:''}`,`<div class="btn-row"><button class="btn primary" data-action="mark-inspection" data-id="${c.id}">Проверено</button><button class="btn" data-action="mark-replacement" data-id="${c.id}">Заменено</button></div><div class="btn-row" style="margin-top:8px"><button class="btn" data-action="edit-component" data-id="${c.id}">Изменить</button><button class="btn danger" data-action="delete-component" data-id="${c.id}">Удалить</button></div>`); }

function expenseDetailSheet(id){ const x=state.expenses.find(e=>e.id===id); if(!x)return ''; const linked=x.linkedServiceId?state.serviceEntries.find(e=>e.id===x.linkedServiceId):null; const foot=linked?`<button class="btn primary block" data-action="open-linked-entry" data-id="${linked.id}">Открыть сервисную запись</button>`:`<div class="btn-row"><button class="btn" data-action="edit-expense" data-id="${x.id}">Изменить</button><button class="btn danger" data-action="delete-expense" data-id="${x.id}">Удалить</button></div>`; return sheetWrap('Расход',`<div class="detail-hero"><div class="detail-title">${money(x.amount)}</div><div class="detail-sub">${esc(x.description||x.category)} · ${fmtDate(x.date)}</div><div class="detail-grid"><div class="detail-item"><div class="detail-label">Категория</div><div class="detail-value">${esc(x.category)}</div></div><div class="detail-item"><div class="detail-label">Пробег</div><div class="detail-value">${x.odometer?`${fmtNum(x.odometer)} км`:'—'}</div></div></div></div>${linked?`<section class="section"><div class="install-note"><strong>Связано с сервисной записью.</strong><br>Сумма обновляется автоматически.</div></section>`:''}${x.note?`<section class="section"><div class="note-box">${esc(x.note)}</div></section>`:''}`,foot); }

function documentDetailSheet(id){ const d=state.documents.find(x=>x.id===id); if(!d)return ''; return sheetWrap(d.title,`<div class="detail-hero"><div class="detail-title">${esc(d.title)}</div><div class="detail-sub">${esc(d.type||'Документ')}</div><div class="detail-grid"><div class="detail-item"><div class="detail-label">Номер</div><div class="detail-value">${esc(d.number||'—')}</div></div><div class="detail-item"><div class="detail-label">Действует до</div><div class="detail-value">${fmtDate(d.expiryDate)}</div></div></div></div>${d.files?.length?`<section class="section"><div class="form-title">Файлы</div>${d.files.map((f,i)=>`<div class="file-chip"><span>${icons.doc}</span><span class="file-name">${esc(f.name)}</span><button class="text-btn" data-action="open-stored-file" data-doc="${d.id}" data-index="${i}">Открыть</button><button class="text-btn" data-action="share-stored-file" data-doc="${d.id}" data-index="${i}">Поделиться</button></div>`).join('')}</section>`:''}`,`<div class="btn-row"><button class="btn" data-action="edit-document" data-id="${d.id}">Изменить</button><button class="btn danger" data-action="delete-document" data-id="${d.id}">Удалить</button></div>`); }

function renderSheet(){ if(!ui.sheet)return ''; if(ui.sheet==='reminders')return remindersSheet(); if(ui.sheet==='car')return carSheet(ui.sheetId); if(ui.sheet==='garage')return garageSheet(); if(ui.sheet==='odometer')return odometerSheet(); if(ui.sheet==='entry')return entrySheet(ui.sheetId); if(ui.sheet==='component')return componentSheet(ui.sheetId); if(ui.sheet==='expense')return expenseSheet(ui.sheetId); if(ui.sheet==='document')return documentSheet(ui.sheetId); if(ui.sheet==='entry-detail')return entryDetailSheet(ui.sheetId); if(ui.sheet==='component-detail')return componentDetailSheet(ui.sheetId); if(ui.sheet==='expense-detail')return expenseDetailSheet(ui.sheetId); if(ui.sheet==='document-detail')return documentDetailSheet(ui.sheetId); return ''; }

function render(){
  const root=$('#app');
  let page={home:homePage,history:historyPage,parts:partsPage,expenses:expensesPage,analytics:analyticsPage,documents:documentsPage,more:morePage}[ui.view]||homePage;
  root.innerHTML=`${topbar()}${page()}${tabbar()}${renderSheet()}`;
}

async function fileToDataURL(file, compressImage=false){
  if(compressImage && file.type.startsWith('image/')){
    const src=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
    const max=1600, scale=Math.min(1,max/Math.max(img.width,img.height)); const canvas=document.createElement('canvas'); canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale); canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height); return canvas.toDataURL('image/jpeg',.82);
  }
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
}

function formObject(form){ return Object.fromEntries(new FormData(form).entries()); }
function updateCarMileage(value,date=nowISO(),note=''){ const c=car(); if(!c)return false; const n=Number(value); if(!Number.isFinite(n)||n<nonneg(c.currentOdometer)){toast('Текущий пробег не может быть меньше предыдущего');return false;} const err=mileageConsistencyError(n,date,'manual',''); if(err){toast(err);return false;} c.currentOdometer=n; state.odometerLogs.push({id:uid(),carId:c.id,date,value:n,note,sourceType:'manual',sourceId:uid()}); return true; }

function syncEntryExpense(entry){
  const amount=totalServiceCost(entry);
  let ex=state.expenses.find(x=>x.linkedServiceId===entry.id);
  if(amount>0){ const obj={id:ex?.id||uid(),carId:entry.carId,date:entry.date,odometer:entry.odometer,category:entry.type==='repair'?'Ремонт':'Обслуживание',amount,description:entry.title,note:'Создано из сервисной записи',linkedServiceId:entry.id}; if(ex)Object.assign(ex,obj); else state.expenses.push(obj); }
  else if(ex) state.expenses=state.expenses.filter(x=>x.id!==ex.id);
}


async function handleSubmit(e){
  const f=e.target;
  // A control named "id" shadows HTMLFormElement.id in Safari and Chromium.
  const formId=f.getAttribute('id');
  if(formId==='car-form'){
    const d=formObject(f), id=d.id||uid(); let x=state.cars.find(c=>c.id===id); const initial=nonneg(d.initialOdometer), requested=nonneg(d.currentOdometer);
    if(!d.make.trim()||!d.model.trim()){toast('Укажи марку и модель автомобиля');return;}
    if(requested<initial){toast('Текущий пробег не может быть меньше пробега начала учёта');return;}
    if(d.year&&(Number(d.year)<1886||Number(d.year)>new Date().getFullYear()+1)){toast('Проверь год автомобиля');return;}
    if(x){const floor=linkedMileageFloor(id);if(requested<floor){toast(`В истории есть запись на ${fmtNum(floor)} км. Сначала исправь её.`);return;}Object.assign(x,{id,make:d.make.trim(),model:d.model.trim(),year:d.year,engine:d.engine,plate:d.plate.trim(),vin:d.vin.trim(),initialOdometer:initial,purchaseDate:d.purchaseDate,purchasePrice:nonneg(d.purchasePrice)});state.odometerLogs=state.odometerLogs.filter(v=>!(v.carId===id&&v.sourceType==='manual'&&nonneg(v.value)>requested));state.odometerLogs.push({id:uid(),carId:id,date:nowISO(),value:requested,note:'Из карточки автомобиля',sourceType:'manual',sourceId:uid()});recalculateCurrentOdometer(id);}else{const obj={id,make:d.make.trim(),model:d.model.trim(),year:d.year,engine:d.engine,plate:d.plate.trim(),vin:d.vin.trim(),initialOdometer:initial,currentOdometer:requested,purchaseDate:d.purchaseDate,purchasePrice:nonneg(d.purchasePrice),trackingStartDate:nowISO()};state.cars.push(obj);state.activeCarId=id;state.odometerLogs.push({id:uid(),carId:id,date:nowISO(),value:requested,note:'Начало учёта',sourceType:'car-start',sourceId:id});}
    await persist();ui.sheet=null;toast('Автомобиль сохранён');render();return;
  }
  if(formId==='odometer-form'){const d=formObject(f);if(!updateCarMileage(d.value,d.date,d.note))return;await persist();ui.sheet=null;toast('Пробег обновлён');render();return;}
  if(formId==='entry-form'){
    const d=formObject(f), id=d.id||uid(); let x=state.serviceEntries.find(v=>v.id===id); const oldComponentId=x?.componentId||''; const photos=x?.photos?[...x.photos]:[];
    for(const file of f.elements.photos.files){if(file.size>12*1024*1024){toast(`Фото ${file.name} слишком большое`);continue;}try{const data=await fileToDataURL(file,true);if(safeImageData(data))photos.push({id:uid(),name:file.name,data});else toast(`Формат ${file.name} не поддерживается`);}catch{toast(`Не удалось обработать ${file.name}`);}}
    const obj={id,carId:car().id,date:d.date,odometer:nonneg(d.odometer),type:d.type,title:d.title.trim(),category:d.category.trim(),faultKey:d.faultKey.trim(),workText:d.workText||'',partsText:d.partsText||'',partsCost:nonneg(d.partsCost),laborCost:nonneg(d.laborCost),otherCost:nonneg(d.otherCost),componentId:d.componentId||'',componentAction:d.componentAction||'',notes:d.notes,photos,createdAt:x?.createdAt||new Date().toISOString(),seq:x?.seq!=null?nonneg(x.seq):nextSeq()};
    if(!dateOK(obj.date)){toast('Укажи корректную дату');return;} if(obj.componentAction&&!obj.componentId){toast('Для действия выбери узел');return;} const err=mileageConsistencyError(obj.odometer,obj.date,'service',id); if(err&&obj.odometer>nonneg(car().initialOdometer)){toast(err);return;}
    if(x)Object.assign(x,obj);else state.serviceEntries.push(obj); syncEntryExpense(obj); recordMileageObservation(obj.odometer,obj.date,'Из сервисной записи','service',id); if(oldComponentId&&oldComponentId!==obj.componentId){} await persist();ui.sheet=null;toast('Запись сохранена');render();return;
  }
  if(formId==='component-form'){
    const d=formObject(f), id=d.id||uid(); let x=state.components.find(v=>v.id===id); const installKm=nonneg(d.installedOdometer); if(installKm>currentKm()){toast('Пробег установки не может быть больше текущего пробега');return;} if(d.installedDate>today()){toast('Дата установки не может быть в будущем');return;}
    const obj={id,carId:car().id,name:d.name.trim(),category:d.category,brand:d.brand,partNumber:d.partNumber,baseInstalledDate:d.installedDate,baseInstalledOdometer:installKm,installedDate:d.installedDate,installedOdometer:installKm,lifeKm:nonneg(d.lifeKm),lifeMonths:nonneg(d.lifeMonths),inspectKm:nonneg(d.inspectKm),inspectMonths:nonneg(d.inspectMonths),warnKm:nonneg(d.warnKm),warnDays:nonneg(d.warnDays),cost:nonneg(d.cost),notes:d.notes,lastInspectionDate:d.installedDate,lastInspectionOdometer:installKm}; if(x)Object.assign(x,obj);else state.components.push(obj); recordMileageObservation(installKm,d.installedDate,'Установка узла','component',id); await persist();ui.sheet=null;toast('Узел сохранён');render();return;
  }
  if(formId==='expense-form'){
    const d=formObject(f), id=d.id||uid(); let x=state.expenses.find(v=>v.id===id); if(x?.linkedServiceId){toast('Связанный расход изменяется через сервисную запись');return;} const obj={id,carId:car().id,date:d.date,odometer:nonneg(d.odometer),category:d.category,amount:nonneg(d.amount),description:d.description.trim(),note:d.note,linkedServiceId:''}; if(!dateOK(obj.date)){toast('Укажи корректную дату');return;} const err=obj.odometer?mileageConsistencyError(obj.odometer,obj.date,'expense',id):null;if(err&&obj.odometer>nonneg(car().initialOdometer)){toast(err);return;} if(x)Object.assign(x,obj);else state.expenses.push(obj); if(obj.odometer)recordMileageObservation(obj.odometer,obj.date,'Из расхода','expense',id);else removeMileageSource('expense',id); await persist();ui.sheet=null;toast('Расход сохранён');render();return;
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

document.addEventListener('input', e=>{
  const key=e.target.dataset.input;
  if(key==='history-search'){ui.search=e.target.value; const pos=$('.main-scroll')?.scrollTop||0; render(); const ms=$('.main-scroll'); if(ms)ms.scrollTop=pos; $('#app input[data-input="history-search"]')?.focus();}
});
document.addEventListener('change', async e=>{
  const key=e.target.dataset.input;
  if(key==='history-type'){ui.historyType=e.target.value;render();}
  if(key==='expense-filter'){ui.expenseFilter=e.target.value;render();}
  if(key==='theme'){state.settings.theme=e.target.value;applyTheme();await persist();render();}
  if(e.target.id==='backup-input') await importBackupFile(e.target.files[0]);
});

document.addEventListener('click', async e=>{
  const view=e.target.closest('[data-view]')?.dataset.view;
  if(view){ui.view=view;ui.sheet=null;render();return;}
  const el=e.target.closest('[data-action]'); if(!el)return; const a=el.dataset.action,id=el.dataset.id;
  if(a==='close-sheet'){ui.sheet=null;ui.sheetId=null;render();return;}
  if(a==='open-reminders'){ui.sheet='reminders';render();return;}
  if(a==='add-car'){ui.sheet='car';ui.sheetId=null;render();return;}
  if(a==='edit-current-car'){ui.sheet='car';ui.sheetId=state.activeCarId;render();return;}
  if(a==='car-switch'){ui.sheet='garage';ui.sheetId=null;render();return;}
  if(a==='activate-car'){state.activeCarId=id;await persist();ui.sheet=null;toast('Автомобиль выбран');render();return;}
  if(a==='add-odometer'){if(!car())return;ui.sheet='odometer';render();return;}
  if(a==='add-entry'){if(!car()){ui.sheet='car';render();return;}ui.sheet='entry';ui.sheetId=null;render();return;}
  if(a==='entry-detail'){ui.sheet='entry-detail';ui.sheetId=id;render();return;}
  if(a==='edit-entry'){ui.sheet='entry';ui.sheetId=id;render();return;}
  if(a==='add-component'){if(!car()){ui.sheet='car';render();return;}ui.sheet='component';ui.sheetId=null;render();return;}
  if(a==='component-detail'){ui.sheet='component-detail';ui.sheetId=id;render();return;}
  if(a==='edit-component'){ui.sheet='component';ui.sheetId=id;render();return;}
  if(a==='add-expense'){if(!car()){ui.sheet='car';render();return;}ui.sheet='expense';ui.sheetId=null;render();return;}
  if(a==='expense-detail'){ui.sheet='expense-detail';ui.sheetId=id;render();return;}
  if(a==='edit-expense'){const x=state.expenses.find(v=>v.id===id);if(x?.linkedServiceId){ui.sheet='entry-detail';ui.sheetId=x.linkedServiceId;}else{ui.sheet='expense';ui.sheetId=id;}render();return;}
  if(a==='open-linked-entry'){ui.sheet='entry-detail';ui.sheetId=id;render();return;}
  if(a==='add-document'){if(!car()){ui.sheet='car';render();return;}ui.sheet='document';ui.sheetId=null;render();return;}
  if(a==='document-detail'){ui.sheet='document-detail';ui.sheetId=id;render();return;}
  if(a==='edit-document'){ui.sheet='document';ui.sheetId=id;render();return;}
  if(a==='reminder-open'){if(el.dataset.kind==='document'){ui.sheet='document-detail';ui.sheetId=id;}else{ui.sheet='component-detail';ui.sheetId=id;}render();return;}
  if(a==='delete-car'){if(confirm('Удалить автомобиль и все связанные записи? Это необратимо.')){const cid=id;state.cars=state.cars.filter(x=>x.id!==cid);for(const k of ['odometerLogs','serviceEntries','components','expenses','documents'])state[k]=state[k].filter(x=>x.carId!==cid);state.activeCarId=state.cars[0]?.id||null;await persist();ui.sheet=null;render();toast('Автомобиль удалён');}return;}
  if(a==='delete-entry'){if(confirm('Удалить сервисную запись?')){state.serviceEntries=state.serviceEntries.filter(x=>x.id!==id);state.expenses=state.expenses.filter(x=>x.linkedServiceId!==id);removeMileageSource('service',id);await persist();ui.sheet=null;render();toast('Запись удалена');}return;}
  if(a==='delete-component'){if(confirm('Удалить узел и его интервалы? История работ сохранится.')){state.components=state.components.filter(x=>x.id!==id);state.serviceEntries.filter(x=>x.componentId===id).forEach(x=>{x.componentId='';x.componentAction='';});removeMileageSource('component',id);await persist();ui.sheet=null;render();toast('Узел удалён');}return;}
  if(a==='delete-expense'){const x=state.expenses.find(v=>v.id===id);if(x?.linkedServiceId){toast('Связанный расход удаляется вместе с сервисной записью');return;}if(confirm('Удалить расход?')){state.expenses=state.expenses.filter(v=>v.id!==id);removeMileageSource('expense',id);await persist();ui.sheet=null;render();toast('Расход удалён');}return;}
  if(a==='delete-document'){if(confirm('Удалить документ и сохранённые в нём файлы?')){state.documents=state.documents.filter(x=>x.id!==id);await persist();ui.sheet=null;render();toast('Документ удалён');}return;}
  if(a==='mark-inspection'){await markComponent(id,'inspect');return;}
  if(a==='mark-replacement'){await markComponent(id,'replace');return;}
  if(a==='open-stored-file'){openStoredFile(el.dataset.doc,Number(el.dataset.index));return;}
  if(a==='share-stored-file'){await shareStoredFile(el.dataset.doc,Number(el.dataset.index));return;}
  if(a==='remove-stored-file'){const d=state.documents.find(x=>x.id===el.dataset.doc),i=Number(el.dataset.index);if(d?.files?.[i]&&confirm(`Удалить файл «${d.files[i].name}»?`)){d.files.splice(i,1);await persist();render();toast('Файл удалён');}return;}
  if(a==='open-image'){window.open(el.getAttribute('src'),'_blank');return;}
  if(a==='backup-export'){exportBackup();return;}
  if(a==='backup-import'){$('#backup-input')?.click();return;}
  if(a==='calendar-export'){exportCalendar();return;}
  if(a==='enable-notifications'){await showCurrentNotification();return;}
  if(a==='persist-storage'){await requestPersistentStorage();return;}
  if(a==='reset-all'){if(confirm('Удалить ВСЕ автомобили, историю, фото, документы и настройки с этого устройства?')){await clearState();state=defaultState();applyTheme();ui={view:'home',sheet:null,sheetId:null,search:'',historyType:'all',expenseFilter:'all'};render();toast('Все данные удалены');}return;}
});

async function markComponent(id,action){ const c=state.components.find(x=>x.id===id); if(!c)return; const km=currentKm(), date=nowISO(); const entry={id:uid(),carId:c.carId,date,odometer:km,type:action==='inspect'?'inspection':'replacement',title:`${action==='inspect'?'Проверка':'Замена'}: ${c.name}`,category:c.category||'',faultKey:'',workText:'',partsText:action==='replace'?[c.brand,c.partNumber].filter(Boolean).join(' · '):'',partsCost:action==='replace'?nonneg(c.cost):0,laborCost:0,otherCost:0,componentId:c.id,componentAction:action,notes:'Отмечено из карточки узла',photos:[],createdAt:new Date().toISOString(),seq:nextSeq()}; state.serviceEntries.push(entry); syncEntryExpense(entry); recordMileageObservation(km,date,'Из сервисной записи','service',entry.id); await persist();toast(action==='inspect'?'Проверка отмечена':'Замена отмечена, циклы сброшены');ui.sheet='component-detail';render(); }

function openStoredFile(docId,index){ const d=state.documents.find(x=>x.id===docId); const f=d?.files?.[index]; if(!f)return; const a=document.createElement('a');a.href=f.data;a.download=f.name;a.target='_blank';document.body.append(a);a.click();a.remove(); }

async function shareStoredFile(docId,index){ const d=state.documents.find(x=>x.id===docId); const f=d?.files?.[index]; if(!f)return; try{ const res=await fetch(f.data); const blob=await res.blob(); const file=new File([blob],f.name,{type:f.type||blob.type||'application/octet-stream'}); if(navigator.canShare?.({files:[file]})){ await navigator.share({title:d.title,files:[file]}); } else { openStoredFile(docId,index); toast('Системный Share для файлов недоступен — файл открыт'); } }catch{ openStoredFile(docId,index); } }

function downloadText(name,text,type='application/json'){ const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function exportBackup(){ downloadText(`autojournal-backup-${nowISO()}.json`,JSON.stringify(state,null,2));toast('Резервная копия создана'); }
async function importBackupFile(file){ if(!file)return; if(file.size>80*1024*1024){toast('Резервная копия слишком большая');return;} try{const data=JSON.parse(await file.text()); if(!data || !Array.isArray(data.cars) || !Array.isArray(data.serviceEntries))throw new Error('invalid'); if(!confirm('Восстановление заменит все текущие данные. Продолжить?'))return; state=migrate(data);await persist();applyTheme();render();toast('Резервная копия восстановлена');}catch{toast('Не удалось прочитать резервную копию');} }

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
  if(state.activeCarId && !state.cars.some(c=>c.id===state.activeCarId))state.activeCarId=state.cars[0]?.id||null;
  applyTheme();
  render();
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js');}catch(err){console.warn('SW registration failed',err);}}
  window.addEventListener('online',()=>toast('Интернет доступен'));
  window.addEventListener('offline',()=>toast('Офлайн-режим: данные остаются доступны'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.theme==='system')applyTheme();});
}

init().catch(err=>{console.error(err);$('#app').innerHTML=`<main class="main-scroll"><div class="page"><div class="empty"><div class="empty-title">Не удалось открыть локальную базу</div><div class="empty-text">${esc(err.message||String(err))}</div></div></div></main>`;});
