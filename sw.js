const CACHE = 'autojournal-v2.1.0';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './db.js',
  './manifest.webmanifest',
  './payload/v2-styles.b64',
  './payload/v2-app-1.b64',
  './payload/v2-app-2.b64',
  './payload/v2-app-3.b64',
  './payload/v2-app-4.b64',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response?.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  const core =
    event.request.mode === 'navigate' ||
    /\/(?:app|db|sw)\.js$/.test(url.pathname) ||
    /\/manifest\.webmanifest$/.test(url.pathname) ||
    /\/payload\/v2-/.test(url.pathname);

  if (core) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || networkFirst(event.request)));
});
