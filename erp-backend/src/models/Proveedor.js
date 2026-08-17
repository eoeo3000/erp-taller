const mongoose = require('mongoose');

const ProveedorSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true },
    contacto: { type: String, default: '' },
    correo: { type: String, default: '', trim: true, lowercase: true },
    telefono: { type: String, default: '' },
    tipoInsumo: { type: String, default: '' },
    rut: { type: String, default: '' }
}, { timestamps: true });

module.exports = (conn) => conn.models.Proveedor || conn.model('Proveedor', ProveedorSchema);
