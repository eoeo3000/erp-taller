const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const getSolicitud = require('../models/Solicitud');
const getOT = require('../models/OT');
const getSesionPortal = require('../models/SesionPortal');
const getCliente = require('../models/Cliente');
const transporter = require('../config/mailer');
const { PWA_CLIENTE_URL } = require('../config/urls');

const DIAS_VIGENCIA_TOKEN = 30; // sesión autoservicio/emitida
const DIAS_VIGENCIA_LOTE = 90;  // token pre-generado sin asignar (Requiere confirmación → confirmado con el usuario)
const DIAS_INACTIVO = 30;       // último acceso más antiguo que esto se muestra en rojo

// Un solo mensaje para los tres casos de fallo (teléfono inexistente, solicitud
// inexistente, o par que no coincide) — no revelar cuál de los dos falló (ver
// docs/estrategia-movil.md §5.2 y design_handoff_pwa_movil/README.md §6, C1).
const MENSAJE_ACCESO_INVALIDO = 'Teléfono o número de solicitud no coinciden.';

// "912345678", "56912345678" y "+56912345678" son el mismo celular chileno (ver
// validarTelefono en los formularios del frontend, que acepta las tres formas) — hay
// que normalizarlos al mismo valor acá, o si el cliente ingresó la solicitud con un
// formato y después busca/entra con otro, no la encuentra.
function normalizarTelefono(t) {
    const soloDigitos = String(t || '').replace(/\D/g, '');
    if (soloDigitos.length === 11 && soloDigitos.startsWith('569')) {
        return soloDigitos.slice(2);
    }
    return soloDigitos;
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

// El formulario "Pedir un servicio" (C6, PWA Cliente) manda la foto como data-URI base64
// dentro del JSON, porque esa ruta no tiene multer — a diferencia de POST /api/solicitudes
// (el formulario de escritorio), que sí sube el archivo real y guarda solo la ruta.
// Guardar el base64 tal cual en Solicitud.adjuntos infla cada documento a varios MB, y con
// eso cualquier consulta masiva (GET /api/data, cada 30 s desde erp-web; el propio Portal
// del Cliente) arrastra ese peso — confirmado: una sola solicitud así hizo que /api/data
// tardara casi un minuto en producción. Se decodifica acá y se guarda en uploads/, igual
// que ya hace multer para el formulario de escritorio, dejando en el campo solo la ruta.
function guardarAdjuntoSiEsBase64(valor) {
    const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(valor || '');
    if (!match) return valor; // ya es una ruta/URL (o está vacío) — se deja igual
    const [, mime, contenido] = match;
    const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const nombre = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const destino = path.join(__dirname, '..', '..', 'uploads', nombre);
    fs.writeFileSync(destino, Buffer.from(contenido, 'base64'));
    return `/uploads/${nombre}`;
}

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
        if (data.adjuntos) data.adjuntos = guardarAdjuntoSiEsBase64(data.adjuntos);
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

// POST /api/portal/acceso — { telefono, numeroSolicitud? }: el teléfono identifica a la
// empresa y devuelve TODOS sus trabajos (design_handoff_pwa_movil/README.md §6, C1).
//
// numeroSolicitud es OPCIONAL — decisión de producto (revisión agosto 2026): el cliente
// puede entrar solo con su teléfono, sin tener a mano el número de una solicitud puntual.
// Lo que NO se permite es al revés (numeroSolicitud solo, sin teléfono): numeroSolicitud
// es correlativo y adivinable (SOL-2026-0001, 0002...) — sin el teléfono como segundo
// factor, cualquiera podría probar números seguidos y ver datos de otro cliente (hueco de
// privacidad ya documentado en docs/estrategia-movil.md §5.2). El teléfono, en cambio, no
// es correlativo, así que basta solo con demostrar que se conoce.
exports.acceso = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    const SesionPortal = getSesionPortal(req.db);
    try {
        const telefono = normalizarTelefono(req.body.telefono);
        const numeroSolicitud = (req.body.numeroSolicitud || '').trim();
        if (!telefono) return res.status(400).json({ error: MENSAJE_ACCESO_INVALIDO });

        let empresaSolicitante;
        if (numeroSolicitud) {
            const solicitud = await Solicitud.findOne({ numeroSolicitud }).lean();
            if (!solicitud || normalizarTelefono(solicitud.numero) !== telefono) {
                return res.status(401).json({ error: MENSAJE_ACCESO_INVALIDO });
            }
            empresaSolicitante = solicitud.empresaSolicitante;
        }

        const trabajos = await trabajosPorTelefono(req.db, telefono);
        if (!numeroSolicitud) {
            if (!trabajos.length) return res.status(401).json({ error: 'No hay solicitudes registradas con ese teléfono.' });
            empresaSolicitante = trabajos[0].empresaSolicitante;
        }

        const token = crypto.randomBytes(20).toString('hex'); // se devuelve una sola vez, no se guarda en claro
        const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días, ver README §6 C1
        await SesionPortal.create({
            telefono, expira,
            tokenHash: hashToken(token),
            empresaSolicitante,
        });

        res.json({ token, expira, empresaSolicitante, trabajos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Construye el link del portal y despacha el correo de acceso — reutilizado por emisión,
// regeneración y reenvío. Texto plano, sin HTML decorativo (mismo criterio que el resto
// de los correos del sistema, ver config/mailer.js).
async function enviarCorreoAcceso({ correo, nombre, empresa, token, entorno }) {
    if (!correo) return false;
    const link = `${PWA_CLIENTE_URL}/?token=${token}${entorno ? `&entorno=${entorno}` : ''}`;
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
        const { clienteId, contactoId, alcance, correo: correoManual, entorno, nombreContacto: nombreNuevo } = req.body;
        let telefono = normalizarTelefono(req.body.telefono);
        let empresaSolicitante = '';
        let nombreContacto = '';
        let correo = correoManual || '';
        let contactoIdFinal = contactoId || null;

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
            } else if (nombreNuevo) {
                // "Si el contacto no existe, se crea aquí mismo y queda guardado en la ficha
                // de la empresa en Clientes" (prototipo, Emitir acceso cliente).
                cliente.contactos.push({ nombre: nombreNuevo, correo, telefono: req.body.telefono || '' });
                await cliente.save();
                const creado = cliente.contactos[cliente.contactos.length - 1];
                contactoIdFinal = creado._id;
                nombreContacto = creado.nombre;
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
            clienteId: clienteId || null, contactoId: contactoIdFinal,
            alcance: alcance === 'propias' ? 'propias' : 'empresa',
            tokenHash: hashToken(token), tokenPreview: token.slice(0, 4), expira, estado: 'activo',
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
        anterior.tokenPreview = token.slice(0, 4);
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
    const Usuario = require('../models/Usuario')(req.db);
    const Cliente = getCliente(req.db);
    try {
        const ahora = Date.now();
        const estadoPorFechas = (estado, ultimoAcceso, sinAsignar) => {
            if (estado === 'revocado') return 'Revocado';
            if (sinAsignar) return 'Sin asignar';
            if (!ultimoAcceso) return 'Sin uso';
            if (ahora - new Date(ultimoAcceso).getTime() > DIAS_INACTIVO * 24 * 60 * 60 * 1000) return 'Inactivo';
            return 'Activo';
        };

        // Cliente — origen SesionPortal
        const sesiones = await SesionPortal.find({ tipo: 'cliente' }).select('-tokenHash').sort({ createdAt: -1 }).lean();
        const clientesPorId = new Map((await Cliente.find().lean()).map(c => [String(c._id), c]));
        const filasCliente = sesiones.map(s => {
            const cliente = s.clienteId ? clientesPorId.get(String(s.clienteId)) : null;
            const contacto = cliente?.contactos?.find(c => String(c._id) === String(s.contactoId));
            return {
                _id: s._id, tipo: 'cliente',
                nombre: contacto?.nombre || s.empresaSolicitante || 'Sin nombre',
                correo: contacto?.correo || '',
                origen: `Clientes · ${s.empresaSolicitante || cliente?.empresa || '—'}`,
                tokenPreview: s.tokenPreview || '',
                emitidoEn: s.emitidoEn, ultimoAcceso: s.ultimoAcceso,
                estadoDisplay: estadoPorFechas(s.estado, s.ultimoAcceso, !s.tokenHash && !s.clienteId),
            };
        });

        // Operativo — origen Usuario (se emiten desde la ficha de Recursos, no desde acá;
        // esta lista solo los muestra, para que "Tokens activos" sea una vista única).
        const Recurso = require('../models/Recurso')(req.db);
        const usuarios = await Usuario.find().sort({ createdAt: -1 }).lean();
        const recursosPorId = new Map(
            (await Recurso.find({ _id: { $in: usuarios.filter(u => u.recursoId).map(u => u.recursoId) } }).lean())
                .map(r => [String(r._id), r])
        );
        const filasOperativo = usuarios.map(u => {
            const recurso = u.recursoId ? recursosPorId.get(String(u.recursoId)) : null;
            return {
                _id: u._id, tipo: 'operativo',
                nombre: u.nombre, correo: recurso?.email || '',
                origen: `Recursos · ${u.puesto || u.rol}`,
                // Usuario.token se guarda en claro (ver models/Usuario.js) — se recorta acá,
                // nunca se manda completo fuera de whoami()/accion-movil (auth por token).
                tokenPreview: u.token ? u.token.slice(0, 4) : '',
                emitidoEn: u.fechaEmision, ultimoAcceso: u.ultimoAcceso,
                estadoDisplay: estadoPorFechas(u.estado, u.ultimoAcceso, false),
            };
        });

        // Personal con puesto de supervisor que YA existe en Recursos pero todavía no
        // tiene Usuario (nunca se le emitió token): sin esto, "Tokens activos" solo
        // mostraba a quien ya tenía acceso, no a quién le falta — no quedaban asociados.
        const idsConUsuario = new Set(usuarios.filter(u => u.recursoId).map(u => String(u.recursoId)));
        const supervisoresSinToken = await Recurso.find({ puesto: { $regex: /supervisor/i } }).lean();
        const filasPendientes = supervisoresSinToken
            .filter(r => !idsConUsuario.has(String(r._id)))
            .map(r => ({
                _id: r._id, tipo: 'operativo', pendiente: true, recursoId: r._id, puesto: r.puesto,
                nombre: r.nombre, correo: r.email || '',
                origen: `Recursos · ${r.puesto}`,
                tokenPreview: '', emitidoEn: null, ultimoAcceso: null,
                estadoDisplay: 'Sin emitir',
            }));

        res.json([...filasCliente, ...filasOperativo, ...filasPendientes].sort((a, b) => new Date(b.emitidoEn || 0) - new Date(a.emitidoEn || 0)));
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

// GET /api/portal/stock-tokens — resumen para "Stock pre-generado". El bloque operativo
// es de solo lectura: Usuario no tiene concepto de lote/pre-generado ni de vencimiento
// (ver models/Usuario.js — el token no expira por tiempo, decisión ya tomada), así que
// "Generar lote" para operativos queda fuera del alcance de esta entrega (mejora v3 #2:
// "solo tokens de cliente"); se muestran sus contadores reales igual, sin inventar un pool.
exports.stockTokens = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    const Usuario = require('../models/Usuario')(req.db);
    try {
        const ahora = new Date();
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const en30dias = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);

        const [disponiblesCliente, asignadosClienteMes, vencenClienteEn30] = await Promise.all([
            SesionPortal.countDocuments({ tipo: 'cliente', tokenHash: '', clienteId: null }),
            SesionPortal.countDocuments({ tipo: 'cliente', clienteId: { $ne: null }, emitidoEn: { $gte: inicioMes } }),
            SesionPortal.countDocuments({ tipo: 'cliente', estado: 'activo', expira: { $gte: ahora, $lte: en30dias } }),
        ]);
        const asignadosOperativoMes = await Usuario.countDocuments({ createdAt: { $gte: inicioMes } });

        res.json({
            cliente: { disponibles: disponiblesCliente, asignadosMes: asignadosClienteMes, vencenEn30Dias: vencenClienteEn30, vigenciaLoteDias: DIAS_VIGENCIA_LOTE },
            operativo: { disponibles: 0, asignadosMes: asignadosOperativoMes, vencenEn30Dias: 0, soportaLote: false },
        });
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
