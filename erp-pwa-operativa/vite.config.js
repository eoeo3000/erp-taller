import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Aplicación aparte de la SPA de escritorio (erp-web): su propio build, su propio
// manifest y su propio service worker, para que el scope del SW no choque con el de
// ninguna otra app. Se sirve bajo /operativo/ del mismo dominio — mismo criterio de
// "sin subdominio nuevo" que ya usa el Portal del Cliente (ver docs/estrategia-movil.md
// §10), aplicado aquí como base de Vite en vez de como ruta interna de otra SPA, porque
// el requisito explícito de esta PWA es tener su propio manifest/SW (ver prompt M2).
export default defineConfig({
  base: '/operativo/',
  plugins: [react()],
  server: { port: 5174 },
});
