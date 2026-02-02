const Equipo = require('../models/equiposHerramientas');

// 1. Obtener todos los equipos
exports.getEquipos = async (req, res) => {
    try {
        const equipos = await Equipo.find().sort({ fechaRegistro: -1 });
        res.json(equipos);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener equipos" });
    }
};

// 2. Crear un nuevo equipo
exports.crearEquipo = async (req, res) => {
    try {
        const nuevoEquipo = new Equipo(req.body);
        await nuevoEquipo.save();
        res.status(201).json(nuevoEquipo);
    } catch (error) {
        console.error("Error en crearEquipo:", error);
        res.status(400).json({ error: "No se pudo crear el equipo" });
    }
};

// 3. Eliminar un equipo
exports.eliminarEquipo = async (req, res) => {
    try {
        const { id } = req.params;
        const equipoEliminado = await Equipo.findByIdAndDelete(id);

        if (!equipoEliminado) {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }

        res.json({ mensaje: "Equipo eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar el equipo" });
    }
};
// 4. Actualizar un equipo existente
exports.actualizarEquipo = async (req, res) => {
    try {
        const { id } = req.params;
        const datosActualizados = req.body;

        // Buscamos por ID y actualizamos con los nuevos datos
        const equipo = await Equipo.findByIdAndUpdate(
            id,
            datosActualizados,
            {
                new: true,          // Devuelve el documento actualizado, no el viejo
                runValidators: true // Obliga a validar contra el Schema (importante por el enum)
            }
        );

        if (!equipo) {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }

        res.json(equipo);
    } catch (error) {
        console.error("❌ Error en actualizarEquipo:", error);
        res.status(400).json({ error: "No se pudo actualizar el equipo" });
    }
};