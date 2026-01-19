const mongoose = require('mongoose');

const RecursoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true
    },
    // Añadimos puesto para mantener la info de tu db.js (Mecánico, Eléctrico)
    puesto: {
        type: String
    },
    tipo: {
        type: String,
        enum: ['Interno', 'Externo', 'Humano'], // Añadí 'Humano' por tu db.js
        default: 'Interno'
    },
    // Cambiamos a ObjectId para que Mongoose pueda validar que el calendario existe
    calendarioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Calendario'
    },
    ajustes: {
        type: Map,
        of: Number,
        default: {}
    },
    fechaInicioCiclo: { type: String },
    // Mejoramos ausencias para que coincida con la lógica de fechas
    ausencias: [{
        fecha: { type: String }, // Formato "YYYY-MM-DD"
        motivo: { type: String }
    }]
}, {
    timestamps: true,
    // Esto asegura que cuando conviertas a JSON (para el frontend), los Mapas se vean como objetos normales
    toJSON: { flattenMaps: true }
});

module.exports = mongoose.model('Recurso', RecursoSchema);