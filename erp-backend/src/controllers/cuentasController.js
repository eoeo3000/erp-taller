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
const { tallerPorDefecto } = require('../config/talleres');
// Las tres acciones viven en el servicio porque ahora también las llama el panel, que opera
// sobre la base de otro taller y sin sesión. Duplicarlas sería repetir el error de las tres
// versiones de `fechasDeTrabajo`: la segunda copia no se arregla cuando se arregla la primera.
const {
    reenviarInvitacion, revocarCuenta, reactivarCuenta,
    emitirInvitacion, enviarCorreoInvitacion, DIAS_VALIDEZ_INVITACION,
} = require('../servicios/cuentasDeTaller');

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
        const usuario = await Usuario.create({ nombre, email, rol: 'administrador', tallerId: req.taller || tallerPorDefecto() });

        const link = await emitirInvitacion(Usuario, usuario, req.entorno, req.taller || tallerPorDefecto());
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

// PUT /api/cuentas/:id — { nombre?, email? }
exports.actualizar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario || !usuario.email) return res.fail(404, 'Cuenta no encontrada');

        const cambios = {};

        const nombre = String(req.body?.nombre || '').trim();
        if (nombre && nombre !== usuario.nombre) cambios.nombre = nombre;

        const email = String(req.body?.email || '').trim().toLowerCase();
        if (email && email !== usuario.email) {
            // El correo es con lo que entra: cambiárselo a una cuenta activa la deja sin
            // acceso de inmediato y, si el correo nuevo es de otra persona, le entrega el
            // acceso a ella. Para eso está invitar al correo correcto y revocar esta, que
            // además deja rastro de las dos cuentas.
            if (usuario.passwordHash) {
                return res.fail(409, 'Esa cuenta ya está activa y su correo es con lo que entra. Invita al correo correcto y revoca esta.');
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.fail(400, 'El correo no parece válido');
            if (await Usuario.findOne({ email })) return res.fail(409, 'Ya hay una cuenta con ese correo.');
            cambios.email = email;
        }

        if (!Object.keys(cambios).length) return res.ok({ cuenta: cuentaPublica(usuario), sinCambios: true });

        await Usuario.updateOne({ _id: usuario._id }, cambios);
        Object.assign(usuario, cambios);

        let correoEnviado = false;
        let link = '';
        if (cambios.email) {
            // La invitación anterior ya salió al correo equivocado y su link SIGUE sirviendo:
            // quien lo haya recibido podría activar esta cuenta. Emitir otra reemplaza el
            // resetHash guardado, así que el link viejo muere acá mismo.
            link = await emitirInvitacion(Usuario, usuario, req.entorno, req.taller || tallerPorDefecto());
            correoEnviado = true;
            try {
                await enviarCorreoInvitacion(usuario, link, req.usuario?.nombre || 'La oficina');
            } catch (eCorreo) {
                console.warn('[cuentas] no se pudo enviar la invitación al correo corregido:', eCorreo.message);
                correoEnviado = false;
            }
        }

        res.ok({ cuenta: cuentaPublica(usuario), correoEnviado, link: correoEnviado ? '' : link });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// POST /api/cuentas/:id/reenviar — nueva invitación (invalida la anterior)
exports.reenviar = async (req, res) => {
    try {
        const r = await reenviarInvitacion({
            Usuario: getUsuario(req.db), id: req.params.id,
            entorno: req.entorno, taller: req.taller || tallerPorDefecto(),
            invitadoPor: req.usuario?.nombre || 'La oficina',
        });
        if (r.error) return res.fail(r.estado, r.error);
        res.ok({ correoEnviado: r.correoEnviado, link: r.link });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// POST /api/cuentas/:id/revocar — deja de poder entrar, de inmediato
exports.revocar = async (req, res) => {
    try {
        // Desde la app el candado es «nadie puede revocarse a sí mismo»: quien revoca es una
        // de las cuentas que pueden entrar, así que no puede dejar al taller sin ninguna. El
        // servicio comprueba además esa condición de fondo, que es la que importa cuando el
        // que revoca NO tiene cuenta en esa base (el panel).
        if (String(req.params.id) === String(req.usuario._id)) {
            return res.fail(409, 'No puedes revocar tu propia cuenta — pídeselo a otra persona de la oficina.');
        }
        const r = await revocarCuenta({
            Usuario: getUsuario(req.db), SesionStaff: getSesionStaff(req.db), id: req.params.id,
        });
        if (r.error) return res.fail(r.estado, r.error);
        res.ok({ cuenta: cuentaPublica(r.usuario) });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// POST /api/cuentas/:id/reactivar — vuelve a habilitarla con su misma clave
exports.reactivar = async (req, res) => {
    try {
        const r = await reactivarCuenta({ Usuario: getUsuario(req.db), id: req.params.id });
        if (r.error) return res.fail(r.estado, r.error);
        res.ok({ cuenta: cuentaPublica(r.usuario) });
    } catch (error) {
        res.fail(500, error.message);
    }
};
