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
