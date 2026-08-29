// Usuarios de la PWA Operativa (supervisor/ejecutor) — ver docs/estrategia-movil.md §7.1
// y docs/rediseno/design_handoff_pwa_movil/README.md §7.
// El entorno de estas rutas viaja por header o por ?entorno= en la query (resolverEntorno,
// ver CORRECCIONES.md punto 7) — las PWA se abren fuera de la SPA y nunca envían el header.
const crypto = require('crypto');
const getUsuario = require('../models/Usuario');
const getRecurso = require('../models/Recurso');
const transporter = require('../config/mailer');
const { PWA_OPERATIVA_URL } = require('../config/urls');

function generarToken() {
    return crypto.randomBytes(20).toString('hex');
}

// El link apunta a PWA_OPERATIVA_URL (su propio host, ver config/urls.js) — NO a este
// backend. Antes usaba `${API_URL}/operativo`, un bug real: la PWA Operativa es un Render
// Static Site aparte, ese path nunca existió en el backend (ver base:'/' en su vite.config).
// El token en claro nunca se vuelve a mostrar después de esta respuesta (listar() lo oculta
// con select('-token')) — devolver el link acá es la ÚNICA oportunidad de entregarlo si no
// hay correo para mandarlo solo. Sin esto, un Recurso sin correo quedaba con un token creado
// pero irrecuperable: nadie podía compartírselo por ningún otro medio.
function armarLink(usuario, entorno) {
    return `${PWA_OPERATIVA_URL}/?token=${usuario.token}&entorno=${entorno}`;
}

async function enviarCorreoToken(usuario, recurso, link) {
    if (!recurso?.email) return false; // sin Recurso o sin correo, no hay a quién avisar
    await transporter.sendMail({
        from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
        to: recurso.email,
        subject: `Tu acceso a ${usuario.nombre} quedó listo`,
        text: `Hola ${usuario.nombre},\n\n`
            + `Este es tu acceso a la app de trabajo. El link es tu acceso permanente: no caduca al terminar un trabajo y no necesitas clave.\n\n`
            + `${link}\n\n`
            + `Si pierdes el teléfono, avisa a la oficina para que revoquen este acceso.`,
    });
    return true;
}

// POST /api/usuarios — crear usuario y emitir su primer token
exports.crear = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Recurso = getRecurso(req.db);
    try {
        const { nombre, puesto, rol, recursoId } = req.body;
        if (!nombre || !rol) return res.status(400).json({ error: 'nombre y rol son requeridos' });
        if (!['supervisor', 'ejecutor'].includes(rol)) return res.status(400).json({ error: "rol debe ser 'supervisor' o 'ejecutor'" });

        const recurso = recursoId ? await Recurso.findById(recursoId) : null;
        // Sin correo NI teléfono no hay forma de hacerle llegar el link a la persona (ver
        // armarLink más arriba) — pedido explícito del usuario: uno de los dos es obligatorio.
        if (recursoId && !recurso?.email && !recurso?.telefono) {
            return res.status(400).json({ error: 'Este integrante no tiene correo ni teléfono registrado en Recursos — agrega al menos uno antes de emitir el acceso.' });
        }

        const usuario = await Usuario.create({
            nombre, puesto: puesto || '', rol,
            recursoId: recursoId || undefined,
            token: generarToken(),
        });

        if (recursoId) await Recurso.findByIdAndUpdate(recursoId, { usuarioId: usuario._id });

        const link = armarLink(usuario, req.entorno);
        let correoEnviado = false;
        try {
            correoEnviado = await enviarCorreoToken(usuario, recurso, link);
        } catch (eCorreo) {
            console.warn('[usuarios] no se pudo enviar el correo de acceso:', eCorreo.message);
        }

        res.status(201).json({ ...usuario.toObject(), link, correoEnviado, telefono: recurso?.telefono || '' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// GET /api/usuarios/whoami?token=&entorno= — la propia PWA Operativa, para la ficha de O1
exports.whoami = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuario = await Usuario.findOne({ token: req.query.token, estado: 'activo' });
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });
        res.json({ nombre: usuario.nombre, puesto: usuario.puesto, rol: usuario.rol, fechaEmision: usuario.fechaEmision });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/usuarios — listado para el planificador (vía SPA)
exports.listar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuarios = await Usuario.find().select('-token').sort({ createdAt: -1 });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/usuarios/:id/reemitir-token — invalida el token anterior y reenvía el correo
exports.reemitirToken = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Recurso = getRecurso(req.db);
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        const recurso = usuario.recursoId ? await Recurso.findById(usuario.recursoId) : null;
        if (usuario.recursoId && !recurso?.email && !recurso?.telefono) {
            return res.status(400).json({ error: 'Este integrante no tiene correo ni teléfono registrado en Recursos — agrega al menos uno antes de reemitir el acceso.' });
        }

        usuario.token = generarToken();
        usuario.fechaEmision = new Date();
        usuario.estado = 'activo';
        await usuario.save();

        const link = armarLink(usuario, req.entorno);
        let correoEnviado = false;
        try {
            correoEnviado = await enviarCorreoToken(usuario, recurso, link);
        } catch (eCorreo) {
            console.warn('[usuarios] no se pudo enviar el correo de reemisión:', eCorreo.message);
        }

        res.json({ mensaje: 'Token reemitido', usuario, link, correoEnviado, telefono: recurso?.telefono || '' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/usuarios/:id/revocar — el token deja de servir de inmediato
exports.revocar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuario = await Usuario.findByIdAndUpdate(req.params.id, { estado: 'revocado' }, { new: true });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ mensaje: 'Acceso revocado', usuario });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/usuarios/:id/reactivar — vuelve a habilitar con el MISMO token (no lo cambia;
// para eso está reemitir-token). Cubre "un revocado ofrece Reactivar" en Tokens activos.
exports.reactivar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuario = await Usuario.findByIdAndUpdate(req.params.id, { estado: 'activo' }, { new: true }).select('-token');
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ mensaje: 'Acceso reactivado', usuario });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// DELETE /api/usuarios/:id — borra el registro entero (Bodega de tokens, botón "Eliminar").
// A diferencia de revocar (invalida el token pero conserva el registro para auditoría), esto
// lo saca por completo de la tabla — pensado para limpiar pruebas/duplicados, no como
// reemplazo de revocar en el uso normal. Limpia Recurso.usuarioId para no dejar una
// referencia colgando (mismo criterio que la limpieza en cascada al eliminar una OT).
//
// También limpia las Asignacion de este usuarioId — si no, un supervisor con un informe
// inicial tomado y sin enviar quedaba con esa Asignacion huérfana: un token nuevo (con un
// _id distinto) nunca la vuelve a ver como propia, y la solicitud tampoco reaparece en la
// bandeja compartida "Sin informe inicial" (esa vista excluye cualquier solicitud que ya
// tenga una Asignacion, sin fijarse si el usuarioId sigue existiendo). Borrar la Asignacion
// no pierde el trabajo ya cargado: los hallazgos viven en OT.informeEvaluacion, no en la
// Asignacion — esto solo libera la "reserva" de vuelta al pool compartido. Mismo criterio
// que otController.eliminarOT limpiando Asignacion al borrar una OT.
exports.eliminar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Recurso = getRecurso(req.db);
    const Asignacion = require('../models/Asignacion')(req.db);
    try {
        const usuario = await Usuario.findByIdAndDelete(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (usuario.recursoId) await Recurso.updateOne({ _id: usuario.recursoId }, { usuarioId: null });
        await Asignacion.deleteMany({ usuarioId: usuario._id });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
