const mongoose = require('mongoose');

const LineaSchema = new mongoose.Schema({
    cuentaId:     { type: mongoose.Schema.Types.ObjectId, ref: 'CuentaContable', required: true },
    cuentaCodigo: { type: String, default: '' },
    cuentaNombre: { type: String, default: '' },
    debe:         { type: Number, default: 0 },
    haber:        { type: Number, default: 0 },
    glosa:        { type: String, default: '' }
}, { _id: false });

const AsientoContableSchema = new mongoose.Schema({
    numeroAsiento: { type: String, unique: true },
    fecha:         { type: String, required: true },
    descripcion:   { type: String, required: true },
    tipo:          { type: String, enum: ['automatico', 'manual'], default: 'manual' },
    origen: {
        tipo:          { type: String, enum: ['OT', 'PagoPersonal', 'Manual', 'Ajuste'], default: 'Manual' },
        referenciaId:  { type: mongoose.Schema.Types.ObjectId, default: null },
        referenciaNro: { type: String, default: '' }
    },
    lineas:      [LineaSchema],
    totalDebe:   { type: Number, default: 0 },
    totalHaber:  { type: Number, default: 0 },
    estado:      { type: String, enum: ['vigente', 'anulado'], default: 'vigente' },
    anulacion: {
        fechaAnulacion:    { type: String, default: '' },
        motivoAnulacion:   { type: String, default: '' },
        asientoReversaId:  { type: mongoose.Schema.Types.ObjectId, ref: 'AsientoContable', default: null }
    },
    creadoPor: { type: String, default: 'Sistema' }
}, { timestamps: true });

module.exports = mongoose.models.AsientoContable || mongoose.model('AsientoContable', AsientoContableSchema);
