import axios from 'axios';

// Sesión de la app de escritorio. Mismo truco que utils/entorno.js: el token se propaga a
// TODAS las llamadas de axios vía axios.defaults, así ninguna llamada existente necesita
// tocarse. Las pocas que usan fetch() nativo sí deben incluir headerSesion() a mano (igual
// que ya hacen con headerEntorno/headerApiKey).
//
// sessionStorage y no localStorage: la sesión muere al cerrar la pestaña o el navegador, que
// es lo que se pidió ("que dure lo que dure la sesión del PC"). El backend agrega la otra
// mitad: una ventana de inactividad de 60 minutos, para que un computador suspendido pida
// clave al volver aunque la pestaña haya quedado abierta.
//
// El token se guarda acá y no en una cookie porque el SPA y el backend son dos servicios
// distintos de Render (subdominios distintos de onrender.com): una cookie del backend sería
// de terceros y Safari la bloquea por defecto, dejando sin login a cualquiera con iPhone.
const CLAVE_TOKEN = 'erpTaller.sesion.token';
const CLAVE_USUARIO = 'erpTaller.sesion.usuario';

// En navegación privada o con el almacenamiento bloqueado, leer/escribir puede lanzar. Sin
// persistencia la app igual funciona: se pide clave de nuevo, no se rompe nada.
function leer(clave) {
    try { return sessionStorage.getItem(clave); } catch { return null; }
}

function escribir(clave, valor) {
    try {
        if (valor === null) sessionStorage.removeItem(clave);
        else sessionStorage.setItem(clave, valor);
    } catch { /* sin persistencia: la sesión dura lo que dure esta carga de la página */ }
}

export function obtenerToken() {
    return leer(CLAVE_TOKEN) || '';
}

export function obtenerUsuario() {
    try { return JSON.parse(leer(CLAVE_USUARIO) || 'null'); } catch { return null; }
}

function aplicarEnAxios(token) {
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    else delete axios.defaults.headers.common['Authorization'];
}

export function fijarSesion(token, usuario) {
    escribir(CLAVE_TOKEN, token);
    escribir(CLAVE_USUARIO, JSON.stringify(usuario || null));
    aplicarEnAxios(token);
}

export function limpiarSesion() {
    escribir(CLAVE_TOKEN, null);
    escribir(CLAVE_USUARIO, null);
    aplicarEnAxios('');
}

export function headerSesion() {
    const token = obtenerToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// El polling de /api/data no debe correr la ventana de inactividad del backend: si lo
// hiciera, una pestaña abierta mantendría la sesión viva para siempre aunque no haya nadie
// frente al computador (ver erp-backend/src/middlewares/sesion.js).
export function headerSondeo() {
    return { 'X-Sondeo': '1' };
}

// Quien quiera enterarse de que la sesión se cayó (App.jsx, para volver al login) se
// suscribe acá. Mismo patrón que utils/notificar.js.
let alCaerSesion = null;
export function suscribirCaidaDeSesion(fn) {
    alCaerSesion = fn;
}

// Se ejecuta una sola vez al importar el módulo, antes de cualquier llamada.
aplicarEnAxios(obtenerToken());

// Una sesión puede vencer en cualquier momento (inactividad, tope de 24h, o alguien la
// revocó desde la oficina). El primer 401 que llegue — típicamente el del polling, que corre
// solo cada 30s — devuelve al login en vez de dejar la pantalla con datos viejos y todo
// fallando en silencio.
axios.interceptors.response.use(
    (respuesta) => respuesta,
    (error) => {
        const url = error?.config?.url || '';
        // /auth/login responde 401 con la clave equivocada y /auth/yo responde 401 cuando
        // justamente estamos preguntando si hay sesión: ninguno de los dos es una sesión
        // que se cayó, y tratarlos como tal borraría el intento de login en curso.
        const esConsultaDeSesion = url.includes('/auth/login') || url.includes('/auth/yo');
        if (error?.response?.status === 401 && !esConsultaDeSesion) {
            limpiarSesion();
            if (alCaerSesion) alCaerSesion();
        }
        return Promise.reject(error);
    },
);
