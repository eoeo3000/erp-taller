const getPuesto = require('../models/puesto');

// Obtener todos los puestos
exports.obtenerPuestos = async (req, res) => {
    const Puesto = getPuesto(req.db);
    try {
        const puestos = await Puesto.find().sort({ nombre: 1 });
        res.json(puestos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener puestos' });
    }
};

// Crear un nuevo puesto
exports.crearPuesto = async (req, res) => {
    const Puesto = getPuesto(req.db);
    try {
        const nuevoPuesto = new Puesto(req.body);
        await nuevoPuesto.save();
        res.status(201).json(nuevoPuesto);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al crear el puesto', error });
    }
};

// Actualizar un puesto
exports.actualizarPuesto = async (req, res) => {
    const Puesto = getPuesto(req.db);
    try {
        const puestoActualizado = await Puesto.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(puestoActualizado);
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar' });
    }
};

// Eliminar un puesto
exports.eliminarPuesto = async (req, res) => {
    const Puesto = getPuesto(req.db);
    try {
        await Puesto.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Puesto eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar' });
    }
};