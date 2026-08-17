const mongoose = require('mongoose');

const MovimientoStockSchema = new mongoose.Schema({
    suministroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Suministro', required: true },
    tipo: {
        type: String,
        enum: ['Ingreso', 'Salida', 'Ajuste', 'Reserva', 'Liberación'],
        required: true
    },
    cantidad: { type: Number, required: true },
    fecha: { type: Date, default: Date.now },
    otId: { type: mongoose.Schema.Types.ObjectId, ref: 'OT' },
    motivo: { type: String, default: '' },
    usuario: { type: String, default: '' }
});

module.exports = (conn) => conn.models.MovimientoStock || conn.model('MovimientoStock', MovimientoStockSchema);
