const mongoose = require('mongoose');

const solicitudSchema = new mongoose.Schema({
    // --- Campos de Identificación y Contacto ---
    solicitante: { type: String, required: true }, // Nombre del contacto
    empresaSolicitante: { type: String, required: true },
    correo: { type: String, lowercase: true, trim: true },
    numero: { type: String },
    direccion: { type: String },

    // --- Detalles de la Solicitud ---
    descripcion: { type: String, required: true },
    origen: { type: String, default: 'WhatsApp' },
    estado: { type: String, default: 'Pendiente' },

    // --- Tiempos y Plazos ---
    fechaHoraSolicitud: { type: Date, default: Date.now }, // Cuándo entró el pedido
    fechaEjecucionSolicitada: { type: Date }, // Para cuándo lo quiere el cliente
    plazoEjecucionSugerido: { type: String }, // Ejemplo: "15 días hábiles"

    // --- Documentación ---
    adjuntos: { type: String },

    // --- Control Interno ---
    fechaCreacion: { type: Date, default: Date.now }
}, {
    timestamps: true,
    collection: 'solicitudes'
});

module.exports = mongoose.models.Solicitud || mongoose.model('Solicitud', solicitudSchema);