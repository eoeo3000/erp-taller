const mongoose = require('mongoose');

const RegistroPagoRecursoSchema = new mongoose.Schema({
    recursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recurso', required: true },
    recursoNombre: { type: String, default: '' },
    fecha: { type: String, required: true }, // YYYY-MM-DD
    horasTrabajadas: { type: Number, default: 8 },
    tarifaHora: { type: Number, default: 0 },
    totalDia: { type: Number, default: 0 },
    pagado: { type: Boolean, default: false },
    fechaPago: { type: String, default: '' },
    metodoPago: { type: String, default: 'Transferencia' },
    notas: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('RegistroPagoRecurso', RegistroPagoRecursoSchema);
