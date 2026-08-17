const getSolicitud = require('../models/Solicitud');

async function generarNumeroSolicitud(conn) {
    const Solicitud = getSolicitud(conn);
    const anio = new Date().getFullYear();
    const prefijo = `SOL-${anio}-`;
    const ultima = await Solicitud.findOne({ numeroSolicitud: { $regex: new RegExp(`^${prefijo}`) } }).sort({ numeroSolicitud: -1 });
    let siguiente = 1;
    if (ultima?.numeroSolicitud) {
        const partes = ultima.numeroSolicitud.split('-');
        const n = parseInt(partes[partes.length - 1]);
        if (!isNaN(n)) siguiente = n + 1;
    }
    return `${prefijo}${siguiente.toString().padStart(4, '0')}`;
}

exports.obtenerSolicitudes = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    try {
        // Quitamos el { estado: 'Pendiente' } para recibir TODO
        const solicitudes = await Solicitud.find().sort({ fechaCreacion: -1 });
        res.json(solicitudes);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener solicitudes" });
    }
};

exports.crearSolicitud = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
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

        if (!data.numeroSolicitud) {
            data.numeroSolicitud = await generarNumeroSolicitud(req.db);
        }

        const nuevaSolicitud = new Solicitud(data);
        await nuevaSolicitud.save();

        res.status(201).json(nuevaSolicitud);
    } catch (error) {
        // Este console.log es vital ahora mismo en tu terminal de VS Code
        console.error("DETALLE DEL ERROR:", error.message);

        res.status(400).json({
            error: "Error al crear solicitud",
            detalle: error.message
        });
    }
};

exports.actualizarEstado = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const actualizada = await Solicitud.findByIdAndUpdate(id, { estado }, { new: true });
        res.json(actualizada);
    } catch (error) {
        res.status(400).json({ error: "Error al actualizar estado" });
    }
};