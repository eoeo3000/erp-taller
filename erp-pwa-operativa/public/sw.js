// Service worker de assets — solo cachea el shell estático de la PWA (JS/CSS/HTML/íconos).
// No cachea nada de /api/: los datos de "mi día" tienen que ser siempre frescos, y la cola
// de reportes sin señal la maneja IndexedDB desde la app (ver src/db.js), no este SW.
// Sin offline completo (ver design_handoff_pwa_movil/README.md §8) — esto es solo la
// diferencia entre "la app carga" y "pantalla en blanco" con mala señal.
const CACHE = 'operativo-shell-v1';
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
  if (event.request.method !== 'GET') return; // nunca cachear POST/PUT (acciones, reportes)
  if (url.pathname.startsWith('/api/')) return; // datos siempre en vivo, nunca desde el SW

  event.respondWith(
    caches.match(event.request).then((cacheado) => {
      const red = fetch(event.request)
        .then((respuesta) => {
          // Clonar YA, antes de devolver la respuesta: en cuanto el navegador la recibe
          // empieza a leer su body, y clonar después de eso revienta con "Response body
          // is already used" (visto en producción — cache.put quedaba en una promesa sin
          // esperar, así que corría después de que el body ya estaba en uso).
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
