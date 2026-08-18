// Persona con acceso móvil (PWA Operativa) — ver docs/estrategia-movil.md §7.1.
// Un Recurso puede o no tener Usuario asociado (Recurso.usuarioId, opcional).
const mongoose = require('mongoose');

const UsuarioSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true },
    puesto: { type: String, default: '' },
    rol: { type: String, enum: ['supervisor', 'ejecutor'], required: true },
    recursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recurso' },
    token: { type: String, required: true },
    estado: { type: String, enum: ['activo', 'revocado'], default: 'activo' },
    fechaEmision: { type: Date, default: Date.now },
    ultimoAcceso: { type: Date, default: null },
}, { timestamps: true });

module.exports = (conn) => conn.models.Usuario || conn.model('Usuario', UsuarioSchema);
