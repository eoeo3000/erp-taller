const mongoose = require('mongoose');

const OrdenCompraSchema = new mongoose.Schema({
    numeroOC: { type: String, unique: true },
    proveedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Proveedor', required: true },
    otId: { type: mongoose.Schema.Types.ObjectId, ref: 'OT', required: true },
    items: [{
        suministroId: { type: mongoose.Schema.Types.ObjectId, ref: 'Suministro' },
        descripcion: String,
        cantidad: Number,
        precioUnitario: Number
    }],
    estado: {
        type: String,
        enum: ['Emitida', 'Aceptada por proveedor', 'En tránsito', 'Recibida', 'Pagada'],
        default: 'Emitida'
    },
    fechaEmision: { type: Date, default: Date.now },
    fechaRecepcion: { type: Date },
    total: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = (conn) => conn.models.OrdenCompra || conn.model('OrdenCompra', OrdenCompraSchema);
