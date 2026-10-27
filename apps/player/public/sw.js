/* Cache only the player shell. Media is stored by the page after SHA-256 verification. */
const SHELL_CACHE = 'scenzly-shell-v2';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const response = await fetch('/', { cache: 'reload' });
    if (!response.ok) throw new Error('Player shell unavailable');
    const html = await response.clone().text();
    const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]).filter(p => p.startsWith('/assets/'));
    await cache.addAll([...new Set([...assetPaths, '/manifest.webmanifest', '/brand/screnzly-logo.png', '/brand/screnzly-mark.png'])]);
    // Fonts referenced by the stylesheet must also be available offline.
    for (const path of assetPaths.filter(path => path.endsWith('.css'))) {
      const css = await (await cache.match(path)).text();
      const fonts = [...css.matchAll(/url\(["']?(\/assets\/[^)"']+)["']?\)/g)].map(match => match[1]);
      await cache.addAll([...new Set(fonts)]);
    }
    await cache.put('/', response);
    self.skipWaiting();
  })());
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('scenzly-shell-') && key !== SHELL_CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => {
      const cached = await caches.match('/', { cacheName: SHELL_CACHE });
      return cached || new Response('Screnzly : premier démarrage hors ligne impossible.', { status: 503 });
    }));
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/') || ['/icon.svg', '/manifest.webmanifest'].includes(url.pathname)) {
    event.respondWith(caches.match(event.request, { cacheName: SHELL_CACHE, ignoreVary: true }).then(cached => cached || fetch(event.request)));
  }
});
