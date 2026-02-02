const mongoose = require('mongoose');

const EquiposHerramientasSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    tipo: { type: String, enum: ['Herramienta', 'Maquinaria', 'Instrumento'] },
    precio: { type: Number, default: 0 }, // 🚩 AGREGA ESTO
    codigo: { type: String },
    estado: {
        type: String,
        enum: ['Disponible', 'En Uso', 'Mantenimiento', 'Reparación'],
        default: 'Disponible'
    },
    fechaRegistro: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EquiposHerramientas', EquiposHerramientasSchema);