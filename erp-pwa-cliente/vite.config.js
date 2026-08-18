import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Aplicación aparte de PortalClienteScreen (erp-web) y de la PWA Operativa: su propio
// manifest y service worker. Se despliega como su propio Render Static Site, dominio
// propio — base '/' porque la raíz del sitio ES la raíz de esta app (mismo criterio y
// mismo motivo que erp-pwa-operativa/vite.config.js).
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: { port: 5175 },
});
