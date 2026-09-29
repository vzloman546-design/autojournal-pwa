async function readGzipBase64(paths) {
  const chunks = await Promise.all(paths.map(async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
    return response.text();
  }));

  const binary = atob(chunks.join('').replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  if (!('DecompressionStream' in window)) {
    throw new Error('Эта версия Safari не поддерживает локальную распаковку PWA. Обновите iOS.');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function boot() {
  const css = await readGzipBase64(['./payload/styles.b64']);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const source = await readGzipBase64([
    './payload/app.part1a.b64',
    './payload/app.part1b.b64',
    './payload/app.part1c.b64',
    './payload/app.part2.b64',
    './payload/app.part3.b64'
  ]);

  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

boot().catch(error => {
  console.error(error);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<main style="font:16px -apple-system,BlinkMacSystemFont,sans-serif;padding:calc(env(safe-area-inset-top,0px) + 24px) 20px;color:#111"><h1 style="font-size:24px">АвтоЖурнал</h1><p>Не удалось запустить приложение.</p><pre style="white-space:pre-wrap">${String(error?.message || error)}</pre></main>`;
  }
});
