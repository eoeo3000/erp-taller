// Service worker de assets — mismo criterio que erp-pwa-operativa/public/sw.js: solo
// cachea el shell estático, nunca /api/, nunca POST/PUT.
const CACHE = 'cliente-shell-v1';
const SHELL = ['/cliente/', '/cliente/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cacheado) => {
      const red = fetch(event.request)
        .then((respuesta) => {
          if (respuesta.ok) caches.open(CACHE).then((cache) => cache.put(event.request, respuesta.clone()));
          return respuesta;
        })
        .catch(() => cacheado);
      return cacheado || red;
    })
  );
});
