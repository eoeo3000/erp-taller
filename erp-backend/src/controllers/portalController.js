const crypto = require('crypto');
const getSolicitud = require('../models/Solicitud');
const getOT = require('../models/OT');
const getSesionPortal = require('../models/SesionPortal');

// Un solo mensaje para los tres casos de fallo (teléfono inexistente, solicitud
// inexistente, o par que no coincide) — no revelar cuál de los dos falló (ver
// docs/estrategia-movil.md §5.2 y design_handoff_pwa_movil/README.md §6, C1).
const MENSAJE_ACCESO_INVALIDO = 'Teléfono o número de solicitud no coinciden.';

function normalizarTelefono(t) {
    return String(t || '').replace(/\D/g, '');
}

// SesionPortal guarda el hash, nunca el token en claro (ver models/SesionPortal.js).
function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

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
    const Solicitud = getSolicitud(req.db);
    const OT = getOT(req.db);
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
    const Solicitud = getSolicitud(req.db);
    const OT = getOT(req.db);
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
    const Solicitud = getSolicitud(req.db);
    try {
        const data = {};
        for (const key in req.body) {
            const value = req.body[key];
            if (value !== 'undefined' && value !== 'null' && value !== '') {
                data[key] = value;
            }
        }
        data.origen = data.origen || 'Portal Web';
        data.numeroSolicitud = await generarNumeroSolicitud(req.db);

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

// Todas las solicitudes/OT que comparten el mismo teléfono (normalizado, sin separadores),
// para no depender de que el número se haya escrito siempre igual (con o sin '+56', espacios,
// guiones). A la escala de una PyME (ver estrategia-movil.md §4) filtrar en memoria sobre el
// listado ya ordenado alcanza — mismo criterio que ya usa buscar() con $regex sin índice.
async function trabajosPorTelefono(conn, telefonoNormalizado) {
    const Solicitud = getSolicitud(conn);
    const OT = getOT(conn);
    const candidatas = await Solicitud.find().sort({ fechaCreacion: -1 }).lean();
    const solicitudes = candidatas.filter(s => normalizarTelefono(s.numero) === telefonoNormalizado);
    return Promise.all(solicitudes.map(async sol => {
        const ot = await OT.findOne({ solicitudId: sol._id }).lean();
        return {
            _id: sol._id,
            numeroSolicitud: sol.numeroSolicitud || null,
            empresaSolicitante: sol.empresaSolicitante,
            solicitante: sol.solicitante,
            descripcion: sol.descripcion,
            estado: sol.estado,
            fechaCreacion: sol.fechaCreacion || sol.createdAt,
            fechaEjecucionSolicitada: sol.fechaEjecucionSolicitada,
            ot: otPublica(ot),
        };
    }));
}

// POST /api/portal/acceso — { telefono, numeroSolicitud }: el teléfono identifica a la
// empresa, el número de solicitud es el segundo factor. Del par se deriva la empresa y se
// devuelven TODOS sus trabajos (design_handoff_pwa_movil/README.md §6, C1).
exports.acceso = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    const SesionPortal = getSesionPortal(req.db);
    try {
        const telefono = normalizarTelefono(req.body.telefono);
        const numeroSolicitud = (req.body.numeroSolicitud || '').trim();
        if (!telefono || !numeroSolicitud) return res.status(400).json({ error: MENSAJE_ACCESO_INVALIDO });

        const solicitud = await Solicitud.findOne({ numeroSolicitud }).lean();
        if (!solicitud || normalizarTelefono(solicitud.numero) !== telefono) {
            return res.status(401).json({ error: MENSAJE_ACCESO_INVALIDO });
        }

        const token = crypto.randomBytes(20).toString('hex'); // se devuelve una sola vez, no se guarda en claro
        const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días, ver README §6 C1
        await SesionPortal.create({
            telefono, expira,
            tokenHash: hashToken(token),
            empresaSolicitante: solicitud.empresaSolicitante,
        });

        const trabajos = await trabajosPorTelefono(req.db, telefono);
        res.json({ token, expira, empresaSolicitante: solicitud.empresaSolicitante, trabajos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/portal/mis-solicitudes?token= — reutiliza la sesión que abrió acceso()
exports.misSolicitudes = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesion = await SesionPortal.findOne({ tokenHash: hashToken(req.query.token), revocada: false });
        if (!sesion || sesion.expira < new Date()) return res.status(403).json({ error: 'Sesión inválida o vencida' });

        sesion.ultimoAcceso = new Date();
        await sesion.save();

        const trabajos = await trabajosPorTelefono(req.db, sesion.telefono);
        res.json({ empresaSolicitante: sesion.empresaSolicitante, trabajos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/portal/sesiones — para que la oficina vea qué sesiones de cliente están activas
exports.listarSesiones = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesiones = await SesionPortal.find().select('-tokenHash').sort({ createdAt: -1 });
        res.json(sesiones);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/portal/sesiones/:id/revocar — la oficina corta el acceso de un dispositivo
exports.revocarSesion = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesion = await SesionPortal.findByIdAndUpdate(req.params.id, { revocada: true }, { new: true }).select('-tokenHash');
        if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });
        res.json({ mensaje: 'Sesión revocada', sesion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
