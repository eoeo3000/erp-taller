// Sesión de escritorio (SPA erp-web). Corre después de resolverEntorno, así que `req.db`
// ya apunta a la conexión correcta: las cuentas de demo y las de producción son distintas,
// igual que el resto de los datos.
//
// Expone dos middlewares con propósitos distintos:
//   - `identificar`: nunca bloquea. Deja `req.usuario` cuando hay sesión válida, para que
//     los controladores puedan registrar quién hizo cada cosa (OT.asignadaPor,
//     SesionPortal.emitidoPor, informeEvaluacion.revision.autor — todos hoy vacíos "porque
//     no hay sistema de login", ver TratamientoScreen.jsx).
//   - `requiereSesion`: bloquea con 401 si no hay sesión válida.
//
// ROLLOUT: `requiereSesion` solo bloquea de verdad con AUTH_REQUERIDA='true' en el .env.
// Sin esa variable deja pasar con un aviso en consola, exactamente como hace apiKey.js
// cuando falta API_KEY. El motivo es de secuencia: el backend se despliega antes que la
// pantalla de login del SPA, y si bloqueara desde el primer deploy la app quedaría muerta
// (no manda ningún token todavía) hasta que ambos lados estén arriba. Se activa cuando el
// SPA ya sabe autenticarse.
const getSesionStaff = require('../models/SesionStaff');
const getUsuario = require('../models/Usuario');
const { hashToken, separarPrefijo } = require('../utils/tokens');
const { tallerPorDefecto } = require('../config/talleres');

// Ventana de inactividad: un PC suspendido no dispara ningún evento que el navegador pueda
// avisar, así que "pedir clave al volver de suspender" se implementa como "pedir clave
// después de N minutos sin actividad real".
const MINUTOS_INACTIVIDAD = 60;
// Tope duro desde la creación de la sesión, aunque haya actividad continua.
const HORAS_MAXIMO = 24;
// No se reescribe la fila en cada request: con el polling del SPA eso serían ~2 escrituras
// por minuto y por persona sin ninguna ganancia. Se renueva cuando ya pasó este lapso.
const RENOVAR_CADA_MS = 60 * 1000;

let avisoEmitido = false;

function authRequerida() {
    return process.env.AUTH_REQUERIDA === 'true';
}

function tokenDeLaRequest(req) {
    const cabecera = req.headers.authorization || '';
    return cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : '';
}

// El polling de /api/data (cada 30s en App.jsx) NO debe correr la ventana de inactividad:
// si lo hiciera, una pestaña abierta mantendría viva la sesión para siempre aunque no haya
// nadie frente al computador — justo lo contrario de lo que se busca. El SPA marca esa
// llamada con este header.
//
// Que la marca venga del cliente no es un agujero: quien ya tiene un token válido puede
// renovar su propia sesión de todas formas con cualquier otra acción. No hay nada que
// ganar mintiendo acá.
function esSondeo(req) {
    return req.headers['x-sondeo'] === '1';
}

function nuevaExpiracion(desde = Date.now()) {
    return new Date(desde + MINUTOS_INACTIVIDAD * 60 * 1000);
}

function expiracionAbsoluta(desde = Date.now()) {
    return new Date(desde + HORAS_MAXIMO * 60 * 60 * 1000);
}

// Devuelve { sesion, usuario } o null. No responde nunca: quien llama decide qué hacer.
async function resolverSesion(req) {
    const tokenCompleto = tokenDeLaRequest(req);
    if (!tokenCompleto) return null;

    // El prefijo ya lo usó middlewares/entorno.js para elegir la base; acá se descarta y se
    // trabaja con el token solo, que es lo que se guardó hasheado.
    const { token } = separarPrefijo(tokenCompleto);
    if (!token) return null;

    const SesionStaff = getSesionStaff(req.db);
    const sesion = await SesionStaff.findOne({ tokenHash: hashToken(token), estado: 'activa' });
    if (!sesion) return null;

    const ahora = new Date();
    if (sesion.expira <= ahora || sesion.expiraAbsoluto <= ahora) {
        // Se cierra en vez de dejarla colgando: así "sesiones activas" significa lo que dice.
        await SesionStaff.updateOne({ _id: sesion._id }, { estado: 'cerrada' });
        return null;
    }

    const usuario = await getUsuario(req.db).findById(sesion.usuarioId);
    // Revocar a la persona corta sus sesiones abiertas en la siguiente request, sin tener
    // que ir a buscarlas una por una.
    if (!usuario || usuario.estado !== 'activo') return null;

    // El cierre de la cadena: la persona tiene que pertenecer al taller cuya base se abrió.
    // El prefijo del token eligió la base, pero es dato del cliente; esto lo confronta con
    // lo que dice la base. Sin `tallerId` son cuentas anteriores a que el campo existiera y
    // se resuelven como del taller por defecto, que es el único que hay hoy.
    //
    // Con un solo taller esto nunca falla. Existe desde ahora para que el día que haya dos
    // no haya que acordarse de agregarlo: ese es exactamente el olvido que convierte un
    // sistema multi-cliente en una filtración.
    const tallerDelUsuario = usuario.tallerId || tallerPorDefecto();
    if (tallerDelUsuario !== (req.taller || tallerPorDefecto())) {
        console.warn(`[sesion] sesión de un usuario de "${tallerDelUsuario}" llegó resuelta al taller "${req.taller}" — se rechaza`);
        return null;
    }

    if (!esSondeo(req) && ahora - sesion.ultimoAcceso > RENOVAR_CADA_MS) {
        const expira = nuevaExpiracion(ahora.getTime());
        // La ventana deslizante nunca puede pasarse del tope duro.
        sesion.expira = expira > sesion.expiraAbsoluto ? sesion.expiraAbsoluto : expira;
        sesion.ultimoAcceso = ahora;
        await SesionStaff.updateOne({ _id: sesion._id }, { expira: sesion.expira, ultimoAcceso: ahora });
    }

    return { sesion, usuario };
}

async function identificar(req, res, next) {
    try {
        const resuelto = await resolverSesion(req);
        if (resuelto) {
            req.sesion = resuelto.sesion;
            req.usuario = resuelto.usuario;
        }
    } catch (error) {
        // Identificar es informativo: si falla, la request sigue sin identidad en vez de
        // caerse. Las rutas que exigen sesión igual quedan cerradas por requiereSesion.
        console.error('[sesion] no se pudo resolver la sesión:', error.message);
    }
    next();
}

function requiereSesion(req, res, next) {
    if (req.usuario) return next();

    if (!authRequerida()) {
        if (!avisoEmitido) {
            console.warn('⚠️  AUTH_REQUERIDA no está en "true" — las rutas de la app de escritorio quedan abiertas (ver middlewares/sesion.js).');
            avisoEmitido = true;
        }
        return next();
    }

    return res.status(401).json({ error: 'Sesión requerida' });
}

// Exige sesión SIEMPRE, ignore o no el rollout. Para lo que crea o cambia credenciales
// (invitar a alguien a la oficina, revocar su cuenta): una invitación emitida durante la
// ventana en que AUTH_REQUERIDA sigue apagada seguiría sirviendo después de encenderla, así
// que dejar pasar ahí no es "todavía no bloqueamos", es regalar acceso permanente.
// Consecuencia buscada: antes de que exista la primera cuenta no se puede invitar desde la
// app; esa primera sale de scripts/crearAdmin.js, que es justamente para lo que existe.
function requiereSesionEstricta(req, res, next) {
    if (req.usuario) return next();
    res.status(401).json({ error: 'Sesión requerida' });
}

module.exports = {
    identificar,
    requiereSesion,
    requiereSesionEstricta,
    authRequerida,
    nuevaExpiracion,
    expiracionAbsoluta,
    MINUTOS_INACTIVIDAD,
    HORAS_MAXIMO,
};
