// Service worker de assets — solo cachea el shell estático de la PWA (JS/CSS/HTML/íconos).
// No cachea nada de /api/: los datos de "mi día" tienen que ser siempre frescos, y la cola
// de reportes sin señal la maneja IndexedDB desde la app (ver src/db.js), no este SW.
// Sin offline completo (ver design_handoff_pwa_movil/README.md §8) — esto es solo la
// diferencia entre "la app carga" y "pantalla en blanco" con mala señal.
// v3: subir este nombre purga el caché de quien haya quedado con una build vieja. Es un
// parche de una sola vez, no la solución: este archivo no cambia entre deploys, así que el
// navegador no reinstala el SW y nadie se entera de que hay algo nuevo publicado. Lo que de
// verdad lo resuelve es el sello de build (/version.json + src/main.jsx), que la app consulta
// al abrir y al volver del segundo plano.
const CACHE = 'operativo-shell-v3';
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
  // El sello de build tiene que salir siempre de la red: es justamente con lo que la app
  // decide si está corriendo una versión vieja (ver src/main.jsx). Cacheado, contestaría
  // "estás al día" para siempre, que es el bug que viene a resolver.
  if (url.pathname === '/version.json') return;

  // El HTML de entrada (navegación) va SIEMPRE a la red primero, cache solo como respaldo
  // sin señal: es el que referencia los nombres (con hash) del JS/CSS de la build actual —
  // servirlo cache-first dejaba a la persona viendo la versión anterior de la app hasta una
  // segunda apertura (a veces ni eso), porque el HTML viejo seguía apuntando al bundle viejo
  // aunque el bundle nuevo ya estuviera disponible. Bug real reportado: "a veces me lleva a
  // la visual antigua".
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

  // El resto (JS/CSS con hash en el nombre, íconos): cache-first con revalidación en
  // segundo plano está bien acá, porque la URL cambia cuando cambia el contenido.
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
