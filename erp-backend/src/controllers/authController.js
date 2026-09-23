// Login de la app de escritorio (SPA erp-web). Las PWAs no pasan por acá: siguen con su
// token por persona (Usuario.token) y por dispositivo (SesionPortal), sin clave.
const getUsuario = require('../models/Usuario');
const getSesionStaff = require('../models/SesionStaff');
const { hashPassword, verificarPassword } = require('../utils/password');
const { generarToken, hashToken, conPrefijo } = require('../utils/tokens');
const { tallerPorDefecto } = require('../config/talleres');
const { nuevaExpiracion, expiracionAbsoluta, authRequerida, MINUTOS_INACTIVIDAD } = require('../middlewares/sesion');
const { hayCuentasDeEscritorio, claveInstalacionRequerida } = require('./instalacionController');
const transporter = require('../config/mailer');
const { SPA_URL } = require('../config/urls');

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
const MINUTOS_VALIDEZ_RESET = 60;
const LARGO_MINIMO_PASSWORD = 8;

// Mismo texto para "no existe ese correo" y "la clave está mala", a propósito: distinguirlos
// convierte el login en un verificador de qué correos tienen cuenta.
const CREDENCIAL_INVALIDA = 'Correo o clave incorrectos';

// Lo que el SPA necesita saber de quien entró. Nunca incluye passwordHash ni token.
function usuarioPublico(usuario) {
    return {
        _id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email || '',
        rol: usuario.rol,
        puesto: usuario.puesto || '',
        debeCambiarPassword: !!usuario.debeCambiarPassword,
    };
}

async function crearSesion(req, usuario) {
    const SesionStaff = getSesionStaff(req.db);
    const token = generarToken();
    const ahora = Date.now();

    await SesionStaff.create({
        usuarioId: usuario._id,
        tokenHash: hashToken(token),
        expira: nuevaExpiracion(ahora),
        expiraAbsoluto: expiracionAbsoluta(ahora),
        ultimoAcceso: new Date(ahora),
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
    });

    // Se guarda el hash del token SOLO, y se devuelve con el prefijo del taller delante:
    // el prefijo es ruteo (dice en qué base buscarlo la próxima vez) y no forma parte del
    // secreto. Ver utils/tokens.js.
    return conPrefijo(usuario.tallerId || tallerPorDefecto(), token);
}

// POST /api/auth/login — { email, password }
exports.login = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        if (!email || !password) return res.status(400).json({ error: 'Correo y clave son requeridos' });

        const usuario = await Usuario.findOne({ email });

        // Una cuenta sin passwordHash es un usuario de PWA (token, sin clave): no puede
        // entrar por acá aunque tenga correo registrado.
        if (!usuario || !usuario.passwordHash || usuario.estado !== 'activo') {
            return res.status(401).json({ error: CREDENCIAL_INVALIDA });
        }

        if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
            const minutos = Math.ceil((usuario.bloqueadoHasta - Date.now()) / 60000);
            return res.status(429).json({ error: `Demasiados intentos fallidos. Vuelve a intentar en ${minutos} minuto(s).` });
        }

        if (!await verificarPassword(password, usuario.passwordHash)) {
            const intentos = (usuario.intentosFallidos || 0) + 1;
            const cambios = { intentosFallidos: intentos };
            if (intentos >= MAX_INTENTOS) {
                cambios.bloqueadoHasta = new Date(Date.now() + MINUTOS_BLOQUEO * 60 * 1000);
                cambios.intentosFallidos = 0;
            }
            await Usuario.updateOne({ _id: usuario._id }, cambios);
            return res.status(401).json({ error: CREDENCIAL_INVALIDA });
        }

        const token = await crearSesion(req, usuario);
        await Usuario.updateOne({ _id: usuario._id }, {
            intentosFallidos: 0, bloqueadoHasta: null, ultimoAccesoSpa: new Date(),
        });

        res.json({ token, usuario: usuarioPublico(usuario), minutosInactividad: MINUTOS_INACTIVIDAD });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/auth/logout — cierra la sesión con la que se llama
exports.logout = async (req, res) => {
    try {
        if (req.sesion) {
            await getSesionStaff(req.db).updateOne({ _id: req.sesion._id }, { estado: 'cerrada' });
        }
        // Siempre 200: cerrar una sesión que ya no existe es el resultado que se buscaba.
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/auth/yo — quién está conectado. El SPA la llama al arrancar para decidir si
// muestra el login o la app.
exports.yo = async (req, res) => {
    if (req.usuario) {
        return res.json({ usuario: usuarioPublico(req.usuario), expira: req.sesion?.expira || null, authRequerida: authRequerida() });
    }

    // Sin NINGUNA cuenta con clave no hay con qué entrar, así que pedir login sería mandar a
    // la gente a una pantalla que nadie puede pasar (es exactamente lo que pasaba antes de
    // que existiera la instalación: había que entrar al servidor a correr un script). Se
    // ofrece crear la primera cuenta, y esto se apaga solo en cuanto exista una.
    if (!await hayCuentasDeEscritorio(getUsuario(req.db))) {
        return res.json({ usuario: null, requiereInstalacion: true, requiereClaveInstalacion: claveInstalacionRequerida() });
    }
    // Sin sesión y con el gate todavía apagado, el SPA entra igual que antes de que
    // existiera el login. Esto es lo que hace que el rollout de AUTH_REQUERIDA valga en los
    // DOS lados: si acá se respondiera 401 siempre, desplegar esta versión dejaría a la
    // oficina mirando una pantalla de acceso que nadie puede pasar todavía, porque las
    // cuentas con clave se crean después (scripts/crearAdmin.js).
    if (!authRequerida()) return res.json({ usuario: null, authRequerida: false });

    res.status(401).json({ error: 'Sesión requerida' });
};

// POST /api/auth/cambiar-password — { passwordActual, passwordNueva }
exports.cambiarPassword = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        if (!req.usuario) return res.status(401).json({ error: 'Sesión requerida' });

        const passwordActual = String(req.body?.passwordActual || '');
        const passwordNueva = String(req.body?.passwordNueva || '');
        if (passwordNueva.length < LARGO_MINIMO_PASSWORD) {
            return res.status(400).json({ error: `La clave nueva debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres` });
        }
        if (!await verificarPassword(passwordActual, req.usuario.passwordHash)) {
            return res.status(401).json({ error: 'La clave actual no es correcta' });
        }

        await Usuario.updateOne({ _id: req.usuario._id }, {
            passwordHash: await hashPassword(passwordNueva),
            debeCambiarPassword: false,
        });
        // Se cierran las demás sesiones, no la actual: cambiar la clave es lo que hace
        // alguien que sospecha que otro la tiene, y el efecto esperado es echar a ese otro
        // sin echarse a sí mismo de la pestaña donde está trabajando.
        await getSesionStaff(req.db).updateMany(
            { usuarioId: req.usuario._id, estado: 'activa', _id: { $ne: req.sesion?._id } },
            { estado: 'cerrada' },
        );

        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/auth/recuperar — { email }. Manda el correo con el link de restablecimiento.
exports.recuperar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        // Respuesta idéntica exista o no la cuenta: si no, esto se convierte en una forma
        // de averiguar qué correos están registrados (mismo criterio que CREDENCIAL_INVALIDA).
        const respuesta = { ok: true, mensaje: 'Si el correo está registrado, te llegará un mensaje con las instrucciones.' };
        if (!email) return res.json(respuesta);

        const usuario = await Usuario.findOne({ email, estado: 'activo' });
        if (!usuario || !usuario.passwordHash) return res.json(respuesta);

        const token = generarToken();
        await Usuario.updateOne({ _id: usuario._id }, {
            resetHash: hashToken(token),
            resetExpira: new Date(Date.now() + MINUTOS_VALIDEZ_RESET * 60 * 1000),
        });

        const link = `${SPA_URL}/restablecer?token=${token}&entorno=${req.entorno}`;
        try {
            await transporter.sendMail({
                from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
                to: usuario.email,
                subject: 'Restablecer tu clave',
                text: `Hola ${usuario.nombre},\n\n`
                    + `Pediste restablecer la clave de tu cuenta. Entra a este link para poner una nueva:\n\n`
                    + `${link}\n\n`
                    + `El link vence en ${MINUTOS_VALIDEZ_RESET} minutos y sirve una sola vez.\n`
                    + `Si no fuiste tú, ignora este correo: tu clave actual sigue funcionando.`,
            });
        } catch (eCorreo) {
            // Mismo criterio que usuarioController al emitir tokens: el fallo de correo se
            // registra pero no se le informa a quien llama, para no filtrar si existe o no.
            console.warn('[auth] no se pudo enviar el correo de recuperación:', eCorreo.message);
        }

        res.json(respuesta);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/auth/restablecer — { token, password }
exports.restablecer = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const token = String(req.body?.token || '');
        const password = String(req.body?.password || '');
        if (!token) return res.status(400).json({ error: 'Falta el token' });
        if (password.length < LARGO_MINIMO_PASSWORD) {
            return res.status(400).json({ error: `La clave debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres` });
        }

        const usuario = await Usuario.findOne({
            resetHash: hashToken(token),
            resetExpira: { $gt: new Date() },
            estado: 'activo',
        });
        if (!usuario) return res.status(400).json({ error: 'El link no es válido o ya venció' });

        await Usuario.updateOne({ _id: usuario._id }, {
            passwordHash: await hashPassword(password),
            debeCambiarPassword: false,
            resetHash: '',        // un solo uso
            resetExpira: null,
            intentosFallidos: 0,
            bloqueadoHasta: null,
        });
        // Acá sí se cierran TODAS: quien restablece la clave no tiene ninguna sesión que
        // conservar, y si alguien más estaba dentro con la clave vieja, queda afuera.
        await getSesionStaff(req.db).updateMany({ usuarioId: usuario._id, estado: 'activa' }, { estado: 'cerrada' });

        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
