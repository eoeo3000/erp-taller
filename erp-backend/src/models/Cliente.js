// Mejora v3 #2 (Emisión de acceso cliente): no existía ninguna colección de empresas ni
// contactos — "cliente" era solo texto libre repetido en cada Solicitud/OT
// (empresaSolicitante, solicitante, correo, numero). Este modelo es la base mínima real
// que necesita el módulo de tokens (elegir empresa → elegir contacto), poblable desde las
// Solicitudes ya existentes en vez de partir de cero (ver clienteController.poblarDesdeSolicitudes).
const mongoose = require('mongoose');

const ContactoSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    correo: { type: String, default: '' },
    telefono: { type: String, default: '' },
    cargo: { type: String, default: '' },
});

const ClienteSchema = new mongoose.Schema({
    empresa: { type: String, required: true, trim: true },
    direccion: { type: String, default: '' },
    contactos: [ContactoSchema],
}, { timestamps: true });

module.exports = (conn) => conn.models.Cliente || conn.model('Cliente', ClienteSchema);
