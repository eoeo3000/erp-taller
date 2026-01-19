// src/models/Calendario.js
const mongoose = require('mongoose');

const CalendarioSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    tipo: { type: String, default: 'semanal' },
    cicloDias: { type: Number, default: 7 },
    config: [{
        dia: { type: String }, // <--- CAMBIADO de Number a String
        nombreDia: String,
        activo: { type: Boolean, default: true },
        bloques: [{
            inicio: String,
            fin: String
        }]
    }]
}, { timestamps: true });

module.exports = mongoose.model('Calendario', CalendarioSchema);