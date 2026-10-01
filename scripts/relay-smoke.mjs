import { createHash, webcrypto } from 'node:crypto';

const {subtle}=webcrypto;
const enc=new TextEncoder();
const dec=new TextDecoder();
const API='https://autojournal-sync.vzloman546.workers.dev';
const vaultId='relay-smoke-vault-20261001';
const secret=Buffer.from('AutoJournal relay smoke test key 2026').toString('base64url');

const b64=bytes=>Buffer.from(bytes).toString('base64url');
const unb64=value=>new Uint8Array(Buffer.from(String(value),'base64url'));
async function digestBytes(bytes){return new Uint8Array(await subtle.digest('SHA-256',bytes));}
async function derive(purpose){
  const master=unb64(secret),label=enc.encode(`AutoJournal:${purpose}:${vaultId}:v1`);
  const material=new Uint8Array(master.length+label.length);material.set(master);material.set(label,master.length);
  return digestBytes(material);
}
const authToken=b64(await derive('authorization'));
const verifier=createHash('sha256').update(`${vaultId}.${authToken}`).digest('base64url');
const headers={'Authorization':`Bearer ${authToken}`,'Content-Type':'application/json'};

let res=await fetch(API+'/v1/vaults',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:vaultId,verifier})});
if(!res.ok)throw new Error('register '+res.status+' '+await res.text());

const collection='qa',recordId='relay-smoke';
const payload={message:'AutoJournal real relay smoke',at:new Date().toISOString()};
const key=await subtle.importKey('raw',await derive(`record:${collection}:${recordId}`),{name:'AES-GCM'},false,['encrypt','decrypt']);
const iv=webcrypto.getRandomValues(new Uint8Array(12));
const aad=enc.encode(`AutoJournalVault:${vaultId}:${collection}:${recordId}:v1`);
const plain=enc.encode(JSON.stringify({format:'autojournal-record-v1',collection,id:recordId,data:payload}));
const cipher=new Uint8Array(await subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,plain));
res=await fetch(API+`/v1/vaults/${vaultId}/records`,{method:'PUT',headers,body:JSON.stringify({
  deviceId:'github-relay-smoke',
  records:[{collection,id:recordId,deleted:false,iv:b64(iv),chunks:[b64(cipher)]}]
})});
if(!res.ok)throw new Error('push '+res.status+' '+await res.text());
const pushed=await res.json();

res=await fetch(API+`/v1/vaults/${vaultId}/changes?since=0`,{headers:{Authorization:`Bearer ${authToken}`}});
if(!res.ok)throw new Error('pull '+res.status+' '+await res.text());
const pulled=await res.json();
const rec=(pulled.records||[]).find(x=>x.collection===collection&&x.id===recordId&&!x.deleted);
if(!rec)throw new Error('record missing from real relay');
const body=(rec.chunks||[]).join('');
const decrypted=await subtle.decrypt({name:'AES-GCM',iv:unb64(rec.iv),additionalData:aad},key,unb64(body));
const envelope=JSON.parse(dec.decode(decrypted));
if(envelope?.data?.message!==payload.message)throw new Error('decrypted relay payload mismatch');
console.log(JSON.stringify({ok:true,worker:API,revision:pushed.revision,pulledRevision:pulled.revision,message:envelope.data.message}));
