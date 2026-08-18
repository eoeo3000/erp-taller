// Sesión de la PWA Cliente (docs/rediseno/design_handoff_pwa_movil/README.md §6, C1).
// No es un Usuario (el Cliente sigue sin cuenta, ver estrategia-movil.md §7.1) — es un
// token de dispositivo, atado a un teléfono, con vencimiento y revocable desde la
// oficina. No existía en el diseño original; se agrega aquí como la pieza mínima que
// hace falta para sostener "sesión de 30 días, revocable" sin inventar un modelo de
// cuentas de cliente completo.
const mongoose = require('mongoose');

const SesionPortalSchema = new mongoose.Schema({
    telefono: { type: String, required: true, trim: true },
    token: { type: String, required: true },
    expira: { type: Date, required: true },
    activa: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = (conn) => conn.models.SesionPortal || conn.model('SesionPortal', SesionPortalSchema);
