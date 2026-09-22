// Persona con acceso al sistema. Dos formas de entrar conviven en la misma colección, a
// propósito (ver docs/estrategia-movil.md §7.2, sobre el costo de tener dos lugares que
// respondan "quién es esta persona"):
//
//   - Móvil (PWA Operativa): `token` permanente por persona, sin clave, revocable desde la
//     oficina. No cambia con el login de escritorio — ver §6.2 de ese mismo documento: un
//     supervisor en terreno no va a escribir una clave cada vez.
//   - Escritorio (SPA erp-web): `email` + `passwordHash`, con sesiones en SesionStaff.
//
// Una persona puede tener las dos, una sola, o ninguna de las dos formas (un Recurso que
// solo aparece en el Gantt y nunca reporta ni entra a la oficina).
const mongoose = require('mongoose');

const UsuarioSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true },
    puesto: { type: String, default: '' },
    rol: { type: String, enum: ['supervisor', 'ejecutor', 'administrador'], required: true },
    recursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recurso' },
    // Opcional desde que existe el login de escritorio: una cuenta de oficina no tiene PWA.
    // OJO al consultar por este campo: `findOne({ token })` con token undefined viaja a
    // Mongo como `{ token: null }`, y null hace match con los documentos QUE NO TIENEN el
    // campo — es decir, con todas las cuentas de oficina. Toda búsqueda por token tiene que
    // descartar antes el valor vacío, como ya hace asignacionController.resolverUsuarioPorToken.
    token: { type: String },
    estado: { type: String, enum: ['activo', 'revocado'], default: 'activo' },
    fechaEmision: { type: Date, default: Date.now },
    ultimoAcceso: { type: Date, default: null },

    // --- Acceso de escritorio (SPA) ---
    // Sin `default`: tiene que quedar ausente, no en '', porque el índice sparse solo
    // ignora el campo cuando falta — con '' dos usuarios móviles chocarían entre sí.
    email: { type: String, trim: true, lowercase: true, index: { unique: true, sparse: true } },
    passwordHash: { type: String },
    debeCambiarPassword: { type: Boolean, default: false },
    ultimoAccesoSpa: { type: Date, default: null },

    // Freno de fuerza bruta contra el login (authController.login). Vive acá y no en una
    // colección aparte para no sumar un round-trip a Mongo en el camino más caliente.
    intentosFallidos: { type: Number, default: 0 },
    bloqueadoHasta: { type: Date, default: null },

    // Recuperación de clave por correo: mismo criterio que el token de sesión — se guarda
    // el hash, el token en claro solo existe dentro del correo que se envía.
    resetHash: { type: String, default: '' },
    resetExpira: { type: Date, default: null },
}, { timestamps: true });

module.exports = (conn) => conn.models.Usuario || conn.model('Usuario', UsuarioSchema);
