const CACHE='autojournal-v5.14.22';
const APP_SHELL=[
  './','./index.html','./styles.css','./app.js','./db.js','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png',
  './sync.js','./sync-config.js','./vendor/qrcode.mjs','./vendor/jsQR.js'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

async function fetchWithTimeout(request,timeoutMs=5000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(request,{signal:controller.signal});
  }finally{
    clearTimeout(timer);
  }
}

async function cacheFirst(request,{navigationFallback=false,refreshInBackground=false}={}){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request);

  if(cached){
    if(refreshInBackground){
      fetchWithTimeout(request).then(async response=>{
        if(response?.ok)await cache.put(request,response.clone());
      }).catch(()=>{});
    }
    return cached;
  }

  try{
    const response=await fetchWithTimeout(request);
    if(response?.ok)await cache.put(request,response.clone());
    return response;
  }catch{
    if(navigationFallback){
      return (await cache.match('./index.html')) || Response.error();
    }
    return Response.error();
  }
}

async function networkFirst(request){
  try{
    const response=await fetchWithTimeout(request);
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

  const core=event.request.mode==='navigate'
    || /\/(?:app|db|sw|sync|sync-config)\.js$/.test(url.pathname)
    || /\/styles\.css$/.test(url.pathname)
    || /\/manifest\.webmanifest$/.test(url.pathname);

  if(core){
    event.respondWith(cacheFirst(event.request,{
      navigationFallback:event.request.mode==='navigate',
      refreshInBackground:true
    }));
    return;
  }

  event.respondWith(caches.match(event.request).then(hit=>hit||networkFirst(event.request)));
});

self.addEventListener('push',event=>{
  event.waitUntil(self.registration.showNotification('Пора планировать смену шин',{
    body:'В прогнозе на ближайшие 7 дней среднесуточная температура опускается до заданного вами порога. Проверьте прогноз и запланируйте сезонную смену шин.',
    icon:'./icons/icon-192.png',
    badge:'./icons/icon-192.png',
    tag:'autojournal-tire-weather',
    renotify:false,
    data:{url:'./'}
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification?.data?.url||'./',self.registration.scope).href;
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of list){
      if(client.url.startsWith(self.registration.scope)){
        await client.focus();
        if('navigate' in client)await client.navigate(target);
        return;
      }
    }
    if(clients.openWindow)await clients.openWindow(target);
  })());
});
