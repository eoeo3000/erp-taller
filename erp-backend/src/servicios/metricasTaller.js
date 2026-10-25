// Qué se puede saber de un taller sin entrar a su app.
//
// Es lo que alimenta el panel: si lo están usando, cuánto, y si su base responde. Vive
// aparte del controlador porque es la parte que tiene decisiones adentro —qué contar, qué
// hacer cuando una base no contesta— y esa parte se prueba.
//
// Desde la etapa 5 también se puede medir lo que ocupa cada taller y cuándo fue su último
// respaldo: los archivos viven en `talleres/<slug>/` y los respaldos en
// `respaldos/<entorno>/<slug>/`. Antes todo iba junto y el panel decía que no se podía
// medir, en vez de mostrar el total de todos para cada uno — que parecería un dato y sería
// mentira.
const getOT = require('../models/OT');
const getSolicitud = require('../models/Solicitud');
const getUsuario = require('../models/Usuario');
const almacenamiento = require('../config/almacenamiento');
const { listarRespaldos } = require('./respaldo');

// Cuánto se espera a la base de un taller antes de darla por caída. Que una base dormida o
// rota no cuelgue el panel entero es el punto: el panel existe justamente para enterarse de
// eso, así que no puede ser lo primero que se rompa cuando pasa.
const MS_ESPERA = 8000;

function conTope(promesa, ms = MS_ESPERA) {
    return Promise.race([
        promesa,
        new Promise((_, rechazar) => {
            const t = setTimeout(() => rechazar(new Error(`La base no respondió en ${ms} ms`)), ms);
            if (t.unref) t.unref();
        }),
    ]);
}

// La fecha más reciente, ignorando lo que no sea una fecha.
function masReciente(fechas) {
    const validas = fechas.map((f) => (f ? new Date(f) : null)).filter((f) => f && !Number.isNaN(f.getTime()));
    return validas.length ? new Date(Math.max(...validas.map((f) => f.getTime()))) : null;
}

// La última señal de vida del taller. Se miran los DOS campos porque son dos puertas
// distintas: `ultimoAccesoSpa` lo mueve quien entra al escritorio y `ultimoAcceso` quien usa
// la PWA en terreno. Un taller donde solo trabajan los supervisores desde el teléfono se
// vería muerto mirando únicamente el primero.
async function ultimaActividad(Usuario) {
    const [spa, movil] = await Promise.all([
        Usuario.findOne({ ultimoAccesoSpa: { $ne: null } }).sort({ ultimoAccesoSpa: -1 }).lean(),
        Usuario.findOne({ ultimoAcceso: { $ne: null } }).sort({ ultimoAcceso: -1 }).lean(),
    ]);
    return masReciente([spa?.ultimoAccesoSpa, movil?.ultimoAcceso]);
}

// Cuánto ocupa la base de este taller. Es el techo que de verdad aprieta: el clúster de
// Atlas tiene un tope para TODAS las bases juntas, así que lo que ocupa cada cliente le
// resta a los demás.
//
// **Se usa `dataSize` y no `storageSize`**, porque es el número que Atlas compara contra el
// tope del plan: su propia pantalla del clúster dice "Data size: 3.92 MB / 512 MB". Medir
// otra cosa daría un panel que no coincide con lo que muestra el proveedor, y la diferencia
// no es cosmética — WiredTiger comprime, así que `storageSize` suele ser bastante MENOR que
// `dataSize`. Usarlo haría que el panel diga "te queda espacio" justo cuando Atlas ya no te
// deja escribir, que es el peor error posible en un aviso de capacidad.
//
// (Primero se midió `storageSize + indexSize`, razonando que un plan cobra lo que ocupa en
// disco. Es cierto para un plan pago y falso para el tope del gratuito, que es contra el que
// hoy avisa esto.)
//
// `dbStats` es un comando de la base y no una consulta, así que no recorre nada: es barato
// aunque el taller tenga miles de OT.
async function tamanoDeBase(conexion) {
    const stats = await conexion.db.command({ dbStats: 1 });
    return stats.dataSize || 0;
}

// Las cuentas y los conteos de un taller. Devuelve `baseResponde: false` en vez de lanzar:
// un cliente con la base caída tiene que aparecer en la lista marcado en rojo, no hacer que
// la lista entera falle.
async function metricasDeTaller(db) {
    try {
        const OT = getOT(db);
        const Solicitud = getSolicitud(db);
        const Usuario = getUsuario(db);

        const [ots, solicitudes, cuentas, actividad, bytesBase] = await conTope(Promise.all([
            OT.countDocuments(),
            Solicitud.countDocuments(),
            Usuario.countDocuments({ passwordHash: { $exists: true, $ne: '' } }),
            ultimaActividad(Usuario),
            // Con su propio `catch`: el tamaño es un dato de gestión, no una señal de
            // salud. Si `dbStats` no estuviera disponible en algún plan, un taller
            // perfectamente sano quedaría marcado como caído por no poder medirlo — y el
            // panel diría que la base de un cliente no responde cuando sí responde.
            tamanoDeBase(db).catch(() => null),
        ]));

        return { baseResponde: true, ots, solicitudes, cuentas, ultimaActividad: actividad, bytesBase, error: null };
    } catch (error) {
        return { baseResponde: false, ots: null, solicitudes: null, cuentas: null, ultimaActividad: null, bytesBase: null, error: error.message };
    }
}

// Lo que ocupa un taller y cuándo fue su último respaldo. Va aparte de `metricasDeTaller`
// porque no toca su base: pregunta por el almacén, que puede estar bien cuando la base está
// caída y al revés. Mezclarlas haría que un bucket con problemas marcara la base como
// caída, que es decir algo falso sobre dónde está el problema.
//
// Devuelve `error` en vez de lanzar, por lo mismo que las métricas de la base: un taller
// que no se puede medir tiene que salir marcado en su fila, no tumbar la lista entera.
async function almacenamientoDeTaller(taller, entorno = 'produccion') {
    const resultado = { archivos: null, respaldo: null, error: null };
    try {
        resultado.archivos = await almacenamiento.medir(`${almacenamiento.CARPETA_TALLERES}/${taller}`);
    } catch (error) {
        resultado.error = error.message;
    }
    try {
        const respaldos = await listarRespaldos(entorno, taller);
        resultado.respaldo = { total: respaldos.length, ultimo: respaldos[0]?.fecha || null, clave: respaldos[0]?.clave || null };
    } catch (error) {
        resultado.error = resultado.error || error.message;
    }
    return resultado;
}

// Días desde la última señal de vida, o null si nunca hubo ninguna. El panel lo usa para
// pintar el aviso: un cliente que lleva semanas sin entrar es el que avisa que se va a ir
// antes de avisarlo.
function diasSinUsar(fecha, ahora = Date.now()) {
    if (!fecha) return null;
    const t = new Date(fecha).getTime();
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((ahora - t) / (24 * 60 * 60 * 1000)));
}

module.exports = { metricasDeTaller, almacenamientoDeTaller, tamanoDeBase, diasSinUsar, masReciente, MS_ESPERA };
