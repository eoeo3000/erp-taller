const getDisposicionTabla = require('../models/DisposicionTabla');

// 1. Listar variantes de una pantalla (?pantalla=panel-control)
exports.obtenerDisposiciones = async (req, res) => {
    const DisposicionTabla = getDisposicionTabla(req.db);
    try {
        const filtro = {};
        if (req.query.pantalla) filtro.pantalla = req.query.pantalla;
        const disposiciones = await DisposicionTabla.find(filtro).sort({ nombre: 1 });
        res.json(disposiciones);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las disposiciones' });
    }
};

// 2. Guardar (crea o sobrescribe si ya existe el mismo nombre en la misma pantalla)
exports.guardarDisposicion = async (req, res) => {
    const DisposicionTabla = getDisposicionTabla(req.db);
    try {
        const { nombre, pantalla, layout } = req.body;
        if (!nombre || !layout) return res.status(400).json({ error: 'Nombre y layout son requeridos' });

        const guardada = await DisposicionTabla.findOneAndUpdate(
            { nombre, pantalla: pantalla || 'panel-control' },
            { nombre, pantalla: pantalla || 'panel-control', layout },
            { new: true, upsert: true, runValidators: true }
        );
        res.status(201).json(guardada);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. Eliminar
exports.eliminarDisposicion = async (req, res) => {
    const DisposicionTabla = getDisposicionTabla(req.db);
    try {
        const eliminada = await DisposicionTabla.findByIdAndDelete(req.params.id);
        if (!eliminada) return res.status(404).json({ error: 'No encontrada' });
        res.json({ mensaje: 'Disposición eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
};
