import axios from 'axios';

// Selector de entorno de trabajo (producción / demo, ver §9.2 del README de rediseño).
// Se guarda en localStorage (preferencia de este navegador, no hay sesión/usuario real —
// ver CLAUDE.md) y se propaga a TODAS las llamadas vía axios.defaults, así ningún llamado
// existente en App.jsx o las pantallas necesita tocarse. Las llamadas con fetch() nativo sí
// deben incluir headerEntorno() a mano (son pocas, ver App.jsx/ContabilidadScreen.jsx).
const CLAVE = 'erpTaller.entorno';

export function obtenerEntorno() {
    return localStorage.getItem(CLAVE) === 'demo' ? 'demo' : 'produccion';
}

export function fijarEntorno(valor) {
    localStorage.setItem(CLAVE, valor);
    axios.defaults.headers.common['X-Entorno'] = valor;
}

export function headerEntorno() {
    return { 'X-Entorno': obtenerEntorno() };
}

// Se ejecuta una sola vez al importar el módulo (import en App.jsx, antes de cualquier
// llamada), dejando el header por defecto listo para todas las llamadas axios de la app.
axios.defaults.headers.common['X-Entorno'] = obtenerEntorno();

// Clave compartida para las rutas de escritura de mayor riesgo (OT, contabilidad,
// recursos/puestos/calendarios) — ver plan de robustecimiento, punto 4. Vive en el build del
// SPA (VITE_API_KEY, definida en erp-web/.env): no es autenticación real por persona, protege
// contra acceso casual/directo a la API, no contra alguien que ya usa la app desde el
// navegador. Si VITE_API_KEY no está definida, el header sale vacío y el backend permite el
// paso igual (ver middlewares/apiKey.js) — así el gate solo se activa cuando se configura
// explícitamente en ambos lados, sin romper la app para quien no la haya configurado.
export function headerApiKey() {
    return { 'X-Api-Key': import.meta.env.VITE_API_KEY || '' };
}

axios.defaults.headers.common['X-Api-Key'] = import.meta.env.VITE_API_KEY || '';
