import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Aplicación aparte de la SPA de escritorio (erp-web): su propio build, su propio
// manifest y su propio service worker, para que el scope del SW no choque con el de
// ninguna otra app. Se despliega como su propio Render Static Site, con dominio propio
// (no un subdirectorio del dominio de erp-web) — por eso base es '/' y no '/operativo/':
// la raíz del sitio ES la raíz de esta app. La idea original de estrategia-movil.md §10
// (subruta del mismo dominio) suponía un solo host sirviendo todo; en la práctica ni
// erp-web ni erp-backend comparten host hoy, así que cada PWA sigue ese mismo patrón.
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
  server: { port: 5174 },
});
