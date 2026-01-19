const OT = require('../models/OT'); // Asegúrate de crear este modelo
const Recurso = require('../models/Recurso');
const Solicitud = require('../models/Solicitud');
// const Calendario = require('../models/Calendario'); 

// 1. Obtener toda la data (Sincronización global)
// src/controllers/otController.js

exports.getAllData = async (req, res) => {
    try {
        const [todasLasOts, recursos, calendarios] = await Promise.all([
            OT.find().sort({ createdAt: -1 }),
            Recurso.find(),
            Calendario.find().catch(() => [])
        ]);

        res.json({
            // Las OTs son las que ya tienen proceso (Generada, Tratada, etc.)
            ots: todasLasOts.filter(o => o.estado !== 'Pendiente'),

            // CAMBIO AQUÍ: Las solicitudes ahora incluyen las 'Pendientes' 
            // Y las 'Generadas' para que sigan apareciendo en tu tabla de ingreso.
            solicitudes: todasLasOts.filter(o => o.estado === 'Pendiente' || o.estado === 'Generada'),

            recursos: recursos,
            calendarios: calendarios
        });
    } catch (error) {
        console.error("Error global:", error);
        res.status(500).json({ error: "Error al obtener datos" });
    }
};

// 2. Crear Solicitud Manual
exports.crearSolicitudManual = async (req, res) => {
    try {
        const nueva = new OT({
            ...req.body,
            estado: 'Pendiente',
            origen: 'Manual'
        });
        await nueva.save();
        res.status(201).json(nueva);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. Convertir a OT (Upsert: Actualizar o Insertar)
exports.convertirOT = async (req, res) => {
    try {
        const data = req.body;
        // En Mongo usamos el _id si viene, o el id que tú manejes
        const idBusqueda = data._id || data.solicitudId;

        const nuevaOT = await OT.findByIdAndUpdate(
            idBusqueda,
            {
                ...data,
                estado: 'Generada',
                ultimaEdicion: new Date().toISOString()
            },
            { new: true, upsert: true } // Si no existe, la crea
        );

        res.status(201).json({ success: true, ot: nuevaOT });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4. Eliminar OT
exports.eliminarOT = async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await OT.findByIdAndDelete(id);

        if (!resultado) {
            return res.status(404).json({ message: "OT no encontrada" });
        }

        res.status(200).json({ message: "Eliminado con éxito" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 5. Obtener por ID
exports.obtenerOTPorId = async (req, res) => {
    try {
        const { id } = req.params;
        // Buscamos por el ID de MongoDB
        const ot = await OT.findById(id);

        if (!ot) {
            return res.status(404).json({ message: "No encontrado en Atlas" });
        }

        res.json(ot);
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
};

// 6. Webhook Emails
exports.webhookEmail = async (req, res) => {
    try {
        const { remitente, asunto, contenido } = req.body;
        const nuevaSolicitud = new OT({
            solicitante: remitente,
            descripcion: `${asunto}: ${contenido}`,
            origen: 'Correo',
            estado: 'Pendiente'
        });
        await nuevaSolicitud.save();
        res.status(201).json({ mensaje: "Solicitud recibida y guardada en Atlas" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
// 7. Actualizar OT (Para Tratamiento Técnico, Tareas y Componentes)
// controllers/otController.js
// Reemplaza tu función 7 por esta:
// src/controllers/otController.js

// src/controllers/otController.js
exports.actualizarOT = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        // 1. Intentamos actualizar si ya existe como OT
        let ot = await OT.findByIdAndUpdate(id, data, { new: true });

        // 2. Si no existe en la colección OT, buscamos en Solicitud
        if (!ot) {
            const Solicitud = require('../models/Solicitud');
            const solicitud = await Solicitud.findById(id);

            if (solicitud) {
                const total = await OT.countDocuments();
                const numeroGenerado = `OT-${2026}-${(total + 1).toString().padStart(4, '0')}`;

                // CREAR LA OT
                ot = new OT({
                    ...solicitud.toObject(),
                    ...data,
                    _id: solicitud._id,
                    numeroOT: numeroGenerado,
                    estado: 'Generada'
                });
                await ot.save();

                // --- CAMBIO CLAVE AQUÍ ---
                // En lugar de borrarla, actualizamos su estado en la tabla de Solicitudes
                await Solicitud.findByIdAndUpdate(id, {
                    estado: 'Generada',
                    numeroOT: numeroGenerado
                });

            }
        }

        if (!ot) return res.status(404).json({ error: "No encontrado" });
        res.json(ot);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};