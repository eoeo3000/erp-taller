const Calendario = require('../models/Calendario');

// Obtener todos los calendarios
exports.getCalendarios = async (req, res) => {
    try {
        const calendarios = await Calendario.find();
        res.json(calendarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Crear o Actualizar Calendario
exports.guardarCalendario = async (req, res) => {
    try {
        const { id } = req.params;
        const datos = req.body;

        if (id && id !== "null") {
            // USAR $set ES LA CLAVE:
            // Esto obliga a MongoDB a reemplazar todo el objeto config 
            // incluyendo los bloques de horas.
            const actualizado = await Calendario.findByIdAndUpdate(
                id,
                { $set: datos },
                { new: true, runValidators: true }
            );

            if (!actualizado) {
                return res.status(404).json({ error: "Calendario no encontrado" });
            }

            return res.json(actualizado);
        } else {
            // CREAR NUEVO
            const nuevo = new Calendario(datos);
            await nuevo.save();
            return res.status(201).json(nuevo);
        }
    } catch (error) {
        console.error("❌ [Backend] Error al guardar:", error.message);
        res.status(400).json({ error: error.message });
    }
};

// Eliminar Calendario
exports.eliminarCalendario = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Borrar el calendario
        await Calendario.findByIdAndDelete(id);

        // 2. IMPORTANTE: Limpiar los recursos que usaban este calendario
        await Recurso.updateMany(
            { calendarioId: id },
            { $set: { calendarioId: null } }
        );

        res.json({ mensaje: "Calendario eliminado y recursos actualizados" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};