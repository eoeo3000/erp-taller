const getSuministro = require('../models/suministro');
const getMovimientoStock = require('../models/MovimientoStock');

// 1. Obtener todos los registros de logística
exports.getSuministros = async (req, res) => {
    const Suministro = getSuministro(req.db);
    try {
        const suministros = await Suministro.find().sort({ fechaRegistro: -1 });
        res.json(suministros);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener suministros" });
    }
};

// 2. Crear un nuevo registro de logística (Camión, Patente, Ruta)
exports.crearSuministro = async (req, res) => {
    const Suministro = getSuministro(req.db);
    try {
        const nuevoSuministro = new Suministro(req.body);
        await nuevoSuministro.save();
        res.status(201).json(nuevoSuministro);
    } catch (error) {
        console.error("❌ Error en crearSuministro:", error.message);

        // Si el código está duplicado (Error 11000 en MongoDB)
        if (error.code === 11000) {
            return res.status(400).json({ error: "Ese código ya está registrado" });
        }

        // Si fallan las validaciones del Schema (precio, enum, etc)
        res.status(400).json({ error: error.message });
    }
};

// 3. Eliminar un registro
exports.eliminarSuministro = async (req, res) => {
    const Suministro = getSuministro(req.db);
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
    const Suministro = getSuministro(req.db);
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

// 5. Ajuste manual de stock (suma o resta stockActual) + registra el movimiento
exports.ajustarStock = async (req, res) => {
    const Suministro = getSuministro(req.db);
    const MovimientoStock = getMovimientoStock(req.db);
    try {
        const { id } = req.params;
        const { cantidad, tipo, motivo, usuario, otId } = req.body;

        const delta = Number(cantidad);
        if (!delta) return res.status(400).json({ error: "La cantidad debe ser distinta de cero" });

        const tipoMovimiento = tipo || (delta > 0 ? 'Ingreso' : 'Ajuste');

        const suministro = await Suministro.findByIdAndUpdate(
            id,
            { $inc: { stockActual: delta } },
            { new: true, runValidators: true }
        );
        if (!suministro) return res.status(404).json({ error: "Suministro no encontrado" });

        await MovimientoStock.create({
            suministroId: id,
            tipo: tipoMovimiento,
            cantidad: delta,
            motivo: motivo || '',
            usuario: usuario || '',
            otId: otId || undefined
        });

        res.json(suministro);
    } catch (error) {
        console.error("Error en ajustarStock:", error);
        res.status(400).json({ error: "Error al ajustar el stock" });
    }
};

// 6. Historial de movimientos de un suministro
exports.getMovimientosStock = async (req, res) => {
    const MovimientoStock = getMovimientoStock(req.db);
    try {
        const { id } = req.params;
        const movimientos = await MovimientoStock.find({ suministroId: id }).sort({ fecha: -1 });
        res.json(movimientos);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener el historial de movimientos" });
    }
};