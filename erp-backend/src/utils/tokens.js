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

module.exports = { generarToken, hashToken, conPrefijo, separarPrefijo };
