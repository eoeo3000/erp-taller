// Administración de las cuentas de escritorio (las que entran con correo y clave al SPA).
// Separado de usuarioController, que administra los accesos móviles por token: comparten la
// colección Usuario (una sola tabla de personas, ver models/Usuario.js) pero son dos formas
// de entrar distintas, con dos pantallas distintas y dos ciclos de vida distintos.
//
// Alta SOLO por invitación de alguien que ya está adentro — no hay registro abierto. Un
// correo confirma que esa persona es dueña de ese buzón, pero no que trabaje en el taller;
// quien autoriza es la oficina. Ver la nota de rutas en cuentasRoutes.js.
const getUsuario = require('../models/Usuario');
const getSesionStaff = require('../models/SesionStaff');
const { generarToken, hashToken } = require('../utils/tokens');
const transporter = require('../config/mailer');
const { SPA_URL } = require('../config/urls');

// Más larga que la de recuperar clave (1h): una invitación se manda a alguien que capaz
// recién entra el lunes, no a alguien que está mirando la pantalla en este momento.
const DIAS_VALIDEZ_INVITACION = 7;

function cuentaPublica(usuario) {
    return {
        _id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email || '',
        rol: usuario.rol,
        estado: usuario.estado,
        // Sin passwordHash todavía = la invitación no se ha usado. Es lo que la pantalla
        // muestra como "Invitación pendiente" en vez de "Activa".
        activada: !!usuario.passwordHash,
        ultimoAccesoSpa: usuario.ultimoAccesoSpa || null,
        createdAt: usuario.createdAt,
    };
}

async function emitirInvitacion(Usuario, usuario, entorno) {
    const token = generarToken();
    await Usuario.updateOne({ _id: usuario._id }, {
        resetHash: hashToken(token),
        resetExpira: new Date(Date.now() + DIAS_VALIDEZ_INVITACION * 24 * 60 * 60 * 1000),
    });
    // Misma maquinaria que recuperar clave (POST /auth/restablecer valida este token y
    // graba la clave): activar una cuenta nueva y reponer una olvidada son el mismo acto
    // desde el punto de vista del backend — alguien que demuestra tener el buzón elige una
    // clave. Lo único que cambia es el texto del correo y el título de la pantalla.
    return `${SPA_URL}/activar?token=${token}&entorno=${entorno}`;
}

async function enviarCorreoInvitacion(usuario, link, invitadoPor) {
    await transporter.sendMail({
        from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
        to: usuario.email,
        subject: 'Tu acceso al ERP del taller',
        text: `Hola ${usuario.nombre},\n\n`
            + `${invitadoPor} te dio acceso al sistema del taller. Entra a este link para elegir tu clave y activar tu cuenta:\n\n`
            + `${link}\n\n`
            + `El link vence en ${DIAS_VALIDEZ_INVITACION} días. Si vence antes de que alcances a usarlo, pídele a la oficina que te lo reenvíe.\n`
            + `Si no esperabas este correo, ignóralo: sin entrar a ese link la cuenta no queda activa.`,
    });
}

// POST /api/cuentas/invitar — { nombre, email }
exports.invitar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const nombre = String(req.body?.nombre || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!nombre || !email) return res.fail(400, 'Nombre y correo son requeridos');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.fail(400, 'El correo no parece válido');

        const yaExiste = await Usuario.findOne({ email });
        if (yaExiste) {
            return res.fail(409, yaExiste.passwordHash
                ? 'Ya hay una cuenta con ese correo.'
                : 'Ya hay una invitación pendiente para ese correo — usá "Reenviar" en la lista.');
        }

        // Sin passwordHash: la cuenta existe pero no sirve para entrar hasta que la persona
        // elija su clave desde el link. Nadie, ni quien invita, conoce una clave suya.
        const usuario = await Usuario.create({ nombre, email, rol: 'administrador' });

        const link = await emitirInvitacion(Usuario, usuario, req.entorno);
        let correoEnviado = true;
        try {
            await enviarCorreoInvitacion(usuario, link, req.usuario?.nombre || 'La oficina');
        } catch (eCorreo) {
            // Mismo criterio que usuarioController al emitir tokens: si el correo no sale,
            // se devuelve el link para entregarlo a mano en vez de dejar la cuenta inservible.
            console.warn('[cuentas] no se pudo enviar la invitación:', eCorreo.message);
            correoEnviado = false;
        }

        res.ok({ cuenta: cuentaPublica(usuario), correoEnviado, link: correoEnviado ? '' : link }, 201);
    } catch (error) {
        res.fail(500, error.message);
    }
};

// GET /api/cuentas — las cuentas de escritorio (las que tienen correo)
exports.listar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const cuentas = await Usuario.find({ email: { $exists: true, $ne: '' } })
            .select('-passwordHash -token -resetHash')
            .sort({ createdAt: -1 });
        res.ok(cuentas.map(cuentaPublica));
    } catch (error) {
        res.fail(500, error.message);
    }
};

// POST /api/cuentas/:id/reenviar — nueva invitación (invalida la anterior)
exports.reenviar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario || !usuario.email) return res.fail(404, 'Cuenta no encontrada');
        if (usuario.passwordHash) return res.fail(409, 'Esa cuenta ya está activa — si perdió la clave, que use "Olvidé mi clave" en la pantalla de ingreso.');

        const link = await emitirInvitacion(Usuario, usuario, req.entorno);
        let correoEnviado = true;
        try {
            await enviarCorreoInvitacion(usuario, link, req.usuario?.nombre || 'La oficina');
        } catch (eCorreo) {
            console.warn('[cuentas] no se pudo reenviar la invitación:', eCorreo.message);
            correoEnviado = false;
        }

        res.ok({ correoEnviado, link: correoEnviado ? '' : link });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// POST /api/cuentas/:id/revocar — deja de poder entrar, de inmediato
exports.revocar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        // Quedarse sin ninguna cuenta activa dejaría al taller afuera de su propio sistema,
        // y recuperarlo exigiría entrar al servidor a correr scripts/crearAdmin.js.
        if (String(req.params.id) === String(req.usuario._id)) {
            return res.fail(409, 'No puedes revocar tu propia cuenta — pídeselo a otra persona de la oficina.');
        }

        const usuario = await Usuario.findByIdAndUpdate(req.params.id, { estado: 'revocado' }, { new: true });
        if (!usuario) return res.fail(404, 'Cuenta no encontrada');

        // No se espera al próximo request suyo para echarla: se cierran sus sesiones ya.
        await getSesionStaff(req.db).updateMany({ usuarioId: usuario._id, estado: 'activa' }, { estado: 'cerrada' });

        res.ok({ cuenta: cuentaPublica(usuario) });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// POST /api/cuentas/:id/reactivar — vuelve a habilitarla con su misma clave
exports.reactivar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuario = await Usuario.findByIdAndUpdate(req.params.id, { estado: 'activo' }, { new: true });
        if (!usuario) return res.fail(404, 'Cuenta no encontrada');
        res.ok({ cuenta: cuentaPublica(usuario) });
    } catch (error) {
        res.fail(500, error.message);
    }
};
