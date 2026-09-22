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

module.exports = { generarToken, hashToken };
