const mongoose = require('mongoose');

const SuministroSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: [true, 'El código es obligatorio'],
        unique: true,
        trim: true
    },
    descripcion: {
        type: String,
        required: [true, 'La descripción es obligatoria'],
        trim: true
    },
    precio: {
        type: Number,
        required: [true, 'El precio es obligatorio'],
        default: 0
    },
    categoria: {
        type: String,
        enum: ['Transporte', 'Repuesto', 'Insumo', 'Otro'],
        default: 'Insumo'
    },
    fechaRegistro: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Suministro', SuministroSchema);