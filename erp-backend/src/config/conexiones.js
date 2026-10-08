// Las conexiones de Mongo: una base por taller, más la demo, que es una sola y compartida.
//
// Etapa 2 de docs/multi-taller.md. Antes acá había dos conexiones fijas —producción y demo—
// abiertas al arrancar desde `MONGO_URI` y `MONGO_URI_DEMO`, y `obtenerConexion` lanzaba
// "Taller desconocido" ante cualquier slug que no fuera `principal`. Ahora hay un REGISTRO
// de talleres, que vive en la **base de control**, y las conexiones de producción se abren
// bajo demanda y se reutilizan.
//
// --- Lo que no cambia, y es lo que permite desplegar esto sin tocar nada ---
//
// Sin `MONGO_URI_CONTROL` el registro se arma del entorno y tiene un solo taller
// (`principal` → `MONGO_URI`): exactamente el comportamiento anterior. La base de control se
// configura cuando haga falta un segundo cliente, no antes.
//
// --- Por qué `obtenerConexion` sigue siendo síncrona ---
//
// La llama `middlewares/entorno.js` en CADA request. Buscar el taller en la base de control
// cada vez agregaría un viaje a Mongo por request, y en este despliegue un solo `findOne` ya
// tarda 600-800ms por la latencia de la conexión (medido en producción, ver el comentario de
// `resolverUsuarioPorToken`). Por eso el registro se mantiene EN MEMORIA: se carga al
// arrancar, se refresca cada minuto, y el controlador lo refresca al instante cuando él
// mismo crea o cambia un taller. La ventana de desactualización —hasta un minuto para que
// otra instancia vea un taller recién creado— es aceptable y está acá dicha.
//
// --- Lo que a propósito NO se construye todavía ---
//
// Cerrar las conexiones que llevan rato sin uso. Con diez talleres y el pool acotado a
// POOL_MAXIMO, el techo son ~50 conexiones, muy por debajo del límite de cualquier clúster
// pagado. Cerrar una conexión en uso es una fuente de errores intermitentes difíciles de
// reproducir, y no vale la pena pagarla por un problema que todavía no existe. Cuando haya
// muchos más talleres, acá es donde va.
const mongoose = require('mongoose');
const { TALLER_PRINCIPAL } = require('./talleres');
const getTaller = require('../models/Taller');

// Tope de conexiones simultáneas por taller. Cada conexión abre un pool, y diez pools con el
// tamaño por omisión de Mongoose (100) se comerían el límite del clúster.
const POOL_MAXIMO = 5;
const MS_REFRESCO = 60 * 1000;

// La base de control, o null si no está configurada.
let conexionControl = null;
// La demo: una sola para todos los talleres (decisión §9.2 — es para mostrar el producto,
// no para que cada cliente tenga la suya).
let conexionDemo = null;
// slug -> { slug, nombre, estado, mongoUri }. En memoria, ver arriba.
const registro = new Map();
// 'slug' -> { uri, conn } de producción ya abierta. Se guarda la URI con la que se abrió,
// no solo la conexión: ver abrirProduccion.
const abiertas = new Map();
let temporizador = null;

function hayBaseDeControl() {
    return !!String(process.env.MONGO_URI_CONTROL || '').trim();
}

// El registro cuando no hay base de control: un solo taller, el de siempre, sacado del
// entorno. Es el estado anterior a esta etapa, escrito explícitamente.
function registroDesdeEntorno() {
    registro.clear();
    registro.set(TALLER_PRINCIPAL, {
        slug: TALLER_PRINCIPAL,
        nombre: 'Taller principal',
        estado: 'activo',
        mongoUri: process.env.MONGO_URI,
    });
}

// Vuelve a leer la base de control. Se llama al arrancar, cada minuto, y desde el
// controlador justo después de crear o cambiar un taller — para que el cambio se note en esa
// misma instancia sin esperar el minuto.
async function refrescarRegistro() {
    if (!conexionControl) return registro;
    const Taller = getTaller(conexionControl);
    const filas = await Taller.find().lean();
    registro.clear();
    for (const t of filas) {
        registro.set(t.slug, { slug: t.slug, nombre: t.nombre, estado: t.estado, mongoUri: t.mongoUri });
    }
    return registro;
}

// La primera vez que se enciende la base de control, el taller que ya existe tiene que
// quedar anotado ahí sin que nadie lo escriba a mano: si no, el despliegue siguiente
// respondería "Taller desconocido: principal" a todo el mundo. Es idempotente.
async function sembrarTallerPrincipal() {
    const Taller = getTaller(conexionControl);
    const yaEsta = await Taller.findOne({ slug: TALLER_PRINCIPAL });
    if (yaEsta) return yaEsta;

    const creado = await Taller.create({
        slug: TALLER_PRINCIPAL,
        nombre: 'Taller principal',
        mongoUri: process.env.MONGO_URI,
        estado: 'activo',
    });
    console.log(`🏭 Base de control: se anotó el taller "${TALLER_PRINCIPAL}" con la base que ya estaba en uso.`);
    return creado;
}

// Abre (o reutiliza) la conexión de producción de un taller. Mongoose devuelve la conexión
// de inmediato y encola las consultas hasta que termina de conectar, así que esto puede ser
// síncrono; lo que no puede es fallar en silencio, y por eso el listener de error.
function abrirProduccion(slug, uri) {
    const abierta = abiertas.get(slug);
    if (abierta && abierta.uri === uri) return abierta.conn;

    // La URI cambió: a este taller lo movieron de base (§9.1 — mover un cliente que creció a
    // su propio clúster es cambiar un campo). Seguir usando la conexión anterior significaría
    // escribir en la base vieja después de la mudanza, que es perder datos sin ningún error
    // a la vista. Se cierra la anterior: una request en vuelo contra la base vieja puede
    // fallar una vez, y eso es claramente preferible.
    if (abierta) {
        console.warn(`🔁 El taller "${slug}" cambió de base de datos: se cierra la conexión anterior.`);
        abierta.conn.close().catch(() => {});
    }

    const conn = mongoose.createConnection(uri, { maxPoolSize: POOL_MAXIMO });
    conn.on('error', (err) => console.error(`❌ Conexión del taller "${slug}":`, err.message));
    abiertas.set(slug, { uri, conn });
    return conn;
}

async function inicializarConexiones() {
    // Se llama una vez por proceso. El reseteo está para que una segunda llamada refleje el
    // entorno de AHORA y no el de la anterior — que es lo que pasa en las pruebas, y lo que
    // haría que un "ya no hay demo configurada" siguiera devolviendo la demo anterior. No se
    // tocan las conexiones de producción ya abiertas: reutilizarlas es lo correcto, y
    // `abrirProduccion` ya se encarga si a un taller le cambiaron la base.
    conexionControl = null;
    conexionDemo = null;
    if (temporizador) { clearInterval(temporizador); temporizador = null; }

    if (hayBaseDeControl()) {
        conexionControl = mongoose.createConnection(process.env.MONGO_URI_CONTROL, { maxPoolSize: POOL_MAXIMO });
        await conexionControl.asPromise();
        console.log(`✅ CONECTADO A LA BASE DE CONTROL (${conexionControl.name})`);

        // El registro ANTES de conectar: si el taller principal ya fue movido a otra base,
        // conectar primero con la URI del entorno abriría la base vieja y la reabriría al
        // primer request, con su aviso, en cada arranque. Quien manda es el registro.
        await sembrarTallerPrincipal();
        await refrescarRegistro();

        // Si la base de control apunta a la misma base que los datos de un taller, la
        // colección `Taller` quedaría conviviendo con las OT y las solicitudes —y se iría en
        // sus respaldos—. No es fatal, así que no se corta el arranque, pero se avisa.
        const conn = await conectarPrincipal();
        if (conexionControl.name === conn.name) {
            console.warn('⚠️  MONGO_URI_CONTROL apunta a la MISMA base que MONGO_URI:'
                + ' el registro de talleres va a quedar mezclado con los datos del taller.');
        }

        // Para que otra instancia note un taller creado en la primera. `unref` para que este
        // temporizador no sea razón para que el proceso siga vivo. A diferencia del respaldo
        // diario —que SÍ necesita correr aunque Render duerma el servicio, y por eso se
        // dispara desde afuera— acá dormirse no pierde nada: al despertar, el proceso es
        // nuevo y lee el registro completo.
        temporizador = setInterval(() => { refrescarRegistro().catch(() => {}); }, MS_REFRESCO);
        if (temporizador.unref) temporizador.unref();
    } else {
        // El aviso va ANTES de conectar: si la conexión se queda colgada, lo que se necesita
        // leer en el log es justamente en qué modo arrancó.
        console.log('ℹ️  Sin MONGO_URI_CONTROL: un solo taller, el de MONGO_URI. Ver docs/multi-taller.md.');
        registroDesdeEntorno();
        await conectarPrincipal();
    }

    if (process.env.MONGO_URI_DEMO) {
        conexionDemo = mongoose.createConnection(process.env.MONGO_URI_DEMO, { maxPoolSize: POOL_MAXIMO });
        await conexionDemo.asPromise();
        console.log('✅ CONECTADO A MONGODB (demo)');
    } else {
        console.warn('⚠️  MONGO_URI_DEMO no está definida — el modo demostración queda deshabilitado.');
    }
}

// El taller por defecto se conecta al arrancar y no bajo demanda: es el camino caliente, y
// esperar su conexión acá es lo que hace que un MONGO_URI malo se note al desplegar y no en
// la primera pantalla que alguien abra.
async function conectarPrincipal() {
    const ficha = registro.get(TALLER_PRINCIPAL) || { mongoUri: process.env.MONGO_URI };
    const conn = abrirProduccion(TALLER_PRINCIPAL, ficha.mongoUri);
    await conn.asPromise();
    console.log(`✅ CONECTADO A MONGODB (producción · ${conn.name})`);
    return conn;
}

function conexionDisponible(entorno, taller = TALLER_PRINCIPAL) {
    if (entorno === 'demo') return !!conexionDemo;
    const ficha = registro.get(taller);
    return !!ficha && ficha.estado === 'activo';
}

// `taller` es el cliente que arrienda el sistema; `entorno` es producción o demo. La demo es
// una sola para todos, así que el taller no la afecta.
function obtenerConexion(entorno, taller = TALLER_PRINCIPAL) {
    if (entorno === 'demo') {
        if (!conexionDemo) throw new Error('El entorno demo no está disponible: falta MONGO_URI_DEMO en .env');
        return conexionDemo;
    }

    const ficha = registro.get(taller);
    if (!ficha) throw new Error(`Taller desconocido: ${taller}`);
    // Suspendido es la palanca del día 0 de una baja, y también la de un impago. Que corte
    // acá —y no en cada controlador— es lo que hace que no se pueda olvidar en ninguna ruta.
    if (ficha.estado !== 'activo') throw new Error(`El taller "${taller}" está ${ficha.estado} y no puede operar`);
    return abrirProduccion(taller, ficha.mongoUri);
}

// Para el controlador del registro: la conexión donde vive la colección Taller.
function conexionDeControl() {
    return conexionControl;
}

module.exports = {
    inicializarConexiones,
    obtenerConexion,
    conexionDisponible,
    conexionDeControl,
    refrescarRegistro,
    hayBaseDeControl,
    POOL_MAXIMO,
};
