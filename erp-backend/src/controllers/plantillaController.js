const Plantilla = require('../models/Plantilla');

exports.listar = async (req, res) => {
    try {
        const plantillas = await Plantilla.find().sort({ categoria: 1, nombre: 1 });
        res.json(plantillas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.crear = async (req, res) => {
    try {
        const plantilla = new Plantilla(req.body);
        await plantilla.save();
        res.status(201).json(plantilla);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.actualizar = async (req, res) => {
    try {
        const plantilla = await Plantilla.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );
        if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
        res.json(plantilla);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.eliminar = async (req, res) => {
    try {
        const plantilla = await Plantilla.findByIdAndDelete(req.params.id);
        if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
        res.json({ mensaje: 'Plantilla eliminada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
