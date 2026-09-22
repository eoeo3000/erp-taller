// Sesión de escritorio (SPA erp-web) — el equivalente para la oficina de lo que
// SesionPortal es para el cliente, y con el mismo criterio de almacenamiento: se guarda el
// HASH del token, nunca el token en claro (ver models/SesionPortal.js).
//
// Token opaco propio y no un JWT: un JWT no se puede invalidar del lado del servidor hasta
// que vence solo, y revocar el acceso al instante (alguien deja la empresa, se pierde un
// notebook) es exactamente el caso de uso que justifica tener login. Acá revocar es marcar
// una fila.
//
// Dos vencimientos distintos, porque cumplen cosas distintas:
//   - `expira`: ventana de inactividad, se corre hacia adelante con cada acción real de la
//     persona. Es lo que hace que un computador suspendido pida clave de nuevo al volver.
//   - `expiraAbsoluto`: tope duro desde que se creó la sesión. Aunque alguien deje la
//     pestaña abierta y la use todo el día, la sesión no dura para siempre.
const mongoose = require('mongoose');

const SesionStaffSchema = new mongoose.Schema({
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    tokenHash: { type: String, required: true },
    expira: { type: Date, required: true },
    expiraAbsoluto: { type: Date, required: true },
    estado: { type: String, enum: ['activa', 'cerrada'], default: 'activa' },
    ultimoAcceso: { type: Date, default: Date.now },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
}, { timestamps: true });

// Se busca por hash en CADA request autenticada — sin índice, cada llamada hace un scan
// completo de la colección (mismo problema que ya se vio en producción con OT, ver OT.js).
SesionStaffSchema.index({ tokenHash: 1 });
// Cerrar todas las sesiones de una persona: al cambiar su clave, al revocarla.
SesionStaffSchema.index({ usuarioId: 1, estado: 1 });
// Mongo borra solo las sesiones pasado su tope duro, así la colección no crece sin
// límite. No se pierde trazabilidad: "quién hizo qué" vive en los documentos del dominio
// (OT.asignadaPor, reportes[].usuario), no en la fila de la sesión.
SesionStaffSchema.index({ expiraAbsoluto: 1 }, { expireAfterSeconds: 0 });

module.exports = (conn) => conn.models.SesionStaff || conn.model('SesionStaff', SesionStaffSchema);
