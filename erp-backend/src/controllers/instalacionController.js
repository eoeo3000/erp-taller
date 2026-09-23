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
const { nuevaExpiracion, expiracionAbsoluta } = require('../middlewares/sesion');

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

// POST /api/instalacion — { nombre, email, password, claveInstalacion? }
// Crea la primera cuenta Y su sesión, para que quien instala entre de inmediato sin tener
// que escribir de nuevo lo que acaba de elegir.
exports.instalar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        if (await hayCuentasDeEscritorio(Usuario)) {
            return res.fail(409, 'Este sistema ya está instalado. Entra con tu cuenta, o pídele a un administrador que te invite.');
        }

        if (claveInstalacionRequerida() && String(req.body?.claveInstalacion || '') !== process.env.SETUP_TOKEN) {
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
        const usuario = await Usuario.create({
            nombre, email, rol: 'administrador',
            tallerId: req.taller || tallerPorDefecto(),
            passwordHash: await hashPassword(password),
            ultimoAccesoSpa: new Date(),
        });

        const token = generarToken();
        const ahora = Date.now();
        await getSesionStaff(req.db).create({
            usuarioId: usuario._id,
            tokenHash: hashToken(token),
            expira: nuevaExpiracion(ahora),
            expiraAbsoluto: expiracionAbsoluta(ahora),
            ultimoAcceso: new Date(ahora),
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || '',
        });

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
