async function readGzipBase64(paths) {
  const chunks = await Promise.all(paths.map(async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Не удалось загрузить ${path}: HTTP ${response.status}`);
    return response.text();
  }));
  const binary = atob(chunks.join('').replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (!('DecompressionStream' in window)) throw new Error('Для запуска требуется актуальная версия iOS/Safari.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

const DB_BOOTSTRAP = String.raw`
const DB_NAME = 'autojournal-db';
const DB_VERSION = 1;
const STORE = 'kv';
const STATE_KEY = 'app-state';
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadState() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(STATE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function saveState(state) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function clearState() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
`;

async function boot() {
  const [css, rawSource] = await Promise.all([
    readGzipBase64(['./payload/styles.js']),
    readGzipBase64(['./payload/app.part1a.js','./payload/app.part1b.js','./payload/app.part1c.js','./payload/app.part2.js','./payload/app.part3.js'])
  ]);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const source = rawSource.replace(/^\s*import\s*\{[^}]*\}\s*from\s*['"]\.\/db\.js['"];?\s*/m, '');
  if (source === rawSource) throw new Error('Не удалось подготовить модуль приложения.');
  const execute = new Function(`"use strict";\n${DB_BOOTSTRAP}\n${source}`);
  execute();
}

boot().catch(error => {
  console.error(error);
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<main style="font:16px -apple-system,BlinkMacSystemFont,sans-serif;padding:calc(env(safe-area-inset-top,0px) + 24px) 20px;color:#111"><h1 style="font-size:24px">АвтоЖурнал</h1><p>Не удалось запустить приложение.</p><pre style="white-space:pre-wrap">${String(error?.message || error)}</pre></main>`;
});