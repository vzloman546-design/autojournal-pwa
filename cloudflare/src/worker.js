const JSON_HEADERS={'Content-Type':'application/json;charset=utf-8'};

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
async function cleanup(env){
  const now=Date.now();
  await env.DB.prepare('DELETE FROM sync_sessions WHERE expires_at < ?1').bind(now).run();
}
async function getSession(env,id){
  return env.DB.prepare('SELECT id, verifier, mode, status, sender, total_chunks, iv, created_at, updated_at, expires_at FROM sync_sessions WHERE id=?1').bind(id).first();
}
async function authorize(request,env,id){
  const row=await getSession(env,id);
  if(!row)return {error:'session_not_found',status:404};
  if(Number(row.expires_at)<Date.now())return {error:'session_expired',status:410};
  const auth=request.headers.get('Authorization')||'';
  const secret=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!secret||await verifierFor(id,secret)!==row.verifier)return {error:'unauthorized',status:401};
  return {row};
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'')||'/';
    if(request.method==='OPTIONS')return response(request,env,'',204);
    if(path==='/health')return json(request,env,{ok:true,service:'autojournal-sync',time:new Date().toISOString()});
    try{await cleanup(env);}catch{}

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
    const id=match[1],tail=match[2]||'',auth=await authorize(request,env,id);
    if(auth.error)return json(request,env,{error:auth.error},auth.status);
    const row=auth.row;

    if(!tail&&request.method==='GET'){
      return json(request,env,{
        id:row.id,mode:row.mode||null,status:row.status,sender:row.sender||null,
        totalChunks:row.total_chunks==null?null:Number(row.total_chunks),iv:row.iv||null,
        createdAt:Number(row.created_at),updatedAt:Number(row.updated_at),expiresAt:Number(row.expires_at)
      });
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
        if(!value||value.length>400000)return json(request,env,{error:'invalid_chunk'},413);
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
      if(!Number.isInteger(total)||total<1||total>200||!/^[A-Za-z0-9_-]{12,32}$/.test(iv))return json(request,env,{error:'invalid_payload_meta'},400);
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_chunks WHERE session_id=?1').bind(id).first();
      if(Number(count?.n)!==total)return json(request,env,{error:'chunk_count_mismatch'},409);
      const now=Date.now();
      await env.DB.prepare("UPDATE sync_sessions SET status='ready',sender=?1,total_chunks=?2,iv=?3,updated_at=?4 WHERE id=?5")
        .bind(sender,total,iv,now,id).run();
      return json(request,env,{ok:true,status:'ready'});
    }

    if(tail==='consume'&&request.method==='POST'){
      await env.DB.prepare('DELETE FROM sync_chunks WHERE session_id=?1').bind(id).run();
      const now=Date.now();
      await env.DB.prepare("UPDATE sync_sessions SET status='consumed',updated_at=?1,expires_at=?2 WHERE id=?3").bind(now,now+60000,id).run();
      return json(request,env,{ok:true,status:'consumed'});
    }

    return json(request,env,{error:'not_found'},404);
  }
};
