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
        }],
        // Formulario adaptativo — ver docs/plan-formulario-adaptativo.md. Aditivo: no
        // reemplaza nada de lo de arriba. Cada hallazgo mantiene sincronizada una fila propia
        // en `tareas` de acá arriba (tareaVinculadaId guarda el _id de ese subdocumento) — ver
        // plan §3.4.1. Eliminar un hallazgo elimina también su tarea vinculada.
        hallazgos: [{
            tipoTrabajoId: { type: mongoose.Schema.Types.ObjectId, ref: 'TipoTrabajo', default: null },
            valores: { type: mongoose.Schema.Types.Mixed, default: {} },
            condicionesEntorno: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CondicionEntorno' }],
            textoGenerado: { type: String, default: '' },
            textoDescriptivo: { type: String, default: '' },
            textoEditadoManualmente: { type: Boolean, default: false },
            fotos: { type: [String], default: [] },
            casoNoCubierto: { type: Boolean, default: false },
            tareaVinculadaId: { type: String, default: '' },
            fecha: { type: Date, default: Date.now },
        }],
    },

    // --- NUEVOS CAMPOS PARA GUARDAR EL TRATAMIENTO ---

    // 1. Tareas (Array de objetos)
    tareas: [{
        descripcion: String,
        // Metodología/desarrollo de la tarea (pestaña Tareas del tratamiento): la primera
        // línea se edita inline en la tabla, el texto completo en el panel expandido. Viaja
        // tal cual a la PWA Operativa (mi-día) y al Informe de Ejecución para comparar plan
        // contra terreno — no necesita serialización especial, es un campo más del subdocumento.
        desarrollo: { type: String, default: '' },
        puesto: String,
        duracion: Number,
        fecha: String,
        hora: String,
        // Real, no derivado de hora+duracion en cada lectura: la detección de cruces de
        // horario (PWA Operativa, modo supervisor) los necesita ya calculados y persistidos.
        // Se recalculan en TratamientoScreen.actualizarTarea cada vez que cambian hora/duracion.
        horaInicio: { type: String, default: '' },
        horaFin: { type: String, default: '' },
        operarioId: [String],
        operarioNombre: [String],
        valorHora: Number,
        completada: { type: Boolean, default: false },
        // PWA Operativa, modo supervisor (S3): motivo de una tarea NO realizada (ej. cancelada
        // por el cliente). completada sigue en false — el Portal Cliente la sigue mostrando como
        // no terminada, correcto desde su vista — pero con motivo no vacío la tarea ya no bloquea
        // el cierre de la OT: se puede cerrar con todas realizadas O no-realizadas-y-notificadas.
        motivoNoRealizada: { type: String, default: '' },
        // Ingreso de lo realizado en terreno, por tarea (no por OT, a diferencia de OT.reportes
        // que usa ReporteTerreno.jsx). Uno por tarea: se sobreescribe si se vuelve a guardar.
        registro: {
            texto: { type: String, default: '' },
            fotos: [String],
            hora: { type: String, default: '' },
            autor: { type: String, default: '' }
        }
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
    // Referencia a Recurso (el catálogo real de personal que usa todo el resto de la app:
    // Gantt, responsables de tarea), NO a Usuario (acceso móvil PWA, que hoy casi ningún
    // Recurso tiene todavía). Si ese Recurso además tiene Recurso.usuarioId, la OT se
    // refleja en su "mi día"/"mi semana" — ver asignacionController.otsSupervisadasEnFechas.
    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recurso', default: null },
    // Fecha en que se ejecuta el trabajo (distinto de fechaInicio/fechaEntrega, que ya
    // existían sin uso claro en el frontend — este es el campo que la pestaña edita).
    fechaEjecucion: { type: Date, default: null },
    // OC del CLIENTE (texto libre) — no confundir con ordenesCompra de abajo, que son las
    // Ordenes de Compra propias generadas para cubrir faltantes de stock (Gap 3).
    ordenCompra: { type: String, default: '' },
    instruccionesTerreno: { type: String, default: '' },
    // Mejora v3 #6 (Cotización ampliada) — sección "Condiciones comerciales" del PDF.
    condicionesComerciales: {
        validez: { type: String, default: '30 días corridos desde la emisión' },
        plazoPago: { type: String, default: '30 días desde la factura' },
        formaPago: { type: String, default: 'Transferencia electrónica' },
        garantia: { type: String, default: '6 meses por defectos de montaje' },
        plazoEjecucion: { type: String, default: '' },
        noIncluye: { type: String, default: '' },
    },
    // Mejora v3 #5 (Carpeta de OT) — documento interno consolidado, no se envía al cliente.
    carpetaOT: {
        generadoEn: { type: Date, default: null },
        generadoPor: { type: String, default: '' },
        paginas: { type: Number, default: 0 },
        secciones: [String],
    },
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

// getAllData (dataController.js) ordena por createdAt en cada carga/poll de /api/data.
OTSchema.index({ createdAt: -1 });
// mi-dia/mi-semana/mi-panel (PWA Operativa, modo supervisor) filtran por estos dos campos
// en cada request — sin índice, cada llamada hace un collection scan completo. Se vio en
// producción: mi-semana tardaba ~8s con datos reales (la demo, con pocos documentos, nunca
// lo mostró).
OTSchema.index({ supervisorId: 1, estado: 1 });

module.exports = (conn) => conn.models.OT || conn.model('OT', OTSchema);