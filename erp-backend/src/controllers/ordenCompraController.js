const getOrdenCompra = require('../models/OrdenCompra');
const getProveedor = require('../models/Proveedor');
const getSuministro = require('../models/suministro');
const getMovimientoStock = require('../models/MovimientoStock');
const getOT = require('../models/OT');
const transporter = require('../config/mailer');

async function generarNumeroOC(conn) {
    const OrdenCompra = getOrdenCompra(conn);
    const anio = new Date().getFullYear();
    const prefijo = `OC-${anio}-`;
    const ultima = await OrdenCompra.findOne({ numeroOC: { $regex: new RegExp(`^${prefijo}`) } }).sort({ numeroOC: -1 });
    let siguiente = 1;
    if (ultima?.numeroOC) {
        const partes = ultima.numeroOC.split('-');
        const n = parseInt(partes[partes.length - 1]);
        if (!isNaN(n)) siguiente = n + 1;
    }
    return `${prefijo}${siguiente.toString().padStart(4, '0')}`;
}

const calcularTotal = (items = []) => items.reduce((sum, it) => sum + (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0), 0);

// 1. Listar (filtrable por ?otId=)
exports.getOrdenesCompra = async (req, res) => {
    const OrdenCompra = getOrdenCompra(req.db);
    try {
        const filtro = {};
        if (req.query.otId) filtro.otId = req.query.otId;
        const ordenes = await OrdenCompra.find(filtro).populate('proveedorId').sort({ createdAt: -1 });
        res.json(ordenes);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener órdenes de compra" });
    }
};

// 2. Crear (manual, asociada a una OT)
exports.crearOrdenCompra = async (req, res) => {
    const OrdenCompra = getOrdenCompra(req.db);
    const OT = getOT(req.db);
    try {
        const { proveedorId, otId, items } = req.body;
        if (!proveedorId || !otId) return res.status(400).json({ error: "Proveedor y OT son requeridos" });

        const numeroOC = await generarNumeroOC(req.db);
        const nueva = await OrdenCompra.create({
            numeroOC,
            proveedorId,
            otId,
            items: items || [],
            total: calcularTotal(items)
        });

        await OT.findByIdAndUpdate(otId, { $push: { ordenesCompra: nueva._id } });

        const conProveedor = await nueva.populate('proveedorId');
        res.status(201).json(conProveedor);
    } catch (error) {
        console.error("Error en crearOrdenCompra:", error);
        res.status(400).json({ error: error.message });
    }
};

// 3. Actualizar (items, estado manual, etc.)
exports.actualizarOrdenCompra = async (req, res) => {
    const OrdenCompra = getOrdenCompra(req.db);
    try {
        const datos = { ...req.body };
        if (datos.items) datos.total = calcularTotal(datos.items);

        const actualizada = await OrdenCompra.findByIdAndUpdate(req.params.id, datos, { new: true, runValidators: true }).populate('proveedorId');
        if (!actualizada) return res.status(404).json({ error: "Orden de compra no encontrada" });
        res.json(actualizada);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 4. Eliminar
exports.eliminarOrdenCompra = async (req, res) => {
    const OrdenCompra = getOrdenCompra(req.db);
    const OT = getOT(req.db);
    try {
        const eliminada = await OrdenCompra.findByIdAndDelete(req.params.id);
        if (!eliminada) return res.status(404).json({ error: "Orden de compra no encontrada" });
        await OT.findByIdAndUpdate(eliminada.otId, { $pull: { ordenesCompra: eliminada._id } });
        res.json({ mensaje: "Orden de compra eliminada correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar la orden de compra" });
    }
};

// 5. Enviar por correo al proveedor (Brevo) — solo cambia estado a 'Emitida' si seguía así, no fuerza avance
exports.enviarOrdenCompra = async (req, res) => {
    const OrdenCompra = getOrdenCompra(req.db);
    try {
        const oc = await OrdenCompra.findById(req.params.id).populate('proveedorId');
        if (!oc) return res.status(404).json({ error: "Orden de compra no encontrada" });
        if (!oc.proveedorId?.correo) return res.status(400).json({ error: "El proveedor no tiene correo registrado" });

        const filasItems = (oc.items || []).map(it =>
            `<tr><td style="padding:6px;border:1px solid #eee">${it.descripcion || ''}</td><td style="padding:6px;border:1px solid #eee;text-align:right">${it.cantidad}</td><td style="padding:6px;border:1px solid #eee;text-align:right">$${(it.precioUnitario || 0).toLocaleString('es-CL')}</td></tr>`
        ).join('');

        await transporter.sendMail({
            from: `"Compras" <${process.env.EMAIL_FROM}>`,
            to: oc.proveedorId.correo,
            subject: `Orden de Compra ${oc.numeroOC}`,
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:auto">
                    <h2 style="color:#2c3e50">Orden de Compra ${oc.numeroOC}</h2>
                    <p>Estimado/a ${oc.proveedorId.nombre},</p>
                    <p>Adjuntamos el detalle de la orden de compra:</p>
                    <table style="border-collapse:collapse;width:100%">
                        <thead><tr><th style="padding:6px;border:1px solid #eee;text-align:left">Ítem</th><th style="padding:6px;border:1px solid #eee">Cant.</th><th style="padding:6px;border:1px solid #eee">P. Unit.</th></tr></thead>
                        <tbody>${filasItems}</tbody>
                    </table>
                    <p style="margin-top:16px;font-weight:bold">Total: $${(oc.total || 0).toLocaleString('es-CL')}</p>
                </div>
            `
        });

        res.json({ ok: true, mensaje: "Orden de compra enviada" });
    } catch (error) {
        console.error("Error en enviarOrdenCompra:", error);
        res.status(500).json({ error: error.message });
    }
};

// 6. Marcar como Recibida: mueve stock (Suministro.stockActual) y registra MovimientoStock por cada ítem
exports.recibirOrdenCompra = async (req, res) => {
    const OrdenCompra = getOrdenCompra(req.db);
    const Suministro = getSuministro(req.db);
    const MovimientoStock = getMovimientoStock(req.db);
    try {
        const oc = await OrdenCompra.findById(req.params.id);
        if (!oc) return res.status(404).json({ error: "Orden de compra no encontrada" });
        if (oc.estado === 'Recibida' || oc.estado === 'Pagada') {
            return res.status(400).json({ error: "Esta orden de compra ya fue recibida" });
        }

        for (const item of oc.items) {
            if (!item.suministroId || !item.cantidad) continue;
            await Suministro.findByIdAndUpdate(item.suministroId, { $inc: { stockActual: Number(item.cantidad) } });
            await MovimientoStock.create({
                suministroId: item.suministroId,
                tipo: 'Ingreso',
                cantidad: Number(item.cantidad),
                otId: oc.otId,
                motivo: `Recepción OC ${oc.numeroOC}`
            });
        }

        oc.estado = 'Recibida';
        oc.fechaRecepcion = new Date();
        await oc.save();

        res.json(oc);
    } catch (error) {
        console.error("Error en recibirOrdenCompra:", error);
        res.status(500).json({ error: error.message });
    }
};
