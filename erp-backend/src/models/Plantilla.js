const mongoose = require('mongoose');

const plantillaSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    descripcion: { type: String, default: '' },
    categoria: { type: String, default: 'General' },
    procedimiento: { type: String, default: '' },
    tareas: [{
        descripcion: String,
        puesto: String,
        duracion: Number
        // fecha, hora y operario los completa el usuario al aplicar la plantilla
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
}, {
    timestamps: true,
    collection: 'plantillas'
});

module.exports = (conn) => conn.models.Plantilla || conn.model('Plantilla', plantillaSchema);
