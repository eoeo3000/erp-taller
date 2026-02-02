const mongoose = require('mongoose');

const PuestoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: [true, 'El nombre del puesto es obligatorio'],
        unique: true,
        trim: true
    },
    costoHora: {
        type: Number,
        required: [true, 'El costo por hora es obligatorio'],
        default: 0
    },
    categoria: {
        type: String,
        enum: ['Operativo', 'Técnico', 'Administrativo', 'Supervisión'],
        default: 'Técnico'
    },
    fechaCreacion: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Puesto', PuestoSchema);