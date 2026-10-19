// Qué se puede saber de un taller sin entrar a su app.
//
// Es lo que alimenta el panel: si lo están usando, cuánto, y si su base responde. Vive
// aparte del controlador porque es la parte que tiene decisiones adentro —qué contar, qué
// hacer cuando una base no contesta— y esa parte se prueba.
//
// --- Lo que NO se puede medir todavía, y por qué se dice en vez de inventarse ---
//
// **Fotos y espacio en disco**: los archivos del bucket R2 todavía no están separados por
// taller (van a `<clave>` a secas, no a `talleres/<id>/<clave>`; es la etapa 5). Contarlos
// hoy daría el total de todos los clientes juntos para cada uno, que es peor que no dar
// ningún número: parece un dato y es mentira.
//
// **Respaldos**: viven en `respaldos/<entorno>/`, no por taller — misma etapa. El panel
// muestra el último del entorno y dice que es compartido.
const getOT = require('../models/OT');
const getSolicitud = require('../models/Solicitud');
const getUsuario = require('../models/Usuario');

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

// Las cuentas y los conteos de un taller. Devuelve `baseResponde: false` en vez de lanzar:
// un cliente con la base caída tiene que aparecer en la lista marcado en rojo, no hacer que
// la lista entera falle.
async function metricasDeTaller(db) {
    try {
        const OT = getOT(db);
        const Solicitud = getSolicitud(db);
        const Usuario = getUsuario(db);

        const [ots, solicitudes, cuentas, actividad] = await conTope(Promise.all([
            OT.countDocuments(),
            Solicitud.countDocuments(),
            Usuario.countDocuments({ passwordHash: { $exists: true, $ne: '' } }),
            ultimaActividad(Usuario),
        ]));

        return { baseResponde: true, ots, solicitudes, cuentas, ultimaActividad: actividad, error: null };
    } catch (error) {
        return { baseResponde: false, ots: null, solicitudes: null, cuentas: null, ultimaActividad: null, error: error.message };
    }
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

module.exports = { metricasDeTaller, diasSinUsar, masReciente, MS_ESPERA };
