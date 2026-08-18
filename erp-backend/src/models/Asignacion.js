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
    fechaReal: { type: String, default: '' },
    estado: { type: String, enum: ['pendiente', 'en_curso', 'completada', 'cancelada'], default: 'pendiente' },
}, { timestamps: true });

AsignacionSchema.pre('validate', function () {
    if (!this.otId && !this.solicitudId) {
        throw new Error('Una Asignacion necesita otId o solicitudId.');
    }
});

module.exports = (conn) => conn.models.Asignacion || conn.model('Asignacion', AsignacionSchema);
