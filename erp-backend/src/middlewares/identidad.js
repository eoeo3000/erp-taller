// Quién está llamando, para las rutas que comparten la oficina y la PWA Operativa.
//
// Por qué existe, y por qué no alcanzaba `requiereSesion`: `/ots` y `/solicitudes` las usan
// DOS clientes con dos formas distintas de identificarse. La oficina (erp-web) manda una
// sesión de escritorio en `Authorization: Bearer`; la PWA Operativa manda el token
// permanente de la persona en `?token=`, sin clave y sin sesión. Exigir sesión en esas
// rutas dejaría a la PWA afuera, y por eso quedaron **abiertas a cualquiera** — sin ninguna
// credencial, `GET /api/solicitudes` devolvía la cartera completa de clientes del taller.
//
// Esto acepta cualquiera de las dos pruebas de identidad y rechaza al que no trae ninguna.
//
// --- Lo que esto NO hace ---
//
// No es autorización por recurso. Con una identidad válida, cualquier persona del taller
// puede leer cualquier OT, no solo las suyas. Eso es una mejora enorme sobre "cualquiera en
// internet", y sigue sin ser "solo quien corresponde": lo segundo es trabajo aparte, por
// ruta, y es el camino que ya abrió `otController.accionMovil` (que sí comprueba que la
// persona tenga asignación sobre esa OT antes de dejarla actuar).
//
// ROLLOUT: igual que `requiereSesion` con AUTH_REQUERIDA y que `apiKey` con API_KEY, esto
// solo bloquea de verdad con IDENTIDAD_REQUERIDA='true'. Sin esa variable deja pasar con un
// aviso. El motivo acá es más fuerte que en los otros dos: la PWA Operativa vive instalada
// en el teléfono de alguien que está en terreno. Si el backend empezara a exigir el token
// en el mismo deploy, cualquier teléfono con una copia vieja de la app —y en terreno las
// hay, con mala señal y cola de reintento— se quedaría sin poder guardar su informe a mitad
// de trabajo. El orden correcto es: desplegar esto, desplegar la PWA que manda el token,
// confirmar en un teléfono de verdad, y recién ahí encender la variable.
const getUsuario = require('../models/Usuario');
const { sinPrefijo, tokenMovilDeLaRequest } = require('../utils/tokens');
const { tallerPorDefecto } = require('../config/talleres');

let avisoEmitido = false;

function identidadRequerida() {
    return process.env.IDENTIDAD_REQUERIDA === 'true';
}

// La ÚNICA definición de "a quién corresponde este token de PWA". Antes vivía copiada en
// asignacionController, usuarioController y otController; las tres estaban bien, pero tres
// copias de una comprobación de acceso es exactamente la forma en que una de ellas se queda
// atrás. Mismo criterio que `fechasDeTrabajo` tras B1: una definición, y las demás la usan.
//
// **El descarte del token vacío no es opcional.** `findOne({ token })` con token undefined
// viaja a Mongo como `{ token: null }`, y null hace match con los documentos que NO tienen
// el campo — desde que existe el login de escritorio, eso son justamente las cuentas de
// oficina. Sin esta línea, una llamada sin token se identificaría como la primera cuenta
// administrativa que encuentre.
// `taller` es el de la request (`req.taller`), el que ya eligió la base. No es opcional: un
// valor por omisión que se saltara la comprobación sería exactamente el olvido que convierte
// un sistema multi-cliente en una filtración.
async function resolverUsuarioPorToken(Usuario, tokenCompleto, taller) {
    // El token viaja con el prefijo del taller delante (`rivas.a3f9…`) y en la base está
    // guardado pelado. Sin sacarlo no se encuentra nunca a nadie. Un token sin punto vuelve
    // igual: son los que ya están instalados en los teléfonos.
    const token = sinPrefijo(tokenCompleto);
    if (!token) return null;
    const usuario = await Usuario.findOne({ token, estado: 'activo' });

    // El cierre de la cadena, igual que en middlewares/sesion.js: la persona tiene que
    // pertenecer al taller cuya base se abrió. El prefijo eligió la base, pero es dato que
    // manda el cliente; esto lo confronta con lo que dice la base. Sin `tallerId` son accesos
    // anteriores a que el campo existiera y se resuelven como del taller por defecto.
    if (usuario) {
        const tallerDelUsuario = usuario.tallerId || tallerPorDefecto();
        if (tallerDelUsuario !== (taller || tallerPorDefecto())) {
            console.warn(`[identidad] token de una persona de "${tallerDelUsuario}" llegó resuelto al taller "${taller}" — se rechaza`);
            return null;
        }
    }

    if (usuario) {
        // No se espera este guardado: es una marca informativa de "último acceso" y cada
        // request de la PWA pasa por acá — esperarlo duplica el round-trip a Mongo de CADA
        // llamada (medido en producción: un solo findOne ya tarda ~600-800ms por la latencia
        // de la conexión; sumar otro era buena parte de la lentitud de mi-día/mi-semana).
        usuario.ultimoAcceso = new Date();
        usuario.save().catch(() => {});
    }
    return usuario;
}

// `tokenMovilDeLaRequest` vive en utils/tokens.js: lo necesita también
// `middlewares/entorno.js`, que tiene que saber de qué taller es la request antes de que
// exista ninguna base abierta donde buscar a nadie.

// Deja `req.usuarioMovil` cuando la identidad vino por token de PWA. A propósito NO escribe
// `req.usuario`: ese lo pone `identificar` y significa "sesión de escritorio". Mezclarlos
// haría que un controlador que confía en `req.usuario` para decidir algo de oficina lo
// viera satisfecho con un token de operario.
async function requiereIdentidad(req, res, next) {
    if (req.usuario) return next();

    try {
        const usuario = await resolverUsuarioPorToken(getUsuario(req.db), tokenMovilDeLaRequest(req), req.taller);
        if (usuario) {
            req.usuarioMovil = usuario;
            return next();
        }
    } catch (error) {
        // Una caída de Mongo no debe convertirse en "pasa igual": se registra y se trata
        // como identidad no probada.
        console.error('[identidad] no se pudo resolver el token:', error.message);
    }

    if (!identidadRequerida()) {
        if (!avisoEmitido) {
            console.warn('⚠️  IDENTIDAD_REQUERIDA no está en "true" — las rutas que comparten la oficina y la PWA'
                + ' (OT y solicitudes) siguen abiertas a cualquiera (ver middlewares/identidad.js).');
            avisoEmitido = true;
        }
        return next();
    }

    return res.status(401).json({ error: 'Identidad requerida' });
}

// La combinación que deja a la oficina afuera: identidad exigida y login apagado. Sin
// AUTH_REQUERIDA el SPA no manda ninguna sesión, así que `requiereIdentidad` no encuentra
// `req.usuario` y responde 401 a cada pantalla — la app queda muerta para el escritorio
// aunque la PWA siga funcionando. Se avisa al arrancar en vez de corregirlo solo: apagar
// uno de los dos es una decisión, y adivinar cuál quería quien configuró sería peor.
function avisarConfiguracion() {
    if (identidadRequerida() && process.env.AUTH_REQUERIDA !== 'true') {
        console.error('❌ IDENTIDAD_REQUERIDA está activa pero AUTH_REQUERIDA no:'
            + ' la app de escritorio no manda sesión y va a recibir 401 en OT y solicitudes.'
            + ' Enciende AUTH_REQUERIDA, o apaga IDENTIDAD_REQUERIDA.');
        return false;
    }
    return true;
}

module.exports = { requiereIdentidad, resolverUsuarioPorToken, identidadRequerida, avisarConfiguracion };
