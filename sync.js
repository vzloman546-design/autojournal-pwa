import { qrcode } from './vendor/qrcode.mjs';
import { SYNC_API_URL } from './sync-config.js';

const enc=new TextEncoder();
const dec=new TextDecoder();
const SESSION_TTL_SECONDS=10*60;
const CHUNK_CHARS=250000;
const MAX_ENCRYPTED_CHARS=45*1024*1024;
const MAX_PUSH_BODY_CHARS=1800000;
const VAULT_KEY='autojournal-sync-vault-v2';
const STATE_COLLECTIONS=['cars','odometerLogs','serviceEntries','components','expenses','documents','refuels'];

function bytesToBase64Url(bytes){
  let s='';
  const arr=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  for(let i=0;i<arr.length;i+=0x8000)s+=String.fromCharCode(...arr.subarray(i,i+0x8000));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64UrlToBytes(value=''){
  const s=String(value).replace(/-/g,'+').replace(/_/g,'/');
  const padded=s+'='.repeat((4-s.length%4)%4);
  const raw=atob(padded),out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function randomToken(bytes=16){
  const out=new Uint8Array(bytes);crypto.getRandomValues(out);return bytesToBase64Url(out);
}
function normalizeApi(url=''){
  return String(url||'').trim().replace(/\/+$/,'');
}
export function getSyncApiUrl(){
  try{return normalizeApi(localStorage.getItem('autojournal-sync-api')||SYNC_API_URL);}catch{return normalizeApi(SYNC_API_URL);}
}
async function sha256Base64Url(text){
  return bytesToBase64Url(await crypto.subtle.digest('SHA-256',enc.encode(text)));
}
async function deriveSyncBytes(secret,id,purpose){
  const master=base64UrlToBytes(secret);
  const label=enc.encode(`AutoJournal:${purpose}:${id}:v1`);
  const material=new Uint8Array(master.length+label.length);
  material.set(master);material.set(label,master.length);
  return new Uint8Array(await crypto.subtle.digest('SHA-256',material));
}
async function derivedKey(secret,id,purpose='encryption'){
  return crypto.subtle.importKey('raw',await deriveSyncBytes(secret,id,purpose),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function syncAuthToken(secret,id){
  return bytesToBase64Url(await deriveSyncBytes(secret,id,'authorization'));
}
async function apiRequest(pair,path,options={}){
  const base=normalizeApi(pair?.api||getSyncApiUrl());
  if(!base)throw new Error('SYNC_NOT_CONFIGURED');
  const headers=new Headers(options.headers||{});
  if(pair?.secret)headers.set('Authorization',`Bearer ${await syncAuthToken(pair.secret,pair.id)}`);
  const res=await fetch(base+path,{...options,headers});
  if(!res.ok){
    let detail='';try{detail=(await res.json())?.error||'';}catch{}
    const err=new Error(detail||`SYNC_HTTP_${res.status}`);err.status=res.status;throw err;
  }
  return res;
}

export function encodePairingCode(pair){
  const payload={v:1,s:pair.id,k:pair.secret,u:normalizeApi(pair.api)};
  return 'AJ1:'+bytesToBase64Url(enc.encode(JSON.stringify(payload)));
}
export function parsePairingCode(raw=''){
  let value=String(raw||'').trim();
  try{
    const url=new URL(value);
    value=url.hash.startsWith('#pair=')?decodeURIComponent(url.hash.slice(6)):value;
  }catch{}
  if(!value.startsWith('AJ1:'))throw new Error('INVALID_QR');
  const payload=JSON.parse(dec.decode(base64UrlToBytes(value.slice(4))));
  if(payload?.v!==1||!payload.s||!payload.k||!payload.u)throw new Error('INVALID_QR');
  return {id:String(payload.s),secret:String(payload.k),api:normalizeApi(payload.u),code:value};
}
export function pairingQrSvg(pair){
  const qr=qrcode(0,'M');qr.addData(pair.code||encodePairingCode(pair));qr.make();
  return qr.createSvgTag({cellSize:5,margin:4,scalable:true});
}
export async function createSyncSession(){
  const api=getSyncApiUrl();
  if(!api)throw new Error('SYNC_NOT_CONFIGURED');
  const id=randomToken(18),secret=randomToken(32),authToken=await syncAuthToken(secret,id),verifier=await sha256Base64Url(`${id}.${authToken}`);
  const res=await apiRequest({api},'/v1/sessions',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id,verifier,ttl:SESSION_TTL_SECONDS})
  });
  const data=await res.json();
  const pair={id,secret,api,expiresAt:data.expiresAt||Date.now()+SESSION_TTL_SECONDS*1000};
  pair.code=encodePairingCode(pair);
  return pair;
}
export async function getSyncSession(pair){
  const res=await apiRequest(pair,`/v1/sessions/${encodeURIComponent(pair.id)}`);
  return res.json();
}
export async function requestSyncMode(pair,mode){
  if(!['push','pull'].includes(mode))throw new Error('INVALID_MODE');
  const res=await apiRequest(pair,`/v1/sessions/${encodeURIComponent(pair.id)}/request`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})
  });
  return res.json();
}
export async function uploadSyncState(pair,state,sender='scanner'){
  const key=await derivedKey(pair.secret,pair.id),iv=new Uint8Array(12);crypto.getRandomValues(iv);
  const envelope={format:'autojournal-sync-v1',createdAt:new Date().toISOString(),state};
  const plain=enc.encode(JSON.stringify(envelope));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(`AutoJournal:${pair.id}:v1`)},key,plain);
  const body=bytesToBase64Url(cipher);
  if(body.length>MAX_ENCRYPTED_CHARS)throw new Error('SYNC_TOO_LARGE');
  const chunks=[];for(let i=0;i<body.length;i+=CHUNK_CHARS)chunks.push(body.slice(i,i+CHUNK_CHARS));
  for(let i=0;i<chunks.length;i++){
    await apiRequest(pair,`/v1/sessions/${encodeURIComponent(pair.id)}/chunks/${i}`,{
      method:'PUT',headers:{'Content-Type':'text/plain;charset=utf-8'},body:chunks[i]
    });
  }
  const res=await apiRequest(pair,`/v1/sessions/${encodeURIComponent(pair.id)}/complete`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sender,totalChunks:chunks.length,iv:bytesToBase64Url(iv)})
  });
  return res.json();
}
export async function downloadSyncState(pair,status=null){
  const meta=status||await getSyncSession(pair);
  if(meta.status!=='ready'||!Number.isInteger(meta.totalChunks)||meta.totalChunks<1||!meta.iv)throw new Error('SYNC_NOT_READY');
  let body='';
  for(let i=0;i<meta.totalChunks;i++){
    const res=await apiRequest(pair,`/v1/sessions/${encodeURIComponent(pair.id)}/chunks/${i}`);
    body+=await res.text();
    if(body.length>MAX_ENCRYPTED_CHARS)throw new Error('SYNC_TOO_LARGE');
  }
  const key=await derivedKey(pair.secret,pair.id);
  const plain=await crypto.subtle.decrypt({
    name:'AES-GCM',iv:base64UrlToBytes(meta.iv),additionalData:enc.encode(`AutoJournal:${pair.id}:v1`)
  },key,base64UrlToBytes(body));
  const envelope=JSON.parse(dec.decode(plain));
  if(envelope?.format!=='autojournal-sync-v1'||!envelope.state||typeof envelope.state!=='object')throw new Error('INVALID_PAYLOAD');
  return envelope;
}
export async function consumeSyncSession(pair){
  const res=await apiRequest(pair,`/v1/sessions/${encodeURIComponent(pair.id)}/consume`,{method:'POST'});
  return res.json();
}
export function summarizeSyncState(s={}){
  return {
    cars:Array.isArray(s.cars)?s.cars.length:0,
    service:Array.isArray(s.serviceEntries)?s.serviceEntries.length:0,
    refuels:Array.isArray(s.refuels)?s.refuels.length:0,
    expenses:Array.isArray(s.expenses)?s.expenses.length:0,
    components:Array.isArray(s.components)?s.components.length:0,
    documents:Array.isArray(s.documents)?s.documents.length:0
  };
}
export function pairingCodeShort(pair){
  return pair?.id?pair.id.slice(0,6).toUpperCase():'';
}

/* Persistent encrypted vault sync */
export function loadSyncVault(){
  try{
    const raw=JSON.parse(localStorage.getItem(VAULT_KEY)||'null');
    if(!raw?.id||!raw?.secret)return null;
    return {
      id:String(raw.id),secret:String(raw.secret),api:normalizeApi(raw.api||getSyncApiUrl()),
      deviceId:String(raw.deviceId||randomToken(9)),lastRevision:Number(raw.lastRevision)||0,
      lastSyncAt:String(raw.lastSyncAt||''),shadow:raw.shadow&&typeof raw.shadow==='object'?raw.shadow:{}
    };
  }catch{return null;}
}
export function saveSyncVault(vault){
  if(!vault?.id||!vault?.secret)return;
  const out={
    id:String(vault.id),secret:String(vault.secret),api:normalizeApi(vault.api||getSyncApiUrl()),
    deviceId:String(vault.deviceId||randomToken(9)),lastRevision:Number(vault.lastRevision)||0,
    lastSyncAt:String(vault.lastSyncAt||''),shadow:vault.shadow&&typeof vault.shadow==='object'?vault.shadow:{}
  };
  localStorage.setItem(VAULT_KEY,JSON.stringify(out));
  Object.assign(vault,out);
}
export function clearSyncVault(){try{localStorage.removeItem(VAULT_KEY);}catch{}}
export function createSyncVaultLink(){
  return {id:randomToken(18),secret:randomToken(32),api:getSyncApiUrl(),deviceId:randomToken(9),lastRevision:0,lastSyncAt:'',shadow:{}};
}
export async function registerSyncVault(vault){
  if(!vault?.id||!vault?.secret)throw new Error('INVALID_VAULT');
  const authToken=await syncAuthToken(vault.secret,vault.id);
  const verifier=await sha256Base64Url(`${vault.id}.${authToken}`);
  const res=await apiRequest({api:vault.api},'/v1/vaults',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:vault.id,verifier})
  });
  return res.json();
}
export async function adoptSyncVault(link){
  if(!link?.id||!link?.secret)throw new Error('INVALID_VAULT');
  const existing=loadSyncVault();
  const vault=existing?.id===link.id
    ?{...existing,api:normalizeApi(link.api||existing.api||getSyncApiUrl())}
    :{id:String(link.id),secret:String(link.secret),api:normalizeApi(link.api||getSyncApiUrl()),deviceId:randomToken(9),lastRevision:0,lastSyncAt:'',shadow:{}};
  await registerSyncVault(vault);
  saveSyncVault(vault);
  return vault;
}
async function pairingVaultKey(pair){
  return derivedKey(pair.secret,pair.id,'pairing-vault');
}
export async function publishSessionVault(pair,vault){
  const key=await pairingVaultKey(pair),iv=new Uint8Array(12);crypto.getRandomValues(iv);
  const plain=enc.encode(JSON.stringify({format:'autojournal-vault-link-v1',vault:{id:vault.id,secret:vault.secret,api:normalizeApi(vault.api||getSyncApiUrl())}}));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(`AutoJournal:${pair.id}:pairing:v1`)},key,plain);
  const payload=bytesToBase64Url(cipher);
  const res=await apiRequest(pair,`/v1/sessions/${encodeURIComponent(pair.id)}/pairing`,{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({iv:bytesToBase64Url(iv),payload})
  });
  return res.json();
}
export async function readSessionVault(pair){
  const res=await apiRequest(pair,`/v1/sessions/${encodeURIComponent(pair.id)}/pairing`);
  const meta=await res.json();
  const key=await pairingVaultKey(pair);
  const plain=await crypto.subtle.decrypt({
    name:'AES-GCM',iv:base64UrlToBytes(meta.iv),additionalData:enc.encode(`AutoJournal:${pair.id}:pairing:v1`)
  },key,base64UrlToBytes(meta.payload));
  const envelope=JSON.parse(dec.decode(plain));
  if(envelope?.format!=='autojournal-vault-link-v1'||!envelope.vault?.id||!envelope.vault?.secret)throw new Error('INVALID_VAULT');
  return {...envelope.vault,api:normalizeApi(envelope.vault.api||pair.api)};
}
function metaRecordData(state){
  return {
    settings:state?.settings&&typeof state.settings==='object'?state.settings:{},
    activeCarId:state?.activeCarId||null,
    nextSeq:Number(state?.nextSeq)||1,
    version:Number(state?.version)||0
  };
}
export function stateSyncRecords(state){
  const out=[];
  for(const collection of STATE_COLLECTIONS){
    for(const item of Array.isArray(state?.[collection])?state[collection]:[]){
      if(item?.id!=null)out.push({collection,id:String(item.id),data:item});
    }
  }
  out.push({collection:'meta',id:'state',data:metaRecordData(state)});
  return out;
}
export async function hashSyncData(data){
  return sha256Base64Url(JSON.stringify(data??null));
}
export async function diffSyncState(state,vault){
  const current=new Map();
  const changes=[];
  const shadow=vault?.shadow&&typeof vault.shadow==='object'?vault.shadow:{};
  for(const rec of stateSyncRecords(state)){
    const hash=await hashSyncData(rec.data),key=`${rec.collection}:${rec.id}`;
    current.set(key,{...rec,hash});
    if(shadow[key]!==hash)changes.push({...rec,hash,deleted:false});
  }
  for(const [key,hash] of Object.entries(shadow)){
    if(current.has(key))continue;
    const cut=key.indexOf(':');if(cut<1)continue;
    changes.push({collection:key.slice(0,cut),id:key.slice(cut+1),data:null,hash,deleted:true});
  }
  return changes;
}
async function encryptVaultRecord(vault,change){
  const key=await derivedKey(vault.secret,vault.id,`record:${change.collection}:${change.id}`);
  const iv=new Uint8Array(12);crypto.getRandomValues(iv);
  const plain=enc.encode(JSON.stringify({format:'autojournal-record-v1',collection:change.collection,id:change.id,data:change.deleted?null:change.data}));
  const aad=enc.encode(`AutoJournalVault:${vault.id}:${change.collection}:${change.id}:v1`);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,plain);
  const body=bytesToBase64Url(cipher);
  if(body.length>MAX_ENCRYPTED_CHARS)throw new Error('AUTO_SYNC_TOO_LARGE');
  const chunks=[];for(let i=0;i<body.length;i+=CHUNK_CHARS)chunks.push(body.slice(i,i+CHUNK_CHARS));
  return {collection:change.collection,id:change.id,deleted:Boolean(change.deleted),iv:bytesToBase64Url(iv),chunks,hash:change.hash};
}
export async function pushVaultChanges(vault,changes=[]){
  if(!changes.length)return {revision:null,uploaded:[]};
  await registerSyncVault(vault);
  const encrypted=[];
  for(const change of changes)encrypted.push(await encryptVaultRecord(vault,change));
  const groups=[];let group=[],size=0;
  for(const rec of encrypted){
    const recSize=rec.chunks.reduce((n,x)=>n+x.length,0)+1000;
    if(group.length&&(group.length>=20||size+recSize>MAX_PUSH_BODY_CHARS)){groups.push(group);group=[];size=0;}
    group.push(rec);size+=recSize;
  }
  if(group.length)groups.push(group);
  let revision=null;
  for(const records of groups){
    const body={deviceId:vault.deviceId,records:records.map(({hash,...x})=>x)};
    const res=await apiRequest(vault,`/v1/vaults/${encodeURIComponent(vault.id)}/records`,{
      method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    const data=await res.json();revision=Math.max(Number(revision)||0,Number(data.revision)||0);
  }
  return {revision,uploaded:encrypted.map(x=>({collection:x.collection,id:x.id,deleted:x.deleted,hash:x.hash}))};
}
export async function pullVaultChanges(vault,since=0){
  await registerSyncVault(vault);
  const res=await apiRequest(vault,`/v1/vaults/${encodeURIComponent(vault.id)}/changes?since=${Math.max(0,Number(since)||0)}`);
  const data=await res.json(),changes=[];
  for(const rec of Array.isArray(data.records)?data.records:[]){
    if(rec.deleted){
      changes.push({collection:String(rec.collection),id:String(rec.id),deleted:true,version:Number(rec.version)||0});
      continue;
    }
    let body='';for(const chunk of Array.isArray(rec.chunks)?rec.chunks:[])body+=String(chunk||'');
    if(body.length>MAX_ENCRYPTED_CHARS)throw new Error('AUTO_SYNC_TOO_LARGE');
    const key=await derivedKey(vault.secret,vault.id,`record:${rec.collection}:${rec.id}`);
    const plain=await crypto.subtle.decrypt({
      name:'AES-GCM',iv:base64UrlToBytes(rec.iv),
      additionalData:enc.encode(`AutoJournalVault:${vault.id}:${rec.collection}:${rec.id}:v1`)
    },key,base64UrlToBytes(body));
    const envelope=JSON.parse(dec.decode(plain));
    if(envelope?.format!=='autojournal-record-v1'||String(envelope.collection)!==String(rec.collection)||String(envelope.id)!==String(rec.id))throw new Error('INVALID_VAULT_RECORD');
    changes.push({collection:String(rec.collection),id:String(rec.id),deleted:false,data:envelope.data,version:Number(rec.version)||0});
  }
  return {revision:Number(data.revision)||0,changes};
}
export function updateVaultShadow(vault,items=[]){
  vault.shadow=vault.shadow&&typeof vault.shadow==='object'?vault.shadow:{};
  for(const item of items){
    const key=`${item.collection}:${item.id}`;
    if(item.deleted)delete vault.shadow[key];
    else if(item.hash)vault.shadow[key]=item.hash;
  }
  saveSyncVault(vault);
}
