// Service worker de assets — mismo criterio que erp-pwa-operativa/public/sw.js: solo
// cachea el shell estático, nunca /api/, nunca POST/PUT.
// v2: sube el nombre para purgar el caché de quien ya tenía la v1 — ver el fetch handler
// más abajo, que corrige quedar pegado en una build vieja.
const CACHE = 'cliente-shell-v2';
const SHELL = ['/', '/manifest.json'];

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

  // El HTML de entrada va siempre a la red primero (cache solo como respaldo sin señal):
  // es el que referencia los nombres con hash del JS/CSS de la build actual — servirlo
  // cache-first dejaba a la persona viendo la versión anterior de la app (mismo bug real
  // de erp-pwa-operativa/public/sw.js: "a veces me lleva a la visual antigua").
  if (event.request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const paraCache = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, paraCache));
          }
          return respuesta;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cacheado) => {
      const red = fetch(event.request)
        .then((respuesta) => {
          // Clonar YA, antes de devolver la respuesta: en cuanto el navegador la recibe
          // empieza a leer su body, y clonar después de eso revienta con "Response body
          // is already used" (mismo bug real que erp-pwa-operativa/public/sw.js).
          if (respuesta.ok) {
            const paraCache = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, paraCache));
          }
          return respuesta;
        })
        .catch(() => cacheado);
      return cacheado || red;
    })
  );
});
