// Usuarios de la PWA Operativa (supervisor/ejecutor) — ver docs/estrategia-movil.md §7.1
// y docs/rediseno/design_handoff_pwa_movil/README.md §7.
// El entorno de estas rutas viaja por header o por ?entorno= en la query (resolverEntorno,
// ver CORRECCIONES.md punto 7) — las PWA se abren fuera de la SPA y nunca envían el header.
const crypto = require('crypto');
const getUsuario = require('../models/Usuario');
const getRecurso = require('../models/Recurso');
const transporter = require('../config/mailer');

function generarToken() {
    return crypto.randomBytes(20).toString('hex');
}

async function enviarCorreoToken(usuario, recurso, baseUrl, entorno) {
    if (!recurso?.email) return; // sin Recurso o sin correo, no hay a quién avisar
    const link = `${baseUrl}/operativo?token=${usuario.token}&entorno=${entorno}`;
    await transporter.sendMail({
        from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
        to: recurso.email,
        subject: `Tu acceso a ${usuario.nombre} quedó listo`,
        text: `Hola ${usuario.nombre},\n\n`
            + `Este es tu acceso a la app de trabajo. El link es tu acceso permanente: no caduca al terminar un trabajo y no necesitas clave.\n\n`
            + `${link}\n\n`
            + `Si pierdes el teléfono, avisa a la oficina para que revoquen este acceso.`,
    });
}

// POST /api/usuarios — crear usuario y emitir su primer token
exports.crear = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Recurso = getRecurso(req.db);
    try {
        const { nombre, puesto, rol, recursoId } = req.body;
        if (!nombre || !rol) return res.status(400).json({ error: 'nombre y rol son requeridos' });
        if (!['supervisor', 'ejecutor'].includes(rol)) return res.status(400).json({ error: "rol debe ser 'supervisor' o 'ejecutor'" });

        const usuario = await Usuario.create({
            nombre, puesto: puesto || '', rol,
            recursoId: recursoId || undefined,
            token: generarToken(),
        });

        if (recursoId) await Recurso.findByIdAndUpdate(recursoId, { usuarioId: usuario._id });

        const recurso = recursoId ? await Recurso.findById(recursoId) : null;
        const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
        try {
            await enviarCorreoToken(usuario, recurso, baseUrl, req.entorno);
        } catch (eCorreo) {
            console.warn('[usuarios] no se pudo enviar el correo de acceso:', eCorreo.message);
        }

        res.status(201).json(usuario);
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

        usuario.token = generarToken();
        usuario.fechaEmision = new Date();
        usuario.estado = 'activo';
        await usuario.save();

        const recurso = usuario.recursoId ? await Recurso.findById(usuario.recursoId) : null;
        const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
        try {
            await enviarCorreoToken(usuario, recurso, baseUrl, req.entorno);
        } catch (eCorreo) {
            console.warn('[usuarios] no se pudo enviar el correo de reemisión:', eCorreo.message);
        }

        res.json({ mensaje: 'Token reemitido', usuario });
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
