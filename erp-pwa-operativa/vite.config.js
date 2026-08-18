import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Aplicación aparte de la SPA de escritorio (erp-web): su propio build, su propio
// manifest y su propio service worker, para que el scope del SW no choque con el de
// ninguna otra app. Se despliega como su propio Render Static Site, con dominio propio
// (no un subdirectorio del dominio de erp-web) — por eso base es '/' y no '/operativo/':
// la raíz del sitio ES la raíz de esta app. La idea original de estrategia-movil.md §10
// (subruta del mismo dominio) suponía un solo host sirviendo todo; en la práctica ni
// erp-web ni erp-backend comparten host hoy, así que cada PWA sigue ese mismo patrón.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: { port: 5174 },
});
