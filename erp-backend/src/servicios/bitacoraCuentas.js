// Escribir en la bitácora de cuentas.
//
// **Nunca puede ser el motivo de que falle lo que está registrando.** Si Mongo rechaza la
// línea, se pierde la línea, no la invitación ni el ingreso. Mismo criterio que el aviso de
// instalación: lo accesorio no tumba lo principal. Por eso todo va dentro de un `catch`.
//
// Las llamadas **sí** se esperan con `await`, aunque agreguen un insert al camino de un
// login. Soltar la promesa ahorraría esos milisegundos y a cambio el orden de las líneas
// dejaría de ser el de los hechos, que es lo único que un registro tiene para ofrecer. Es
// un insert sin índice único y sin lecturas previas, no el `findOne` de 600-800ms que pesa
// en este clúster. `registrar` no lanza nunca, así que el `await` no agrega ningún camino
// nuevo por el que un ingreso pueda fallar.
//
// Devuelve la línea armada (o null) en vez de solo escribirla, para poder probar QUÉ queda
// escrito sin abrir una conexión — igual que `mailer.revisarConfiguracion`.
const getBitacoraCuenta = require('../models/BitacoraCuenta');

// Lo que se guarda de quien hizo la acción. Un `req` del panel no tiene `req.usuario`: ahí
// el origen es 'panel' y no hay nombre, porque quien arrienda el sistema no es una cuenta de
// esta base. Esa diferencia es justamente lo que se quiere poder leer después.
function quienLoHizo(req) {
    if (!req) return { origen: 'script', porNombre: '', porEmail: '' };
    if (req.usuario) {
        return { origen: 'app', porNombre: req.usuario.nombre || '', porEmail: req.usuario.email || '' };
    }
    return { origen: req.origenBitacora || 'app', porNombre: '', porEmail: '' };
}

function armarLinea({ accion, usuario, req, detalle = '', origen }) {
    const quien = quienLoHizo(req);
    return {
        accion,
        usuarioId: usuario?._id,
        email: usuario?.email || '',
        ...quien,
        ...(origen ? { origen } : {}),
        // `req.ip` es confiable porque server.js declara `trust proxy: 1`. Sin eso era
        // siempre la del proxy de Render, o sea la misma para todos.
        ip: req?.ip || '',
        detalle,
    };
}

async function registrar(db, datos) {
    try {
        const linea = armarLinea(datos);
        await getBitacoraCuenta(db).create(linea);
        return linea;
    } catch (error) {
        // Se avisa pero no se propaga: perder una línea de bitácora no puede dejar a alguien
        // sin poder entrar ni sin poder invitar.
        console.warn('[bitacora] no se pudo registrar:', error.message);
        return null;
    }
}

// Las últimas N líneas, opcionalmente de una sola cuenta. Para el panel y, el día que exista,
// para la pantalla de Cuentas de oficina.
async function leer(db, { usuarioId, limite = 50 } = {}) {
    const filtro = usuarioId ? { usuarioId } : {};
    return getBitacoraCuenta(db).find(filtro).sort({ cuando: -1 }).limit(limite).lean();
}

module.exports = { registrar, leer, armarLinea };
