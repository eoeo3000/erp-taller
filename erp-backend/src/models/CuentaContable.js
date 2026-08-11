const mongoose = require('mongoose');

const CuentaContableSchema = new mongoose.Schema({
    codigo:     { type: String, required: true, unique: true, trim: true },
    nombre:     { type: String, required: true, trim: true },
    tipo:       { type: String, enum: ['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto'], required: true },
    naturaleza: { type: String, enum: ['Deudora', 'Acreedora'], required: true },
    nivel:      { type: Number, required: true },
    padreId:    { type: mongoose.Schema.Types.ObjectId, ref: 'CuentaContable', default: null },
    activa:     { type: Boolean, default: true },
    descripcion:{ type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.models.CuentaContable || mongoose.model('CuentaContable', CuentaContableSchema);
