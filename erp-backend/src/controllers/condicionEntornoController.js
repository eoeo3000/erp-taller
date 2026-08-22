// CRUD simple del catálogo transversal de condiciones de entorno — ver
// docs/plan-formulario-adaptativo.md §3.3.
const getCondicionEntorno = require('../models/CondicionEntorno');

exports.obtenerCondiciones = async (req, res) => {
    const CondicionEntorno = getCondicionEntorno(req.db);
    try {
        const condiciones = await CondicionEntorno.find().sort({ nombre: 1 });
        res.json(condiciones);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener condiciones de entorno' });
    }
};

exports.crearCondicion = async (req, res) => {
    const CondicionEntorno = getCondicionEntorno(req.db);
    try {
        const nueva = new CondicionEntorno(req.body);
        await nueva.save();
        res.status(201).json(nueva);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear la condición de entorno', error: error.message });
    }
};

exports.actualizarCondicion = async (req, res) => {
    const CondicionEntorno = getCondicionEntorno(req.db);
    try {
        const actualizada = await CondicionEntorno.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json(actualizada);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar', error: error.message });
    }
};

exports.eliminarCondicion = async (req, res) => {
    const CondicionEntorno = getCondicionEntorno(req.db);
    try {
        await CondicionEntorno.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Condición de entorno eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar' });
    }
};
