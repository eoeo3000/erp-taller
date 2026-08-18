// Sesión de la PWA Cliente (docs/rediseno/design_handoff_pwa_movil/README.md §6, C1).
// No es un Usuario (el Cliente sigue sin cuenta, ver estrategia-movil.md §7.1) — es un
// token de dispositivo, con vencimiento y revocable desde la oficina. El alcance es la
// empresa (todas las solicitudes que comparten el mismo teléfono), no la solicitud
// puntual usada para entrar — es lo que habilita la pantalla C2.
// Se guarda el HASH del token, no el token: un volcado de esta colección no debe
// alcanzar para suplantar una sesión activa (mismo motivo por el que nadie guarda
// contraseñas en claro). El token en claro solo existe una vez, en la respuesta de
// acceso() al momento de emitirlo.
const mongoose = require('mongoose');

const SesionPortalSchema = new mongoose.Schema({
    telefono: { type: String, required: true, trim: true },
    empresaSolicitante: { type: String, default: '' },
    tokenHash: { type: String, required: true },
    expira: { type: Date, required: true },
    revocada: { type: Boolean, default: false },
    ultimoAcceso: { type: Date, default: null },
}, { timestamps: true });

module.exports = (conn) => conn.models.SesionPortal || conn.model('SesionPortal', SesionPortalSchema);
