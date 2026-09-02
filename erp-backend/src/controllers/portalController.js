const crypto = require('crypto');
const { guardarAdjuntoSiEsBase64 } = require('../utils/adjuntos');
const getSolicitud = require('../models/Solicitud');
const getOT = require('../models/OT');
const getSesionPortal = require('../models/SesionPortal');
const getCliente = require('../models/Cliente');
const otController = require('./otController');
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
        // `activa` viaja aunque acá el objeto ya sea null cuando no está cancelada: la PWA
        // Cliente pregunta por cancelada?.activa igual que el escritorio (que lee la OT cruda),
        // y sin este campo la app del cliente nunca se enteraba de la cancelación — se quedaba
        // mostrando el mismo estado de antes después de cancelar.
        cancelada: ot.cancelada?.activa
            ? { activa: true, motivo: ot.cancelada.motivo || '', fecha: ot.cancelada.fecha, fechaPropuesta: ot.cancelada.fechaPropuesta || '' }
            : null,
        // Documentos del flujo de pago (Chile): Orden de Compra → Estado de Pago (EDP) → Hoja
        // de Entrada de Servicio (HES). Editables desde ambos lados — Cuenta y Pago (C5, PWA
        // Cliente) y la pestaña Pago (erp-web) — ver actualizarOrdenCompra/actualizarEdp/
        // actualizarHes más abajo. Con los 3 completos el pago se considera Pagado, sin
        // selector manual (ver otController.actualizarOT).
        ordenCompra: ot.ordenCompra || '',
        ordenCompraArchivo: ot.ordenCompraArchivo || '',
        granTotal: ot.granTotal,
        // Igual que TratamientoScreen.granTotal/totalManoObra en erp-web — se suma acá y se
        // expone como un solo número porque tareas[] (abajo) NUNCA manda valorHora al cliente
        // (la tarifa por hora interna no le corresponde verla); sin este agregado, la mano de
        // obra quedaba invisible en la cotización del Portal Cliente/PWA — el cliente veía
        // materiales y suministros itemizados pero el total incluía una mano de obra "fantasma".
        totalManoObra: (ot.tareas || []).reduce((sum, t) => sum + (Number(t.duracion) * Number(t.valorHora) || 0), 0),
        tareas: (ot.tareas || []).map(t => ({
            descripcion: t.descripcion,
            puesto: t.puesto,
            // Responsables — para que "Tareas — qué, con quién, cuándo y cómo" (TratamientoScreen)
            // se pueda replicar igual en la cotización del cliente; antes no viajaba.
            operarioNombre: t.operarioNombre,
            duracion: t.duracion,
            fecha: t.fecha,
            hora: t.hora,
            completada: t.completada,
            // El "cómo" de la cotización (ver C5_CuentaPago.jsx) — antes no viajaba al cliente.
            desarrollo: t.desarrollo,
            // Lo que el supervisor reportó que se hizo en esta tarea puntual (comentario +
            // fotos, ver S3_Trabajo.jsx "Guardar lo ingresado") — antes no viajaba al cliente
            // en absoluto, así que el informe final no tenía forma de mostrar avance por
            // tarea, solo el feed genérico de OT.reportes (sin vincular a una tarea).
            registro: (t.registro?.texto || t.registro?.fotos?.length) ? {
                texto: t.registro.texto, fotos: t.registro.fotos, hora: t.registro.hora, autor: t.registro.autor,
            } : null,
        })),
        // Antes exponía {nombre, precioUnitario, subtotal} — campos que no existen en el
        // schema real de OT.componentes (models/OT.js: codigo/descripcion/cantidad/precio/
        // tipo), así que esta sección salía vacía en el Portal Cliente y en la PWA. subtotal
        // se calcula acá porque no se guarda como campo propio en el documento.
        componentes: (ot.componentes || []).map(c => ({
            descripcion: c.descripcion,
            cantidad: c.cantidad,
            precio: c.precio,
            tipo: c.tipo,
            subtotal: (c.cantidad || 0) * (c.precio || 0),
        })),
        // Condiciones comerciales — sección propia del PDF de escritorio (TratamientoScreen),
        // antes no viajaba al cliente en absoluto.
        condicionesComerciales: ot.condicionesComerciales ? {
            validez: ot.condicionesComerciales.validez,
            plazoPago: ot.condicionesComerciales.plazoPago,
            formaPago: ot.condicionesComerciales.formaPago,
            garantia: ot.condicionesComerciales.garantia,
            plazoEjecucion: ot.condicionesComerciales.plazoEjecucion,
            noIncluye: ot.condicionesComerciales.noIncluye,
        } : null,
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
        // Mismo problema que componentes arriba: logistica tampoco guarda "subtotal" como
        // campo propio (models/OT.js: unidad/patente/descripcion/cantidad/precio). cantidad/
        // precio se agregan para poder mostrar la misma tabla "Suministros directos" que ya
        // tiene TratamientoScreen (Cant./Unitario/Subtotal), no solo el subtotal ya sumado.
        logistica: (ot.logistica || []).map(l => ({
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            precio: l.precio,
            subtotal: (l.cantidad || 0) * (l.precio || 0),
        })),
        pago: ot.pago ? {
            estado: ot.pago.estado,
            montoPagado: ot.pago.montoPagado || 0,
            estadoPago: { numero: ot.pago.estadoPago?.numero || '', archivo: ot.pago.estadoPago?.archivo || '' },
            hes: { numero: ot.pago.hes?.numero || '', archivo: ot.pago.hes?.archivo || '' },
        } : null,
        // Informe inicial (evaluación previa a cotizar) — antes no viajaba al cliente en
        // absoluto. Se expone completo (decisión explícita del usuario: sin filtrar el
        // contenido) — se omiten sí tipoTrabajoId/tareaVinculadaId/valores porque son
        // vinculación interna con el catálogo de formularios (plan-formulario-adaptativo.md),
        // no contenido informativo; textoDescriptivo/textoGenerado ya traen la narrativa
        // completa de cada hallazgo, valores es el dato crudo del que salió ese texto.
        informeEvaluacion: ot.informeEvaluacion ? {
            fecha: ot.informeEvaluacion.fecha,
            completo: ot.informeEvaluacion.completo,
            hallazgos: (ot.informeEvaluacion.hallazgos || []).map(h => ({
                texto: h.textoDescriptivo || h.textoGenerado || '',
                fotos: h.fotos || [],
                fecha: h.fecha,
            })),
        } : null,
        // Booleano + fecha nada más (igual que cotizacion.enviada) — el contenido del informe
        // final se arma en el cliente a partir de tareas/informeEvaluacion/reportes, que ya
        // viajan arriba; esto solo dice si ya se compartió. El botón que lo marca vive en la
        // pestaña Pago del escritorio (TabPago.jsx), no en Ejecución — pedido del usuario.
        informeFinal: ot.informeFinal ? {
            enviado: ot.informeFinal.enviado,
            fechaEnvio: ot.informeFinal.fechaEnvio,
            // Copia editable congelada al enviar — si existe, el cliente ve esto en vez de
            // recalcular desde tareas/informeEvaluacion/reportes en vivo (ver C4_AvanceFotos.jsx).
            contenido: ot.informeFinal.contenido || null,
        } : null,
        // respuestaCliente + enviada: lo que C2/C3 necesitan para distinguir "presupuesto
        // rechazado" de "en preparación" de "cotización enviada, esperando tu respuesta"
        // (ver models/OT.js). fechaEnvio se suma para que la PWA pueda calcular el vencimiento
        // de 12h (mismo criterio que otController.cotizacionVencida, duplicado ahí y acá). El
        // resto de cotizacion (fechas propuestas, verificación de capacidad) sigue siendo interno.
        cotizacion: ot.cotizacion ? {
            respuestaCliente: ot.cotizacion.respuestaCliente,
            enviada: ot.cotizacion.enviada,
            fechaEnvio: ot.cotizacion.fechaEnvio,
        } : null,
        // Excepciones ("extensión de cotización", ver models/OT.js §7) — se filtran los
        // 'Borrador' porque todavía no tienen precio ni fueron revisados por la oficina, no le
        // corresponden al cliente hasta que el planificador los envía.
        excepciones: (ot.excepciones || []).filter(e => e.estado !== 'Borrador').map(e => ({
            _id: e._id,
            descripcion: e.descripcion,
            componentesExtra: e.componentesExtra,
            tareasExtra: e.tareasExtra,
            montoExtra: e.montoExtra,
            estado: e.estado,
            motivoRechazo: e.motivoRechazo,
        })),
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
// (guardarAdjuntoSiEsBase64 ahora vive en utils/adjuntos.js — otController también la usa
// para los documentos de pago.)

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
            // Solo tiene contenido en las canceladas sin OT (con OT el detalle va en
            // ot.cancelada) — el cliente necesita ver de vuelta lo que dejó dicho al cancelar.
            cancelacion: sol.estado === 'Cancelada' && sol.cancelacion
                ? { motivo: sol.cancelacion.motivo || '', fechaPropuesta: sol.cancelacion.fechaPropuesta || '' }
                : null,
            fechaCreacion: sol.fechaCreacion || sol.createdAt,
            fechaEjecucionSolicitada: sol.fechaEjecucionSolicitada,
            // El resto del detalle de "lo que pedimos" (antes solo viajaban los campos de
            // arriba) — para que el cliente pueda ver la solicitud completa, no un resumen.
            correo: sol.correo || '',
            direccion: sol.direccion || '',
            origen: sol.origen || '',
            plazoEjecucionSugerido: sol.plazoEjecucionSugerido || '',
            adjuntos: sol.adjuntos || '',
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

// Emite una SesionPortal nueva para un teléfono (mismo patrón que acceso(), sin pedir
// numeroSolicitud como segundo factor porque acá el llamador ya conoce la OT/Solicitud de
// origen) y devuelve el token en claro. Hoy solo la usa mailRoutes.js al enviar una
// cotización, para que el link del correo entre a la PWA ya autenticado.
exports.emitirSesionParaTelefono = async function emitirSesionParaTelefono(conn, telefonoCrudo, empresaSolicitante) {
    const SesionPortal = getSesionPortal(conn);
    const telefono = normalizarTelefono(telefonoCrudo);
    if (!telefono) return null;
    const token = nuevoToken();
    const expira = new Date(Date.now() + DIAS_VIGENCIA_TOKEN * 24 * 60 * 60 * 1000);
    await SesionPortal.create({ telefono, expira, tokenHash: hashToken(token), empresaSolicitante });
    return token;
};

// El token en claro nunca se vuelve a mostrar después de la respuesta de emisión/regeneración
// (tokenHash es lo único que se guarda) — devolver `link` en esa respuesta es la única forma
// de poder compartirlo por otro medio (WhatsApp, etc.) cuando no hay correo, o simplemente
// porque el llamador (ej. enviarPortalCliente, App.jsx) prefiere WhatsApp antes que el correo.
function armarLinkPortalCliente(token, entorno) {
    return `${PWA_CLIENTE_URL}/?token=${token}${entorno ? `&entorno=${entorno}` : ''}`;
}

// Despacha el correo de acceso — reutilizado por emisión, regeneración y reenvío. Texto
// plano, sin HTML decorativo (mismo criterio que el resto de los correos del sistema, ver
// config/mailer.js).
async function enviarCorreoAcceso({ correo, nombre, empresa, link }) {
    if (!correo) return false;
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

        const link = armarLinkPortalCliente(token, entorno);
        const correoEnviado = await enviarCorreoAcceso({ correo, nombre: nombreContacto, empresa: empresaSolicitante, link });

        res.json({ token, link, expira, empresaSolicitante, sesionId: sesion._id, correoEnviado });
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

        const link = armarLinkPortalCliente(token, req.body.entorno);
        const correoEnviado = await enviarCorreoAcceso({
            correo: req.body.correo, empresa: anterior.empresaSolicitante, link,
        });

        res.json({ token, link, expira: anterior.expira, correoEnviado });
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
                nombre: r.nombre, correo: r.email || '', telefono: r.telefono || '',
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

// DELETE /api/portal/sesiones/:id — borra el registro entero (Bodega de tokens, botón
// "Eliminar"). A diferencia de revocar (invalida el token pero conserva el registro para
// auditoría de accesos), esto lo saca por completo de la tabla — pensado para limpiar
// pruebas/duplicados, no como reemplazo de revocar en el uso normal.
exports.eliminarSesion = async (req, res) => {
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesion = await SesionPortal.findByIdAndDelete(req.params.id);
        if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });
        res.json({ ok: true });
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

// POST /api/portal/ot/:id/responder?token= — aprobar/rechazar una cotización desde la PWA
// Cliente (reemplaza, para correos nuevos, el link sin auth GET /api/mail/respuesta/:id/:nuevoEstado
// — ver mailRoutes.js). Exige SesionPortal válida y que la OT pertenezca a ese teléfono,
// misma lógica de pertenencia que ya usa trabajosPorTelefono.
exports.responderCotizacion = async (req, res) => {
    const OT = getOT(req.db);
    const Solicitud = getSolicitud(req.db);
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesion = await SesionPortal.findOne({ tokenHash: hashToken(req.query.token), estado: 'activo' });
        if (!sesion || sesion.expira < new Date()) return res.status(403).json({ error: 'Sesión inválida o vencida' });

        const { id } = req.params;
        const { estado, motivoRechazo } = req.body;

        const ot = await OT.findById(id).lean();
        if (!ot) return res.status(404).json({ error: 'OT no encontrada' });

        const solicitud = await Solicitud.findById(ot.solicitudId || ot._id).lean();
        if (!solicitud || normalizarTelefono(solicitud.numero) !== sesion.telefono) {
            return res.status(403).json({ error: 'Esta OT no pertenece a tu sesión.' });
        }

        const otActualizada = await otController.aplicarRespuestaCotizacion({
            id, nuevoEstado: estado, motivoRechazo, conn: req.db,
        });

        res.json({ ok: true, ot: otPublica(otActualizada) });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/portal/ot/:id/excepciones/:excepcionId/responder?token= — aprobar/rechazar una
// excepción ("extensión de cotización") desde la PWA Cliente. Mismo esqueleto que
// responderCotizacion arriba.
exports.responderExcepcion = async (req, res) => {
    const OT = getOT(req.db);
    const Solicitud = getSolicitud(req.db);
    const SesionPortal = getSesionPortal(req.db);
    try {
        const sesion = await SesionPortal.findOne({ tokenHash: hashToken(req.query.token), estado: 'activo' });
        if (!sesion || sesion.expira < new Date()) return res.status(403).json({ error: 'Sesión inválida o vencida' });

        const { id, excepcionId } = req.params;
        const { estado, motivoRechazo } = req.body;

        const ot = await OT.findById(id).lean();
        if (!ot) return res.status(404).json({ error: 'OT no encontrada' });

        const solicitud = await Solicitud.findById(ot.solicitudId || ot._id).lean();
        if (!solicitud || normalizarTelefono(solicitud.numero) !== sesion.telefono) {
            return res.status(403).json({ error: 'Esta OT no pertenece a tu sesión.' });
        }

        const otActualizada = await otController.aplicarRespuestaExcepcion({
            id, excepcionId, nuevoEstado: estado, motivoRechazo, conn: req.db,
        });

        res.json({ ok: true, ot: otPublica(otActualizada) });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// La OT (cuando existe) reutiliza el _id de la Solicitud que la originó (ver
// otController.convertirOT), así que 'id' siempre identifica primero a la Solicitud —
// cancelarSolicitud/editarDescripcionSolicitud necesitan funcionar aunque todavía no haya OT
// (mismo criterio "híbrido" que otController.antecedentes/actualizarOT).
async function solicitudDeLaSesion(Solicitud, SesionPortal, id, token) {
    const sesion = await SesionPortal.findOne({ tokenHash: hashToken(token), estado: 'activo' });
    if (!sesion || sesion.expira < new Date()) { const e = new Error('Sesión inválida o vencida'); e.status = 403; throw e; }
    const solicitud = await Solicitud.findById(id);
    if (!solicitud) { const e = new Error('Solicitud no encontrada'); e.status = 404; throw e; }
    if (normalizarTelefono(solicitud.numero) !== sesion.telefono) {
        const e = new Error('Esta solicitud no pertenece a tu sesión.'); e.status = 403; throw e;
    }
    return solicitud;
}

// Estados de OT en los que todavía no arrancó el trabajo en terreno — el corte para poder
// cancelar/editar es "antes de 'En Ejecución'" (pedido explícito del usuario). 'Reprogramar'
// entra: el supervisor la marcó porque necesita fecha nueva, el trabajo real no empezó.
const ESTADOS_OT_CANCELABLE = ['Tratada', 'Planificada', 'Programada', 'Reprogramar'];

// POST /api/portal/solicitudes/:id/cancelar?token= — el cliente cancela su propia solicitud.
// Con OT ya creada no se borra nada (a diferencia de eliminarSolicitud/eliminarOT en el
// escritorio): se marca OT.cancelada para poder seguir facturando lo ya ejecutado (ej. una
// visita de evaluación) sin reabrir el flujo normal ni perder el historial.
exports.cancelarSolicitud = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    const OT = getOT(req.db);
    const SesionPortal = getSesionPortal(req.db);
    try {
        const { id } = req.params;
        const solicitud = await solicitudDeLaSesion(Solicitud, SesionPortal, id, req.query.token);

        // Cancelar no siempre es dar de baja el trabajo: muchas veces es correrlo. Se acepta
        // una fecha propuesta para retomarlo, y vacío significa "sin fecha, hasta nuevo aviso"
        // — que es una respuesta explícita del cliente, no un dato faltante.
        const fechaPropuesta = (req.body.fechaPropuesta || '').trim();
        if (fechaPropuesta && !/^\d{4}-\d{2}-\d{2}$/.test(fechaPropuesta)) {
            return res.status(422).json({ error: 'La fecha propuesta debe venir como YYYY-MM-DD.' });
        }
        const motivo = (req.body.motivo || '').trim();

        const ot = await OT.findById(id);
        if (ot) {
            if (ot.cancelada?.activa) return res.status(409).json({ error: 'Esta OT ya está cancelada.' });
            if (!ESTADOS_OT_CANCELABLE.includes(ot.estado)) {
                return res.status(409).json({ error: 'Ya no se puede cancelar: el trabajo está en ejecución o ya terminó.' });
            }
            ot.cancelada = { activa: true, motivo, fecha: new Date(), fechaPropuesta };
            await ot.save();
            return res.json({ ok: true, ot: otPublica(ot) });
        }

        if (solicitud.estado === 'Cancelada') return res.status(409).json({ error: 'Esta solicitud ya está cancelada.' });
        solicitud.estado = 'Cancelada';
        // Sin OT el detalle no tenía dónde guardarse y el motivo se perdía en silencio (ver
        // Solicitud.cancelacion) — ahora se conserva igual que en la OT.
        solicitud.cancelacion = { motivo, fecha: new Date(), fechaPropuesta };
        await solicitud.save();
        res.json({ ok: true, cancelacion: { motivo, fechaPropuesta } });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/portal/solicitudes/:id/descripcion?token= — el cliente corrige/amplía el alcance
// de lo pedido. Mismo corte que cancelar; si ya hay OT, se actualiza también su descripcion
// (copia hecha al convertir la Solicitud, ver otController.convertirOT) para que no quede
// desincronizada de lo que ve la oficina en Tratamiento.
exports.editarDescripcionSolicitud = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    const OT = getOT(req.db);
    const SesionPortal = getSesionPortal(req.db);
    try {
        const { id } = req.params;
        const descripcion = (req.body.descripcion || '').trim();
        if (!descripcion) return res.status(400).json({ error: 'La descripción no puede quedar vacía.' });
        const solicitud = await solicitudDeLaSesion(Solicitud, SesionPortal, id, req.query.token);

        const ot = await OT.findById(id);
        if (ot) {
            if (ot.cancelada?.activa || !ESTADOS_OT_CANCELABLE.includes(ot.estado)) {
                return res.status(409).json({ error: 'Ya no se puede editar: el trabajo está en ejecución, ya terminó, o la solicitud está cancelada.' });
            }
            ot.descripcion = descripcion;
            await ot.save();
        } else if (solicitud.estado === 'Cancelada') {
            return res.status(409).json({ error: 'Esta solicitud está cancelada.' });
        }

        solicitud.descripcion = descripcion;
        await solicitud.save();
        res.json({ ok: true, ot: ot ? otPublica(ot) : null });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// Valida que la sesión del portal (token) le pertenezca a esta OT — mismo chequeo repetido
// en responderCotizacion/responderExcepcion/actualizarOrdenCompra/actualizarEdp/actualizarHes.
async function otDeLaSesion(OT, Solicitud, SesionPortal, id, token) {
    const sesion = await SesionPortal.findOne({ tokenHash: hashToken(token), estado: 'activo' });
    if (!sesion || sesion.expira < new Date()) { const e = new Error('Sesión inválida o vencida'); e.status = 403; throw e; }
    const ot = await OT.findById(id).lean();
    if (!ot) { const e = new Error('OT no encontrada'); e.status = 404; throw e; }
    const solicitud = await Solicitud.findById(ot.solicitudId || ot._id).lean();
    if (!solicitud || normalizarTelefono(solicitud.numero) !== sesion.telefono) {
        const e = new Error('Esta OT no pertenece a tu sesión.'); e.status = 403; throw e;
    }
    return ot;
}

// POST /api/portal/ot/:id/orden-compra?token= — carga/corrige número y archivo de la Orden de
// Compra desde Cuenta y Pago (C5, PWA Cliente) — también editable desde la oficina (TabPago,
// erp-web). Con OC + EDP + HES completos el pago se considera Pagado (otController.actualizarOT
// hace el mismo cálculo cuando la oficina guarda desde el escritorio).
exports.actualizarOrdenCompra = async (req, res) => {
    const OT = getOT(req.db);
    const Solicitud = getSolicitud(req.db);
    const SesionPortal = getSesionPortal(req.db);
    try {
        const { id } = req.params;
        await otDeLaSesion(OT, Solicitud, SesionPortal, id, req.query.token);
        const { numero, archivo } = req.body;
        const otActualizada = await OT.findByIdAndUpdate(id, {
            ordenCompra: numero || '',
            ordenCompraArchivo: guardarAdjuntoSiEsBase64(archivo) || '',
        }, { new: true });
        res.json({ ok: true, ot: otPublica(otActualizada) });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/portal/ot/:id/edp?token= — Estado de Pago. Mismo esqueleto que actualizarOrdenCompra.
exports.actualizarEdp = async (req, res) => {
    const OT = getOT(req.db);
    const Solicitud = getSolicitud(req.db);
    const SesionPortal = getSesionPortal(req.db);
    try {
        const { id } = req.params;
        await otDeLaSesion(OT, Solicitud, SesionPortal, id, req.query.token);
        const { numero, archivo } = req.body;
        const otActualizada = await OT.findByIdAndUpdate(id, {
            'pago.estadoPago': { numero: numero || '', archivo: guardarAdjuntoSiEsBase64(archivo) || '' },
        }, { new: true });
        res.json({ ok: true, ot: otPublica(otActualizada) });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/portal/ot/:id/hes?token= — Hoja de Entrada de Servicio. Mismo esqueleto que
// actualizarOrdenCompra.
exports.actualizarHes = async (req, res) => {
    const OT = getOT(req.db);
    const Solicitud = getSolicitud(req.db);
    const SesionPortal = getSesionPortal(req.db);
    try {
        const { id } = req.params;
        await otDeLaSesion(OT, Solicitud, SesionPortal, id, req.query.token);
        const { numero, archivo } = req.body;
        const otActualizada = await OT.findByIdAndUpdate(id, {
            'pago.hes': { numero: numero || '', archivo: guardarAdjuntoSiEsBase64(archivo) || '' },
        }, { new: true });
        res.json({ ok: true, ot: otPublica(otActualizada) });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};
