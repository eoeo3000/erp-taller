const mongoose = require('mongoose');

const SuministroSchema = new mongoose.Schema({
    unidad: {
        type: String,
        required: [true, 'La unidad o vehículo es obligatorio'],
        trim: true
    },
    patente: {
        type: String,
        required: [true, 'La patente es obligatoria'],
        unique: true, // Evita duplicados de vehículos
        trim: true
    },
    ruta: {
        type: String,
        required: [true, 'La ruta asignada es obligatoria']
    },
    fechaRegistro: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Suministro', SuministroSchema);