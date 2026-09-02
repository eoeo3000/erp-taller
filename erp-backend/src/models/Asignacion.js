// Asignación de una persona a un trabajo — colección propia, no una extensión de
// OT.tareas (decisión y motivo en docs/estrategia-movil.md §7.2). Una asignación de
// tipo 'evaluacion' apunta a una Solicitud (todavía no hay OT ni tareas en ese punto);
// 'ejecucion'/'supervision' apuntan a una OT, opcionalmente a una tarea puntual dentro
// de ella (tareaId guarda el _id del subdocumento OT.tareas, sin ref porque OT.tareas
// no es una colección propia).
const mongoose = require('mongoose');

const AsignacionSchema = new mongoose.Schema({
    tipo: { type: String, enum: ['evaluacion', 'ejecucion', 'supervision'], required: true },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    otId: { type: mongoose.Schema.Types.ObjectId, ref: 'OT' },
    solicitudId: { type: mongoose.Schema.Types.ObjectId, ref: 'Solicitud' },
    tareaId: { type: String, default: '' },
    fechaPlanificada: { type: String, default: '' },
    // Solo la usa tipo 'evaluacion' (S4 · Solicitudes, filtro "Sin informe inicial"): la visita agendada lleva
    // hora además de fecha, a diferencia de 'ejecucion'/'supervision' que ya tienen su hora
    // real en OT.tareas[].horaInicio.
    horaPlanificada: { type: String, default: '' },
    fechaReal: { type: String, default: '' },
    estado: { type: String, enum: ['pendiente', 'en_curso', 'completada', 'cancelada'], default: 'pendiente' },
}, { timestamps: true });

AsignacionSchema.pre('validate', function () {
    if (!this.otId && !this.solicitudId) {
        throw new Error('Una Asignacion necesita otId o solicitudId.');
    }
});

// "Tomar solicitud" (S4 · Solicitudes) tiene que ser un solo PUT atómico y sin confirmación de oficina:
// si dos supervisores la abren a la vez, el segundo debe chocar contra esto (código 11000)
// y no crear una segunda Asignacion de evaluación para la misma Solicitud. sparse porque
// 'ejecucion'/'supervision' no usan solicitudId — no deben competir por este índice.
AsignacionSchema.index({ solicitudId: 1 }, { unique: true, sparse: true });
// mi-dia/mi-semana (PWA Operativa) filtran por estos dos campos en cada request — mismo
// motivo que el índice nuevo de OT.supervisorId+estado: sin él, cada llamada es un
// collection scan completo, invisible en la demo y real en producción.
AsignacionSchema.index({ usuarioId: 1, fechaPlanificada: 1 });

module.exports = (conn) => conn.models.Asignacion || conn.model('Asignacion', AsignacionSchema);
