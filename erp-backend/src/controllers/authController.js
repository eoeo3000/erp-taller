// Login de la app de escritorio (SPA erp-web). Las PWAs no pasan por acá: siguen con su
// token por persona (Usuario.token) y por dispositivo (SesionPortal), sin clave.
const getUsuario = require('../models/Usuario');
const getSesionStaff = require('../models/SesionStaff');
const bitacora = require('../servicios/bitacoraCuentas');
const { hashPassword, verificarPassword } = require('../utils/password');
const { generarToken, hashToken, conPrefijo } = require('../utils/tokens');
const { tallerPorDefecto } = require('../config/talleres');
const { nuevaExpiracion, expiracionAbsoluta, authRequerida, MINUTOS_INACTIVIDAD } = require('../middlewares/sesion');
// Qué base mirar cuando todavía no hay sesión (entrar, recuperar, restablecer). El slug
// viaja como pista y la credencial igual tiene que existir ahí — ver middlewares/entorno.js.
const { conexionPedida } = require('../middlewares/entorno');
// La marca del taller sale del registro EN MEMORIA, así que esto no agrega un viaje a Mongo.
const { marcaDeTaller } = require('../config/conexiones');
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

async function crearSesion(req, usuario, db = req.db) {
    const SesionStaff = getSesionStaff(db);
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
    // La base del taller que pide quien entra, no la del taller por defecto. Sin esto, el
    // correo de alguien de otro taller se busca donde no está y no puede entrar nunca.
    const { db } = conexionPedida(req);
    const Usuario = getUsuario(db);
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
                // Solo el bloqueo, no cada intento fallido: una línea por intento convertiría
                // la bitácora en el registro de quien se equivoca al escribir, y taparía lo
                // que de verdad hay que ver.
                await bitacora.registrar(db, { accion: 'ingreso-bloqueado', usuario, req,
                    detalle: `${MAX_INTENTOS} intentos fallidos — bloqueada ${MINUTOS_BLOQUEO} min` });
            }
            await Usuario.updateOne({ _id: usuario._id }, cambios);
            return res.status(401).json({ error: CREDENCIAL_INVALIDA });
        }

        const token = await crearSesion(req, usuario, db);
        await Usuario.updateOne({ _id: usuario._id }, {
            intentosFallidos: 0, bloqueadoHasta: null, ultimoAccesoSpa: new Date(),
        });
        // `ultimoAccesoSpa` guarda la ÚLTIMA vez y pisa la anterior; esto guarda cada una.
        // La pregunta que no se podía contestar era «¿entró alguna vez, y desde dónde?».
        await bitacora.registrar(db, { accion: 'ingreso', usuario, req });

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
// La marca viaja en LAS CUATRO respuestas, incluida la de 401. El 401 es justamente el que
// hace aparecer la pantalla de ingreso, que es donde más se ve el nombre y el logo del
// taller: si se le olvidara a esa rama, la marca andaría en todas las pantallas menos en la
// primera. Hay prueba de eso.
//
// Qué revela: el nombre que ese taller eligió mostrar, para un slug que hay que acertar. El
// slug se deriva del nombre (servicios/baseDelTaller.js), así que acertarlo ya implica
// conocerlo — esto no agrega una forma de averiguar qué clientes existen.
exports.yo = async (req, res) => {
    if (req.usuario) {
        return res.json({
            usuario: usuarioPublico(req.usuario),
            expira: req.sesion?.expira || null,
            authRequerida: authRequerida(),
            marca: marcaDeTaller(req.taller),
        });
    }

    // Sin NINGUNA cuenta con clave no hay con qué entrar, así que pedir login sería mandar a
    // la gente a una pantalla que nadie puede pasar (es exactamente lo que pasaba antes de
    // que existiera la instalación: había que entrar al servidor a correr un script). Se
    // ofrece crear la primera cuenta, y esto se apaga solo en cuanto exista una.
    const { db, taller } = conexionPedida(req);
    const marca = marcaDeTaller(taller);
    if (!await hayCuentasDeEscritorio(getUsuario(db))) {
        // Un taller que no es el por defecto SIEMPRE necesita su clave de instalación, la del
        // enlace de un solo uso. Sin esto la pantalla se ofrecería sin pedirla y el envío
        // fallaría con un 403 sin explicación — y peor: si no la pidiera el backend,
        // cualquiera que supiera el identificador de un cliente nuevo podría quedarse con él
        // antes que su dueño.
        const esOtroTaller = taller !== tallerPorDefecto();
        return res.json({
            usuario: null,
            requiereInstalacion: true,
            requiereClaveInstalacion: esOtroTaller || claveInstalacionRequerida(),
            // **Por qué** se pide la clave, no solo que se pide. Son dos claves distintas y
            // la pantalla no tiene cómo saber cuál: la del enlace de un solo uso que se le
            // mandó al dueño de un taller nuevo, o `SETUP_TOKEN`, que es del servidor y la
            // sabe quien administra. Sin esto el SPA adivinaba mirando si la URL traía
            // `?clave=`, y al abrir el enlace de ACCESO de un taller nuevo —que no la
            // trae— le decía a su dueño que buscara un SETUP_TOKEN que no existe para él.
            motivoClaveInstalacion: esOtroTaller ? 'enlace' : 'setup',
            taller,
            marca,
        });
    }
    // Sin sesión y con el gate todavía apagado, el SPA entra igual que antes de que
    // existiera el login. Esto es lo que hace que el rollout de AUTH_REQUERIDA valga en los
    // DOS lados: si acá se respondiera 401 siempre, desplegar esta versión dejaría a la
    // oficina mirando una pantalla de acceso que nadie puede pasar todavía, porque las
    // cuentas con clave se crean después (scripts/crearAdmin.js).
    if (!authRequerida()) return res.json({ usuario: null, authRequerida: false, marca });

    res.status(401).json({ error: 'Sesión requerida', marca });
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
        await bitacora.registrar(req.db, { accion: 'clave-cambiada', usuario: req.usuario, req });
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
// Qué se registra de una recuperación, y qué no.
//
// La respuesta al navegador es siempre la misma —exista o no la cuenta— para que el
// formulario no se convierta en una forma de averiguar qué correos están registrados. Pero
// esa misma opacidad dejaba a quien administra el sistema sin ninguna forma de saber qué
// pasó: "no existe esa cuenta", "la cuenta todavía no tiene clave" y "el correo salió bien"
// se veían exactamente igual desde afuera. Eso costó horas de adivinanzas con un caso real.
//
// Así que el resultado SÍ va al log del servidor, con dos reglas:
//   - Nunca la dirección completa. El log de Render lo lee cualquiera con acceso al panel y
//     quedaría ahí una lista de quién tiene cuenta.
//   - Sí el dominio, que es lo que de verdad sirve para diagnosticar: el error típico es
//     escribir el correo de otra cuenta (un gmail cuando la cuenta es de hotmail).
//
// **Y el taller**, porque sin él la línea más común del log —"ninguna cuenta con ese correo"—
// no se puede interpretar: recuperar pasa SIN sesión, así que la base sale de la pista
// `X-Taller`/`?taller=` del navegador (ver `conexionPedida`). Si esa pista apunta al cliente
// equivocado, el correo se busca donde no está y el log dice exactamente lo mismo que si la
// cuenta no existiera. Pasó: alguien que visita los enlaces de varios clientes queda con el
// navegador apuntando al último. El slug no es un secreto —no abre nada— y es lo único que
// distingue "este correo no tiene cuenta" de "buscamos en la base equivocada".
// **Y el entorno**, porque un taller tiene DOS bases —producción y demo— y la elige el
// navegador, no el servidor: `utils/entorno.js` lo guarda en localStorage y lo manda como
// `X-Entorno` en cada llamada, igual que hacía la pista del taller. Un navegador que quedó
// en demo busca el correo en la base de demostración, donde esa cuenta no existe, y hasta
// acá el log decía exactamente lo mismo que si no existiera en ninguna parte.
//
// Y es peor que con el taller: la pantalla de ingreso **no muestra el banner de demo** —vive
// dentro del shell de la app, no en el login—, así que desde ahí no hay ninguna señal de en
// qué base se está buscando. Esta línea es la única.
function registrarRecuperacion(resultado, email, taller, entorno) {
    const dominio = String(email || '').split('@')[1] || '(sin dominio)';
    const donde = `taller ${taller || '(por defecto)'}, ${entorno || 'produccion'}`;
    console.log(`[auth] recuperación: ${resultado} (@${dominio}, ${donde})`);
}

exports.recuperar = async (req, res) => {
    const { db, taller } = conexionPedida(req);
    const Usuario = getUsuario(db);
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        // Respuesta idéntica exista o no la cuenta: si no, esto se convierte en una forma
        // de averiguar qué correos están registrados (mismo criterio que CREDENCIAL_INVALIDA).
        const respuesta = { ok: true, mensaje: 'Si el correo está registrado, te llegará un mensaje con las instrucciones.' };
        if (!email) {
            registrarRecuperacion('pedida sin correo', email, taller, req.entorno);
            return res.json(respuesta);
        }

        const usuario = await Usuario.findOne({ email, estado: 'activo' });
        if (!usuario) {
            // Las dos razones por las que no hay cuenta activa se separan SOLO en el log —a
            // quien pregunta se le responde lo mismo igual— porque mandan a lugares
            // distintos: "no existe" manda a revisar el correo o el taller, y "revocada"
            // manda a Cuentas de oficina a reactivarla. Diagnosticar una como la otra hace
            // perder la tarde buscando donde no es. La consulta extra solo ocurre en el
            // camino que ya falló.
            const revocada = await Usuario.findOne({ email }).catch(() => null);
            registrarRecuperacion(revocada
                ? 'NO se envió — la cuenta existe pero está revocada (se reactiva en Cuentas de oficina)'
                : 'NO se envió — ninguna cuenta con ese correo en este taller', email, taller, req.entorno);
            return res.json(respuesta);
        }
        if (!usuario.passwordHash) {
            // Una invitación que todavía no se activó. Reponer la clave no aplica: lo que
            // corresponde es reenviar la invitación desde Cuentas de oficina.
            registrarRecuperacion('NO se envió — la cuenta existe pero aún no tiene clave (invitación sin activar)', email, taller, req.entorno);
            return res.json(respuesta);
        }

        const token = generarToken();
        await Usuario.updateOne({ _id: usuario._id }, {
            resetHash: hashToken(token),
            resetExpira: new Date(Date.now() + MINUTOS_VALIDEZ_RESET * 60 * 1000),
        });

        // El link lleva el taller: quien lo abre todavía no tiene sesión, así que sin esto
        // el SPA mandaría el restablecimiento a la base del taller por defecto.
        const link = `${SPA_URL}/restablecer?token=${token}&entorno=${req.entorno}&taller=${encodeURIComponent(taller)}`;
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
            registrarRecuperacion('correo entregado al proveedor', email, taller, req.entorno);
        } catch (eCorreo) {
            // Mismo criterio que usuarioController al emitir tokens: el fallo de correo se
            // registra pero no se le informa a quien llama, para no filtrar si existe o no.
            console.warn('[auth] no se pudo enviar el correo de recuperación:', eCorreo.message);
            registrarRecuperacion(`FALLÓ el envío — ${eCorreo.message}`, email, taller, req.entorno);
        }

        res.json(respuesta);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/auth/restablecer — { token, password }
exports.restablecer = async (req, res) => {
    const { db } = conexionPedida(req);
    const Usuario = getUsuario(db);
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
        await getSesionStaff(db).updateMany({ usuarioId: usuario._id, estado: 'activa' }, { estado: 'cerrada' });

        // La misma ruta activa una invitación y repone una clave olvidada: lo que las separa
        // es si esa cuenta YA tenía clave. Sin distinguirlas, el día que alguien pregunte
        // «¿cuándo activó su cuenta?» la bitácora diría «cambió la clave» y no es lo mismo.
        await bitacora.registrar(db, {
            accion: usuario.passwordHash ? 'clave-restablecida' : 'activada',
            usuario, req,
        });

        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
