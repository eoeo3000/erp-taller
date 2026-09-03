const mongoose = require('mongoose');

const solicitudSchema = new mongoose.Schema({
    // --- Campos de Identificación y Contacto ---
    solicitante: { type: String, required: true }, // Nombre del contacto
    empresaSolicitante: { type: String, required: true },
    // Referencia real a Cliente (resuelta/creada en solicitudController al guardar) — antes
    // "Empresa" era solo texto libre repetido en cada Solicitud, sin ninguna relación real
    // con el catálogo de Clientes. Se mantiene empresaSolicitante como el nombre tal cual se
    // escribió en ese momento (documentos/correos ya emitidos siguen mostrando ESE texto);
    // clienteId es lo que usan las pantallas de trabajo (Ingreso, Panel de control,
    // Antecedentes) para mostrar el nombre ACTUAL del Cliente, aunque se haya renombrado.
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', default: null },
    correo: { type: String, lowercase: true, trim: true },
    numero: { type: String },
    direccion: { type: String },

    // --- Detalles de la Solicitud ---
    descripcion: { type: String, required: true },
    origen: { type: String, default: 'WhatsApp' },
    estado: { type: String, default: 'Pendiente' },
    // Detalle de la cancelación hecha por el cliente desde su app, cuando la solicitud todavía
    // no llegó a ser OT (con OT el detalle vive en OT.cancelada, ver portalController.
    // cancelarSolicitud). Antes de esto, cancelar sin OT solo dejaba estado:'Cancelada' y el
    // motivo se perdía. fechaPropuesta vacía = "sin fecha, hasta nuevo aviso".
    cancelacion: {
        motivo: { type: String, default: '' },
        fecha: { type: Date, default: null },
        fechaPropuesta: { type: String, default: '' },
        // Qué estado tenía antes de cancelarse, para poder devolverlo exactamente a ese si el
        // cliente anula la cancelación (reactivarSolicitud). Sin esto habría que adivinarlo.
        estadoPrevio: { type: String, default: '' },
    },

    // --- Tiempos y Plazos ---
    fechaHoraSolicitud: { type: Date, default: Date.now }, // Cuándo entró el pedido
    fechaEjecucionSolicitada: { type: Date }, // Para cuándo lo quiere el cliente
    plazoEjecucionSugerido: { type: String }, // Ejemplo: "15 días hábiles"

    // --- Documentación ---
    adjuntos: { type: String },

    // --- Control Interno ---
    fechaCreacion: { type: Date, default: Date.now },
    numeroSolicitud: { type: String }
}, {
    timestamps: true,
    collection: 'solicitudes'
});

// getAllData (dataController.js) y obtenerSolicitudes (solicitudController.js) ordenan por
// fechaCreacion en cada carga/poll.
solicitudSchema.index({ fechaCreacion: -1 });
// mi-panel (PWA Operativa, S1) filtra por estado en cada request — mismo motivo que los
// índices de OT/Asignacion: sin él, es un collection scan completo.
solicitudSchema.index({ estado: 1 });

module.exports = (conn) => conn.models.Solicitud || conn.model('Solicitud', solicitudSchema);