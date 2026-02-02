const Suministro = require('../models/suministro');

// 1. Obtener todos los registros de logística
exports.getSuministros = async (req, res) => {
    try {
        const suministros = await Suministro.find().sort({ fechaRegistro: -1 });
        res.json(suministros);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener suministros" });
    }
};

// 2. Crear un nuevo registro de logística (Camión, Patente, Ruta)
exports.crearSuministro = async (req, res) => {
    try {
        const nuevoSuministro = new Suministro(req.body);
        await nuevoSuministro.save();
        res.status(201).json(nuevoSuministro);
    } catch (error) {
        console.error("Error en crearSuministro:", error);
        res.status(400).json({ error: "Error al registrar suministro" });
    }
};

// 3. Eliminar un registro
exports.eliminarSuministro = async (req, res) => {
    try {
        const { id } = req.params;
        const eliminado = await Suministro.findByIdAndDelete(id);

        if (!eliminado) {
            return res.status(404).json({ error: "Registro no encontrado" });
        }

        res.json({ mensaje: "Registro eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar registro" });
    }
};
// ... (tus otras funciones get y crear)

exports.actualizarSuministro = async (req, res) => {
    try {
        const { id } = req.params;
        const datosNuevos = req.body;

        const actualizado = await Suministro.findByIdAndUpdate(
            id,
            datosNuevos,
            { new: true, runValidators: true }
        );

        if (!actualizado) {
            return res.status(404).json({ error: "No se encontró el registro para actualizar" });
        }

        res.json(actualizado);
    } catch (error) {
        console.error("Error en actualizarSuministro:", error);
        res.status(400).json({ error: "Error al procesar la actualización" });
    }
};