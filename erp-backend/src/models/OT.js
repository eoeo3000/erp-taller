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
            'Planificada',      // Tareas y recursos definidos, cotización armada
            'Aprobada',         // Cliente aceptó la cotización
            'Rechazada',        // Cliente rechazó la cotización (cierre)
            'Programada',       // Agendada en Gantt
            'En Ejecución',     // Trabajo en terreno
            'Trabajo Terminado',// Faena completada
            'Con Informe',      // Reporte entregado
            'Pagada'            // Cobro recibido
        ],
        default: 'Pendiente'
    },
    origen: { type: String, default: 'Manual' },

    // Informe de Evaluación: levantamiento en terreno previo a cotizar (ver docs/funcionalidades-v2.md)
    informeEvaluacion: {
        fecha: String,
        responsable: String,
        condicionesSitio: String,
        fotos: [String],
        recursosObservados: String,
        riesgos: String,
        metodologia: String,
        completo: { type: Boolean, default: false },
        tareas: [{
            descripcion: String,
            puesto: String,
            duracion: Number
        }],
        componentes: [{
            codigo: String,
            descripcion: String,
            cantidad: Number,
            precio: Number,
            tipo: String
        }],
        logistica: [{
            descripcion: String,
            cantidad: Number,
            unidad: String,
            precio: Number
        }]
    },

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
    // 'Media'/'Alta' quedaron en el enum viejo pero nunca se usaron en ningún lado del
    // frontend (grep confirmado sobre erp-web/src) — se reemplaza sin costo de migración
    // de datos reales. Ver pestaña Antecedentes, docs/rediseno/design_handoff_panel_control.
    prioridad: { type: String, enum: ['Baja', 'Normal', 'Urgente'], default: 'Normal' },
    tecnicoAsignado: { type: String },
    fechaInicio: { type: Date },
    fechaEntrega: { type: Date },

    // Pestaña Antecedentes: supervisor a cargo de la OT completa (independiente del
    // responsable de cada tarea en tareas[].operarioNombre — no se sobreescribe).
    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // Fecha en que se ejecuta el trabajo (distinto de fechaInicio/fechaEntrega, que ya
    // existían sin uso claro en el frontend — este es el campo que la pestaña edita).
    fechaEjecucion: { type: Date, default: null },
    // OC del CLIENTE (texto libre) — no confundir con ordenesCompra de abajo, que son las
    // Ordenes de Compra propias generadas para cubrir faltantes de stock (Gap 3).
    ordenCompra: { type: String, default: '' },
    instruccionesTerreno: { type: String, default: '' },
    asignadaEn: { type: Date, default: null },
    // Sin sistema de login para el staff interno (ver CLAUDE.md) — no hay de dónde sacar
    // "quién" asignó de forma confiable hoy. Se deja el campo para cuando exista una sesión
    // real; queda null en vez de inventar un valor.
    asignadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // Bitácora de la OT (por ahora solo la usa la asignación de supervisor).
    bitacora: [{
        fecha: { type: Date, default: Date.now },
        texto: String,
    }],

    // Órdenes de Compra generadas para cubrir faltantes de stock de esta OT (ver docs/funcionalidades-v2.md, Gap 3)
    ordenesCompra: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OrdenCompra' }],

    tokenEjecucion: { type: String, default: '' },
    ultimaEdicion: { type: Date, default: Date.now },
    fechaCreacion: { type: Date, default: Date.now }
}, {
    timestamps: true
});

module.exports = (conn) => conn.models.OT || conn.model('OT', OTSchema);