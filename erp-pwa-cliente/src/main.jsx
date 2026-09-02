import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './tokens.css';

// Con mala señal el service worker sirve el HTML cacheado (para eso está: es la diferencia
// entre "la app carga" y "pantalla en blanco"), y ese HTML apunta a los bundles de la build
// anterior, que también siguen en el caché — así que arranca la app vieja entera. Hasta acá
// nadie se enteraba nunca: sw.js no cambia entre deploys, así que el navegador no lo
// reinstala y no hay ningún evento de "hay versión nueva". El sello de build (vite.config.js)
// permite preguntarlo explícitamente y recargar.
const CLAVE_RECARGA = 'cliente.recargaPorVersion';

async function recargarSiHayVersionNueva() {
    try {
        // no-store + query única: este archivo NO debe salir de ningún caché, ni del
        // navegador ni del service worker (que lo excluye a propósito, ver public/sw.js).
        const respuesta = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!respuesta.ok) return;
        const { build } = await respuesta.json();
        if (!build) return;
        if (build === __BUILD_ID__) {
            // Al día: se limpia la marca para que una próxima versión pueda volver a recargar.
            sessionStorage.removeItem(CLAVE_RECARGA);
            return;
        }
        // Si ya se recargó por esta misma versión y seguimos viejos, no se insiste: se prefiere
        // dejar la app usable (aunque desactualizada) antes que un bucle de recargas.
        if (sessionStorage.getItem(CLAVE_RECARGA) === build) return;
        sessionStorage.setItem(CLAVE_RECARGA, build);
        window.location.reload();
    } catch {
        // Sin señal no se puede saber si hay algo nuevo — se sigue con lo que haya en caché,
        // que es exactamente para lo que está.
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => { /* sin SW no bloquea el uso */ });
    });
}

recargarSiHayVersionNueva();
// Una PWA instalada casi no se cierra: se deja en segundo plano y se vuelve a ella. Sin este
// chequeo al volver, la comprobación de arriba solo correría la primera vez que se abrió.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recargarSiHayVersionNueva();
});

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
