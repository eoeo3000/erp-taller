// URLs base por app y por entorno de despliegue. Cada una cae a su equivalente en
// localhost si la variable no está seteada, nunca a un hardcode de producción — así correr
// el backend en local jamás manda un correo con un link que apunta a producción por
// accidente (el bug real que tenía esto: enviarCorreoToken armaba el link de la PWA
// Operativa a partir de API_URL, apuntando al propio backend en vez de al host real de esa
// PWA, que es un Render Static Site aparte).
//
// En Render, definir estas tres variables en el servicio del backend:
//   API_URL            = https://erp-taller-backend.onrender.com
//   PWA_OPERATIVA_URL  = https://erp-pwa-operativa.onrender.com
//   PWA_CLIENTE_URL    = https://erp-pwa-cliente.onrender.com
// En local, dejarlas sin definir (o copiarlas a erp-backend/.env con los puertos de
// `npm run dev` de cada PWA) — los defaults de abajo ya apuntan a localhost.
const API_URL = process.env.API_URL || 'http://localhost:5000';
const PWA_OPERATIVA_URL = process.env.PWA_OPERATIVA_URL || 'http://localhost:5174';
const PWA_CLIENTE_URL = process.env.PWA_CLIENTE_URL || 'http://localhost:5175';

module.exports = { API_URL, PWA_OPERATIVA_URL, PWA_CLIENTE_URL };
