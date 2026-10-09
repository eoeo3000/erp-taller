import axios from 'axios';

// De qué taller es este navegador.
//
// Todo lo que pasa ANTES de tener sesión —entrar, recuperar la clave, activar una
// invitación— no puede sacar el taller del token, porque todavía no hay token. Sin este
// dato, el backend busca el correo en la base del taller por defecto y alguien de otro
// taller no puede entrar nunca (ver erp-backend/middlewares/entorno.js, `conexionPedida`).
//
// **Esto no es una credencial.** El slug solo dice en qué base buscar; la clave, el hash de
// recuperación o el token de invitación igual tienen que existir ahí. Apuntar al taller de
// otro lleva a una base donde tus credenciales no están: 401, nunca sus datos. Es el mismo
// criterio que el prefijo del token de sesión y que el enlace de instalación.
//
// Va en localStorage y no en sessionStorage —al revés que el token de sesión— porque es una
// preferencia de este navegador, no un secreto: que sobreviva a cerrar la ventana es
// justamente lo que evita que la persona tenga que volver a abrir su link cada vez.
const CLAVE = 'erpTaller.taller';

export function obtenerTaller() {
    return localStorage.getItem(CLAVE) || '';
}

export function fijarTaller(slug) {
    const limpio = String(slug || '').trim().toLowerCase();
    if (!limpio) return '';
    localStorage.setItem(CLAVE, limpio);
    axios.defaults.headers.common['X-Taller'] = limpio;
    return limpio;
}

export function headerTaller() {
    const slug = obtenerTaller();
    return slug ? { 'X-Taller': slug } : {};
}

// Los links que llegan por correo (activar, restablecer) y el de instalación traen
// `?taller=`. Se lee una vez al arrancar y se recuerda, así la próxima visita —ya sin el
// link— sigue sabiendo a qué base pertenece este navegador.
export function recordarTallerDeLaUrl() {
    const enLaUrl = new URLSearchParams(window.location.search).get('taller');
    return enLaUrl ? fijarTaller(enLaUrl) : obtenerTaller();
}

// Al importar el módulo, antes de cualquier llamada: deja el header por defecto listo para
// todas las llamadas axios, igual que utils/entorno.js con el entorno.
const inicial = recordarTallerDeLaUrl();
if (inicial) axios.defaults.headers.common['X-Taller'] = inicial;
