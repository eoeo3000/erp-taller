const Solicitud = require('../models/Solicitud');
const OT = require('../models/OT');

async function generarNumeroSolicitud() {
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

// Campos públicos que el cliente puede ver de la OT
function otPublica(ot) {
    if (!ot) return null;
    return {
        _id: ot._id,
        numeroOT: ot.numeroOT,
        estado: ot.estado,
        granTotal: ot.granTotal,
        tareas: (ot.tareas || []).map(t => ({
            descripcion: t.descripcion,
            puesto: t.puesto,
            duracion: t.duracion,
            fecha: t.fecha,
            hora: t.hora,
            completada: t.completada
        })),
        componentes: (ot.componentes || []).map(c => ({
            nombre: c.nombre,
            cantidad: c.cantidad,
            precioUnitario: c.precioUnitario,
            subtotal: c.subtotal
        })),
        logistica: (ot.logistica || []).map(l => ({
            descripcion: l.descripcion,
            subtotal: l.subtotal
        })),
        pago: ot.pago ? { estado: ot.pago.estado } : null,
        descripcionGeneral: ot.descripcionGeneral
    };
}

// GET /api/portal/buscar?q=<texto>
exports.buscar = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.json([]);

        // Buscar OT por numeroOT primero
        const otPorNumero = await OT.findOne({ numeroOT: { $regex: q, $options: 'i' } }).lean();

        // Buscar solicitudes
        const filtros = [
            { numeroSolicitud: { $regex: q, $options: 'i' } },
            { solicitante: { $regex: q, $options: 'i' } },
            { empresaSolicitante: { $regex: q, $options: 'i' } },
        ];
        if (otPorNumero) filtros.push({ _id: otPorNumero.solicitudId });

        const solicitudes = await Solicitud.find({ $or: filtros })
            .sort({ fechaCreacion: -1 })
            .limit(20)
            .lean();

        // Para cada solicitud, buscar su OT vinculada
        const resultados = await Promise.all(solicitudes.map(async sol => {
            const ot = await OT.findOne({ solicitudId: sol._id }).lean();
            return {
                _id: sol._id,
                numeroSolicitud: sol.numeroSolicitud || null,
                solicitante: sol.solicitante,
                empresaSolicitante: sol.empresaSolicitante,
                descripcion: sol.descripcion,
                estado: sol.estado,
                fechaCreacion: sol.fechaCreacion || sol.createdAt,
                fechaEjecucionSolicitada: sol.fechaEjecucionSolicitada,
                ot: otPublica(ot)
            };
        }));

        res.json(resultados);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/portal/solicitud/:id  — detalle de una solicitud específica
exports.detalle = async (req, res) => {
    try {
        const sol = await Solicitud.findById(req.params.id).lean();
        if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });

        const ot = await OT.findOne({ solicitudId: sol._id }).lean();

        res.json({
            _id: sol._id,
            numeroSolicitud: sol.numeroSolicitud || null,
            solicitante: sol.solicitante,
            empresaSolicitante: sol.empresaSolicitante,
            correo: sol.correo,
            numero: sol.numero,
            descripcion: sol.descripcion,
            estado: sol.estado,
            fechaCreacion: sol.fechaCreacion || sol.createdAt,
            fechaEjecucionSolicitada: sol.fechaEjecucionSolicitada,
            plazoEjecucionSugerido: sol.plazoEjecucionSugerido,
            ot: otPublica(ot)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/portal/solicitud  — crear nueva solicitud desde el portal del cliente
exports.crearSolicitud = async (req, res) => {
    try {
        const data = {};
        for (const key in req.body) {
            const value = req.body[key];
            if (value !== 'undefined' && value !== 'null' && value !== '') {
                data[key] = value;
            }
        }
        data.origen = data.origen || 'Portal Web';
        data.numeroSolicitud = await generarNumeroSolicitud();

        const nueva = new Solicitud(data);
        await nueva.save();
        res.status(201).json({
            _id: nueva._id,
            numeroSolicitud: nueva.numeroSolicitud,
            solicitante: nueva.solicitante,
            empresaSolicitante: nueva.empresaSolicitante
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
