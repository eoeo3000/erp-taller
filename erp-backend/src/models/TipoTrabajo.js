// Catálogo de tipos de trabajo para el formulario adaptativo del Informe de Evaluación —
// ver docs/plan-formulario-adaptativo.md. Configuración, no código: cada tipo define sus
// propios campos, las opciones válidas de cada campo, sinónimos para el motor de sugerencia
// (búsqueda por palabra clave, ver erp-web/erp-pwa-operativa "hallazgos") y una plantilla de
// texto con marcadores {clave} que resuelve el motor de texto adaptativo.
//
// No es lo mismo que Plantilla (erp-backend/src/models/Plantilla.js): Plantilla es un
// paquete de tareas/componentes/logística ya armado para insertar de una vez en una OT.
// TipoTrabajo es un esquema de campos para describir UNA observación de terreno y generar su
// texto — conceptos distintos, decisión documentada en el plan (§2), sin fusionar.
const mongoose = require('mongoose');

const TIPOS_DATO_CAMPO = ['texto', 'numero', 'seleccionUnica', 'seleccionMultiple', 'fecha', 'foto'];

const campoSchema = new mongoose.Schema({
    clave: { type: String, required: true, trim: true },
    etiqueta: { type: String, required: true, trim: true },
    tipoDato: { type: String, enum: TIPOS_DATO_CAMPO, required: true },
    // Solo tiene sentido para seleccionUnica/seleccionMultiple; se deja disponible para
    // cualquier tipoDato sin validación cruzada, mismo criterio laxo que el resto del proyecto
    // (CLAUDE.md: "sin validaciones complejas").
    opciones: { type: [String], default: [] },
    obligatorio: { type: Boolean, default: false },
    orden: { type: Number, default: 0 },
}, { _id: false });

// Enlaza las filas de "Campos"/"Opciones"/"Sugerencias por tipo" de un mismo archivo Excel
// con este tipo (docs/plan-formulario-adaptativo.md §3.1) — reemplaza a `nombre` como llave
// de upsert de la importación: si el tipo se retitula, el código no cambia y las hojas
// relacionadas siguen enlazando al mismo documento.
const sugerenciaSchema = new mongoose.Schema({
    lista: { type: String, required: true, trim: true },
    valor: { type: String, required: true, trim: true },
}, { _id: false });

const tipoTrabajoSchema = new mongoose.Schema({
    codigoTipo: { type: String, required: true, trim: true, uppercase: true, unique: true },
    nombre: { type: String, required: true, trim: true },
    sinonimos: { type: [String], default: [] },
    plantillaTexto: { type: String, default: '' },
    campos: { type: [campoSchema], default: [] },
    // Valores de la lista transversal 'condicionesEntorno' (ver CatalogoTransversal) que no
    // tiene sentido ofrecer para este tipo — lista de exclusión, no de inclusión: por
    // defecto el catálogo completo está disponible para todos (plan §3.1).
    condicionesNoAplicables: { type: [String], default: [] },
    // Qué valores de qué listas transversales vienen premarcados al elegir este tipo
    // (plan §3.3.1) — solo tareasSecundarias/materiales/riesgos las usan hoy, pero no se
    // restringe por schema para no bloquear un catálogo futuro que agregue otra.
    sugerencias: { type: [sugerenciaSchema], default: [] },
    activo: { type: Boolean, default: true },
}, { timestamps: true });

tipoTrabajoSchema.index({ nombre: 1 });

module.exports = (conn) => conn.models.TipoTrabajo || conn.model('TipoTrabajo', tipoTrabajoSchema);
module.exports.TIPOS_DATO_CAMPO = TIPOS_DATO_CAMPO;
