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
// --- Por qué son DOS memorias y no una ---
//
// Esto empezó siendo un solo valor en localStorage, y eso rompía a quien administra varios
// clientes. localStorage es del ORIGEN, no de la pestaña: apretar «Abrir» en el panel para
// mirar la puerta de un cliente dejaba a TODO el navegador apuntando a ese cliente, en todas
// sus pestañas y al día siguiente también. Desde entonces su propio correo se buscaba en la
// base de ese cliente y su clave correcta fallaba, con el mensaje «Correo o clave
// incorrectos», que describe otra cosa. Visitar a sus clientes lo dejaba afuera de lo suyo.
//
//   - VISITA (sessionStorage): la pista que vino en el link, `?taller=`. Vale para esta
//     pestaña y nada más. Es lo que permite abrir la puerta de un cliente sin ensuciar el
//     navegador: se cierra la pestaña y no quedó nada.
//
//   - DE ESTE NAVEGADOR (localStorage): a qué taller pertenece quien usa este computador.
//     **Solo la escribe entrar**, desde el prefijo del token, que es la autoridad (ver
//     `fijarSesion` en utils/sesion.js). Así la memoria durable no la puede poner un link.
//
// La visita gana sobre la durable mientras dure la pestaña: es la intención más reciente y
// explícita de quien abrió ese link.
//
// Lo único que se pierde con esto: quien abre su link, NO entra, y cierra el navegador,
// necesita el link otra vez. Sin haber entrado no podía hacer nada igual, y con entrar una
// sola vez la memoria durable queda puesta para siempre.
const CLAVE = 'erpTaller.taller';
const CLAVE_VISITA = 'erpTaller.tallerVisita';

// Todas las lecturas y escrituras van envueltas: en una ventana privada —o con el
// almacenamiento bloqueado— `localStorage` lanza con solo tocarlo. Este módulo se importa al
// arrancar el SPA, así que ahí lo que se vería no es un aviso sino una pantalla en blanco.
function leer(almacen, clave) {
    try { return almacen().getItem(clave) || ''; } catch { return ''; }
}

function escribir(almacen, clave, valor) {
    try {
        if (valor) almacen().setItem(clave, valor);
        else almacen().removeItem(clave);
    } catch { /* sin almacenamiento, vale solo para esta carga */ }
}

const local = () => localStorage;
const sesion = () => sessionStorage;

export function obtenerTaller() {
    return leer(sesion, CLAVE_VISITA) || leer(local, CLAVE);
}

// `durable: false` (lo normal) es la pista de un link: esta pestaña y nada más.
// `durable: true` lo usa SOLO `fijarSesion`, con el prefijo del token: ahí sí se sabe de qué
// taller es esta persona, y de paso se borra la visita, que ya no manda sobre un hecho.
export function fijarTaller(slug, { durable = false } = {}) {
    const limpio = String(slug || '').trim().toLowerCase();
    if (!limpio) return '';
    if (durable) {
        escribir(local, CLAVE, limpio);
        escribir(sesion, CLAVE_VISITA, '');
    } else {
        escribir(sesion, CLAVE_VISITA, limpio);
    }
    axios.defaults.headers.common['X-Taller'] = limpio;
    return limpio;
}

// Olvidar a qué taller apunta este navegador, para volver al de por omisión.
//
// Es la salida de un callejón sin salida: entrar, recuperar la clave y activar una invitación
// pasan SIN sesión, así que el taller sale de esta pista. Si la durable quedó apuntando a otro
// cliente —de antes de que existieran las dos memorias, o porque se entró ahí alguna vez—, el
// correo se busca en esa base, no está, y el backend responde «Correo o clave incorrectos».
// Correcto de su lado (distinguirlo diría qué correos existen en qué cliente), pero describe
// mal lo que pasó: la clave estaba bien, la base no.
//
// `fijarSesion` corrige la pista al entrar — pero eso es DESPUÉS de entrar, que es justo lo
// que ahí no se puede hacer. De ahí que la salida tenga que estar en la pantalla de ingreso.
//
// Olvidar no revela nada ni abre nada: deja este navegador como uno recién estrenado, en el
// taller por defecto, donde las credenciales de otro tampoco valen. Borra las DOS memorias:
// dejar una viva haría que el botón pareciera no hacer nada.
export function olvidarTaller() {
    escribir(local, CLAVE, '');
    escribir(sesion, CLAVE_VISITA, '');
    delete axios.defaults.headers.common['X-Taller'];
}

export function headerTaller() {
    const slug = obtenerTaller();
    return slug ? { 'X-Taller': slug } : {};
}

// Los links que llegan por correo (activar, restablecer) y el de instalación traen
// `?taller=`. Se lee una vez al arrancar y se recuerda PARA ESTA PESTAÑA, así la navegación
// dentro de la app —ya sin el link en la barra— sigue sabiendo a qué base pertenece.
export function recordarTallerDeLaUrl() {
    const enLaUrl = new URLSearchParams(window.location.search).get('taller');
    return enLaUrl ? fijarTaller(enLaUrl) : obtenerTaller();
}

// Al importar el módulo, antes de cualquier llamada: deja el header por defecto listo para
// todas las llamadas axios, igual que utils/entorno.js con el entorno.
const inicial = recordarTallerDeLaUrl();
if (inicial) axios.defaults.headers.common['X-Taller'] = inicial;
