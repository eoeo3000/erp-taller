// Asignaciones — colección propia, no una extensión de OT.tareas (motivo y costo en
// docs/estrategia-movil.md §7.2). Las rutas de mi-dia/mi-semana/cerrar las llama la PWA
// Operativa por token de persona, fuera de la SPA: el entorno viaja en la query
// (?entorno=), nunca en el header X-Entorno (ver CORRECCIONES.md punto 7).
const getAsignacion = require('../models/Asignacion');
const getUsuario = require('../models/Usuario');
const getRecurso = require('../models/Recurso');
const getOT = require('../models/OT');
const getSolicitud = require('../models/Solicitud');
const transporter = require('../config/mailer');

async function resolverUsuarioPorToken(Usuario, token) {
    if (!token) return null;
    const usuario = await Usuario.findOne({ token, estado: 'activo' });
    if (usuario) {
        usuario.ultimoAcceso = new Date();
        await usuario.save();
    }
    return usuario;
}

// Lunes de la semana de `fecha` (ISO, como ya usa GanttScreen/README §5 O6).
function lunesDeLaSemana(fecha) {
    const d = new Date(fecha);
    const dia = d.getDay(); // 0 domingo ... 6 sábado
    const offset = dia === 0 ? -6 : 1 - dia;
    d.setDate(d.getDate() + offset);
    return d;
}
function aISO(d) { return d.toISOString().slice(0, 10); }

// Nadie ve las asignaciones de otro (siempre filtra por usuarioId); el rol solo decide
// qué TIPOS de las suyas aparecen. El ejecutor solo ejecuta; el supervisor además
// supervisa y levanta informes de evaluación (README §5, O5). Vista de carga del equipo
// no entra aquí — vive en Programación, en el escritorio.
const TIPOS_POR_ROL = {
    ejecutor: ['ejecucion'],
    supervisor: ['ejecucion', 'supervision', 'evaluacion'],
};
// OT.supervisorId apunta a un Recurso (el catálogo real de personal, ver models/OT.js),
// no a una Asignacion — así que para que la OT asignada aparezca en "mi día"/"mi semana"
// del supervisor, se arma acá como si fuera una asignación más, en vez de exigir que el
// planificador cree además una Asignacion tipo 'supervision' redundante.
async function otsSupervisadasEnFechas(OT, recursoId, fechasISO) {
    if (!recursoId) return [];
    const ots = await OT.find({ supervisorId: recursoId, estado: { $ne: 'Pagada' } }).lean();
    return ots
        .filter(ot => ot.fechaEjecucion && fechasISO.includes(aISO(new Date(ot.fechaEjecucion))))
        .map(ot => ({
            _id: `ot-sup-${ot._id}`,
            tipo: 'supervision',
            otId: ot._id,
            fechaPlanificada: aISO(new Date(ot.fechaEjecucion)),
            estado: 'pendiente',
        }));
}

function diasDeLaSemana(fecha) {
    const lunes = lunesDeLaSemana(fecha);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(lunes);
        d.setDate(d.getDate() + i);
        return aISO(d);
    });
}

// POST /api/asignaciones — crea la asignación y avisa por correo (planificador, vía SPA)
exports.crear = async (req, res) => {
    const Asignacion = getAsignacion(req.db);
    const Usuario = getUsuario(req.db);
    const Recurso = getRecurso(req.db);
    try {
        const { tipo, usuarioId, otId, solicitudId, tareaId, fechaPlanificada } = req.body;
        if (!tipo || !usuarioId) return res.status(400).json({ error: 'tipo y usuarioId son requeridos' });

        const asignacion = await Asignacion.create({
            tipo, usuarioId, otId: otId || undefined, solicitudId: solicitudId || undefined,
            tareaId: tareaId || '', fechaPlanificada: fechaPlanificada || '',
        });

        try {
            const usuario = await Usuario.findById(usuarioId);
            const recurso = usuario?.recursoId ? await Recurso.findById(usuario.recursoId) : null;
            if (usuario && recurso?.email) {
                let referencia = '';
                if (otId) {
                    const ot = await getOT(req.db).findById(otId).lean();
                    referencia = ot?.numeroOT || '';
                } else if (solicitudId) {
                    const sol = await getSolicitud(req.db).findById(solicitudId).lean();
                    referencia = sol?.numeroSolicitud || '';
                }
                await transporter.sendMail({
                    from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
                    to: recurso.email,
                    subject: `Nueva asignación${referencia ? `: ${referencia}` : ''}`,
                    text: `Hola ${usuario.nombre},\n\n`
                        + `Se te asignó un trabajo${referencia ? ` (${referencia})` : ''}`
                        + `${fechaPlanificada ? ` para el ${fechaPlanificada}` : ''}.\n\n`
                        + `Revísalo en tu app de trabajo con tu link de acceso habitual.`,
                });
            }
        } catch (eCorreo) {
            console.warn('[asignaciones] no se pudo enviar el aviso de asignación nueva:', eCorreo.message);
        }

        res.status(201).json(asignacion);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// GET /api/asignaciones?usuarioId=&otId= — listado filtrable (planificador, vía SPA)
exports.listar = async (req, res) => {
    const Asignacion = getAsignacion(req.db);
    try {
        const filtro = {};
        if (req.query.usuarioId) filtro.usuarioId = req.query.usuarioId;
        if (req.query.otId) filtro.otId = req.query.otId;
        const asignaciones = await Asignacion.find(filtro).sort({ fechaPlanificada: 1 });
        res.json(asignaciones);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PUT /api/asignaciones/:id/cerrar?token=&entorno= — la PWA (o el planificador desde la
// SPA, sin token) marca la asignación como completada.
exports.cerrar = async (req, res) => {
    const Asignacion = getAsignacion(req.db);
    const Usuario = getUsuario(req.db);
    try {
        const asignacion = await Asignacion.findById(req.params.id);
        if (!asignacion) return res.status(404).json({ error: 'Asignación no encontrada' });

        if (req.query.token) {
            const usuario = await resolverUsuarioPorToken(Usuario, req.query.token);
            if (!usuario) return res.status(403).json({ error: 'Token inválido' });
            if (String(usuario._id) !== String(asignacion.usuarioId)) {
                return res.status(403).json({ error: 'Esta asignación no te pertenece' });
            }
        }

        asignacion.estado = 'completada';
        asignacion.fechaReal = req.body?.fechaReal || new Date().toISOString().slice(0, 10);
        await asignacion.save();
        res.json(asignacion);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const DIAS_INFORME_ATRASADO = 5; // días hábiles (confirmado con el usuario) — aproximado a días corridos

function inicioPeriodo(periodo) {
    const ahora = new Date();
    if (periodo === 'mes') return new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    if (periodo === 'trimestre') return new Date(ahora.getFullYear(), Math.floor(ahora.getMonth() / 3) * 3, 1);
    const dia = ahora.getDay();
    const lunes = new Date(ahora);
    lunes.setDate(ahora.getDate() + (dia === 0 ? -6 : 1 - dia));
    lunes.setHours(0, 0, 0, 0);
    return lunes;
}

// GET /api/asignaciones/tablero-supervisores?periodo=semana|mes|trimestre — mejora v3 #4.
// Fuentes: Asignacion (evaluaciones/ejecuciones vía Usuario.recursoId) + OT.supervisorId
// (Recurso) para "informes atrasados", que es un concepto de OT, no de Asignacion. Sin
// timestamp de "cuándo entró en Trabajo Terminado" en el modelo — se aproxima con
// ot.updatedAt, lo más cercano que existe hoy (ver nota en el código).
exports.tableroSupervisores = async (req, res) => {
    const Asignacion = getAsignacion(req.db);
    const Usuario = getUsuario(req.db);
    const Recurso = getRecurso(req.db);
    const OT = getOT(req.db);
    try {
        const desde = inicioPeriodo(req.query.periodo);
        const desdeISO = aISO(desde);

        const supervisoresRecurso = await Recurso.find({ puesto: { $regex: /supervisor/i } }).lean();
        const usuarios = await Usuario.find({ recursoId: { $in: supervisoresRecurso.map(r => r._id) } }).lean();
        const usuarioPorRecurso = new Map(usuarios.map(u => [String(u.recursoId), u]));

        const limiteAtraso = new Date(Date.now() - DIAS_INFORME_ATRASADO * 24 * 60 * 60 * 1000);

        const filas = await Promise.all(supervisoresRecurso.map(async (r) => {
            const usuario = usuarioPorRecurso.get(String(r._id));
            let evalPend = 0, evalCurso = 0, ejecPend = 0, ejecCurso = 0, completadas = 0;
            if (usuario) {
                const asignaciones = await Asignacion.find({ usuarioId: usuario._id, fechaPlanificada: { $gte: desdeISO } }).lean();
                evalPend = asignaciones.filter(a => a.tipo === 'evaluacion' && a.estado === 'pendiente').length;
                evalCurso = asignaciones.filter(a => a.tipo === 'evaluacion' && a.estado === 'en_curso').length;
                ejecPend = asignaciones.filter(a => a.tipo === 'ejecucion' && a.estado === 'pendiente').length;
                ejecCurso = asignaciones.filter(a => a.tipo === 'ejecucion' && a.estado === 'en_curso').length;
                completadas = asignaciones.filter(a => a.estado === 'completada').length;
            }
            const informesAtrasados = await OT.countDocuments({
                supervisorId: r._id, estado: 'Trabajo Terminado', updatedAt: { $lte: limiteAtraso },
            });
            const activas = evalPend + evalCurso + ejecPend + ejecCurso;
            const limite = r.senior ? 6 : 5;
            return {
                recursoId: r._id, nombre: r.nombre, puesto: r.puesto,
                evalPend, evalCurso, ejecPend, ejecCurso, completadas, informesAtrasados,
                cargaPct: Math.min(100, Math.round((activas / limite) * 100)),
            };
        }));

        res.json({ periodo: req.query.periodo || 'semana', desde: desdeISO, supervisores: filas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/asignaciones/mi-dia?token=&entorno=
exports.miDia = async (req, res) => {
    const Asignacion = getAsignacion(req.db);
    const Usuario = getUsuario(req.db);
    const OT = getOT(req.db);
    try {
        const usuario = await resolverUsuarioPorToken(Usuario, req.query.token);
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });

        const tiposPermitidos = TIPOS_POR_ROL[usuario.rol] || [];
        const hoy = aISO(new Date());
        const asignaciones = await Asignacion.find({
            usuarioId: usuario._id, fechaPlanificada: hoy, estado: { $ne: 'cancelada' },
            tipo: { $in: tiposPermitidos },
        }).sort({ createdAt: 1 });

        const supervisiones = tiposPermitidos.includes('supervision')
            ? await otsSupervisadasEnFechas(OT, usuario.recursoId, [hoy])
            : [];

        res.json({ usuario: { nombre: usuario.nombre, rol: usuario.rol }, fecha: hoy, asignaciones: [...asignaciones, ...supervisiones] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/asignaciones/mi-semana?token=&entorno=
exports.miSemana = async (req, res) => {
    const Asignacion = getAsignacion(req.db);
    const Usuario = getUsuario(req.db);
    const OT = getOT(req.db);
    try {
        const usuario = await resolverUsuarioPorToken(Usuario, req.query.token);
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });

        const tiposPermitidos = TIPOS_POR_ROL[usuario.rol] || [];
        const dias = diasDeLaSemana(new Date());
        const asignaciones = await Asignacion.find({
            usuarioId: usuario._id, fechaPlanificada: { $in: dias }, estado: { $ne: 'cancelada' },
            tipo: { $in: tiposPermitidos },
        }).sort({ fechaPlanificada: 1 });

        const supervisiones = tiposPermitidos.includes('supervision')
            ? await otsSupervisadasEnFechas(OT, usuario.recursoId, dias)
            : [];

        res.json({ usuario: { nombre: usuario.nombre, rol: usuario.rol }, dias, asignaciones: [...asignaciones, ...supervisiones] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
