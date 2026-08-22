// Catálogo transversal de condiciones de entorno (pretil de ácido, a la intemperie,
// energizado, etc.) para el formulario adaptativo del Informe de Evaluación — ver
// docs/plan-formulario-adaptativo.md §3.3. Plano y único: no vive anidado dentro de cada
// TipoTrabajo porque describe el lugar/circunstancias de la faena, no algo propio de un tipo
// de trabajo en particular. Cada TipoTrabajo puede excluir las que no le apliquen
// (TipoTrabajo.condicionesNoAplicables), pero el catálogo en sí es uno solo.
const mongoose = require('mongoose');

const condicionEntornoSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true },
    activo: { type: Boolean, default: true },
}, { timestamps: true });

condicionEntornoSchema.index({ nombre: 1 });

module.exports = (conn) => conn.models.CondicionEntorno || conn.model('CondicionEntorno', condicionEntornoSchema);
