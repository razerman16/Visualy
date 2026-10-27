/* Cache only the player shell. Media is stored by the page after SHA-256 verification. */
const SHELL_CACHE = 'scenzly-shell-v1';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const response = await fetch('/', { cache: 'reload' });
    if (!response.ok) throw new Error('Player shell unavailable');
    const html = await response.clone().text();
    const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]).filter(p => p.startsWith('/assets/'));
    await cache.addAll([...new Set([...assetPaths, '/manifest.webmanifest', '/icon.svg'])]);
    await cache.put('/', response);
    self.skipWaiting();
  })());
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => {
      const cached = await caches.match('/', { cacheName: SHELL_CACHE });
      return cached || new Response('Scenzly : premier démarrage hors ligne impossible.', { status: 503 });
    }));
  } else if (url.pathname.startsWith('/assets/') || ['/icon.svg', '/manifest.webmanifest'].includes(url.pathname)) {
    event.respondWith(caches.match(event.request, { cacheName: SHELL_CACHE }).then(cached => cached || fetch(event.request)));
  }
});
