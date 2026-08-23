// Listas transversales del catálogo de tipos de trabajo (formulario adaptativo, Informe de
// Evaluación) — ver docs/plan-formulario-adaptativo.md §3.3. Valores compartidos por casi
// todos los tipos de trabajo (condiciones de entorno, riesgos, materiales, etc.), separados de
// TipoTrabajo.campos precisamente porque no son propios de ningún tipo en particular: guardarlos
// repetidos dentro de cada TipoTrabajo significaría mantener 30 copias de la misma lista.
const mongoose = require('mongoose');

const valorTransversalSchema = new mongoose.Schema({
    valor: { type: String, required: true, trim: true },
    // Solo la usa hoy la lista 'tareasSecundarias' (Desmontaje/Traslado/Taller/Montaje/Ajuste
    // y verificación) — vacía para el resto de las listas.
    categoria: { type: String, default: '' },
}, { _id: false });

const catalogoTransversalSchema = new mongoose.Schema({
    clave: { type: String, required: true, trim: true, unique: true },
    descripcion: { type: String, default: '' },
    seleccion: { type: String, enum: ['unica', 'multiple'], default: 'multiple' },
    valores: { type: [valorTransversalSchema], default: [] },
}, { timestamps: true });

module.exports = (conn) => conn.models.CatalogoTransversal || conn.model('CatalogoTransversal', catalogoTransversalSchema);
