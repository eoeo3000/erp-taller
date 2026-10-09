// A qué base apunta cada request: el registro de conexiones (etapa 2).
//
// Es el punto donde se decide, para un taller y un entorno, qué base de datos se abre. Si
// esto se equivoca, nadie recibe un error: alguien ve los datos de otro cliente. De ahí que
// lo que más se pruebe acá sean las NEGATIVAS — taller desconocido, taller suspendido— que
// son las que cortan antes de devolver nada.
const test = require('node:test');
const assert = require('node:assert');

// mongoose se sustituye por un doble antes de cargar el módulo: estas pruebas no necesitan
// Mongo, y lo que importa es a qué URI se decidió conectar, no que la conexión se logre.
const mongoose = require('mongoose');
const abiertasConUri = [];
const cerradas = [];
mongoose.createConnection = (uri) => {
    abiertasConUri.push(uri);
    const falsa = {
        uri,
        name: String(uri).split('/').pop(),
        on: () => falsa,
        asPromise: async () => falsa,
        // `close` está porque el módulo cierra la conexión anterior cuando a un taller le
        // cambian la base; sin esto la prueba falla por el doble, no por el código.
        close: async () => { cerradas.push(uri); },
        models: {},
        model: () => ({}),
    };
    return falsa;
};

const conexiones = require('../src/config/conexiones');

test.beforeEach(() => {
    abiertasConUri.length = 0;
    cerradas.length = 0;
    process.env.MONGO_URI = 'mongodb://servidor/taller-principal';
    delete process.env.MONGO_URI_CONTROL;
    delete process.env.MONGO_URI_DEMO;
});

test('sin base de control se comporta igual que antes de esta etapa', async () => {
    // La condición para poder desplegar esto sin tocar una sola variable: un taller, el de
    // MONGO_URI, y todo lo demás desconocido.
    await conexiones.inicializarConexiones();
    assert.strictEqual(conexiones.hayBaseDeControl(), false);

    const conn = conexiones.obtenerConexion('produccion', 'principal');
    assert.strictEqual(conn.uri, 'mongodb://servidor/taller-principal');
    assert.strictEqual(conexiones.conexionDisponible('produccion'), true);
});

test('un taller que no está en el registro NO abre ninguna conexión', async () => {
    // Que lance, y no que caiga en el taller por defecto: caer por defecto sería entregarle
    // a quien inventó el slug los datos del taller principal.
    await conexiones.inicializarConexiones();
    const antes = abiertasConUri.length;

    assert.throws(() => conexiones.obtenerConexion('produccion', 'taller-inventado'), /Taller desconocido/);
    assert.strictEqual(abiertasConUri.length, antes, 'no debe intentar abrir nada');
    assert.strictEqual(conexiones.conexionDisponible('produccion', 'taller-inventado'), false);
});

test('la conexión de un taller se reutiliza, no se abre una por request', async () => {
    // Cada conexión abre su propio pool. Abrir una por request se come el límite del clúster.
    await conexiones.inicializarConexiones();
    const antes = abiertasConUri.length;
    const a = conexiones.obtenerConexion('produccion', 'principal');
    const b = conexiones.obtenerConexion('produccion', 'principal');
    assert.strictEqual(a, b);
    assert.strictEqual(abiertasConUri.length, antes, 'no debería abrir una nueva');
});

test('el pool va acotado: diez talleres con el tamaño por omisión se comen el clúster', () => {
    assert.ok(conexiones.POOL_MAXIMO > 0 && conexiones.POOL_MAXIMO <= 10,
        'el tope por taller tiene que ser chico y explícito');
});

test('la demo es UNA sola, compartida por todos los talleres', async () => {
    // Decisión §9.2: la demo es para mostrar el producto, no para que cada cliente tenga la
    // suya. El taller no debe cambiarla.
    process.env.MONGO_URI_DEMO = 'mongodb://servidor/erp_taller_demo';
    await conexiones.inicializarConexiones();

    const unaDemo = conexiones.obtenerConexion('demo', 'principal');
    const otraDemo = conexiones.obtenerConexion('demo', 'cualquier-otro');
    assert.strictEqual(unaDemo, otraDemo);
    assert.strictEqual(unaDemo.uri, 'mongodb://servidor/erp_taller_demo');
});

test('sin MONGO_URI_DEMO, pedir la demo falla claro en vez de caer en producción', async () => {
    await conexiones.inicializarConexiones();
    assert.throws(() => conexiones.obtenerConexion('demo'), /demo no está disponible/);
    assert.strictEqual(conexiones.conexionDisponible('demo'), false);
});

test('un taller SUSPENDIDO no puede operar, y tampoco uno dado de baja', async () => {
    // Es la palanca del día 0 de una baja y la de un impago. Que corte en el registro de
    // conexiones —y no en cada controlador— es lo que hace que no se pueda olvidar en
    // ninguna ruta nueva.
    await conexiones.inicializarConexiones();
    const registro = await conexiones.refrescarRegistro();

    for (const estado of ['suspendido', 'baja']) {
        registro.set('principal', { slug: 'principal', nombre: 'P', estado, mongoUri: process.env.MONGO_URI });
        assert.throws(() => conexiones.obtenerConexion('produccion', 'principal'), new RegExp(estado));
        assert.strictEqual(conexiones.conexionDisponible('produccion', 'principal'), false);
    }

    // Y vuelve a funcionar al reactivarlo: suspender se deshace.
    registro.set('principal', { slug: 'principal', nombre: 'P', estado: 'activo', mongoUri: process.env.MONGO_URI });
    assert.ok(conexiones.obtenerConexion('produccion', 'principal'));
});

test('si a un taller le cambian la base, deja de usarse la anterior', async () => {
    // §9.1: mover un cliente que creció a su propio clúster es cambiar un campo. Si la
    // conexión anterior siguiera en uso, el sistema escribiría en la base vieja después de
    // la mudanza — datos perdidos, sin un solo error a la vista.
    await conexiones.inicializarConexiones();
    const registro = await conexiones.refrescarRegistro();

    const antes = conexiones.obtenerConexion('produccion', 'principal');
    registro.set('principal', { slug: 'principal', nombre: 'P', estado: 'activo', mongoUri: 'mongodb://otro-cluster/taller-principal' });

    const despues = conexiones.obtenerConexion('produccion', 'principal');
    assert.notStrictEqual(despues, antes, 'tiene que abrir la base nueva');
    assert.strictEqual(despues.uri, 'mongodb://otro-cluster/taller-principal');
    assert.deepStrictEqual(cerradas, ['mongodb://servidor/taller-principal'],
        'la conexión a la base vieja tiene que cerrarse, no quedar colgando con su pool');
});

test('resolverTaller: la única respuesta a "¿existe este taller?"', async () => {
    // Vivía duplicada en config/talleres.js, donde quedó congelada conociendo solo
    // `principal`. Mientras el registro aprendía a cargar talleres de la base de control,
    // esa copia seguía diciendo que no a todos — así que el token de cualquier otro taller
    // caía en la base del principal. Una definición, en el módulo que tiene el registro.
    await conexiones.inicializarConexiones();
    const registro = await conexiones.refrescarRegistro();
    registro.set('taller-lopez', { slug: 'taller-lopez', nombre: 'L', estado: 'activo', mongoUri: 'mongodb://servidor/lopez' });

    assert.strictEqual(conexiones.resolverTaller('principal'), 'principal');
    assert.strictEqual(conexiones.resolverTaller('taller-lopez'), 'taller-lopez');
    assert.strictEqual(conexiones.resolverTaller('  TALLER-LOPEZ  '), 'taller-lopez', 'espacios y mayúsculas no deberían importar');

    for (const desconocido of ['competidor', '', null, undefined, 'taller.lopez']) {
        assert.strictEqual(conexiones.resolverTaller(desconocido), null, `resolvió ${JSON.stringify(desconocido)}`);
    }
});

test('un taller suspendido NO se resuelve', async () => {
    // Resolverlo para que obtenerConexion lance dos líneas después cambia un 401 claro por
    // un 503 confuso. "Suspendido" significa que no opera, y eso empieza acá.
    await conexiones.inicializarConexiones();
    const registro = await conexiones.refrescarRegistro();
    registro.set('taller-lopez', { slug: 'taller-lopez', nombre: 'L', estado: 'suspendido', mongoUri: 'mongodb://servidor/lopez' });
    assert.strictEqual(conexiones.resolverTaller('taller-lopez'), null);

    registro.set('taller-lopez', { slug: 'taller-lopez', nombre: 'L', estado: 'activo', mongoUri: 'mongodb://servidor/lopez' });
    assert.strictEqual(conexiones.resolverTaller('taller-lopez'), 'taller-lopez', 'y vuelve al reactivarlo');
});
