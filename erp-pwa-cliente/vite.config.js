import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Aplicación aparte de PortalClienteScreen (erp-web) y de la PWA Operativa: su propio
// manifest y service worker, servida bajo /cliente/ del mismo dominio — mismo criterio
// que erp-pwa-operativa (ver su vite.config.js).
export default defineConfig({
  base: '/cliente/',
  plugins: [react()],
  server: { port: 5175 },
});
