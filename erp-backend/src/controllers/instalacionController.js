// Primera puesta en marcha: crear la cuenta inicial desde la propia app, sin entrar al
// servidor. Es el patrón de WordPress, GitLab o Jira — y resuelve el problema del huevo y la
// gallina (para crear cuentas hay que estar adentro) sin depender de una terminal.
//
// La ventana se cierra sola: en cuanto existe UNA cuenta con clave, estos endpoints dejan de
// funcionar para siempre. No hay un interruptor que alguien pueda olvidar apagado.
//
// Además es la misma pantalla que, cuando esto sea un SaaS, se convierte en el registro de
// cada taller nuevo: ahí en vez de "solo si no hay ninguna cuenta" la condición pasa a ser
// "crea un taller nuevo con su propia base". No es trabajo botado.
const getUsuario = require('../models/Usuario');
const getSesionStaff = require('../models/SesionStaff');
const { hashPassword } = require('../utils/password');
const { tallerPorDefecto } = require('../config/talleres');
const { generarToken, hashToken, conPrefijo } = require('../utils/tokens');
const { comparaSegura } = require('../utils/claveCompartida');
const { nuevaExpiracion, expiracionAbsoluta } = require('../middlewares/sesion');
const { obtenerConexion, conexionDeControl } = require('../config/conexiones');
const { esSlugValido } = require('../config/talleres');
const { aprovisionarTaller } = require('../servicios/aprovisionamiento');
const getTaller = require('../models/Taller');

const LARGO_MINIMO_PASSWORD = 8;

// Qué cuenta como "ya instalado": existe al menos una cuenta que puede entrar por el login.
// Un Usuario de la PWA (token, sin clave) no cuenta — con eso nadie puede entrar al
// escritorio, así que la instalación seguiría pendiente. Se exporta para que authController
// use exactamente el mismo criterio y las dos respuestas nunca se contradigan.
async function hayCuentasDeEscritorio(Usuario) {
    return !!(await Usuario.exists({ passwordHash: { $exists: true, $ne: '' } }));
}

// Candado opcional, mismo criterio que API_KEY y AUTH_REQUERIDA: si SETUP_TOKEN no está
// definida, la instalación queda abierta mientras no haya cuentas (la ventana dura lo que
// tarde el dueño en crear la suya). Definirla cierra esa ventana del todo.
function claveInstalacionRequerida() {
    return !!process.env.SETUP_TOKEN;
}

exports.hayCuentasDeEscritorio = hayCuentasDeEscritorio;
exports.claveInstalacionRequerida = claveInstalacionRequerida;

// Instalar un TALLER NUEVO, por su enlace de un solo uso (etapa 3 de multi-taller).
//
// El problema que resuelve: quien va a instalar un taller recién dado de alta todavía no
// tiene sesión, y sin sesión `middlewares/entorno.js` resuelve al taller por defecto. O sea
// que, sin esto, el dueño de un taller nuevo caería sobre la base del taller principal.
//
// Por eso el slug viaja en el enlace. **Y por eso el slug no autoriza nada**: es ruteo, igual
// que el prefijo del token de sesión (§9.3 — un subdominio nunca puede ser la autoridad, solo
// una pista). Lo que autoriza son las otras dos condiciones, que se comprueban las tres
// juntas: el slug tiene que existir y estar activo, la clave tiene que coincidir con el hash
// guardado y no estar vencida, y ese taller **no puede tener ya cuentas de escritorio**.
//
// Esa última es la que importa de verdad: sin ella, un enlace viejo que quedó en un correo
// serviría para crearse un administrador dentro de un taller que ya está operando.
async function resolverTallerDelEnlace(req) {
    const slug = String(req.body?.taller || '').trim().toLowerCase();
    if (!slug) return null;
    if (!esSlugValido(slug)) return { error: 'El identificador del taller no es válido.' };

    const control = conexionDeControl();
    if (!control) return { error: 'Este servidor no tiene base de control: no puede instalar talleres nuevos.' };

    const taller = await getTaller(control).findOne({ slug });
    // Mismo texto para "no existe" y "la clave está mala", a propósito y por el mismo motivo
    // que CREDENCIAL_INVALIDA en el login: distinguirlos convierte esto en una forma de
    // averiguar qué talleres existen.
    const invalido = { error: 'El enlace de instalación no es válido o ya venció.' };
    if (!taller) return invalido;

    const clave = String(req.body?.claveInstalacion || '').trim();
    if (!taller.instalacionHash || !clave) return invalido;
    if (!comparaSegura(taller.instalacionHash, hashToken(clave))) return invalido;
    if (!taller.instalacionExpira || taller.instalacionExpira.getTime() < Date.now()) return invalido;

    // `obtenerConexion` rechaza un taller suspendido o dado de baja, así que instalar sobre
    // uno de esos se corta acá sin necesidad de repetir la comprobación.
    let db;
    try {
        db = obtenerConexion('produccion', slug);
    } catch (error) {
        return { error: error.message };
    }
    return { taller, db, slug };
}

// POST /api/instalacion — { nombre, email, password, claveInstalacion?, taller? }
// Crea la primera cuenta Y su sesión, para que quien instala entre de inmediato sin tener
// que escribir de nuevo lo que acaba de elegir.
//
// Dos caminos, y el de siempre no cambia: **sin `taller` en el cuerpo se comporta
// exactamente como antes** —la instalación única, sobre `req.db`, protegida por SETUP_TOKEN—.
// Con `taller` instala ese taller contra SU base.
exports.instalar = async (req, res) => {
    try {
        const delEnlace = await resolverTallerDelEnlace(req);
        if (delEnlace?.error) return res.fail(403, delEnlace.error);

        const db = delEnlace ? delEnlace.db : req.db;
        const Usuario = getUsuario(db);

        if (await hayCuentasDeEscritorio(Usuario)) {
            return res.fail(409, 'Este sistema ya está instalado. Entra con tu cuenta, o pídele a un administrador que te invite.');
        }

        // SETUP_TOKEN guarda el camino sin taller. El de un taller nuevo ya trae su propia
        // clave de un solo uso, que es más fuerte: es por taller, vence y se consume.
        if (!delEnlace && claveInstalacionRequerida() && String(req.body?.claveInstalacion || '') !== process.env.SETUP_TOKEN) {
            return res.fail(403, 'La clave de instalación no es correcta.');
        }

        const nombre = String(req.body?.nombre || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');

        if (!nombre || !email) return res.fail(400, 'Nombre y correo son requeridos');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.fail(400, 'El correo no parece válido');
        if (password.length < LARGO_MINIMO_PASSWORD) {
            return res.fail(400, `La clave debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`);
        }

        // Sin debeCambiarPassword: la clave la eligió quien va a usar la cuenta, acá mismo.
        // No hay motivo para hacerlo cambiarla otra vez, a diferencia de crearAdmin.js, donde
        // la escribe quien corre el script.
        // La base del taller nuevo no existe hasta que se escribe en ella, y sus índices
        // tampoco. Esto va ANTES de crear la cuenta: si los índices se construyeran después,
        // la primera cuenta entraría sin que el índice único del correo existiera.
        if (delEnlace) {
            const informe = await aprovisionarTaller(db);
            console.log(`🏗️  Taller "${delEnlace.slug}": índices listos en ${informe.base} (${informe.modelos.length} modelos).`);
            if (informe.fallidos.length) {
                console.error(`❌ Taller "${delEnlace.slug}": no se pudieron construir todos los índices:`, informe.fallidos);
            }
        }

        const usuario = await Usuario.create({
            nombre, email, rol: 'administrador',
            tallerId: delEnlace ? delEnlace.slug : (req.taller || tallerPorDefecto()),
            passwordHash: await hashPassword(password),
            ultimoAccesoSpa: new Date(),
        });

        const token = generarToken();
        const ahora = Date.now();
        await getSesionStaff(db).create({
            usuarioId: usuario._id,
            tokenHash: hashToken(token),
            expira: nuevaExpiracion(ahora),
            expiraAbsoluto: expiracionAbsoluta(ahora),
            ultimoAcceso: new Date(ahora),
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || '',
        });

        // El enlace se consume: sirvió una vez y no vuelve a servir. Va después de crear la
        // cuenta, no antes — si fallara la creación, el enlace tiene que seguir sirviendo
        // para reintentar, en vez de dejar al cliente nuevo afuera con un taller a medias.
        if (delEnlace) {
            delEnlace.taller.instalacionHash = '';
            delEnlace.taller.instalacionExpira = null;
            await delEnlace.taller.save();
        }

        res.ok({
            // Con el prefijo del taller, igual que authController.crearSesion: es lo que
            // dice en qué base buscar esta sesión (ver utils/tokens.js).
            token: conPrefijo(usuario.tallerId, token),
            usuario: {
                _id: usuario._id, nombre: usuario.nombre, email: usuario.email,
                rol: usuario.rol, puesto: '', debeCambiarPassword: false,
            },
        }, 201);
    } catch (error) {
        res.fail(500, error.message);
    }
};
