const crypto = require('crypto');
const getSolicitud = require('../models/Solicitud');
const getOT = require('../models/OT');
const getSesionPortal = require('../models/SesionPortal');
const getCliente = require('../models/Cliente');
const transporter = require('../config/mailer');

const DIAS_VIGENCIA_TOKEN = 30; // sesión autoservicio/emitida
const DIAS_VIGENCIA_LOTE = 90;  // token pre-generado sin asignar (Requiere confirmación → confirmado con el usuario)
const DIAS_INACTIVO = 30;       // último acceso más antiguo que esto se muestra en rojo

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
        // Reportes de terreno — los usa C4 (design_handoff_pwa_movil/README.md §6). Las fotos
        // ya llegan comprimidas desde el origen (O3/O4 y supervisorPortal recomprimen a un
        // ancho máximo de 1200px, calidad .75, antes de guardarlas en OT.reportes) — no se
        // reprocesan acá, solo se exponen tal cual quedaron guardadas.
        reportes: (ot.reportes || []).map(r => ({
            fecha: r.fecha,
            comentario: r.comentario,
            foto: r.foto,
            usuario: r.usuario,
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

// Construye el link del portal y despacha el correo de acceso — reutilizado por emisión,
// regeneración y reenvío. Texto plano, sin HTML decorativo (mismo criterio que el resto
// de los correos del sistema, ver config/mailer.js).
async function enviarCorreoAcceso({ correo, nombre, empresa, token, entorno }) {
    if (!correo) return false;
    const baseUrl = process.env.PWA_CLIENTE_URL || 'https://erp-pwa-cliente.onrender.com';
    const link = `${baseUrl}/?token=${token}${entorno ? `&entorno=${entorno}` : ''}`;
    await transporter.sendMail({
        from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
        to: correo,
        subject: `Acceso a tu portal${empresa ? ` — ${empresa}` : ''}`,
        text: `Hola${nombre ? ` ${nombre}` : ''},\n\n`
            + `Este es tu acceso al portal donde puedes ver el estado de tus solicitudes y órdenes de trabajo${empresa ? ` de ${empresa}` : ''}.\n\n`
            + `${link}\n\n`
            + `Es un acceso permanente: no necesitas clave. Si lo pierdes o cambias de equipo, pide a la oficina que lo renueve.`,
    });
    return true;
}

function nuevoToken() { return crypto.randomBytes(20).toString('hex'); }

// POST /api/portal/emitir-token — "Bodega de tokens · Emitir acceso cliente" (mejora v3
// #2). Dos formas de identificar al titular: clienteId+contactoId (origen normal, desde
// el módulo de tokens o embebido en la ficha del Cliente) o telefono suelto (compatibilidad
// con el flujo anterior, cuando todavía no hay Cliente cargado para ese teléfono). Sin
// segundo factor: quien llama a este endpoint ya es personal interno (vía SPA).
exports.emitirTokenContacto = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    const Cliente = getCliente(req.db);
    try {
        const { clienteId, contactoId, alcance, correo: correoManual, entorno } = req.body;
        let telefono = normalizarTelefono(req.body.telefono);
        let empresaSolicitante = '';
        let nombreContacto = '';
        let correo = correoManual || '';

        if (clienteId) {
            const cliente = await Cliente.findById(clienteId);
            if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
            empresaSolicitante = cliente.empresa;
            if (contactoId) {
                const contacto = cliente.contactos.id(contactoId);
                if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });
                nombreContacto = contacto.nombre;
                correo = correo || contacto.correo;
                telefono = telefono || normalizarTelefono(contacto.telefono);
            }
        } else {
            if (!telefono) return res.status(400).json({ error: 'Teléfono o cliente requerido' });
            const trabajos = await trabajosPorTelefono(req.db, telefono);
            if (!trabajos.length) return res.status(404).json({ error: 'No hay solicitudes registradas con ese teléfono' });
            empresaSolicitante = trabajos[0].empresaSolicitante;
        }

        const token = nuevoToken();
        const expira = new Date(Date.now() + DIAS_VIGENCIA_TOKEN * 24 * 60 * 60 * 1000);
        const sesion = await SesionPortal.create({
            tipo: 'cliente', telefono, empresaSolicitante,
            clienteId: clienteId || null, contactoId: contactoId || null,
            alcance: alcance === 'propias' ? 'propias' : 'empresa',
            tokenHash: hashToken(token), expira, estado: 'activo',
            emitidoEn: new Date(), emitidoPor: req.body.emitidoPor || '',
        });

        const correoEnviado = await enviarCorreoAcceso({ correo, nombre: nombreContacto, empresa: empresaSolicitante, token, entorno });

        res.json({ token, expira, empresaSolicitante, sesionId: sesion._id, correoEnviado });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/portal/sesiones/:id/regenerar — invalida el token anterior (deja de servir
// de inmediato) y emite uno nuevo para la misma persona; reenvía el correo.
exports.regenerarToken = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const anterior = await SesionPortal.findById(req.params.id);
        if (!anterior) return res.status(404).json({ error: 'Sesión no encontrada' });

        const token = nuevoToken();
        anterior.tokenHash = hashToken(token);
        anterior.expira = new Date(Date.now() + DIAS_VIGENCIA_TOKEN * 24 * 60 * 60 * 1000);
        anterior.estado = 'activo';
        anterior.ultimoAcceso = null;
        await anterior.save();

        const correoEnviado = await enviarCorreoAcceso({
            correo: req.body.correo, empresa: anterior.empresaSolicitante, token, entorno: req.body.entorno,
        });

        res.json({ token, expira: anterior.expira, correoEnviado });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/portal/sesiones/:id/reenviar — el token en claro nunca se guarda (solo su
// hash, ver models/SesionPortal.js), así que no existe nada que "reenviar" literalmente:
// reenviar es, en la práctica, regenerar y volver a enviar el correo con el link nuevo.
exports.reenviarToken = exports.regenerarToken;

// GET /api/portal/sesiones — "Tokens activos": estado mostrado se deriva de estado
// guardado + último acceso, no se guarda un cuarto valor aparte (Activo/Inactivo/Sin uso
// son vistas distintas del mismo dato, Revocado es el único estado real que se persiste).
exports.listarSesiones = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesiones = await SesionPortal.find({ tipo: 'cliente' }).select('-tokenHash').sort({ createdAt: -1 }).lean();
        const ahora = Date.now();
        const conEstado = sesiones.map(s => {
            let estadoDisplay = 'Activo';
            if (s.estado === 'revocado') estadoDisplay = 'Revocado';
            else if (!s.tokenHash && !s.clienteId) estadoDisplay = 'Sin asignar'; // stock pre-generado
            else if (!s.ultimoAcceso) estadoDisplay = 'Sin uso';
            else if (ahora - new Date(s.ultimoAcceso).getTime() > DIAS_INACTIVO * 24 * 60 * 60 * 1000) estadoDisplay = 'Inactivo';
            return { ...s, estadoDisplay };
        });
        res.json(conEstado);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/portal/sesiones/:id/revocar — la oficina corta el acceso; avisa por correo.
exports.revocarSesion = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesion = await SesionPortal.findByIdAndUpdate(
            req.params.id,
            { estado: 'revocado', revocadoEn: new Date(), revocadoPor: req.body.revocadoPor || '' },
            { new: true },
        ).select('-tokenHash');
        if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });

        if (req.body.correo) {
            try {
                await transporter.sendMail({
                    from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
                    to: req.body.correo,
                    subject: 'Tu acceso al portal fue revocado',
                    text: 'Tu acceso al portal de seguimiento fue revocado desde la oficina. Si crees que es un error, contáctanos.',
                });
            } catch (eCorreo) {
                console.warn('[revocarSesion] no se pudo enviar el aviso de revocación:', eCorreo.message);
            }
        }

        res.json({ mensaje: 'Sesión revocada', sesion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/portal/sesiones/:id/reactivar — vuelve a habilitar una sesión revocada con el
// mismo token (no regenera): cubre "un revocado ofrece Reactivar" de Tokens activos.
exports.reactivarSesion = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesion = await SesionPortal.findByIdAndUpdate(
            req.params.id, { estado: 'activo', revocadoEn: null, revocadoPor: '' }, { new: true },
        ).select('-tokenHash');
        if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });
        res.json({ mensaje: 'Sesión reactivada', sesion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/portal/sesiones/lote — "Stock pre-generado": crea N sesiones sin clienteId
// (tokenHash vacío, sin asignar todavía). Se asignan más adelante regenerando esa sesión
// una vez que se sabe a qué contacto va (mismo endpoint que "Regenerar").
exports.generarLote = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const cantidad = Math.max(1, Math.min(200, Number(req.body.cantidad) || 0));
        const expira = new Date(Date.now() + DIAS_VIGENCIA_LOTE * 24 * 60 * 60 * 1000);
        const lote = await SesionPortal.insertMany(
            Array.from({ length: cantidad }, () => ({ tipo: 'cliente', tokenHash: '', expira, estado: 'activo' }))
        );
        res.status(201).json({ mensaje: `${lote.length} tokens generados`, cantidad: lote.length, vigenciaDias: DIAS_VIGENCIA_LOTE });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/portal/mis-solicitudes?token= — reutiliza la sesión que abrió acceso()
exports.misSolicitudes = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesion = await SesionPortal.findOne({ tokenHash: hashToken(req.query.token), estado: 'activo' });
        if (!sesion || sesion.expira < new Date()) return res.status(403).json({ error: 'Sesión inválida o vencida' });

        sesion.ultimoAcceso = new Date();
        sesion.accesos = sesion.accesos || [];
        sesion.accesos.push({ fecha: new Date(), ip: req.ip || '', userAgent: req.headers['user-agent'] || '' });
        await sesion.save();

        const trabajos = await trabajosPorTelefono(req.db, sesion.telefono);
        res.json({ empresaSolicitante: sesion.empresaSolicitante, trabajos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
