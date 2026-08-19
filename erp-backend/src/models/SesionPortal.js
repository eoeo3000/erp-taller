// Sesión de acceso al Portal del Cliente. Dos orígenes conviven en la misma colección
// (decisión explícita, ver docs/rediseno/design_handoff_mejoras_v3): autoservicio, cuando
// el cliente entra por teléfono + número de solicitud (portalController.acceso, C1 de la
// PWA) — no hay Cliente asociado, solo telefono/empresaSolicitante en texto libre; y
// emitido por la oficina desde la "Bodega de tokens" (clienteId/contactoId reales, con
// alcance elegido). No es un Usuario (el Cliente sigue sin cuenta, ver estrategia-movil.md
// §7.1) — es un token de dispositivo, con vencimiento y revocable desde la oficina.
// Se guarda el HASH del token, no el token: un volcado de esta colección no debe alcanzar
// para suplantar una sesión activa. El token en claro solo existe una vez, en la respuesta
// del endpoint que lo emite.
const mongoose = require('mongoose');

const SesionPortalSchema = new mongoose.Schema({
    // 'operativo' queda declarado para cuando exista ese flujo (hoy los tokens operativos
    // se emiten desde Usuario/Recurso, no desde acá) — alcance de esta entrega: solo cliente.
    tipo: { type: String, enum: ['cliente', 'operativo'], default: 'cliente' },

    // Origen autoservicio (portalController.acceso) — texto libre, sin Cliente asociado.
    telefono: { type: String, trim: true, default: '' },
    empresaSolicitante: { type: String, default: '' },

    // Origen "Bodega de tokens" (emitido por la oficina).
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', default: null },
    contactoId: { type: mongoose.Schema.Types.ObjectId, default: null }, // subdocumento de Cliente.contactos
    // 'empresa': ve todas las solicitudes/OT de la empresa. 'propias': solo las que se
    // originaron a nombre de este contacto puntual (correo/teléfono del contacto).
    alcance: { type: String, enum: ['empresa', 'propias'], default: 'empresa' },

    tokenHash: { type: String, default: '' }, // vacío = token pre-generado sin asignar todavía (stock)
    expira: { type: Date, required: true },
    estado: { type: String, enum: ['activo', 'revocado'], default: 'activo' },

    emitidoEn: { type: Date, default: Date.now },
    // Texto libre: no existe sesión de staff interno (mismo criterio que OT.asignadaPor).
    emitidoPor: { type: String, default: '' },
    revocadoEn: { type: Date, default: null },
    revocadoPor: { type: String, default: '' },

    ultimoAcceso: { type: Date, default: null },
    // Log de accesos: una entrada por cada uso del token (mis-solicitudes).
    accesos: [{
        fecha: { type: Date, default: Date.now },
        ip: String,
        userAgent: String,
    }],
}, { timestamps: true });

module.exports = (conn) => conn.models.SesionPortal || conn.model('SesionPortal', SesionPortalSchema);
