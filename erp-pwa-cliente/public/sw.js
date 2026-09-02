// Service worker de assets — mismo criterio que erp-pwa-operativa/public/sw.js: solo
// cachea el shell estático, nunca /api/, nunca POST/PUT.
// v3: sube el nombre para purgar el caché de quien haya quedado con una build vieja. Subirlo
// es un parche de una sola vez, no la solución: este archivo no cambia entre deploys, así que
// el navegador no reinstala el SW y nadie se entera de que hay algo nuevo publicado. Lo que
// de verdad lo resuelve es el sello de build (/version.json + src/main.jsx), que la app
// consulta al abrir y al volver del segundo plano.
const CACHE = 'cliente-shell-v3';
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
  // El sello de build tiene que salir siempre de la red: es justamente con lo que la app
  // decide si está corriendo una versión vieja (ver src/main.jsx). Cacheado, contestaría
  // "estás al día" para siempre, que es el bug que viene a resolver.
  if (url.pathname === '/version.json') return;

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
