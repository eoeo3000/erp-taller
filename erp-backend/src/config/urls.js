// URLs base por app y por entorno de despliegue. Cada una cae a su equivalente en
// localhost si la variable no está seteada, nunca a un hardcode de producción — así correr
// el backend en local jamás manda un correo con un link que apunta a producción por
// accidente (el bug real que tenía esto: enviarCorreoToken armaba el link de la PWA
// Operativa a partir de API_URL, apuntando al propio backend en vez de al host real de esa
// PWA, que es un Render Static Site aparte).
//
// En Render, definir estas variables en el servicio del backend:
//   API_URL            = https://erp-taller-backend.onrender.com
//   PWA_OPERATIVA_URL  = https://erp-pwa-operativa.onrender.com
//   PWA_CLIENTE_URL    = https://erp-pwa-cliente.onrender.com
//   SPA_URL            = https://erp-taller-web.onrender.com
// En local, dejarlas sin definir (o copiarlas a erp-backend/.env con los puertos de
// `npm run dev` de cada PWA) — los defaults de abajo ya apuntan a localhost.
const API_URL = process.env.API_URL || 'http://localhost:5000';
const PWA_OPERATIVA_URL = process.env.PWA_OPERATIVA_URL || 'http://localhost:5174';
const PWA_CLIENTE_URL = process.env.PWA_CLIENTE_URL || 'http://localhost:5175';
// SPA de escritorio (erp-web). La usa el correo de recuperación de clave para armar el
// link de restablecimiento — mismo motivo que PWA_OPERATIVA_URL: el link tiene que apuntar
// al host de la app, no al del backend que envía el correo.
const SPA_URL = process.env.SPA_URL || 'http://localhost:5173';

// ¿Sirve este valor para armar un link que alguien pueda abrir?
//
// Existe porque dos configuraciones malas seguidas de SPA_URL costaron dos tardes, y en las
// dos el backend arrancó sin una queja y estuvo mandando correos con links muertos:
//
//   https://.onrender.com                          ← faltaba el nombre del servicio
//   SPA_URL = https://erp-taller-web.onrender.com  ← se pegó la línea entera en el valor
//
// El segundo ni siquiera parsea como URL. El primero sí —`new URL()` lo acepta y deja el
// hostname en ".onrender.com"— así que hace falta mirar también que el host no tenga
// etiquetas vacías. Ese es el caso que se escapa de una validación ingenua.
function urlUsable(valor) {
    let u;
    try {
        u = new URL(String(valor || ''));
    } catch {
        return false;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname;
    if (!host) return false;
    if (host.startsWith('.') || host.endsWith('.') || host.includes('..')) return false;
    return true;
}

// Se llama desde server.js al arrancar. No corta el arranque: una URL mala rompe los links
// de los correos, no la app entera, y dejar el sistema abajo sería peor. Pero se avisa
// fuerte, que es justo lo que no pasaba.
// El parámetro existe para poder probarla: las constantes de arriba se leen del entorno una
// sola vez al cargar el módulo, así que sin inyección habría que recargar el módulo con otro
// process.env para ejercitar cada caso. server.js la llama sin argumentos.
function avisarUrlsInvalidas(configuradas = { API_URL, PWA_OPERATIVA_URL, PWA_CLIENTE_URL, SPA_URL }) {
    const malas = Object.entries(configuradas).filter(([, valor]) => !urlUsable(valor));
    if (!malas.length) return [];

    for (const [nombre, valor] of malas) {
        console.error(`❌ ${nombre} no es una URL usable: ${JSON.stringify(valor)}`);
    }
    console.error('   Los correos que lleven ese link van a salir con un enlace que no abre.');
    console.error('   Formato esperado: https://host.dominio.com (sin barra final, sin el nombre de la variable).');
    return malas.map(([nombre]) => nombre);
}

module.exports = { API_URL, PWA_OPERATIVA_URL, PWA_CLIENTE_URL, SPA_URL, urlUsable, avisarUrlsInvalidas };
