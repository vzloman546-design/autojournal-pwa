const JSON_HEADERS={'Content-Type':'application/json;charset=utf-8'};
let schemaReadyPromise=null;

function corsHeaders(request,env){
  const origin=request.headers.get('Origin')||'';
  const allowed=String(env.ALLOWED_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
  const allowOrigin=!allowed.length?'*':allowed.includes(origin)?origin:allowed[0];
  return {
    'Access-Control-Allow-Origin':allowOrigin,
    'Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers':'Authorization,Content-Type',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  };
}
function response(request,env,body,status=200,headers={}){
  return new Response(body,{status,headers:{...corsHeaders(request,env),...headers}});
}
function json(request,env,value,status=200){
  return response(request,env,JSON.stringify(value),status,JSON_HEADERS);
}
function b64url(bytes){
  let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function verifierFor(id,secret){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${id}.${secret}`));
  return b64url(digest);
}
function validId(v){return /^[A-Za-z0-9_-]{20,40}$/.test(String(v||''));}
function validVerifier(v){return /^[A-Za-z0-9_-]{40,50}$/.test(String(v||''));}
function validCollection(v){return /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(String(v||''));}
function validRecordId(v){const s=String(v||'');return s.length>=1&&s.length<=180&&!/[\u0000-\u001f]/.test(s);}
function validIv(v){return /^[A-Za-z0-9_-]{12,32}$/.test(String(v||''));}

async function ensureSchema(env){
  if(schemaReadyPromise)return schemaReadyPromise;
  schemaReadyPromise=env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_sessions (id TEXT PRIMARY KEY, verifier TEXT NOT NULL, mode TEXT, status TEXT NOT NULL DEFAULT 'waiting', sender TEXT, total_chunks INTEGER, iv TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_chunks (session_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (session_id, chunk_index))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sync_sessions_expires ON sync_sessions(expires_at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_pairing (session_id TEXT PRIMARY KEY, payload TEXT NOT NULL, iv TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_vaults (id TEXT PRIMARY KEY, verifier TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_records (vault_id TEXT NOT NULL, collection TEXT NOT NULL, record_id TEXT NOT NULL, iv TEXT, deleted INTEGER NOT NULL DEFAULT 0, chunk_count INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL, updated_at INTEGER NOT NULL, device_id TEXT, PRIMARY KEY (vault_id, collection, record_id))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sync_records_version ON sync_records(vault_id, version)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_record_chunks (vault_id TEXT NOT NULL, collection TEXT NOT NULL, record_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (vault_id, collection, record_id, chunk_index))")
  ]).catch(err=>{schemaReadyPromise=null;throw err;});
  return schemaReadyPromise;
}
async function cleanup(env){
  const now=Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sync_pairing WHERE session_id IN (SELECT id FROM sync_sessions WHERE expires_at < ?1)').bind(now),
    env.DB.prepare('DELETE FROM sync_chunks WHERE session_id IN (SELECT id FROM sync_sessions WHERE expires_at < ?1)').bind(now),
    env.DB.prepare('DELETE FROM sync_sessions WHERE expires_at < ?1').bind(now)
  ]);
}
async function getSession(env,id){
  return env.DB.prepare('SELECT id, verifier, mode, status, sender, total_chunks, iv, created_at, updated_at, expires_at FROM sync_sessions WHERE id=?1').bind(id).first();
}
async function authorizeSession(request,env,id){
  const row=await getSession(env,id);
  if(!row)return {error:'session_not_found',status:404};
  if(Number(row.expires_at)<Date.now())return {error:'session_expired',status:410};
  const auth=request.headers.get('Authorization')||'';
  const secret=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!secret||await verifierFor(id,secret)!==row.verifier)return {error:'unauthorized',status:401};
  return {row};
}
async function getVault(env,id){
  return env.DB.prepare('SELECT id, verifier, revision, created_at, updated_at FROM sync_vaults WHERE id=?1').bind(id).first();
}
async function authorizeVault(request,env,id){
  const row=await getVault(env,id);
  if(!row)return {error:'vault_not_found',status:404};
  const auth=request.headers.get('Authorization')||'';
  const secret=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!secret||await verifierFor(id,secret)!==row.verifier)return {error:'unauthorized',status:401};
  return {row};
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'')||'/';
    if(request.method==='OPTIONS')return response(request,env,'',204);
    try{await ensureSchema(env);}catch(err){return json(request,env,{error:'schema_error',detail:String(err?.message||err)},500);}
    if(path==='/health')return json(request,env,{ok:true,service:'autojournal-sync',schema:2,time:new Date().toISOString()});
    try{await cleanup(env);}catch{}

    if(path==='/v1/vaults'&&request.method==='POST'){
      let body={};try{body=await request.json();}catch{return json(request,env,{error:'invalid_json'},400);}
      const id=String(body.id||''),verifier=String(body.verifier||'');
      if(!validId(id)||!validVerifier(verifier))return json(request,env,{error:'invalid_vault'},400);
      const now=Date.now(),existing=await getVault(env,id);
      if(existing){
        if(existing.verifier!==verifier)return json(request,env,{error:'vault_conflict'},409);
        return json(request,env,{ok:true,id,revision:Number(existing.revision)||0,created:false});
      }
      await env.DB.prepare('INSERT INTO sync_vaults(id,verifier,revision,created_at,updated_at) VALUES(?1,?2,0,?3,?3)').bind(id,verifier,now).run();
      return json(request,env,{ok:true,id,revision:0,created:true},201);
    }

    const vaultMatch=path.match(/^\/v1\/vaults\/([A-Za-z0-9_-]{20,40})(?:\/(.*))?$/);
    if(vaultMatch){
      const id=vaultMatch[1],tail=vaultMatch[2]||'',auth=await authorizeVault(request,env,id);
      if(auth.error)return json(request,env,{error:auth.error},auth.status);

      if(!tail&&request.method==='GET'){
        return json(request,env,{id,revision:Number(auth.row.revision)||0,updatedAt:Number(auth.row.updated_at)||0});
      }

      if(tail==='records'&&request.method==='PUT'){
        let body={};try{body=await request.json();}catch{return json(request,env,{error:'invalid_json'},400);}
        const records=Array.isArray(body.records)?body.records:[],deviceId=String(body.deviceId||'').slice(0,80);
        if(!records.length||records.length>20)return json(request,env,{error:'invalid_record_batch'},400);
        for(const rec of records){
          if(!validCollection(rec.collection)||!validRecordId(rec.id))return json(request,env,{error:'invalid_record_key'},400);
          if(!rec.deleted&&!validIv(rec.iv))return json(request,env,{error:'invalid_record_iv'},400);
          const chunks=Array.isArray(rec.chunks)?rec.chunks:[];
          if(!rec.deleted&&(!chunks.length||chunks.length>200))return json(request,env,{error:'invalid_record_chunks'},400);
          if(chunks.some(x=>typeof x!=='string'||!x.length||x.length>300000))return json(request,env,{error:'invalid_record_chunk'},413);
        }
        const now=Date.now();
        await env.DB.prepare('UPDATE sync_vaults SET revision=revision+1,updated_at=?1 WHERE id=?2').bind(now,id).run();
        const updated=await getVault(env,id),revision=Number(updated?.revision)||1;
        const statements=[];
        for(const rec of records){
          const collection=String(rec.collection),recordId=String(rec.id),deleted=rec.deleted?1:0,chunks=rec.deleted?[]:rec.chunks;
          statements.push(env.DB.prepare('DELETE FROM sync_record_chunks WHERE vault_id=?1 AND collection=?2 AND record_id=?3').bind(id,collection,recordId));
          statements.push(env.DB.prepare(
            'INSERT INTO sync_records(vault_id,collection,record_id,iv,deleted,chunk_count,version,updated_at,device_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(vault_id,collection,record_id) DO UPDATE SET iv=excluded.iv,deleted=excluded.deleted,chunk_count=excluded.chunk_count,version=excluded.version,updated_at=excluded.updated_at,device_id=excluded.device_id'
          ).bind(id,collection,recordId,deleted?null:String(rec.iv),deleted,chunks.length,revision,now,deviceId));
          chunks.forEach((payload,index)=>statements.push(
            env.DB.prepare('INSERT INTO sync_record_chunks(vault_id,collection,record_id,chunk_index,payload) VALUES(?1,?2,?3,?4,?5)')
              .bind(id,collection,recordId,index,payload)
          ));
        }
        await env.DB.batch(statements);
        return json(request,env,{ok:true,revision,records:records.length});
      }

      if(tail==='changes'&&request.method==='GET'){
        const since=Math.max(0,Number(url.searchParams.get('since'))||0);
        const rows=(await env.DB.prepare(
          'SELECT collection,record_id,iv,deleted,chunk_count,version,updated_at,device_id FROM sync_records WHERE vault_id=?1 AND version>?2 ORDER BY version ASC,collection ASC,record_id ASC'
        ).bind(id,since).all()).results||[];
        if(rows.length>5000)return json(request,env,{error:'too_many_changes'},409);
        const chunkRows=(await env.DB.prepare(
          'SELECT c.collection,c.record_id,c.chunk_index,c.payload FROM sync_record_chunks c JOIN sync_records r ON r.vault_id=c.vault_id AND r.collection=c.collection AND r.record_id=c.record_id WHERE c.vault_id=?1 AND r.version>?2 ORDER BY r.version ASC,c.collection ASC,c.record_id ASC,c.chunk_index ASC'
        ).bind(id,since).all()).results||[];
        const chunkMap=new Map();
        for(const row of chunkRows){
          const key=`${row.collection}:\u0000:${row.record_id}`,list=chunkMap.get(key)||[];list.push(String(row.payload||''));chunkMap.set(key,list);
        }
        const records=rows.map(row=>({
          collection:String(row.collection),id:String(row.record_id),iv:row.iv||null,deleted:Boolean(row.deleted),
          version:Number(row.version)||0,updatedAt:Number(row.updated_at)||0,deviceId:row.device_id||'',
          chunks:Boolean(row.deleted)?[]:(chunkMap.get(`${row.collection}:\u0000:${row.record_id}`)||[])
        }));
        const latest=await getVault(env,id);
        return json(request,env,{ok:true,revision:Number(latest?.revision)||0,records});
      }

      return json(request,env,{error:'not_found'},404);
    }

    if(path==='/v1/sessions'&&request.method==='POST'){
      let body={};try{body=await request.json();}catch{return json(request,env,{error:'invalid_json'},400);}
      const id=String(body.id||''),verifier=String(body.verifier||'');
      if(!validId(id)||!validVerifier(verifier))return json(request,env,{error:'invalid_session'},400);
      const now=Date.now(),ttl=Math.max(120,Math.min(900,Number(body.ttl)||600)),expires=now+ttl*1000;
      try{
        await env.DB.prepare("INSERT INTO sync_sessions(id,verifier,status,created_at,updated_at,expires_at) VALUES(?1,?2,'waiting',?3,?3,?4)")
          .bind(id,verifier,now,expires).run();
      }catch{return json(request,env,{error:'session_exists'},409);}
      return json(request,env,{ok:true,expiresAt:expires},201);
    }

    const match=path.match(/^\/v1\/sessions\/([A-Za-z0-9_-]{20,40})(?:\/(.*))?$/);
    if(!match)return json(request,env,{error:'not_found'},404);
    const id=match[1],tail=match[2]||'',auth=await authorizeSession(request,env,id);
    if(auth.error)return json(request,env,{error:auth.error},auth.status);
    const row=auth.row;

    if(!tail&&request.method==='GET'){
      return json(request,env,{
        id:row.id,mode:row.mode||null,status:row.status,sender:row.sender||null,
        totalChunks:row.total_chunks==null?null:Number(row.total_chunks),iv:row.iv||null,
        createdAt:Number(row.created_at),updatedAt:Number(row.updated_at),expiresAt:Number(row.expires_at)
      });
    }

    if(tail==='pairing'){
      if(request.method==='PUT'){
        let body={};try{body=await request.json();}catch{return json(request,env,{error:'invalid_json'},400);}
        const payload=String(body.payload||''),iv=String(body.iv||'');
        if(!payload||payload.length>4096||!validIv(iv))return json(request,env,{error:'invalid_pairing_payload'},400);
        await env.DB.prepare('INSERT INTO sync_pairing(session_id,payload,iv,updated_at) VALUES(?1,?2,?3,?4) ON CONFLICT(session_id) DO UPDATE SET payload=excluded.payload,iv=excluded.iv,updated_at=excluded.updated_at')
          .bind(id,payload,iv,Date.now()).run();
        return json(request,env,{ok:true});
      }
      if(request.method==='GET'){
        const item=await env.DB.prepare('SELECT payload,iv FROM sync_pairing WHERE session_id=?1').bind(id).first();
        if(!item)return json(request,env,{error:'pairing_not_ready'},409);
        return json(request,env,{payload:item.payload,iv:item.iv});
      }
    }

    if(tail==='request'&&request.method==='POST'){
      let body={};try{body=await request.json();}catch{return json(request,env,{error:'invalid_json'},400);}
      if(!['push','pull'].includes(body.mode))return json(request,env,{error:'invalid_mode'},400);
      if(row.status!=='waiting')return json(request,env,{error:'session_already_used'},409);
      const now=Date.now();
      await env.DB.prepare("UPDATE sync_sessions SET mode=?1,status='requested',updated_at=?2 WHERE id=?3").bind(body.mode,now,id).run();
      return json(request,env,{ok:true,mode:body.mode,status:'requested'});
    }

    const chunk=tail.match(/^chunks\/(\d{1,4})$/);
    if(chunk){
      const index=Number(chunk[1]);
      if(request.method==='PUT'){
        if(!['requested','uploading'].includes(row.status))return json(request,env,{error:'session_not_uploadable'},409);
        const value=await request.text();
        if(!value||value.length>300000)return json(request,env,{error:'invalid_chunk'},413);
        await env.DB.prepare('INSERT INTO sync_chunks(session_id,chunk_index,payload) VALUES(?1,?2,?3) ON CONFLICT(session_id,chunk_index) DO UPDATE SET payload=excluded.payload')
          .bind(id,index,value).run();
        await env.DB.prepare("UPDATE sync_sessions SET status='uploading',updated_at=?1 WHERE id=?2").bind(Date.now(),id).run();
        return json(request,env,{ok:true,index});
      }
      if(request.method==='GET'){
        if(!['ready','consumed'].includes(row.status))return json(request,env,{error:'session_not_ready'},409);
        const item=await env.DB.prepare('SELECT payload FROM sync_chunks WHERE session_id=?1 AND chunk_index=?2').bind(id,index).first();
        if(!item)return json(request,env,{error:'chunk_not_found'},404);
        return response(request,env,item.payload,200,{'Content-Type':'text/plain;charset=utf-8','Cache-Control':'no-store'});
      }
    }

    if(tail==='complete'&&request.method==='POST'){
      if(!['requested','uploading'].includes(row.status))return json(request,env,{error:'session_not_uploadable'},409);
      let body={};try{body=await request.json();}catch{return json(request,env,{error:'invalid_json'},400);}
      const total=Number(body.totalChunks),iv=String(body.iv||''),sender=String(body.sender||'');
      if(!Number.isInteger(total)||total<1||total>200||!validIv(iv))return json(request,env,{error:'invalid_payload_meta'},400);
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_chunks WHERE session_id=?1').bind(id).first();
      if(Number(count?.n)!==total)return json(request,env,{error:'chunk_count_mismatch'},409);
      const now=Date.now();
      await env.DB.prepare("UPDATE sync_sessions SET status='ready',sender=?1,total_chunks=?2,iv=?3,updated_at=?4 WHERE id=?5")
        .bind(sender,total,iv,now,id).run();
      return json(request,env,{ok:true,status:'ready'});
    }

    if(tail==='consume'&&request.method==='POST'){
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sync_chunks WHERE session_id=?1').bind(id),
        env.DB.prepare('DELETE FROM sync_pairing WHERE session_id=?1').bind(id)
      ]);
      const now=Date.now();
      await env.DB.prepare("UPDATE sync_sessions SET status='consumed',updated_at=?1,expires_at=?2 WHERE id=?3").bind(now,now+60000,id).run();
      return json(request,env,{ok:true,status:'consumed'});
    }

    return json(request,env,{error:'not_found'},404);
  }
};
