// src/models/DisposicionTabla.js
// Variantes de disposición guardadas del rediseño (ver design_handoff_panel_control/README.md §4).
// Compartidas globalmente: la app no tiene modelo de usuarios ni roles (ver CLAUDE.md), así que
// no hay de dónde sacar un "por usuario" o "por rol" real — cualquiera que abra la pantalla ve
// y aplica las mismas variantes guardadas.
const mongoose = require('mongoose');

const DisposicionTablaSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true },
    pantalla: { type: String, required: true, default: 'panel-control' },
    layout: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

// Guardar con el mismo nombre en la misma pantalla sobrescribe (ver guardarVariante en DashboardScreen.jsx).
DisposicionTablaSchema.index({ pantalla: 1, nombre: 1 }, { unique: true });

module.exports = (conn) => conn.models.DisposicionTabla || conn.model('DisposicionTabla', DisposicionTablaSchema);
