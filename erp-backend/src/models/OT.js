const mongoose = require('mongoose');

const OTSchema = new mongoose.Schema({
    // Identificadores básicos
    numeroOT: { type: String, unique: true },
    solicitante: { type: String, required: true },
    solicitudId: { type: mongoose.Schema.Types.ObjectId, ref: 'Solicitud' },
    descripcion: { type: String, required: true },

    // Estado del flujo
    estado: {
        type: String,
        enum: [
            'Pendiente',        // OT creada, sin planificar
            'Tratada',          // Tratamiento iniciado
            'Planificada',      // Tareas y recursos definidos
            'Programada',       // Agendada en Gantt
            'En Ejecución',     // Trabajo en terreno
            'Trabajo Terminado',// Faena completada
            'Con Informe',      // Reporte entregado
            'Pagada'            // Cobro recibido
        ],
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
    // En tu archivo de modelo:
    logistica: [{
        unidad: String,
        patente: String,
        descripcion: String,
        cantidad: Number,
        precio: Number
    }],
    reportes: [{
        fecha: { type: Date, default: Date.now },
        tareaId: String,
        comentario: String,
        foto: String, // Base64 o URL
        usuario: String // Nombre del supervisor
    }],
    // 4. Totales Financieros
    granTotal: { type: Number, default: 0 },

    // 5. Control de Pago
    pago: {
        estado: { type: String, enum: ['Pendiente', 'Parcial', 'Pagado'], default: 'Pendiente' },
        montoPagado: { type: Number, default: 0 },
        fechaPago: { type: String, default: '' },
        metodoPago: { type: String, default: 'Transferencia' },
        referencia: { type: String, default: '' },
        notas: { type: String, default: '' },
        anulado: { type: Boolean, default: false },
        fechaAnulacion: { type: String, default: '' },
        motivoAnulacion: { type: String, default: '' }
    },

    // --- Metadatos y Asignación ---
    prioridad: { type: String, enum: ['Baja', 'Media', 'Alta', 'Urgente'] },
    tecnicoAsignado: { type: String },
    fechaInicio: { type: Date },
    fechaEntrega: { type: Date },

    tokenEjecucion: { type: String, default: '' },
    ultimaEdicion: { type: Date, default: Date.now },
    fechaCreacion: { type: Date, default: Date.now }
}, {
    timestamps: true
});

module.exports = mongoose.models.OT || mongoose.model('OT', OTSchema);