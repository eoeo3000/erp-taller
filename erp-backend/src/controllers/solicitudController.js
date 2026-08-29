const getSolicitud = require('../models/Solicitud');
const getOT = require('../models/OT');
const getAsignacion = require('../models/Asignacion');
const { resolverOCrearClientePorNombre } = require('./clienteController');

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

// GET /api/solicitudes/:id — no existía: la SPA siempre trabajó sobre el listado completo
// de /api/data, pero la PWA Operativa (S4/S5, modo supervisor) necesita traer una sola
// solicitud sin cargar todo el catálogo.
exports.obtenerSolicitud = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    try {
        const solicitud = await Solicitud.findById(req.params.id);
        if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
        res.json(solicitud);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la solicitud' });
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

        // Ver models/Solicitud.js: clienteId es la referencia real al catálogo de Clientes,
        // resuelta (o creada si es una empresa nueva) a partir del texto libre "Empresa".
        if (data.empresaSolicitante) {
            data.clienteId = await resolverOCrearClientePorNombre(req.db, data.empresaSolicitante);
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

// A pesar del nombre (histórico: al principio solo cambiaba estado), esta ruta ahora
// también sirve para editar los datos de la solicitud desde el formulario de Ingreso
// (doble clic en una fila) — de ahí el resto de los campos, todos opcionales: Mongoose
// ignora las claves en undefined, así que un PUT que solo manda {estado} sigue
// funcionando igual que antes sin tocar el resto.
exports.actualizarEstado = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    try {
        const { id } = req.params;
        const {
            estado, empresaSolicitante, solicitante, correo, numero, direccion,
            descripcion, origen, fechaEjecucionSolicitada, plazoEjecucionSugerido, adjuntos,
        } = req.body;

        // Una vez que la solicitud pasó a evaluación (se aprobó y existe una OT — estado
        // 'Aprobada'/'Tratada'/'Programada'/etc., puestos por otController al convertir),
        // el contenido ya no se edita desde acá: quedaría desincronizado con la OT, que es
        // la fuente de verdad desde ese punto. Los cambios de solo `estado` (los que dispara
        // el propio flujo de aprobación) siguen permitidos siempre.
        const camposContenido = {
            empresaSolicitante, solicitante, correo, numero, direccion,
            descripcion, origen, fechaEjecucionSolicitada, plazoEjecucionSugerido, adjuntos,
        };
        const tocaContenido = Object.values(camposContenido).some(v => v !== undefined);
        if (tocaContenido) {
            const actual = await Solicitud.findById(id).select('estado');
            if (!actual) return res.status(404).json({ error: "Solicitud no encontrada" });
            if (!['Pendiente', 'Rechazada'].includes(actual.estado)) {
                return res.status(409).json({ error: 'La solicitud ya pasó a evaluación (tiene una OT asociada) y no se puede editar desde aquí.' });
            }
        }

        // Si se está editando el nombre de la empresa, se re-resuelve/crea el Cliente — así
        // "Empresa" nunca queda con un clienteId viejo apuntando a un nombre distinto.
        const clienteId = empresaSolicitante !== undefined
            ? await resolverOCrearClientePorNombre(req.db, empresaSolicitante)
            : undefined;

        const actualizada = await Solicitud.findByIdAndUpdate(id, {
            estado, ...camposContenido, ...(clienteId !== undefined ? { clienteId } : {}),
        }, { new: true, runValidators: true });
        if (!actualizada) return res.status(404).json({ error: "Solicitud no encontrada" });
        res.json(actualizada);
    } catch (error) {
        res.status(400).json({ error: error.message || "Error al actualizar la solicitud" });
    }
};

// DELETE — Análogo a otController.eliminarOT, pero en el otro sentido: solo para
// solicitudes que TODAVÍA no tienen OT (una vez que existe OT, se borra con "Eliminar OT",
// que además libera la solicitud). Si un Supervisor ya tomó la solicitud desde la PWA
// Operativa (Asignacion tipo 'evaluacion', ver asignacionController.tomarSolicitud), esa
// Asignacion se borra en cascada — si no, quedaría huérfana y podía romper "Mis informes"
// (asignacionController.misInformes intenta reconstruir datos desde una Solicitud inexistente).
exports.eliminarSolicitud = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    const OT = getOT(req.db);
    const Asignacion = getAsignacion(req.db);
    try {
        const { id } = req.params;
        const solicitud = await Solicitud.findById(id);
        if (!solicitud) return res.status(404).json({ error: "Solicitud no encontrada" });

        const otExistente = await OT.findById(id);
        if (otExistente) {
            return res.status(409).json({ error: "Esta solicitud ya tiene una OT; elimina la OT en su lugar." });
        }

        await Asignacion.deleteMany({ solicitudId: id });
        await Solicitud.findByIdAndDelete(id);

        res.status(200).json({ message: "Solicitud eliminada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};