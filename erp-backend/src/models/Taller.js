// El cliente que arrienda el sistema. Vive en la BASE DE CONTROL, no en la de ningún taller
// — es el único modelo del proyecto que no se guarda junto a los datos de trabajo, porque
// es justamente el que dice dónde están esos datos.
//
// Etapa 2 de docs/multi-taller.md.
const mongoose = require('mongoose');

const TallerSchema = new mongoose.Schema({
    // El identificador corto. Es el mismo que viaja como prefijo del token de sesión
    // (`principal.a3f9…`), así que no puede llevar puntos: el punto es el separador.
    // La validación de forma vive en config/talleres.js, una sola vez.
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    nombre: { type: String, required: true, trim: true },

    // 'activo'      — opera normalmente.
    // 'suspendido'  — no se puede entrar a operar; es el día 0 de la baja (§9.4) y también
    //                 la palanca para un impago. Se deshace volviendo a 'activo'.
    // 'baja'        — canceló. Sus datos siguen existiendo hasta el borrado del día 30, que
    //                 es otra etapa; acá solo se marca, y marcar se puede deshacer.
    estado: { type: String, enum: ['activo', 'suspendido', 'baja'], default: 'activo' },

    plan: { type: String, default: '' },

    // Dónde viven sus datos. **Es una credencial**: lleva usuario y clave de Mongo, así que
    // NUNCA sale por la API (ver tallerController.publico). Guardarla acá es lo que permite
    // mover un taller que creció a su propio clúster cambiando un campo, sin rehacer nada
    // (§9.1).
    mongoUri: { type: String, required: true },

    fechaAlta: { type: Date, default: Date.now },
    // Cuándo pasó a 'baja'. Es lo que va a contar los 10 días de descarga y los 30 del
    // borrado (§9.4) cuando se construya esa etapa.
    fechaBaja: { type: Date, default: null },
}, { timestamps: true });

// Fábrica, igual que el resto de los modelos: recibe la conexión en vez de usar la global.
// Acá la conexión es siempre la de control, pero la forma se mantiene para que el archivo se
// lea como todos los demás.
module.exports = (conn) => conn.models.Taller || conn.model('Taller', TallerSchema);
