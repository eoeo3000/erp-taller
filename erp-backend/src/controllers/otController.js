const OT = require('../models/OT');
const Recurso = require('../models/Recurso');
// Eliminamos la carga global de Solicitud aquí para evitar bloqueos por referencia circular
// y la cargaremos dentro de las funciones que la necesiten.

// 1. Obtener toda la data
exports.getAllData = async (req, res) => {
    try {
        const Solicitud = require('../models/Solicitud');
        const [todasLasOts, todasLasSolicitudes, recursos] = await Promise.all([
            OT.find().sort({ createdAt: -1 }),
            Solicitud.find().sort({ fechaCreacion: -1 }),
            Recurso.find()
        ]);
        res.json({ ots: todasLasOts, solicitudes: todasLasSolicitudes, recursos });
    } catch (error) {
        res.status(500).json({ error: "Error al sincronizar" });
    }
};

// 2. Crear Solicitud Manual
exports.crearSolicitudManual = async (req, res) => {
    try {
        const nueva = new OT({ ...req.body, estado: 'Pendiente', origen: 'Manual' });
        await nueva.save();
        res.status(201).json(nueva);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. Convertir a OT
exports.convertirOT = async (req, res) => {
    try {
        const data = req.body;
        const idBusqueda = data._id || data.solicitudId;
        if (!data.numeroOT) {
            const ultimaOT = await OT.findOne({ numeroOT: { $regex: /^OT-/ } }).sort({ numeroOT: -1 });
            let siguienteNum = 1;
            if (ultimaOT?.numeroOT) {
                const numeroLimpio = parseInt(ultimaOT.numeroOT.replace(/\D/g, ''));
                if (!isNaN(numeroLimpio)) siguienteNum = numeroLimpio + 1;
            }
            data.numeroOT = `OT-${siguienteNum.toString().padStart(3, '0')}`;
        }
        const { _id, ...updateData } = data;
        const nuevaOT = await OT.findByIdAndUpdate(
            idBusqueda,
            { ...updateData, numeroOT: data.numeroOT, estado: 'Generada', ultimaEdicion: new Date().toISOString() },
            { new: true, upsert: true, runValidators: true }
        );
        res.status(201).json({ success: true, ot: nuevaOT });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4. Eliminar OT y Liberar Solicitud
exports.eliminarOT = async (req, res) => {
    try {
        const { id } = req.params;
        const otAEliminar = await OT.findById(id);
        if (!otAEliminar) return res.status(404).json({ message: "OT no encontrada" });

        const idSolicitudVinculada = otAEliminar.solicitudId || otAEliminar._id;
        await OT.findByIdAndDelete(id);

        const Solicitud = require('../models/Solicitud');
        await Solicitud.findByIdAndUpdate(idSolicitudVinculada, { estado: 'Pendiente', numeroOT: null });

        res.status(200).json({ message: "OT eliminada y solicitud liberada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 5. Obtener OT por ID de Solicitud (ESTA ES LA QUE EL ROUTER NO ENCONTRABA)
exports.obtenerOTPorSolicitud = async (req, res) => {
    try {
        const { solicitudId } = req.params;
        const ot = await OT.findOne({ solicitudId: solicitudId });
        if (!ot) return res.status(404).json({ message: "No se encontró planificación" });
        res.json(ot);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 6. Obtener por ID (Búsqueda directa)
exports.obtenerOTPorId = async (req, res) => {
    try {
        const ot = await OT.findById(req.params.id);
        if (!ot) return res.status(404).json({ message: "No encontrado" });
        res.json(ot);
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
};

// 7. Webhook Emails
exports.webhookEmail = async (req, res) => {
    try {
        const nuevaSolicitud = new OT({
            solicitante: req.body.remitente,
            descripcion: `${req.body.asunto}: ${req.body.contenido}`,
            origen: 'Correo',
            estado: 'Pendiente'
        });
        await nuevaSolicitud.save();
        res.status(201).json({ mensaje: "Guardada en Atlas" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 8. Actualizar OT (General)
exports.actualizarOT = async (req, res) => {
    try {
        const { id } = req.params;
        let ot = await OT.findByIdAndUpdate(id, req.body, { new: true });
        if (!ot) {
            const Solicitud = require('../models/Solicitud');
            const solicitud = await Solicitud.findById(id);
            if (solicitud) {
                const total = await OT.countDocuments();
                const num = `OT-2026-${(total + 1).toString().padStart(4, '0')}`;
                ot = new OT({ ...solicitud.toObject(), ...req.body, _id: solicitud._id, numeroOT: num, estado: 'Generada' });
                await ot.save();
                await Solicitud.findByIdAndUpdate(id, { estado: 'Generada', numeroOT: num });
            }
        }
        if (!ot) return res.status(404).json({ error: "No encontrado" });
        res.json(ot);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};