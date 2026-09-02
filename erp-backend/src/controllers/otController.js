const getOT = require('../models/OT');
const getRecurso = require('../models/Recurso');
const getUsuario = require('../models/Usuario');
const getAsignacion = require('../models/Asignacion');
const { guardarAdjuntoSiEsBase64 } = require('../utils/adjuntos');

// Los 3 documentos del flujo chileno de pago (Orden de Compra → Estado de Pago/EDP → Hoja de
// Entrada de Servicio/HES) reemplazan el selector manual Pendiente/Parcial/Pagado (TabPago.jsx,
// erp-web) — con los 3 completos (número o archivo, no hace falta ambos) el pago se considera
// Pagado. `anulado` sigue pudiendo forzarlo de vuelta a Pendiente aunque estén completos.
function documentosPagoCompletos(ordenCompra, ordenCompraArchivo, pago) {
    const hayDoc = (d) => !!(d?.numero || d?.archivo);
    return !!(ordenCompra || ordenCompraArchivo) && hayDoc(pago?.estadoPago) && hayDoc(pago?.hes);
}

// La aprobación del cliente queda abierta un máximo de 12h desde que se envía la cotización
// (o hasta que el planificador la cancele desde Tratamiento, ver actualizarOT) — pasado eso,
// deja de poder aprobarse y de bloquear capacidad en el Gantt (GanttScreen.jsx duplica este
// mismo criterio, no hay forma de compartir código entre el backend y el frontend acá).
const HORAS_LIMITE_APROBACION_COTIZACION = 12;
function cotizacionVencida(ot) {
    return !!(
        ot.cotizacion?.enviada && ot.cotizacion?.respuestaCliente === 'Pendiente' && ot.cotizacion?.fechaEnvio
        && (Date.now() - new Date(ot.cotizacion.fechaEnvio).getTime()) > HORAS_LIMITE_APROBACION_COTIZACION * 3600 * 1000
    );
}

// Acciones sobre una OT en terreno (iniciar/posponer/interrumpir/reporte/terminar) —
// compartida por supervisorAccion (token por OT, portal HTML) y accionMovil (token por
// persona, PWA Operativa, ver docs/rediseno/design_handoff_pwa_movil/README.md §5, O3/O4).
// Un solo lugar con la lógica de negocio; cada endpoint solo decide CÓMO se autoriza.
function aplicarAccionOT(ot, { accion, motivo, comentario, foto, usuarioNombre = 'Supervisor' }) {
    if (accion === 'iniciar') {
        ot.estado = 'En Ejecución';
    } else if (accion === 'posponer') {
        if (!motivo) { const e = new Error('Motivo requerido'); e.status = 400; throw e; }
        ot.reportes = ot.reportes || [];
        ot.reportes.push({ comentario: `⏸️ TRABAJO POSPUESTO: ${motivo}`, fecha: new Date(), usuario: usuarioNombre });
        ot.estado = 'Programada';
    } else if (accion === 'interrumpir') {
        if (!motivo) { const e = new Error('Motivo requerido'); e.status = 400; throw e; }
        ot.reportes = ot.reportes || [];
        ot.reportes.push({ comentario: `⚠️ TRABAJO INTERRUMPIDO: ${motivo}`, fecha: new Date(), usuario: usuarioNombre });
        ot.estado = 'Programada';
    } else if (accion === 'reporte') {
        if (!comentario && !foto) { const e = new Error('Comentario o foto requeridos'); e.status = 400; throw e; }
        ot.reportes = ot.reportes || [];
        ot.reportes.push({ comentario: comentario || '', foto: foto || '', fecha: new Date(), usuario: usuarioNombre });
        if (ot.estado === 'Trabajo Terminado') ot.estado = 'Con Informe';
    } else if (accion === 'terminar') {
        ot.estado = 'Trabajo Terminado';
    } else if (accion === 'reabrir') {
        // Solo desde S3 (supervisor), solo tiene sentido sobre una OT 'Trabajo Terminado' (el
        // frontend es el que gatea cuándo mostrar el botón — acá no se valida el estado previo,
        // mismo criterio que el resto de estas acciones). Vuelve a 'En Ejecución' — mismo
        // estado que dejaba 'terminar', así que las tareas/checkboxes/registro quedan editables
        // de nuevo sin duplicar esa lógica. Pensado para dos casos: falta agregar una foto o un
        // comentario a alguna tarea, o la OT se cerró por error.
        if (!motivo) { const e = new Error('Motivo requerido'); e.status = 400; throw e; }
        ot.estado = 'En Ejecución';
        ot.reportes = ot.reportes || [];
        ot.reportes.push({ comentario: `🔓 OT REABIERTA: ${motivo}`, fecha: new Date(), usuario: usuarioNombre });
    } else if (accion === 'reprogramar') {
        // Solo desde S3 (supervisor) — no está en el flujo de O3 (ejecutor). La OT necesita una
        // fecha nueva; el planificador la reasigna en Tareas (Tratamiento) y recién vuelve a
        // 'Programada' al reconfirmar capacidad en el Gantt (GanttScreen.confirmarCapacidad) —
        // mismo gate que exige capacidadVerificada antes de poder enviar la cotización la
        // primera vez. Se resetea acá para que ese botón vuelva a pedirse.
        if (!motivo) { const e = new Error('Motivo requerido'); e.status = 400; throw e; }
        ot.estado = 'Reprogramar';
        if (ot.cotizacion) ot.cotizacion.capacidadVerificada = false;
        ot.reportes = ot.reportes || [];
        ot.reportes.push({ comentario: `📅 REPROGRAMACIÓN SOLICITADA: ${motivo}`, fecha: new Date(), usuario: usuarioNombre });
    } else if (accion === 'replanificar') {
        // Solo desde S3 — la OT sigue en curso, pero necesita más HH/materiales de lo cotizado.
        // Crea de una vez el borrador de la excepción con el motivo del supervisor, para que el
        // planificador no arranque de cero, solo la complete con precios (ver
        // aplicarRespuestaExcepcion y TratamientoScreen.jsx, pestaña Excepciones).
        if (!motivo) { const e = new Error('Motivo requerido'); e.status = 400; throw e; }
        ot.subEstado = 'Replanificar';
        ot.excepciones = ot.excepciones || [];
        ot.excepciones.push({ descripcion: motivo, foto: foto || '', creadoPor: usuarioNombre, fecha: new Date() });
        ot.reportes = ot.reportes || [];
        ot.reportes.push({ comentario: `🔧 REPLANIFICACIÓN SOLICITADA: ${motivo}`, fecha: new Date(), usuario: usuarioNombre });
    } else {
        const e = new Error('Acción no reconocida'); e.status = 400; throw e;
    }
}

// Siguiente numeroOT correlativo — antes había 3 copias de este cálculo (convertirOT,
// asignarSupervisor, actualizarOT), cada una con su propio bug: ordenar por numeroOT como
// STRING (o contar documentos) se rompe apenas existe un numeroOT no numérico en el medio
// (ej. uno cargado a mano) — "OT-2026-TEST2" ordena después de "OT-2026-0012" alfabéticamente,
// así que la "última OT" detectada quedaba mal y el correlativo volvía a partir de 0001,
// chocando con una OT ya existente (E11000 duplicate key, encontrado probando el nuevo flujo
// de "Aprobar crea la OT"). Acá se ignora cualquier numeroOT que no matchee el patrón
// numérico estricto y se calcula el máximo real entre los que sí matchean.
async function siguienteNumeroOT(OT) {
    const ots = await OT.find({ numeroOT: { $regex: /^OT-2026-\d+$/ } }, 'numeroOT').lean();
    const maximo = ots.reduce((max, o) => {
        const n = parseInt(o.numeroOT.split('-').pop(), 10);
        return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    return `OT-2026-${(maximo + 1).toString().padStart(4, '0')}`;
}

// El numeroOT usa el mismo correlativo que ya trae la Solicitud (SOL-2026-0009 ->
// OT-2026-0009) en vez de un contador propio — antes cada uno llevaba su cuenta aparte, y
// como no toda Solicitud se convierte en OT (algunas se rechazan antes), los números se
// desalineaban: una OT con número más bajo que el de su propia Solicitud, o viceversa,
// confuso al buscar "la OT 0009" pensando en el número de la solicitud. Como cada OT
// reutiliza el _id de su Solicitud (relación uno a uno), el correlativo de la Solicitud
// nunca choca entre dos OT distintas. Si por algún motivo la Solicitud no tiene
// numeroSolicitud (no debería pasar, se genera solo al crearla), cae al correlativo propio
// de OT como respaldo, para no dejar la conversión sin número.
function numeroOTDesdeSolicitud(numeroSolicitud) {
    return numeroSolicitud ? numeroSolicitud.replace(/^SOL-/, 'OT-') : null;
}

// --- Reserva/liberación de recursos por cambio de estado de la OT (ver docs/funcionalidades-v2.md, Gap 4) ---
// OT.componentes puede traer catalogoId (ObjectId real hacia EquiposHerramientas, capturado
// cuando se elige desde el autocompletado — ver TabEquiposMateriales.jsx) además del
// 'codigo' de texto histórico. El cruce prioriza catalogoId cuando está presente; codigo
// queda como fallback para componentes cargados antes de este cambio o tecleados a mano
// (Suministro no tiene un punto de captura de catalogoId hoy — no hay autocompletado contra
// ese catálogo dentro de OT.componentes — así que esa rama sigue por codigo únicamente).
// Ver plan de robustecimiento, punto 7 (antes era un cruce 100% por texto, "best-effort" —
// un typo o un código reutilizado rompía esto en silencio).
// NOTA: esta función no es un handler (req,res) — recibe la conexión explícitamente como `conn`
// porque se invoca desde varios handlers distintos (actualizarOT, responderCotizacionCliente).
async function aplicarReservaPorCambioEstado(otAnterior, otNueva, conn) {
    try {
        const estadoAnt = otAnterior?.estado;
        const estadoNuevo = otNueva?.estado;
        if (!otNueva || estadoAnt === estadoNuevo) return;

        const EquiposHerramientas = require('../models/equiposHerramientas')(conn);
        const Suministro = require('../models/suministro')(conn);
        const MovimientoStock = require('../models/MovimientoStock')(conn);
        const componentes = otNueva.componentes || [];

        const esEquipo = (c) => c.tipo === 'Equipo' || c.tipo === 'Herramienta';
        const filtroEquipo = (c) => c.catalogoId ? { _id: c.catalogoId } : { codigo: c.codigo };

        // Cliente aprobó la cotización y quedó agendada: reservar herramientas/equipos e
        // insumos comprometidos. Guard específico en la transición Planificada->Programada
        // (no "cualquier entrada a Programada"): aplicarAccionOT también usa 'Programada'
        // como destino de posponer/interrumpir desde 'En Ejecución', y un guard más amplio
        // volvería a reservar equipos que ya están 'En Uso'.
        if (estadoAnt === 'Planificada' && estadoNuevo === 'Programada') {
            for (const c of componentes) {
                if (!c.codigo && !c.catalogoId) continue;
                if (esEquipo(c)) {
                    await EquiposHerramientas.updateOne({ ...filtroEquipo(c), estado: 'Disponible' }, { estado: 'Reservado' });
                } else {
                    const suministro = await Suministro.findOne({ codigo: c.codigo });
                    if (suministro) {
                        await Suministro.updateOne({ _id: suministro._id }, { $inc: { stockReservado: Number(c.cantidad) || 0 } });
                        await MovimientoStock.create({
                            suministroId: suministro._id, tipo: 'Reserva', cantidad: Number(c.cantidad) || 0,
                            otId: otNueva._id, motivo: `Reserva por aprobación de OT ${otNueva.numeroOT || ''}`
                        });
                    }
                }
            }
        }

        // Inicia la ejecución en terreno: lo reservado pasa a estar en uso
        if (estadoNuevo === 'En Ejecución' && estadoAnt !== 'En Ejecución') {
            for (const c of componentes) {
                if ((c.codigo || c.catalogoId) && esEquipo(c)) {
                    await EquiposHerramientas.updateOne({ ...filtroEquipo(c), estado: 'Reservado' }, { estado: 'En Uso' });
                }
            }
        }

        // Faena completada: libera herramientas/equipos e insumos reservados
        if (estadoNuevo === 'Trabajo Terminado' && estadoAnt !== 'Trabajo Terminado') {
            for (const c of componentes) {
                if (!c.codigo && !c.catalogoId) continue;
                if (esEquipo(c)) {
                    await EquiposHerramientas.updateOne({ ...filtroEquipo(c), estado: 'En Uso' }, { estado: 'Disponible' });
                } else {
                    const suministro = await Suministro.findOne({ codigo: c.codigo });
                    if (suministro) {
                        const delta = -(Number(c.cantidad) || 0);
                        await Suministro.updateOne({ _id: suministro._id }, { $inc: { stockReservado: delta } });
                        await MovimientoStock.create({
                            suministroId: suministro._id, tipo: 'Liberación', cantidad: delta,
                            otId: otNueva._id, motivo: `Liberación al terminar OT ${otNueva.numeroOT || ''}`
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[Reservas] Hook de cambio de estado falló (sin impacto en la operación):', e.message);
    }
}

// 1. Obtener toda la data (OTs, Solicitudes y Recursos)
exports.getAllData = async (req, res) => {
    const OT = getOT(req.db);
    const Recurso = getRecurso(req.db);
    try {
        const Solicitud = require('../models/Solicitud')(req.db);
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
    const OT = getOT(req.db);
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
    const OT = getOT(req.db);
    try {
        const data = req.body;
        const idSolicitud = data._id || data.solicitudId;

        // Generación de número con guiones — mismo correlativo que la Solicitud (ver
        // numeroOTDesdeSolicitud).
        if (!data.numeroOT) {
            let numeroSolicitud = data.numeroSolicitud;
            if (!numeroSolicitud) {
                const Solicitud = require('../models/Solicitud')(req.db);
                const sol = await Solicitud.findById(idSolicitud).select('numeroSolicitud').lean();
                numeroSolicitud = sol?.numeroSolicitud;
            }
            data.numeroOT = numeroOTDesdeSolicitud(numeroSolicitud) || await siguienteNumeroOT(OT);
        }

        const { _id, ...updateData } = data;

        const nuevaOT = await OT.findByIdAndUpdate(
            idSolicitud,
            {
                ...updateData,
                solicitudId: idSolicitud,
                numeroOT: data.numeroOT,
                estado: 'Tratada',
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
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const otAEliminar = await OT.findById(id);
        if (!otAEliminar) return res.status(404).json({ message: "OT no encontrada" });
        // Una OT 'Pagada' es un registro financiero cerrado — borrarla resetea la Solicitud a
        // 'Pendiente' y pierde para siempre el historial de ejecución/pago. Chequeo en el
        // backend (no solo ocultar el botón en el frontend) porque es la única defensa real
        // contra un DELETE directo a la API.
        if (otAEliminar.estado === 'Pagada') {
            return res.status(400).json({ error: 'No se puede eliminar una OT pagada — es un registro financiero cerrado.' });
        }

        const idSolicitudVinculada = otAEliminar.solicitudId || otAEliminar._id;
        await OT.findByIdAndDelete(id);

        const Solicitud = require('../models/Solicitud')(req.db);
        await Solicitud.findByIdAndUpdate(idSolicitudVinculada, { estado: 'Pendiente', numeroOT: null });

        // Limpia las Asignacion de este ciclo (evaluación/ejecución/supervisión) — si no, la
        // Asignacion tipo 'evaluacion' del ciclo eliminado sigue bloqueando la solicitud en
        // solicitudesSinInformeDocs (S4/mi-panel la ve como "ya tomada" aunque la OT nueva
        // parta sin informe), y además choca contra el índice único de solicitudId al intentar
        // crear una evaluación nueva. Mismo criterio que la limpieza en cascada al eliminar
        // Recurso/Calendario (ver models/OT.js).
        const Asignacion = require('../models/Asignacion')(req.db);
        await Asignacion.deleteMany({ $or: [{ otId: id }, { solicitudId: idSolicitudVinculada }] });

        res.status(200).json({ message: "OT eliminada y solicitud liberada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 5. Obtener OT por ID de Solicitud (Búsqueda híbrida para evitar el 404)
exports.obtenerOTPorSolicitud = async (req, res) => {
    const OT = getOT(req.db);
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
    const OT = getOT(req.db);
    try {
        const ot = await OT.findById(req.params.id);
        if (!ot) return res.status(404).json({ message: "No encontrado" });
        res.json(ot);
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
};

// 6b. GET — Pestaña Antecedentes: solicitud de origen (solo lectura) + datos de la OT
// (asignación) + candidatos a supervisor. :id puede ser una Solicitud sin OT creada
// todavía (mismo patrón híbrido que obtenerOTPorSolicitud/actualizarOT: la OT reutiliza
// el _id de la Solicitud que la originó).
exports.antecedentes = async (req, res) => {
    const OT = getOT(req.db);
    const Recurso = getRecurso(req.db);
    const Solicitud = require('../models/Solicitud')(req.db);
    const Cliente = require('../models/Cliente')(req.db);
    try {
        const { id } = req.params;
        const ot = await OT.findById(id).lean();
        const solicitudId = ot?.solicitudId || id;
        const sol = await Solicitud.findById(solicitudId).lean();
        if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });

        // Nombre ACTUAL del Cliente si la solicitud ya quedó vinculada (Solicitud.clienteId) —
        // si se renombra el Cliente, Antecedentes lo refleja al toque en vez de mostrar el
        // texto que quedó escrito cuando se creó la solicitud.
        const cliente = sol.clienteId ? await Cliente.findById(sol.clienteId).select('empresa').lean() : null;

        let supervisor = null;
        if (ot?.supervisorId) {
            const r = await Recurso.findById(ot.supervisorId).select('nombre puesto').lean();
            if (r) supervisor = { id: r._id, nombre: r.nombre, puesto: r.puesto };
        }

        // Supervisores = personal (Recurso) con puesto de supervisor, no Usuario (acceso
        // móvil PWA). El puesto es texto libre propio del rubro ("Supervisora de
        // Terreno", no "Supervisor" a secas), así que se filtra por coincidencia de la
        // palabra "supervisor" (sin distinguir mayúsculas ni género), no por igualdad
        // exacta contra un enum fijo — eso último deja el selector vacío con datos reales.
        const candidatos = await Recurso.find({ puesto: { $regex: /supervisor/i } })
            .select('nombre puesto').sort({ nombre: 1 }).lean();

        res.json({
            solicitud: {
                numero: sol.numeroSolicitud || null,
                // Teléfono: es lo que el cliente usa junto con el número de solicitud para
                // entrar al Portal Cliente (design_handoff_pwa_movil §6, C1) — sin verlo acá,
                // nadie en la oficina puede confirmárselo si lo pide.
                telefono: sol.numero || '',
                empresa: cliente?.empresa || sol.empresaSolicitante,
                solicitante: sol.solicitante,
                fechaSolicitud: sol.fechaHoraSolicitud || sol.fechaCreacion,
                origen: sol.origen,
                direccion: sol.direccion || '',
                fechaEjecucionSolicitada: sol.fechaEjecucionSolicitada,
                adjuntos: sol.adjuntos ? [sol.adjuntos] : [],
                descripcion: sol.descripcion,
            },
            ot: {
                numero: ot?.numeroOT || null,
                estado: ot?.estado || null,
                fechaCreacion: ot?.fechaCreacion || null,
                supervisorId: ot?.supervisorId || null,
                supervisor,
                fechaEjecucion: ot?.fechaEjecucion || null,
                prioridad: ot?.prioridad || 'Normal',
                instruccionesTerreno: ot?.instruccionesTerreno || '',
                asignadaEn: ot?.asignadaEn || null,
                asignadaPor: ot?.asignadaPor || null,
            },
            candidatos: candidatos.map(u => ({ id: u._id, nombre: u.nombre, puesto: u.puesto })),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6c. PATCH — Asigna/reasigna el supervisor a cargo de la OT y el resto de los datos de
// la pestaña Antecedentes. Si la OT no existe todavía (solicitud sin tratar), la crea con
// el mismo patrón de numeración que convertirOT/actualizarOT.
exports.asignarSupervisor = async (req, res) => {
    const OT = getOT(req.db);
    const Recurso = getRecurso(req.db);
    const Solicitud = require('../models/Solicitud')(req.db);
    try {
        const { id } = req.params;
        const { supervisorId, fechaEjecucion, prioridad, instruccionesTerreno } = req.body;

        let ot = await OT.findById(id);
        if (!ot) {
            const sol = await Solicitud.findById(id);
            if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });

            ot = new OT({
                ...sol.toObject(),
                _id: sol._id,
                solicitudId: sol._id,
                numeroOT: numeroOTDesdeSolicitud(sol.numeroSolicitud) || await siguienteNumeroOT(OT),
                estado: 'Tratada',
            });
        }

        if (ot.estado === 'Pagada') {
            return res.status(409).json({ error: 'La OT está pagada; no admite cambios en Antecedentes.' });
        }

        if (prioridad && !['Baja', 'Normal', 'Urgente'].includes(prioridad)) {
            return res.status(422).json({ error: "prioridad debe ser 'Baja', 'Normal' o 'Urgente'" });
        }

        let supervisorNuevo = null;
        if (supervisorId) {
            supervisorNuevo = await Recurso.findById(supervisorId);
            // Mismo criterio que la lista de candidatos en antecedentes(): puesto que
            // contiene "supervisor" (sin distinguir mayúsculas ni género).
            if (!supervisorNuevo || !/supervisor/i.test(supervisorNuevo.puesto || '')) {
                return res.status(422).json({ error: 'El supervisor seleccionado no es válido' });
            }
        }

        if (fechaEjecucion) {
            const fecha = new Date(fechaEjecucion);
            if (isNaN(fecha.getTime())) return res.status(422).json({ error: 'Fecha de ejecución inválida' });
            const creacion = ot.fechaCreacion ? new Date(new Date(ot.fechaCreacion).toDateString()) : null;
            if (creacion && fecha < creacion) {
                return res.status(422).json({ error: 'La fecha de ejecución no puede ser anterior a la fecha de creación de la OT' });
            }
            ot.fechaEjecucion = fecha;
        }

        // Snapshot del supervisor anterior para la bitácora, antes de sobrescribir.
        const supervisorAnteriorId = ot.supervisorId;
        const supervisorAnterior = supervisorAnteriorId
            ? await Recurso.findById(supervisorAnteriorId).select('nombre puesto').lean()
            : null;

        if (prioridad) ot.prioridad = prioridad;
        if (instruccionesTerreno !== undefined) ot.instruccionesTerreno = instruccionesTerreno;

        if (supervisorNuevo) {
            ot.supervisorId = supervisorNuevo._id;
            ot.asignadaEn = new Date();
            // asignadaPor queda null: no existe sesión de staff interno hoy (ver default del schema).

            ot.bitacora = ot.bitacora || [];
            const texto = supervisorAnterior && String(supervisorAnteriorId) !== String(supervisorNuevo._id)
                ? `OT reasignada de ${supervisorAnterior.nombre} (${supervisorAnterior.puesto}) a ${supervisorNuevo.nombre} (${supervisorNuevo.puesto})`
                : `OT asignada a ${supervisorNuevo.nombre} (${supervisorNuevo.puesto})`;
            ot.bitacora.push({ fecha: new Date(), texto });
        }

        await ot.save();

        // Empuja el informe inicial al supervisor recién asignado. Sin esto, asignar desde
        // Antecedentes solo guardaba OT.supervisorId — el informe seguía siendo 100%
        // autoservicio (tomarSolicitud): el supervisor asignado nunca lo veía en sus
        // solicitudes "Asignadas a mí" a menos que él mismo fuera a tomarla del pool.
        // misInformes resuelve todo por Asignacion(tipo:'evaluacion').solicitudId, no por
        // OT.supervisorId — de ahí que asignar no "llegara" a la app del supervisor.
        // Reasigna la Asignacion existente en vez de crear una segunda: el índice único de
        // solicitudId (ver models/Asignacion.js) solo admite una por solicitud.
        if (supervisorNuevo && !ot.informeEvaluacion?.completo) {
            try {
                const Usuario = getUsuario(req.db);
                const Asignacion = getAsignacion(req.db);
                const usuarioSupervisor = supervisorNuevo.usuarioId
                    ? await Usuario.findById(supervisorNuevo.usuarioId)
                    : null;
                if (usuarioSupervisor && usuarioSupervisor.rol === 'supervisor' && usuarioSupervisor.estado === 'activo') {
                    const solicitudIdParaEvaluacion = ot.solicitudId || ot._id;
                    const existente = await Asignacion.findOne({ tipo: 'evaluacion', solicitudId: solicitudIdParaEvaluacion });
                    if (existente) {
                        if (String(existente.usuarioId) !== String(usuarioSupervisor._id)) {
                            existente.usuarioId = usuarioSupervisor._id;
                            await existente.save();
                        }
                    } else {
                        await Asignacion.create({ tipo: 'evaluacion', usuarioId: usuarioSupervisor._id, solicitudId: solicitudIdParaEvaluacion });
                    }
                }
            } catch (eAsignacion) {
                console.warn('[Asignacion] No se pudo empujar el informe inicial al supervisor asignado:', eAsignacion.message);
            }
        }

        const otRespuesta = ot.toObject();
        otRespuesta.supervisor = supervisorNuevo
            ? { id: supervisorNuevo._id, nombre: supervisorNuevo.nombre, puesto: supervisorNuevo.puesto }
            : supervisorAnterior
                ? { id: supervisorAnteriorId, nombre: supervisorAnterior.nombre, puesto: supervisorAnterior.puesto }
                : null;
        res.json(otRespuesta);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 7. Webhook Emails
exports.webhookEmail = async (req, res) => {
    const OT = getOT(req.db);
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
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const datosCuerpo = req.body;

        // Snapshot previo para detectar transiciones contables
        const otAnterior = await OT.findById(id).lean();

        // Pestaña Antecedentes: sin supervisor asignado, la OT no puede pasar a Programada.
        if (datosCuerpo.estado === 'Programada') {
            const supervisorFinal = ('supervisorId' in datosCuerpo) ? datosCuerpo.supervisorId : otAnterior?.supervisorId;
            if (!supervisorFinal) {
                return res.status(409).json({ error: 'La OT no tiene supervisor asignado' });
            }
        }

        // fechaEjecucion es lo que usa la PWA Operativa para decidir si una OT le aparece
        // hoy/esta semana a su supervisor (ver asignacionController.otsSupervisadasEnFechas)
        // — si nadie la pone a mano en Antecedentes, la OT queda invisible en el celular
        // aunque ya tenga tareas con fecha real. Se deriva sola de la primera tarea con
        // fecha, salvo que este mismo guardado ya venga con una fechaEjecucion explícita
        // (ej. desde el propio formulario de Antecedentes, que no toca tareas[]).
        if (Array.isArray(datosCuerpo.tareas) && !('fechaEjecucion' in datosCuerpo)) {
            const fechasTareas = datosCuerpo.tareas.map(t => t.fecha).filter(Boolean).sort();
            if (fechasTareas.length > 0) datosCuerpo.fechaEjecucion = fechasTareas[0];
        }

        // Documentos de pago (OC/EDP/HES): un archivo nuevo llega como data-URI base64 (mismo
        // criterio que Solicitud.adjuntos) — se guarda como archivo real antes de tocar Mongo.
        if ('ordenCompraArchivo' in datosCuerpo) {
            datosCuerpo.ordenCompraArchivo = guardarAdjuntoSiEsBase64(datosCuerpo.ordenCompraArchivo);
        }
        if (datosCuerpo.pago?.estadoPago?.archivo) {
            datosCuerpo.pago.estadoPago.archivo = guardarAdjuntoSiEsBase64(datosCuerpo.pago.estadoPago.archivo);
        }
        if (datosCuerpo.pago?.hes?.archivo) {
            datosCuerpo.pago.hes.archivo = guardarAdjuntoSiEsBase64(datosCuerpo.pago.hes.archivo);
        }
        // pago.estado ya no es un selector manual (TabPago.jsx quitó Pendiente/Parcial/Pagado)
        // — se recalcula acá a partir de si los 3 documentos están completos, sin confiar en
        // lo que mande el llamador. Si el llamador no vino ya con `estado` propio (TabPago sí
        // manda el suyo, calculado igual), se refleja también en el pipeline de la OT.
        if ('pago' in datosCuerpo || 'ordenCompra' in datosCuerpo || 'ordenCompraArchivo' in datosCuerpo) {
            const ordenCompra = ('ordenCompra' in datosCuerpo) ? datosCuerpo.ordenCompra : otAnterior?.ordenCompra;
            const ordenCompraArchivo = ('ordenCompraArchivo' in datosCuerpo) ? datosCuerpo.ordenCompraArchivo : otAnterior?.ordenCompraArchivo;
            const pagoMerge = { ...(otAnterior?.pago || {}), ...(datosCuerpo.pago || {}) };
            const completos = documentosPagoCompletos(ordenCompra, ordenCompraArchivo, pagoMerge);
            pagoMerge.estado = (completos && !pagoMerge.anulado) ? 'Pagado' : 'Pendiente';
            datosCuerpo.pago = pagoMerge;
            if (!('estado' in datosCuerpo)) {
                if (pagoMerge.estado === 'Pagado') datosCuerpo.estado = 'Pagada';
                else if (otAnterior?.estado === 'Pagada') datosCuerpo.estado = 'Con Informe';
            }
        }

        // 1. Intentar actualizar (Usamos $set para campos normales y nos aseguramos de traer la OT nueva)
        let ot = await OT.findByIdAndUpdate(
            id,
            { $set: datosCuerpo },
            { new: true, runValidators: true }
        );

        // 2. Lógica de creación si no existe (Tu lógica original mejorada)
        if (!ot) {
            const Solicitud = require('../models/Solicitud')(req.db);
            const solicitud = await Solicitud.findById(id);

            if (solicitud) {
                // Creamos la nueva OT
                ot = new OT({
                    ...solicitud.toObject(),
                    ...datosCuerpo,
                    _id: solicitud._id,
                    solicitudId: solicitud._id,
                    numeroOT: numeroOTDesdeSolicitud(solicitud.numeroSolicitud) || await siguienteNumeroOT(OT),
                    estado: 'Tratada'
                });

                await ot.save();
                // Actualizamos la solicitud original
                await Solicitud.findByIdAndUpdate(id, { estado: 'Tratada', numeroOT: ot.numeroOT });
            }
        }

        if (!ot) return res.status(404).json({ error: "No encontrado" });

        // Hooks contables (no bloquean la respuesta si falla)
        try {
            const pagoNuevo = datosCuerpo.pago;
            const pagoViejo = otAnterior?.pago;
            const { crearAsientoAutomatico, anularAsientoPorReferencia } = require('./contabilidadController');

            const seEstaPagando = pagoNuevo?.estado === 'Pagado'
                && pagoViejo?.estado !== 'Pagado'
                && !pagoNuevo?.anulado;

            const seEstaAnulando = pagoNuevo?.anulado === true && !pagoViejo?.anulado;

            if (seEstaPagando) {
                const monto = Number(pagoNuevo.montoPagado) || 0;
                const fechaPago = pagoNuevo.fechaPago || new Date().toISOString().slice(0, 10);
                await crearAsientoAutomatico('OT', ot._id, ot.numeroOT, [
                    { codigoCuenta: '1.1.2', debe: monto, haber: 0, glosa: `Cobro ${ot.numeroOT}` },
                    { codigoCuenta: '4.1.1', debe: 0, haber: monto, glosa: `Ingreso ${ot.numeroOT}` }
                ], fechaPago, `Cobro servicios ${ot.numeroOT}`, req.db);
            }

            if (seEstaAnulando) {
                await anularAsientoPorReferencia('OT', ot._id, pagoNuevo.motivoAnulacion || 'Pago anulado', req.db);
            }
        } catch (eContab) {
            console.warn('[Contabilidad] Hook OT falló (sin impacto en la operación):', eContab.message);
        }

        await aplicarReservaPorCambioEstado(otAnterior, ot, req.db);

        // 🚩 CLAVE: Devolvemos la OT completa para que el frontend vea los reportes
        res.json(ot);

    } catch (error) {
        console.error("Error en actualizarOT:", error);
        res.status(500).json({ error: error.message });
    }
};

// PUT — Acción sobre una OT desde la PWA Operativa: misma lógica que supervisorAccion
// (aplicarAccionOT), autenticada por token de Usuario (persona) y autorizada por tener una
// Asignacion activa sobre esta OT, en vez del tokenEjecucion por OT del portal antiguo.
exports.accionMovil = async (req, res) => {
    const OT = getOT(req.db);
    const Usuario = getUsuario(req.db);
    const Asignacion = getAsignacion(req.db);
    try {
        const { id } = req.params;
        const { token } = req.query;

        const usuario = await Usuario.findOne({ token, estado: 'activo' });
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });

        const ot = await OT.findById(id);
        if (!ot) return res.status(404).json({ error: 'OT no encontrada' });

        // Dos caminos de autorización, no uno: Asignacion (ejecución/evaluación puntual,
        // ver docs/estrategia-movil.md §7.2) O ser el supervisor de la OT completa
        // (OT.supervisorId, el mismo campo que ya usa asignacionController.otsSupervisadasEnFechas
        // para MOSTRAR la OT en mi-día/mi-semana/mi-panel). Sin esto, un supervisor asignado
        // solo por la pestaña Antecedentes puede VER su OT pero nunca actuar sobre ella desde
        // S3 — 403 real, encontrado probando "Trabajo finalizado" contra datos reales.
        const tieneAsignacion = await Asignacion.exists({ usuarioId: usuario._id, otId: id });
        const esSupervisorDeLaOT = usuario.rol === 'supervisor' && usuario.recursoId && String(ot.supervisorId || '') === String(usuario.recursoId);
        if (!tieneAsignacion && !esSupervisorDeLaOT) return res.status(403).json({ error: 'No tienes una asignación sobre esta OT' });

        aplicarAccionOT(ot, { ...req.body, usuarioNombre: usuario.nombre });
        await ot.save();

        usuario.ultimoAcceso = new Date();
        await usuario.save();

        res.json({ ok: true, estado: ot.estado });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        res.status(500).json({ error: err.message });
    }
};

// 11. Respuesta Directa del Cliente (Solo actualización interna)
// 'Aprobada'/'Rechazada' ya no son valores de OT.estado (ver models/OT.js, subdocumento
// cotizacion) — son la respuesta del cliente a la cotización, un sub-proceso aparte del
// pipeline principal. Aprobar es lo único que mueve el macro-estado (Planificada ->
// Programada, porque para este punto ya se verificó capacidad en Gantt); rechazar deja la
// OT en 'Planificada' con cotizacion.respuestaCliente='Rechazada' como señal de "esperando
// corrección del Planificador", sin sacarla de la fase en la que estaba.
//
// Lógica compartida entre el link viejo del correo (responderCotizacionCliente, sin auth,
// se deja intacto por compatibilidad con correos ya enviados) y el endpoint nuevo autenticado
// por SesionPortal (portalController.responderCotizacion) — un solo lugar que sabe aplicar
// la respuesta y reservar recursos, cada endpoint solo decide cómo se autoriza y qué responde.
async function aplicarRespuestaCotizacion({ id, nuevoEstado, motivoRechazo, conn }) {
    const OT = getOT(conn);

    if (!['Aprobada', 'Rechazada'].includes(nuevoEstado)) {
        const e = new Error('Respuesta no reconocida.'); e.status = 400; throw e;
    }

    const otAnterior = await OT.findById(id).lean();
    if (!otAnterior) {
        const e = new Error('Registro no encontrado.'); e.status = 404; throw e;
    }

    if (otAnterior.cotizacion?.respuestaCliente && otAnterior.cotizacion.respuestaCliente !== 'Pendiente') {
        const e = new Error(`Esta cotización ya fue respondida (${otAnterior.cotizacion.respuestaCliente}).`); e.status = 409; throw e;
    }

    if (nuevoEstado === 'Aprobada' && !otAnterior.supervisorId) {
        const e = new Error(`La orden ${otAnterior.numeroOT || ''} todavía no tiene un supervisor asignado.`);
        e.status = 409; e.sinSupervisor = true; throw e;
    }

    // El rechazo no se bloquea por vencimiento — solo la aprobación, porque es la que
    // compromete HH/recursos que ya pudieron liberarse en el Gantt al pasar las 12h.
    if (nuevoEstado === 'Aprobada' && cotizacionVencida(otAnterior)) {
        const e = new Error('Esta cotización venció (máximo 12 horas para aprobar). Contacta a la oficina para que la reenvíe.');
        e.status = 409; throw e;
    }

    const cambios = {
        'cotizacion.respuestaCliente': nuevoEstado,
        'cotizacion.fechaRespuesta': new Date(),
    };
    if (nuevoEstado === 'Aprobada') cambios.estado = 'Programada';
    if (nuevoEstado === 'Rechazada' && motivoRechazo) cambios['cotizacion.motivoRechazo'] = motivoRechazo;

    const otActualizada = await OT.findByIdAndUpdate(id, { $set: cambios }, { new: true });

    // Sincronizar con la Solicitud original: solo la aprobación mueve la fase macro, así
    // que solo ella se refleja ahí — un rechazo no movió a la OT de 'Planificada'.
    if (nuevoEstado === 'Aprobada') {
        const idSolicitud = otActualizada.solicitudId || otActualizada._id;
        const Solicitud = require('../models/Solicitud')(conn);
        await Solicitud.findByIdAndUpdate(idSolicitud, { estado: 'Programada' });
    }

    // Reserva/liberación de recursos si corresponde (aprobar -> reserva herramientas e insumos)
    await aplicarReservaPorCambioEstado(otAnterior, otActualizada, conn);

    console.log(`♻️ ERP Actualizado: OT ${otActualizada.numeroOT} — cliente respondió ${nuevoEstado}`);
    return otActualizada;
}
exports.aplicarRespuestaCotizacion = aplicarRespuestaCotizacion;

exports.responderCotizacionCliente = async (req, res) => {
    try {
        const { id, nuevoEstado } = req.params;
        const otActualizada = await aplicarRespuestaCotizacion({ id, nuevoEstado, conn: req.db });

        // Respuesta visual simple para el cliente
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
        if (error.sinSupervisor) {
            return res.status(409).send(`
                <div style="font-family: sans-serif; text-align: center; padding: 100px 20px;">
                    <h1 style="color: #2c3e50;">No pudimos procesar su respuesta</h1>
                    <p style="font-size: 18px; color: #7f8c8d;">
                        ${error.message} Por favor contáctenos para confirmar la aprobación.
                    </p>
                </div>
            `);
        }
        if (error.status === 404) return res.status(404).send("<h1>Error: Registro no encontrado.</h1>");
        if (error.status === 400) return res.status(400).send(`<h1>Error: ${error.message}</h1>`);
        if (error.status === 409) return res.status(409).send(`<h1>${error.message}</h1>`);
        res.status(500).send("Error interno.");
    }
};

// Respuesta del cliente a una excepción ("extensión de cotización", ver models/OT.js §7 y
// aplicarAccionOT accion:'replanificar') — mismo criterio que aplicarRespuestaCotizacion, pero
// acá sí hace falta un documento Mongoose completo (no .lean()) para usar ot.excepciones.id(...)
// y para hacer push directo sobre componentes/tareas antes de guardar.
async function aplicarRespuestaExcepcion({ id, excepcionId, nuevoEstado, motivoRechazo, conn }) {
    const OT = getOT(conn);

    if (!['Aprobada', 'Rechazada'].includes(nuevoEstado)) {
        const e = new Error('Respuesta no reconocida.'); e.status = 400; throw e;
    }

    const ot = await OT.findById(id);
    if (!ot) { const e = new Error('Registro no encontrado.'); e.status = 404; throw e; }

    const excepcion = ot.excepciones.id(excepcionId);
    if (!excepcion) { const e = new Error('Excepción no encontrada.'); e.status = 404; throw e; }

    if (excepcion.estado !== 'Enviada') {
        const e = new Error(`Esta excepción ya fue respondida o todavía no fue enviada (${excepcion.estado}).`);
        e.status = 409; throw e;
    }

    excepcion.estado = nuevoEstado;
    excepcion.fechaRespuesta = new Date();
    if (nuevoEstado === 'Rechazada' && motivoRechazo) excepcion.motivoRechazo = motivoRechazo;

    // Aprobar es la única vía del sistema donde el backend recalcula granTotal: acá no hay
    // ningún frontend de escritorio en la transacción que lo mande ya sumado (a diferencia del
    // resto de actualizarOT, ver comentario ahí).
    if (nuevoEstado === 'Aprobada') {
        // .toObject(): son subdocumentos Mongoose de un array distinto (componentesExtra, con
        // su propio schema) — pasarlos tal cual a .push() de otro DocumentArray puede arrastrar
        // su _id/parent original; como objetos planos, Mongoose los castea limpio al schema de
        // componentes/tareas y les asigna _id nuevos.
        ot.componentes.push(...(excepcion.componentesExtra || []).map(c => c.toObject()));
        ot.tareas.push(...(excepcion.tareasExtra || []).map(tt => tt.toObject()));
        ot.granTotal = (ot.granTotal || 0) + (excepcion.montoExtra || 0);
    }

    await ot.save();
    console.log(`♻️ ERP Actualizado: OT ${ot.numeroOT} — cliente respondió ${nuevoEstado} a una excepción`);
    return ot;
}
exports.aplicarRespuestaExcepcion = aplicarRespuestaExcepcion;