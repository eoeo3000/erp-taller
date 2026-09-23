// Respaldos disparados desde fuera. Ver src/servicios/respaldo.js para el qué y el porqué.
//
// Por qué un endpoint y no un temporizador dentro del proceso: en el plan gratis de Render
// el servicio se duerme cuando nadie lo usa, y un `setInterval` no corre mientras duerme.
// El respaldo nunca saldría, y —peor— nadie se enteraría de que no está saliendo. Una
// llamada desde afuera (ver .github/workflows/respaldo.yml) además despierta el servicio.
const crypto = require('crypto');
const { crearRespaldo, listarRespaldos } = require('../servicios/respaldo');
const { obtenerConexion } = require('../config/conexiones');

// A diferencia de API_KEY y AUTH_REQUERIDA, que sin configurar DEJAN PASAR para poder
// desplegarlos por etapas, acá sin clave se cierra. La diferencia es que aquellos protegían
// rutas que ya existían y estaban abiertas —abrir era el estado previo, no una regresión—
// mientras que esta ruta nace hoy: dejarla abierta por omisión regalaría a cualquiera la
// capacidad de disparar respaldos y de leer la lista de lo que hay en la base.
function claveConfigurada() {
    return String(process.env.RESPALDO_TOKEN || '').trim();
}

function claveCorrecta(req) {
    const esperada = claveConfigurada();
    const recibida = String(req.get('X-Respaldo-Token') || '').trim();
    if (!esperada || !recibida) return false;

    // Comparación de tiempo constante: `===` sobre strings corta en la primera diferencia y
    // filtra, por el tiempo de respuesta, cuántos caracteres del principio son correctos.
    const a = Buffer.from(esperada);
    const b = Buffer.from(recibida);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function autorizar(req, res) {
    if (!claveConfigurada()) {
        res.fail(503, 'Los respaldos no están configurados: falta RESPALDO_TOKEN en el servidor.');
        return false;
    }
    if (!claveCorrecta(req)) {
        res.fail(401, 'Clave de respaldo incorrecta');
        return false;
    }
    return true;
}

// Cuál base respaldar. Por defecto producción: la demo se puede regenerar y no es lo que
// duele perder.
function entornoPedido(req) {
    return String(req.query.entorno || req.body?.entorno || 'produccion') === 'demo' ? 'demo' : 'produccion';
}

// POST /api/respaldos — crea uno nuevo
exports.crear = async (req, res) => {
    if (!autorizar(req, res)) return;
    const entorno = entornoPedido(req);
    try {
        const inicio = Date.now();
        const resultado = await crearRespaldo(obtenerConexion(entorno), entorno);
        console.log(`[respaldo] ${entorno}: ${resultado.documentos} documentos, `
            + `${Math.round(resultado.tamano / 1024)} KB, ${Date.now() - inicio} ms → ${resultado.clave}`);
        res.ok({ ...resultado, duracionMs: Date.now() - inicio }, 201);
    } catch (error) {
        // Se registra completo en el log del servidor: si el respaldo falla en silencio, el
        // día que haga falta no va a estar y nadie va a saber desde cuándo.
        console.error(`[respaldo] FALLÓ el respaldo de ${entorno}:`, error);
        res.fail(500, `No se pudo crear el respaldo: ${error.message}`);
    }
};

// GET /api/respaldos — qué respaldos hay
exports.listar = async (req, res) => {
    if (!autorizar(req, res)) return;
    try {
        const respaldos = await listarRespaldos(entornoPedido(req));
        res.ok({
            entorno: entornoPedido(req),
            total: respaldos.length,
            masReciente: respaldos[0]?.fecha || null,
            respaldos,
        });
    } catch (error) {
        res.fail(500, error.message);
    }
};
