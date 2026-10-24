// Respaldos disparados desde fuera. Ver src/servicios/respaldo.js para el qué y el porqué.
//
// Por qué un endpoint y no un temporizador dentro del proceso: en el plan gratis de Render
// el servicio se duerme cuando nadie lo usa, y un `setInterval` no corre mientras duerme.
// El respaldo nunca saldría, y —peor— nadie se enteraría de que no está saliendo. Una
// llamada desde afuera (ver .github/workflows/respaldo.yml) además despierta el servicio.
const { comparaSegura } = require('../utils/claveCompartida');
const { crearRespaldo, listarRespaldos } = require('../servicios/respaldo');
const { obtenerConexion, talleresActivos } = require('../config/conexiones');
const { TALLER_PRINCIPAL } = require('../config/talleres');

// A diferencia de API_KEY y AUTH_REQUERIDA, que sin configurar DEJAN PASAR para poder
// desplegarlos por etapas, acá sin clave se cierra. La diferencia es que aquellos protegían
// rutas que ya existían y estaban abiertas —abrir era el estado previo, no una regresión—
// mientras que esta ruta nace hoy: dejarla abierta por omisión regalaría a cualquiera la
// capacidad de disparar respaldos y de leer la lista de lo que hay en la base.
function claveConfigurada() {
    return String(process.env.RESPALDO_TOKEN || '').trim();
}

function claveCorrecta(req) {
    // La comparación de tiempo constante vive en utils/claveCompartida.js: la comparte con
    // el registro de talleres, y es el tipo de detalle que se degrada al copiarlo.
    return comparaSegura(claveConfigurada(), req.get('X-Respaldo-Token'));
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

// Qué talleres respaldar. **Sin indicar ninguno se respaldan TODOS los activos**, que es lo
// que corre todas las noches: desde la etapa 5 hay un respaldo por cliente, y si esta ruta
// siguiera respaldando uno solo, el día que entre el segundo taller su base quedaría sin
// copia sin que nadie lo note. Se puede pedir uno puntual con `?taller=`, que es lo que
// sirve antes de tocar algo de un cliente en particular.
//
// La demo es una sola para todos (§9.2), así que ahí "todos los talleres" es uno.
function talleresPedidos(req, entorno) {
    if (entorno === 'demo') return [TALLER_PRINCIPAL];
    const pedido = String(req.query.taller || req.body?.taller || '').trim().toLowerCase();
    if (pedido) return [pedido];
    const activos = talleresActivos();
    return activos.length ? activos : [TALLER_PRINCIPAL];
}

// POST /api/respaldos — crea uno nuevo
exports.crear = async (req, res) => {
    if (!autorizar(req, res)) return;
    const entorno = entornoPedido(req);
    const talleres = talleresPedidos(req, entorno);
    const inicio = Date.now();

    // Uno por uno y no en paralelo: cada respaldo lee la base entera y la comprime al
    // máximo, así que diez a la vez compiten por la memoria del contenedor —que en Render
    // es poca— para terminar unos segundos antes. Acá no hay apuro: esto corre de
    // madrugada, llamado desde afuera.
    const hechos = [];
    const fallados = [];
    for (const taller of talleres) {
        try {
            const r = await crearRespaldo(obtenerConexion(entorno, taller), entorno, taller);
            console.log(`[respaldo] ${entorno}/${taller}: ${r.documentos} documentos, `
                + `${Math.round(r.tamano / 1024)} KB → ${r.clave}`);
            hechos.push(r);
        } catch (error) {
            // Un taller que falla NO corta la vuelta: si la base de uno está caída, los
            // demás igual tienen que quedar respaldados esa noche. Lo que no puede pasar es
            // que falle en silencio, así que queda en el log y en la respuesta, y el
            // resultado es 500 para que la tarea programada se ponga roja.
            console.error(`[respaldo] FALLÓ el respaldo de ${entorno}/${taller}:`, error);
            fallados.push({ taller, error: error.message });
        }
    }

    const cuerpo = {
        // Primero el total, porque es lo que lee el workflow de GitHub Actions.
        documentos: hechos.reduce((a, r) => a + r.documentos, 0),
        entorno,
        talleres: hechos,
        fallados,
        duracionMs: Date.now() - inicio,
    };
    if (fallados.length) {
        // No se usa `res.fail` acá: ese contrato devuelve solo `{ error }`, y lo que hace
        // falta saber cuando falla un taller de cinco es cuáles SÍ quedaron respaldados.
        // La clave `error` va igual, así que quien solo lea eso funciona como siempre.
        return res.status(500).json({
            ...cuerpo,
            error: `No se pudo respaldar: ${fallados.map((f) => `${f.taller} (${f.error})`).join(', ')}`,
        });
    }
    res.ok(cuerpo, 201);
};

// GET /api/respaldos — qué respaldos hay
exports.listar = async (req, res) => {
    if (!autorizar(req, res)) return;
    const entorno = entornoPedido(req);
    try {
        const porTaller = [];
        for (const taller of talleresPedidos(req, entorno)) {
            const respaldos = await listarRespaldos(entorno, taller);
            porTaller.push({
                taller,
                total: respaldos.length,
                masReciente: respaldos[0]?.fecha || null,
                respaldos,
            });
        }
        res.ok({ entorno, talleres: porTaller });
    } catch (error) {
        res.fail(500, error.message);
    }
};
