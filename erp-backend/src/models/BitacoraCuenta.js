// Qué pasó con las cuentas de este taller: quién invitó a quién, quién entró, quién revocó.
//
// Nace de una semana entera sin poder contestar «¿esta cuenta estuvo activa alguna vez?».
// `ultimoAccesoSpa` dice *cuándo fue la última vez*, y nada más: no dice quién la creó, ni si
// alguien la revocó y la reactivó, ni desde dónde se entró. Las OT ya tenían su `bitacora`;
// las cuentas no tenían nada, y son justamente sobre lo que llegan las preguntas incómodas.
//
// **Vive en la base DEL TALLER, no en la de control.** Es su dato: le pertenece a ese
// cliente, viaja en su respaldo (`respaldo.js` toma las colecciones de la base, así que esta
// entra sola) y se restaura con él. Ponerla en control haría que restaurar a un cliente le
// devolviera sus datos sin su historia.
//
// **Nunca guarda credenciales.** Ni el hash de la clave, ni el token de la PWA, ni el de
// recuperación. Lo que se registra es que algo pasó, no con qué se hizo.
const mongoose = require('mongoose');

// Qué puede pasar. Lista cerrada a propósito: un `enum` obliga a nombrar el evento nuevo acá
// y no deja que cada controlador invente el suyo, que es como una bitácora termina con
// 'revocar', 'revocada' y 'REVOCAR' significando lo mismo.
const ACCIONES = [
    'invitada', 'invitacion-reenviada', 'activada',
    'ingreso', 'ingreso-bloqueado',
    'clave-cambiada', 'clave-restablecida',
    'revocada', 'reactivada', 'editada',
];

// Dos años. Un registro de accesos que se borra solo no sirve de mucho, pero uno que crece
// sin techo tampoco: el clúster es compartido entre todos los talleres y lo que se llene acá
// le resta a los demás (ver servicios/limites.js). Dos años cubre de sobra el caso real
// —«¿qué pasó con esta cuenta?»— y deja la colección acotada.
const DIAS_RETENCION = 730;

const BitacoraCuentaSchema = new mongoose.Schema({
    // Sin `index: true` acá: el índice se declara abajo con el TTL, y declararlo en los dos
    // lados crea dos índices sobre el mismo campo (Mongoose avisa, pero el segundo se crea
    // igual y se paga en cada escritura).
    cuando: { type: Date, default: Date.now },
    accion: { type: String, enum: ACCIONES, required: true },

    // Sobre quién. Se guardan los DOS: el id para poder filtrar por cuenta aunque le cambien
    // el correo, y el correo para que la línea siga siendo legible si esa cuenta se borró.
    usuarioId: { type: mongoose.Schema.Types.ObjectId, index: true },
    email: { type: String, default: '' },

    // Quién lo hizo. Vacío cuando lo hizo la propia persona (entrar, activar su invitación)
    // o cuando vino del panel, que no es una cuenta de esta base — para eso está `origen`.
    porNombre: { type: String, default: '' },
    porEmail: { type: String, default: '' },

    // 'app' (alguien con sesión en este taller), 'panel' (quien arrienda el sistema),
    // 'script' (crearAdmin.js y compañía). Sin esto, «revocada» no dice si fue la oficina o
    // el proveedor, que es media respuesta.
    origen: { type: String, enum: ['app', 'panel', 'script'], default: 'app' },

    ip: { type: String, default: '' },
    detalle: { type: String, default: '' },
});

// Mongo borra solas las líneas viejas. Va sobre `cuando`, que ya está indexado para listar.
BitacoraCuentaSchema.index({ cuando: 1 }, { expireAfterSeconds: DIAS_RETENCION * 24 * 60 * 60 });

module.exports = (conn) => conn.models.BitacoraCuenta || conn.model('BitacoraCuenta', BitacoraCuentaSchema);
module.exports.ACCIONES = ACCIONES;
module.exports.DIAS_RETENCION = DIAS_RETENCION;
