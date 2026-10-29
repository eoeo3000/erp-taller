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
    // try/catch porque en una ventana privada —o con el almacenamiento bloqueado— leer lanza,
    // y eso tumbaría la app entera al importar el módulo. Sin memoria, taller por defecto.
    try { return localStorage.getItem(CLAVE) || ''; } catch { return ''; }
}

export function fijarTaller(slug) {
    const limpio = String(slug || '').trim().toLowerCase();
    if (!limpio) return '';
    try { localStorage.setItem(CLAVE, limpio); } catch { /* sin memoria, vale para esta visita */ }
    axios.defaults.headers.common['X-Taller'] = limpio;
    return limpio;
}

// Olvidar a qué taller apunta este navegador, para volver al de por omisión.
//
// Existe por un callejón sin salida real: entrar, recuperar la clave y activar una invitación
// pasan SIN sesión, así que el taller sale de esta pista. Quien administra varios clientes
// abre el enlace de uno, este navegador queda apuntando ahí, y al volver a entrar al suyo su
// correo se busca en la base del otro — donde no está. El backend responde "Correo o clave
// incorrectos", que es lo correcto de su lado (distinguirlo diría qué correos existen en qué
// cliente), pero describe mal lo que pasó: la clave estaba bien, la base no.
//
// `fijarSesion` corrige la pista con el prefijo del token, que es la autoridad — pero eso
// solo ocurre DESPUÉS de entrar, que es justo lo que acá no se puede hacer. De ahí que la
// salida tenga que estar en la pantalla de ingreso.
//
// Olvidar no revela nada ni abre nada: deja este navegador como uno recién estrenado, en el
// taller por defecto, donde las credenciales de otro tampoco valen.
export function olvidarTaller() {
    try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento no hay nada que olvidar */ }
    delete axios.defaults.headers.common['X-Taller'];
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
