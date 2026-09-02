import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Aplicación aparte de la PWA Operativa: su propio manifest y service worker. Se despliega
// como su propio Render Static Site, dominio propio — base '/' porque la raíz del sitio ES
// la raíz de esta app (mismo criterio y mismo motivo que erp-pwa-operativa/vite.config.js).
//
// Sello de build: el mismo valor queda incrustado en el JS (__BUILD_ID__) y publicado en
// /version.json. Sirve para que la app se dé cuenta sola de que está corriendo una versión
// vieja — ver src/main.jsx. Hace falta porque sw.js no cambia entre deploys (es un archivo
// estático, igual byte a byte), así que el navegador no reinstala el service worker y no hay
// ningún evento que avise de que hay algo nuevo publicado.
const BUILD_ID = Date.now().toString(36);

function selloDeVersion() {
    return {
        name: 'sello-de-version',
        generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
        },
    };
}

export default defineConfig({
    base: '/',
    define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
    plugins: [react(), selloDeVersion()],
    server: { port: 5175 },
});
