const CACHE='autojournal-v5.5.1';
const APP_SHELL=[
  './','./index.html','./styles.css','./app.js','./db.js','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});
async function networkFirst(request){
  try{
    const response=await fetch(request);
    if(response?.ok)(await caches.open(CACHE)).put(request,response.clone());
    return response;
  }catch{
    return (await caches.match(request)) || (request.mode==='navigate' ? caches.match('./index.html') : Response.error());
  }
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const core=event.request.mode==='navigate'||/\/(?:app|db|sw)\.js$/.test(url.pathname)||/\/styles\.css$/.test(url.pathname)||/\/manifest\.webmanifest$/.test(url.pathname);
  event.respondWith(core?networkFirst(event.request):caches.match(event.request).then(hit=>hit||networkFirst(event.request)));
});