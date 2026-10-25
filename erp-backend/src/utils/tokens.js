// Generación y hash de tokens de sesión/recuperación de las cuentas de escritorio.
//
// Misma entropía (20 bytes → 40 hex) que ya usan OT.tokenEjecucion, Usuario.token y
// SesionPortal, por la razón que fija docs/estrategia-movil.md §6.2: no hay indicio de que
// 40 hex sea insuficiente y usar otra cifra introduciría una segunda convención de
// seguridad en el mismo proyecto.
//
// Mismo criterio de almacenamiento que SesionPortal (ver models/SesionPortal.js): se guarda
// el HASH, nunca el token en claro — un volcado de la base no debe alcanzar para suplantar
// una sesión activa. portalController tiene su propia copia de hashToken; no se retrofitea
// acá (ver CLAUDE.md: no unificar controladores que no se están tocando por otra razón).
const crypto = require('crypto');

function generarToken() {
    return crypto.randomBytes(20).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

// --- Prefijo de taller en los tokens de sesión ---
//
// Un token de sesión viaja como `<taller>.<token>` — por ejemplo `principal.a3f9…`.
//
// Para qué: el backend necesita saber EN QUÉ BASE buscar la sesión antes de poder buscarla,
// y la sesión vive dentro de la base del taller. Sin el prefijo la cadena sería circular
// (para saber el taller hay que leer la sesión; para leer la sesión hay que saber el
// taller). Ver docs/multi-taller.md §4.
//
// **El prefijo NO autentica nada.** Es dato que manda el cliente y se trata como tal: lo
// único que hace es elegir la base. El token que va detrás igual tiene que existir ahí, con
// una sesión válida, y de un usuario que pertenezca a ese mismo taller (ver
// middlewares/sesion.js). Escribir el prefijo de otro taller lleva a una base donde tu
// token no está: 401, no los datos ajenos.
//
// Se separa por el PRIMER punto. Los tokens son hexadecimal (`generarToken`), así que nunca
// contienen puntos y la división no es ambigua.

function conPrefijo(taller, token) {
    return `${taller}.${token}`;
}

// Devuelve `{ taller, token }`. Un token sin punto se devuelve con `taller: null` — es el
// formato anterior al prefijo, y quien llama decide usar el taller por defecto. Gracias a
// eso las sesiones ya abiertas siguen funcionando después de desplegar esto.
function separarPrefijo(tokenCompleto) {
    const texto = String(tokenCompleto || '');
    const corte = texto.indexOf('.');
    if (corte === -1) return { taller: null, token: texto };
    return { taller: texto.slice(0, corte), token: texto.slice(corte + 1) };
}

// El token tal como se guarda en la base: sin el prefijo de ruteo.
//
// Se usa en el momento de BUSCAR. Lo que se guarda —`Usuario.token`, el hash de
// `SesionPortal`, el de `SesionStaff`— es siempre el token pelado; el prefijo es algo que se
// le agrega al entregarlo y que viaja de vuelta en cada llamada. Comparar sin sacarlo
// significa no encontrar nunca nada.
//
// Un token sin punto vuelve igual, que es lo que hace que los que ya están en los teléfonos
// y en los links que la gente guardó sigan sirviendo después de desplegar esto.
function sinPrefijo(tokenCompleto) {
    return separarPrefijo(tokenCompleto).token;
}

// --- Dónde viaja el token de las PWAs ---
//
// La PWA Operativa y el portal del cliente no usan `Authorization: Bearer`: arman sus
// llamadas con `fetch()` a mano y mandan `?token=` (ver erp-pwa-operativa/src/api.js). Se
// acepta además por cabecera, que es donde debería estar, para que la PWA pueda migrar sin
// que el backend tenga que cambiar otra vez.
//
// Vive acá y no en un middleware porque lo necesitan DOS: `middlewares/entorno.js`, para
// saber de qué taller es la request antes de abrir ninguna base, y `middlewares/identidad.js`,
// para saber quién llama. Dos copias de "de dónde sale el token" es la forma en que una se
// queda atrás el día que la PWA cambie de lugar.
function tokenMovilDeLaRequest(req) {
    return String(req?.query?.token || req?.headers?.['x-token-operativo'] || '').trim();
}

module.exports = { generarToken, hashToken, conPrefijo, separarPrefijo, sinPrefijo, tokenMovilDeLaRequest };
