import { qrcode } from './vendor/qrcode.mjs';
import { SYNC_API_URL } from './sync-config.js';

const enc=new TextEncoder();
const dec=new TextDecoder();
const SESSION_TTL_SECONDS=10*60;
const CHUNK_CHARS=300000;
const MAX_ENCRYPTED_CHARS=40*1024*1024;

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
async function syncKey(secret,id){
  const material=new Uint8Array([...base64UrlToBytes(secret),...enc.encode(id)]);
  const digest=await crypto.subtle.digest('SHA-256',material);
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function apiRequest(pair,path,options={}){
  const base=normalizeApi(pair?.api||getSyncApiUrl());
  if(!base)throw new Error('SYNC_NOT_CONFIGURED');
  const headers=new Headers(options.headers||{});
  if(pair?.secret)headers.set('Authorization',`Bearer ${pair.secret}`);
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
  const id=randomToken(18),secret=randomToken(32),verifier=await sha256Base64Url(`${id}.${secret}`);
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
  const key=await syncKey(pair.secret,pair.id),iv=new Uint8Array(12);crypto.getRandomValues(iv);
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
  const key=await syncKey(pair.secret,pair.id);
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
