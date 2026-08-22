// CRUD del catálogo de tipos de trabajo (formulario adaptativo, Informe de Evaluación) — ver
// docs/plan-formulario-adaptativo.md.
const getTipoTrabajo = require('../models/TipoTrabajo');
const getOT = require('../models/OT');

exports.obtenerTiposTrabajo = async (req, res) => {
    const TipoTrabajo = getTipoTrabajo(req.db);
    try {
        const tipos = await TipoTrabajo.find().sort({ nombre: 1 });
        res.json(tipos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener el catálogo de tipos de trabajo' });
    }
};

exports.crearTipoTrabajo = async (req, res) => {
    const TipoTrabajo = getTipoTrabajo(req.db);
    try {
        const nuevo = new TipoTrabajo(req.body);
        await nuevo.save();
        res.status(201).json(nuevo);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear el tipo de trabajo', error: error.message });
    }
};

exports.actualizarTipoTrabajo = async (req, res) => {
    const TipoTrabajo = getTipoTrabajo(req.db);
    try {
        const actualizado = await TipoTrabajo.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json(actualizado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar', error: error.message });
    }
};

exports.eliminarTipoTrabajo = async (req, res) => {
    const TipoTrabajo = getTipoTrabajo(req.db);
    try {
        await TipoTrabajo.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Tipo de trabajo eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar' });
    }
};

// GET /api/tipos-trabajo/casos-no-cubiertos — plan §9: hallazgos donde el supervisor no pudo
// (o no quiso) usar el catálogo, para que quien lo administra decida si conviene agregar un
// tipo de trabajo, una opción, o un sinónimo nuevo. Recorre todas las OT porque los hallazgos
// viven embebidos en OT.informeEvaluacion — no hay colección propia (ver plan §3.4).
exports.casosNoCubiertos = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const ots = await OT.find({ 'informeEvaluacion.hallazgos.casoNoCubierto': true })
            .select('numeroOT solicitante informeEvaluacion.hallazgos')
            .lean();

        const casos = [];
        for (const ot of ots) {
            for (const h of ot.informeEvaluacion?.hallazgos || []) {
                if (!h.casoNoCubierto) continue;
                casos.push({
                    otId: ot._id,
                    numeroOT: ot.numeroOT,
                    solicitante: ot.solicitante,
                    hallazgoId: h._id,
                    tieneTipoTrabajo: !!h.tipoTrabajoId,
                    texto: h.textoDescriptivo,
                    fecha: h.fecha,
                });
            }
        }
        casos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        res.json(casos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener casos no cubiertos', error: error.message });
    }
};
