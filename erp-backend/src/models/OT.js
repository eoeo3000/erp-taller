const mongoose = require('mongoose');

const OTSchema = new mongoose.Schema({
    // Identificadores básicos
    numeroOT: { type: String, unique: true },
    solicitante: { type: String, required: true },
    descripcion: { type: String, required: true },

    // Estado del flujo
    estado: {
        type: String,
        enum: ['Pendiente', 'Generada', 'En Proceso', 'Tratada', 'Finalizada'],
        default: 'Pendiente'
    },
    origen: { type: String, default: 'Manual' },

    // --- NUEVOS CAMPOS PARA GUARDAR EL TRATAMIENTO ---

    // 1. Tareas (Array de objetos)
    tareas: [{
        descripcion: String,
        puesto: String,
        duracion: Number,
        fecha: String,
        hora: String,
        operarioId: [String],
        operarioNombre: [String],
        valorHora: Number,
        completada: { type: Boolean, default: false }
    }],

    // 2. Componentes y Materiales
    componentes: [{
        codigo: String,
        descripcion: String,
        cantidad: Number,
        precio: Number,
        tipo: String // 'Material', 'Equipo', 'Herramienta'
    }],

    // 3. Logística y otros gastos
    logistica: [{
        descripcion: String,
        cantidad: Number,
        precio: Number
    }],

    // 4. Totales Financieros
    granTotal: { type: Number, default: 0 },

    // --- Metadatos y Asignación ---
    prioridad: { type: String, enum: ['Baja', 'Media', 'Alta', 'Urgente'] },
    tecnicoAsignado: { type: String },
    fechaInicio: { type: Date },
    fechaEntrega: { type: Date },

    ultimaEdicion: { type: Date, default: Date.now },
    fechaCreacion: { type: Date, default: Date.now }
}, {
    timestamps: true
});

module.exports = mongoose.models.OT || mongoose.model('OT', OTSchema);