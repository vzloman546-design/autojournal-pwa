const CACHE='autojournal-v3.5.0';
const APP_SHELL=['./','./index.html','./styles.css','./grid.css','./app.js','./db.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
async function networkFirst(req){try{const r=await fetch(req);if(r?.ok)(await caches.open(CACHE)).put(req,r.clone());return r}catch{return(await caches.match(req))||(req.mode==='navigate'?caches.match('./index.html'):Response.error())}}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;const core=e.request.mode==='navigate'||/\/(?:app|db|sw)\.js$/.test(u.pathname)||/\/styles\.css$/.test(u.pathname)||/\/manifest\.webmanifest$/.test(u.pathname);e.respondWith(core?networkFirst(e.request):caches.match(e.request).then(c=>c||networkFirst(e.request)));});
