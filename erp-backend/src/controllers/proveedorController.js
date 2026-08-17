const getProveedor = require('../models/Proveedor');

exports.getProveedores = async (req, res) => {
    const Proveedor = getProveedor(req.db);
    try {
        const proveedores = await Proveedor.find().sort({ nombre: 1 });
        res.json(proveedores);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener proveedores" });
    }
};

exports.crearProveedor = async (req, res) => {
    const Proveedor = getProveedor(req.db);
    try {
        const nuevo = new Proveedor(req.body);
        await nuevo.save();
        res.status(201).json(nuevo);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.actualizarProveedor = async (req, res) => {
    const Proveedor = getProveedor(req.db);
    try {
        const actualizado = await Proveedor.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!actualizado) return res.status(404).json({ error: "Proveedor no encontrado" });
        res.json(actualizado);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.eliminarProveedor = async (req, res) => {
    const Proveedor = getProveedor(req.db);
    try {
        const eliminado = await Proveedor.findByIdAndDelete(req.params.id);
        if (!eliminado) return res.status(404).json({ error: "Proveedor no encontrado" });
        res.json({ mensaje: "Proveedor eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar proveedor" });
    }
};
