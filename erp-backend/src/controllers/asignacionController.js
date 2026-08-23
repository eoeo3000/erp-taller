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
        // No se espera este guardado: es solo una marca informativa de "último acceso", y
        // cada request autenticado de la PWA pasa por acá — esperarlo duplica el
        // round-trip a Mongo de CADA llamada (visto en producción: whoami, un solo
        // findOne sin save, ya tarda ~600-800ms por la latencia propia de la conexión;
        // sumar un segundo round-trip a mi-dia/mi-semana/mi-panel era buena parte de la lentitud).
        usuario.ultimoAcceso = new Date();
        usuario.save().catch(() => {});
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

// Solicitudes que todavía necesitan una visita de evaluación. A propósito, un solo origen:
// una OT ya creada (el Planificador la aprobó desde el Panel de control, o la trató a mano)
// cuyo informeEvaluacion sigue sin completarse — coincide exactamente con el sub-estado
// "Esperando informe" que ve el Planificador en el Panel de control. Antes esta función
// TAMBIÉN incluía cualquier Solicitud cruda en 'Pendiente' sin OT (decisión previa,
// self-service: el supervisor podía tomarla antes de que el Planificador la revisara) — se
// saca a pedido explícito del dueño del negocio: el supervisor solo debe ver lo que ya pasó
// por la aprobación del Planificador, no la bandeja de entrada cruda. Esto además es lo que
// causaba que el conteo acá no coincidiera con "Esperando informe" del Panel de control.
// Comparte cálculo entre solicitudesSinInforme (S4, el listado) y miPanel (S1, el conteo)
// para que ambos se muevan siempre juntos.
async function solicitudesSinInformeDocs({ Solicitud, OT, Asignacion }) {
    const otsSinInforme = await OT.find({
        estado: 'Tratada',
        $or: [{ 'informeEvaluacion.completo': { $ne: true } }, { informeEvaluacion: { $exists: false } }],
    }).select('_id solicitudId').lean();
    const idsCandidatos = [...new Set(otsSinInforme.map(o => String(o.solicitudId || o._id)))];
    if (!idsCandidatos.length) return [];

    const solicitudes = await Solicitud.find({ _id: { $in: idsCandidatos } }).sort({ fechaCreacion: 1 }).lean();
    const evaluaciones = await Asignacion.find({ tipo: 'evaluacion', solicitudId: { $in: solicitudes.map(s => s._id) } }).select('solicitudId').lean();
    const tomadas = new Set(evaluaciones.map(a => String(a.solicitudId)));
    return solicitudes.filter(s => !tomadas.has(String(s._id)));
}

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
// Una sola consulta para las dos vistas derivadas (supervisiones y tareas por semana): antes
// cada una hacía su propio OT.find idéntico — en producción, con datos reales y sin índice
// en supervisorId, esas dos consultas duplicadas eran buena parte de por qué mi-semana
// tardaba ~8s (ver también el índice nuevo en models/OT.js).
async function otsSupervisadasPorRecurso(OT, recursoId) {
    if (!recursoId) return [];
    return OT.find({ supervisorId: recursoId, estado: { $ne: 'Pagada' } }).lean();
}

function supervisionesDesdeOTs(ots, fechasISO) {
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

// Datos por-tarea de las OT supervisadas dentro de un rango de fechas (S2 Mi semana del
// supervisor, docs/rediseno/design_handoff_pwa_supervisor/README.md §4): a diferencia de
// supervisionesDesdeOTs (una fila por OT, pensada para mi-dia/mi-semana del ejecutor), acá se
// necesita granularidad de tarea — hora real y operarioId — para dibujar las barras del
// calendario y detectar cruces de horario en el cliente.
function tareasSemanaDesdeOTs(ots, diasISO) {
    const filas = [];
    for (const ot of ots) {
        for (const t of (ot.tareas || [])) {
            if (!t.fecha || !diasISO.includes(t.fecha)) continue;
            filas.push({
                otId: ot._id, numeroOT: ot.numeroOT,
                // Rótulo de la barra en S2: número de OT completo + descripción de la OT, nada
                // más (pedido explícito — antes mostraba el cliente y las horas). El rótulo
                // puede saltar de línea en vez de recortarse, así que el límite es generoso.
                descripcion: (ot.descripcion || '').slice(0, 60),
                estadoOT: ot.estado, tareaId: String(t._id || ''),
                fecha: t.fecha, duracion: Number(t.duracion) || 0,
                horaInicio: t.horaInicio || t.hora || '', horaFin: t.horaFin || '',
                operarioId: (t.operarioId || []).map(String), operarioNombre: t.operarioNombre || [],
                completada: !!t.completada,
            });
        }
    }
    return filas;
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
        // Asignacion y OT son colecciones distintas, sin dependencia entre sí — en paralelo
        // en vez de en secuencia (cada round-trip a Mongo pesa, ver resolverUsuarioPorToken).
        const [asignaciones, otsSup] = await Promise.all([
            Asignacion.find({
                usuarioId: usuario._id, fechaPlanificada: hoy, estado: { $ne: 'cancelada' },
                tipo: { $in: tiposPermitidos },
            }).sort({ createdAt: 1 }),
            tiposPermitidos.includes('supervision') ? otsSupervisadasPorRecurso(OT, usuario.recursoId) : [],
        ]);
        const supervisiones = supervisionesDesdeOTs(otsSup, [hoy]);

        res.json({ usuario: { nombre: usuario.nombre, rol: usuario.rol }, fecha: hoy, asignaciones: [...asignaciones, ...supervisiones] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/asignaciones/mi-semana?token=&entorno=&desde= — `desde` (opcional, cualquier
// fecha ISO de la semana deseada) permite a S2 · Mi semana navegar semana anterior/
// siguiente; sin el parámetro se usa la semana actual, igual que antes (O6MiSemana no lo manda).
exports.miSemana = async (req, res) => {
    const Asignacion = getAsignacion(req.db);
    const Usuario = getUsuario(req.db);
    const OT = getOT(req.db);
    try {
        const usuario = await resolverUsuarioPorToken(Usuario, req.query.token);
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });

        const tiposPermitidos = TIPOS_POR_ROL[usuario.rol] || [];
        const base = req.query.desde ? new Date(`${req.query.desde}T12:00:00`) : new Date();
        const dias = diasDeLaSemana(base);
        // Asignacion y OT son colecciones distintas, sin dependencia entre sí — en paralelo
        // en vez de en secuencia (cada round-trip a Mongo pesa, ver resolverUsuarioPorToken).
        const [asignaciones, otsSup] = await Promise.all([
            Asignacion.find({
                usuarioId: usuario._id, fechaPlanificada: { $in: dias }, estado: { $ne: 'cancelada' },
                tipo: { $in: tiposPermitidos },
            }).sort({ fechaPlanificada: 1 }),
            tiposPermitidos.includes('supervision') ? otsSupervisadasPorRecurso(OT, usuario.recursoId) : [],
        ]);
        const supervisiones = supervisionesDesdeOTs(otsSup, dias);
        const tareasSupervisadas = tareasSemanaDesdeOTs(otsSup, dias);

        res.json({ usuario: { nombre: usuario.nombre, rol: usuario.rol }, dias, asignaciones: [...asignaciones, ...supervisiones], tareasSupervisadas });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const DIAS_ARCHIVO_PANEL = 30; // "Solicitudes ejecutadas" de S1 (README §3): últimos 30 días.

// GET /api/asignaciones/mi-panel?token=&entorno= — resumen de S1 · Mi panel (solo rol
// supervisor). Cada conteo es de alcance distinto (hoy / backlog propio / archivo de 30
// días) — no una vista de la semana, por eso no reutiliza tareasSemanaDesdeOTs.
exports.miPanel = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Asignacion = getAsignacion(req.db);
    const OT = getOT(req.db);
    const Solicitud = getSolicitud(req.db);
    try {
        const usuario = await resolverUsuarioPorToken(Usuario, req.query.token);
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });
        if (usuario.rol !== 'supervisor') return res.status(403).json({ error: 'Mi panel es solo para supervisores' });

        const hoy = aISO(new Date());
        const diasDesde = (fecha) => (fecha ? Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000) : null);
        const limiteArchivo = new Date(Date.now() - DIAS_ARCHIVO_PANEL * 24 * 60 * 60 * 1000);

        // Las cuatro consultas de arriba no dependen entre sí — en paralelo en vez de en
        // secuencia (cada round-trip a Mongo pesa, ver resolverUsuarioPorToken; en
        // producción esto era buena parte de por qué mi-panel tardaba ~1.8s).
        const [otsActivas, solicitudesSinInforme, misEvaluaciones, ejecutadas] = await Promise.all([
            // Hoy en terreno: OT que este supervisor supervisa, con trabajo hoy.
            OT.find({ supervisorId: usuario.recursoId, estado: { $in: ['Programada', 'En Ejecución'] } }).lean(),
            // Solicitudes sin informe inicial: mismo cálculo que S4 (ver solicitudesSinInformeDocs).
            solicitudesSinInformeDocs({ Solicitud, OT, Asignacion }),
            // Informes iniciales míos sin enviar: mis propias Asignacion de evaluación, no completadas.
            Asignacion.find({ tipo: 'evaluacion', usuarioId: usuario._id, estado: { $ne: 'completada' } }).sort({ createdAt: 1 }).lean(),
            // Solicitudes ejecutadas: OT que este supervisor supervisó, ya cerradas, últimos 30 días.
            OT.countDocuments({
                supervisorId: usuario.recursoId,
                estado: { $in: ['Trabajo Terminado', 'Con Informe', 'Pagada'] },
                updatedAt: { $gte: limiteArchivo },
            }),
        ]);

        const hoyEnTerreno = otsActivas.filter(ot =>
            (ot.fechaEjecucion && aISO(new Date(ot.fechaEjecucion)) === hoy) || (ot.tareas || []).some(t => t.fecha === hoy)
        );
        const contextoHoy = hoyEnTerreno.slice(0, 2).map(ot => {
            if (ot.estado === 'En Ejecución') return `${ot.numeroOT} en ejecución`;
            const tHoy = (ot.tareas || []).find(t => t.fecha === hoy);
            const hora = tHoy?.horaInicio || tHoy?.hora;
            return `${ot.numeroOT}${hora ? ` a las ${hora}` : ''} · aún no inicia`;
        });
        // IDs para que S1 pueda enlazar directo a S3 (Trabajo) sin una pantalla de listado
        // intermedia que el handoff no especifica.
        const itemsHoy = hoyEnTerreno.map(ot => ({ otId: ot._id, numeroOT: ot.numeroOT }));

        const masAntigua = solicitudesSinInforme[0] || null;

        let numeroMasAntigua = null;
        if (misEvaluaciones[0]) {
            if (misEvaluaciones[0].solicitudId) {
                const sol = await Solicitud.findById(misEvaluaciones[0].solicitudId).select('numeroSolicitud').lean();
                numeroMasAntigua = sol?.numeroSolicitud || null;
            } else if (misEvaluaciones[0].otId) {
                const otRef = await OT.findById(misEvaluaciones[0].otId).select('numeroOT').lean();
                numeroMasAntigua = otRef?.numeroOT || null;
            }
        }

        res.json({
            usuario: { nombre: usuario.nombre, puesto: usuario.puesto },
            hoyEnTerreno: { count: hoyEnTerreno.length, contexto: contextoHoy, items: itemsHoy },
            solicitudesSinInforme: { count: solicitudesSinInforme.length, diasMasAntigua: diasDesde(masAntigua?.fechaCreacion) },
            informesMiosSinEnviar: { count: misEvaluaciones.length, numeroMasAntigua, diasMasAntigua: misEvaluaciones[0] ? diasDesde(misEvaluaciones[0].createdAt) : null },
            solicitudesEjecutadas: { count: ejecutadas },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/asignaciones/solicitudes-sin-informe?token=&entorno= — S4 · Sin informe inicial.
// "Sin supervisor" = ninguna Asignacion de evaluación creada todavía para esa Solicitud
// (mismo cálculo que el conteo de miPanel, ver solicitudesSinInformeDocs).
exports.solicitudesSinInforme = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Asignacion = getAsignacion(req.db);
    const Solicitud = getSolicitud(req.db);
    const OT = getOT(req.db);
    try {
        const usuario = await resolverUsuarioPorToken(Usuario, req.query.token);
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });
        if (usuario.rol !== 'supervisor') return res.status(403).json({ error: 'Solo para supervisores' });

        const disponibles = await solicitudesSinInformeDocs({ Solicitud, OT, Asignacion });

        res.json({
            solicitudes: disponibles.map(s => ({
                _id: s._id, numeroSolicitud: s.numeroSolicitud, descripcion: s.descripcion,
                empresaSolicitante: s.empresaSolicitante, direccion: s.direccion,
                diasEsperando: Math.floor((Date.now() - new Date(s.fechaCreacion).getTime()) / 86400000),
            })),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PUT /api/asignaciones/tomar-solicitud/:solicitudId?token=&entorno= — S4: un solo PUT,
// asigna supervisor + crea la visita de evaluación + saca la solicitud de la bandeja de los
// demás, sin confirmación de oficina (README §6). El índice único de Asignacion.solicitudId
// (ver models/Asignacion.js) es lo que hace el 409 real ante dos supervisores a la vez —
// no una carrera de "leer y después escribir" que igual podría perder.
exports.tomarSolicitud = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Asignacion = getAsignacion(req.db);
    const Solicitud = getSolicitud(req.db);
    try {
        const usuario = await resolverUsuarioPorToken(Usuario, req.query.token);
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });
        if (usuario.rol !== 'supervisor') return res.status(403).json({ error: 'Solo para supervisores' });

        const { fecha, hora } = req.body;
        if (!fecha || !hora) return res.status(400).json({ error: 'fecha y hora son requeridas' });

        const solicitud = await Solicitud.findById(req.params.solicitudId);
        if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

        let asignacion;
        try {
            asignacion = await Asignacion.create({
                tipo: 'evaluacion', usuarioId: usuario._id, solicitudId: solicitud._id,
                fechaPlanificada: fecha, horaPlanificada: hora,
            });
        } catch (eCrear) {
            if (eCrear.code === 11000) {
                const existente = await Asignacion.findOne({ tipo: 'evaluacion', solicitudId: solicitud._id });
                const otroUsuario = existente ? await Usuario.findById(existente.usuarioId).select('nombre').lean() : null;
                return res.status(409).json({ error: `Ya la tomó ${otroUsuario?.nombre || 'otro supervisor'}` });
            }
            throw eCrear;
        }

        res.status(201).json(asignacion);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// El informe ya no tiene los 4 pasos cualitativos (condicionesSitio/riesgos/metodologia/
// recursosObservados) — se retiraron a pedido explícito, el informe es directamente la lista
// de hallazgos. Antes esto contaba esos 4 campos; ahora cuenta hallazgos registrados.
function hallazgosRegistrados(informeEvaluacion) {
    return (informeEvaluacion?.hallazgos || []).length;
}

// GET /api/asignaciones/mis-informes?token=&entorno= — S5 · Mis informes.
// El informe vive en OT.informeEvaluacion, no en Solicitud — pero antes de guardarlo por
// primera vez la OT todavía no existe como documento propio. Se busca en OT usando el MISMO
// _id de la Solicitud, porque ese es el _id que va a tener la OT una vez creada (ver
// otController.actualizarOT, upsert que reutiliza solicitud._id) — no es una coincidencia.
exports.misInformes = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Asignacion = getAsignacion(req.db);
    const Solicitud = getSolicitud(req.db);
    const OT = getOT(req.db);
    try {
        const usuario = await resolverUsuarioPorToken(Usuario, req.query.token);
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });
        if (usuario.rol !== 'supervisor') return res.status(403).json({ error: 'Solo para supervisores' });

        const mias = await Asignacion.find({ tipo: 'evaluacion', usuarioId: usuario._id }).sort({ fechaPlanificada: 1 }).lean();
        const solicitudIds = mias.map(a => a.solicitudId).filter(Boolean);
        const solicitudes = solicitudIds.length ? await Solicitud.find({ _id: { $in: solicitudIds } }).lean() : [];
        const solicitudPorId = new Map(solicitudes.map(s => [String(s._id), s]));
        const ots = solicitudIds.length ? await OT.find({ _id: { $in: solicitudIds } }).lean() : [];
        const otPorId = new Map(ots.map(o => [String(o._id), o]));

        const diasDesde = (fecha) => (fecha ? Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000) : null);
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);

        const pendientes = [];
        const enviados = [];
        for (const a of mias) {
            const sol = solicitudPorId.get(String(a.solicitudId));
            if (!sol) continue;
            const ot = otPorId.get(String(a.solicitudId));
            const base = {
                _id: a._id, solicitudId: a.solicitudId, numeroSolicitud: sol.numeroSolicitud, descripcion: sol.descripcion,
                empresaSolicitante: sol.empresaSolicitante, direccion: sol.direccion,
                fechaPlanificada: a.fechaPlanificada, horaPlanificada: a.horaPlanificada,
            };
            if (a.estado === 'completada') {
                if (new Date(a.updatedAt) >= inicioMes) {
                    const desenlace = (ot && !['Pendiente', 'Tratada'].includes(ot.estado)) ? 'Cotizada' : 'En oficina';
                    enviados.push({ ...base, numeroOT: ot?.numeroOT || null, fechaEnvio: a.updatedAt, desenlace, revision: ot?.informeEvaluacion?.revision || null });
                }
            } else {
                pendientes.push({ ...base, hallazgos: hallazgosRegistrados(ot?.informeEvaluacion), diasDesdeVisita: diasDesde(a.fechaPlanificada) });
            }
        }

        res.json({ pendientes, enviados });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/asignaciones/ejecutadas?token=&entorno= — S6 · archivo de solo consulta.
exports.ejecutadas = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const OT = getOT(req.db);
    try {
        const usuario = await resolverUsuarioPorToken(Usuario, req.query.token);
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });
        if (usuario.rol !== 'supervisor') return res.status(403).json({ error: 'Solo para supervisores' });

        const limite = new Date(Date.now() - DIAS_ARCHIVO_PANEL * 24 * 60 * 60 * 1000);
        const ots = await OT.find({
            supervisorId: usuario.recursoId,
            estado: { $in: ['Trabajo Terminado', 'Con Informe', 'Pagada'] },
            updatedAt: { $gte: limite },
        }).sort({ updatedAt: -1 }).lean();

        res.json({
            ots: ots.map(ot => ({
                _id: ot._id, numeroOT: ot.numeroOT, descripcion: ot.descripcion, solicitante: ot.solicitante,
                cerrado: ot.updatedAt,
                horas: (ot.tareas || []).reduce((a, t) => a + (Number(t.duracion) || 0), 0),
                fotos: (ot.reportes || []).filter(r => r.foto).length + (ot.tareas || []).reduce((a, t) => a + (t.registro?.fotos?.length || 0), 0),
            })),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
