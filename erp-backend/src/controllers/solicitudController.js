const Solicitud = require('../models/Solicitud');

exports.obtenerSolicitudes = async (req, res) => {
    try {
        const solicitudes = await Solicitud.find({ estado: 'Pendiente' }).sort({ fechaCreacion: -1 });
        res.json(solicitudes);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener solicitudes" });
    }
};

exports.crearSolicitud = async (req, res) => {
    try {
        const data = {};

        // Recorremos req.body y limpiamos strings basura
        for (let key in req.body) {
            let value = req.body[key];
            // Si el valor es literalmente "undefined" (string) o está vacío, lo ignoramos
            if (value !== 'undefined' && value !== 'null' && value !== '') {
                data[key] = value;
            }
        }

        // Si Multer capturó el archivo
        if (req.file) {
            data.adjuntos = `/uploads/${req.file.filename}`;
        }

        // IMPORTANTE: Si el campo adjuntos existe en req.body como string "undefined"
        // y NO hay req.file, el bucle de arriba podría haberlo saltado, 
        // pero vamos a asegurarnos:
        if (data.adjuntos === 'undefined') delete data.adjuntos;

        const nuevaSolicitud = new Solicitud(data);
        await nuevaSolicitud.save();

        res.status(201).json(nuevaSolicitud);
    } catch (error) {
        // Este console.log es vital ahora mismo en tu terminal de VS Code
        console.log("DATOS RECIBIDOS QUE FALLARON:", req.body);
        console.error("DETALLE DEL ERROR:", error.message);

        res.status(400).json({
            error: "Error al crear solicitud",
            detalle: error.message
        });
    }
};

exports.actualizarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const actualizada = await Solicitud.findByIdAndUpdate(id, { estado }, { new: true });
        res.json(actualizada);
    } catch (error) {
        res.status(400).json({ error: "Error al actualizar estado" });
    }
};