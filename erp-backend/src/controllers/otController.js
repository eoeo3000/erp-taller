const OT = require('../models/OT');
const Recurso = require('../models/Recurso');

// 1. Obtener toda la data (OTs, Solicitudes y Recursos)
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
        res.status(500).json({ error: "Error al sincronizar data" });
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

// 3. Convertir a OT (Con formato OT-2026-0000)
exports.convertirOT = async (req, res) => {
    try {
        const data = req.body;
        const idSolicitud = data._id || data.solicitudId;

        // Generación de número con guiones
        if (!data.numeroOT) {
            const ultimaOT = await OT.findOne({ numeroOT: { $regex: /^OT-2026-/ } }).sort({ numeroOT: -1 });
            let siguienteNum = 1;

            if (ultimaOT?.numeroOT) {
                const partes = ultimaOT.numeroOT.split('-');
                const ultimoSecuencial = parseInt(partes[partes.length - 1]);
                if (!isNaN(ultimoSecuencial)) siguienteNum = ultimoSecuencial + 1;
            }
            data.numeroOT = `OT-2026-${siguienteNum.toString().padStart(4, '0')}`;
        }

        const { _id, ...updateData } = data;

        const nuevaOT = await OT.findByIdAndUpdate(
            idSolicitud,
            {
                ...updateData,
                solicitudId: idSolicitud,
                numeroOT: data.numeroOT,
                estado: 'Generada',
                ultimaEdicion: new Date().toISOString()
            },
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

// 5. Obtener OT por ID de Solicitud (Búsqueda híbrida para evitar el 404)
exports.obtenerOTPorSolicitud = async (req, res) => {
    try {
        const { solicitudId } = req.params;
        const ot = await OT.findOne({
            $or: [
                { solicitudId: solicitudId },
                { _id: solicitudId }
            ]
        });

        if (!ot) return res.status(404).json({ message: "No se encontró planificación" });
        res.json(ot);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 6. Obtener por ID Directo
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

// 8. Actualizar OT (General y Suministros)
exports.actualizarOT = async (req, res) => {
    try {
        const { id } = req.params;
        const datosCuerpo = req.body;

        // 1. Intentar actualizar (Usamos $set para campos normales y nos aseguramos de traer la OT nueva)
        let ot = await OT.findByIdAndUpdate(
            id,
            { $set: datosCuerpo },
            { new: true, runValidators: true }
        );

        // 2. Lógica de creación si no existe (Tu lógica original mejorada)
        if (!ot) {
            const Solicitud = require('../models/Solicitud');
            const solicitud = await Solicitud.findById(id);

            if (solicitud) {
                const total = await OT.countDocuments();
                const num = `OT-2026-${(total + 1).toString().padStart(4, '0')}`;

                // Creamos la nueva OT
                ot = new OT({
                    ...solicitud.toObject(),
                    ...datosCuerpo,
                    _id: solicitud._id,
                    solicitudId: solicitud._id,
                    numeroOT: num,
                    estado: 'Generada'
                });

                await ot.save();
                // Actualizamos la solicitud original
                await Solicitud.findByIdAndUpdate(id, { estado: 'Generada', numeroOT: num });
            }
        }

        if (!ot) return res.status(404).json({ error: "No encontrado" });

        // 🚩 CLAVE: Devolvemos la OT completa para que el frontend vea los reportes
        res.json(ot);

    } catch (error) {
        console.error("Error en actualizarOT:", error);
        res.status(500).json({ error: error.message });
    }
};

// 9. Respuesta Directa del Cliente (Solo actualización interna)
exports.responderCotizacionCliente = async (req, res) => {
    try {
        const { id, nuevoEstado } = req.params;

        // 1. Actualizar la OT
        const otActualizada = await OT.findByIdAndUpdate(
            id,
            { estado: nuevoEstado },
            { new: true }
        );

        if (!otActualizada) {
            return res.status(404).send("<h1>Error: Registro no encontrado.</h1>");
        }

        // 2. Sincronizar con la Solicitud original para que el ERP sea consistente
        const idSolicitud = otActualizada.solicitudId || otActualizada._id;
        const Solicitud = require('../models/Solicitud');
        await Solicitud.findByIdAndUpdate(idSolicitud, { estado: nuevoEstado });

        console.log(`♻️ ERP Actualizado: OT ${otActualizada.numeroOT} ahora está ${nuevoEstado}`);

        // 3. Respuesta visual simple para el cliente
        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 100px 20px;">
                <div style="font-size: 50px;">✔️</div>
                <h1 style="color: #2c3e50;">Respuesta Recibida</h1>
                <p style="font-size: 18px; color: #7f8c8d;">
                    Gracias. Su respuesta sobre la cotización <b>${otActualizada.numeroOT}</b> ha sido procesada correctamente.
                </p>
            </div>
        `);

    } catch (error) {
        console.error("Error al procesar respuesta:", error);
        res.status(500).send("Error interno.");
    }
};