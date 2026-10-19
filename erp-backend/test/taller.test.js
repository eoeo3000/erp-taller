// Etapa 1 de multi-taller: el taller sale de la sesión, no de lo que mande el cliente.
// Ver docs/multi-taller.md §4 y §5.
//
// Hoy existe un solo taller, así que nada de esto cambia el comportamiento. Se prueba igual
// —y desde ahora— porque es el mecanismo que va a decidir de quién son los datos cuando
// haya dos, y conviene que para entonces lleve meses ejercitándose.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { ObjectId } = require('bson');
const { generarToken, hashToken, conPrefijo, separarPrefijo } = require('../src/utils/tokens');
const talleres = require('../src/config/talleres');

// --- El prefijo, solo ---

test('un token con prefijo se separa en taller y token', () => {
    const token = generarToken();
    const completo = conPrefijo('principal', token);
    assert.strictEqual(completo, `principal.${token}`);
    assert.deepStrictEqual(separarPrefijo(completo), { taller: 'principal', token });
});

test('un token SIN prefijo se entiende como del taller por defecto', () => {
    // Las sesiones abiertas antes de desplegar esto no lo traen. Si acá se rechazaran,
    // desplegar echaría a todos los que estuvieran trabajando.
    const token = generarToken();
    assert.deepStrictEqual(separarPrefijo(token), { taller: null, token });
});

test('el token generado nunca contiene un punto, así que la división no es ambigua', () => {
    for (let i = 0; i < 200; i++) assert.ok(!generarToken().includes('.'));
});

test('se corta en el PRIMER punto: el resto es parte del token', () => {
    assert.deepStrictEqual(separarPrefijo('taller.a.b'), { taller: 'taller', token: 'a.b' });
});

test('el prefijo no cambia el secreto: lo que se guarda es el hash del token solo', () => {
    // Si se hasheara el token con prefijo, cambiar de taller invalidaría las sesiones y el
    // prefijo pasaría a ser parte de la credencial, que es justo lo que no queremos.
    const token = generarToken();
    assert.strictEqual(hashToken(separarPrefijo(conPrefijo('principal', token)).token), hashToken(token));
});

// --- El registro de talleres ---

test('un slug no puede contener un punto', () => {
    // Si pudiera, el prefijo del token dejaría de ser divisible sin ambigüedad.
    assert.ok(talleres.esSlugValido('taller-uno'));
    assert.ok(!talleres.esSlugValido('taller.uno'));
    assert.ok(!talleres.esSlugValido('Taller'));
    assert.ok(!talleres.esSlugValido('a'));
});

// --- La resolución por request, con HTTP real ---

// Se sustituye la conexión para no necesitar Mongo. Va antes de requerir el middleware,
// que desestructura `obtenerConexion` al cargarse.
const REGISTRADOS = ['principal', 'taller-lopez'];
const rutaConexiones = require.resolve('../src/config/conexiones');
const aperturas = [];
require.cache[rutaConexiones] = {
    id: rutaConexiones, filename: rutaConexiones, loaded: true,
    exports: {
        // El registro falso conoce DOS talleres: con uno solo, esta prueba no distinguiría
        // "resuelve el taller correcto" de "siempre cae en el por defecto" — que es
        // exactamente el bug que estuvo dos etapas sin verse.
        resolverTaller: (slug) => (REGISTRADOS.includes(String(slug || '')) ? String(slug) : null),
        obtenerConexion: (entorno, taller) => {
            if (!REGISTRADOS.includes(taller)) throw new Error(`Taller desconocido: ${taller}`);
            aperturas.push({ entorno, taller });
            return { marca: `${taller}/${entorno}` };
        },
        conexionDisponible: () => true,
        inicializarConexiones: async () => {},
    },
};
const resolverEntorno = require('../src/middlewares/entorno');

function levantar() {
    const app = express();
    app.use(resolverEntorno);
    app.get('/donde', (req, res) => res.json({ taller: req.taller, entorno: req.entorno, db: req.db.marca }));
    return new Promise((resolve) => {
        const servidor = app.listen(0, () => resolve({ servidor, url: `http://127.0.0.1:${servidor.address().port}` }));
    });
}

const preguntar = (url, headers = {}) => fetch(`${url}/donde`, { headers }).then((r) => r.json());

test('sin sesión se usa el taller por defecto', async (t) => {
    const { servidor, url } = await levantar();
    t.after(() => servidor.close());
    // Es el caso de las PWAs y del portal del cliente, que no mandan token de escritorio.
    assert.deepStrictEqual(await preguntar(url), { taller: 'principal', entorno: 'produccion', db: 'principal/produccion' });
});

test('el taller sale del prefijo del token, no del header', async (t) => {
    const { servidor, url } = await levantar();
    t.after(() => servidor.close());

    const r = await preguntar(url, { Authorization: `Bearer ${conPrefijo('principal', generarToken())}` });
    assert.strictEqual(r.taller, 'principal');
});

test('el prefijo de un taller REGISTRADO abre SU base, no la del principal', async (t) => {
    // La prueba que faltaba. `resolverTaller` conocía solo `principal`, así que el token de
    // alguien de otro taller caía en la base del principal: su sesión no estaba ahí y
    // quedaba afuera sin un solo error a la vista. Dos etapas sin que nada lo notara, porque
    // todas las pruebas anteriores tenían un único taller y "cae en el por defecto" se veía
    // idéntico a "resuelve bien".
    const { servidor, url } = await levantar();
    t.after(() => servidor.close());

    const r = await preguntar(url, { Authorization: `Bearer ${conPrefijo('taller-lopez', generarToken())}` });
    assert.strictEqual(r.taller, 'taller-lopez');
    assert.strictEqual(r.db, 'taller-lopez/produccion', 'tiene que abrir SU base');
});

test('un prefijo inventado NO abre la base de otro taller', async (t) => {
    const { servidor, url } = await levantar();
    t.after(() => servidor.close());

    // El corazón del asunto. Alguien escribe el identificador de otro cliente en su token.
    // No se le abre esa base: se cae al taller por defecto, donde su token no va a validar.
    // Y nunca se llama a obtenerConexion con el taller inventado.
    const antes = aperturas.length;
    const r = await preguntar(url, { Authorization: `Bearer ${conPrefijo('competidor', generarToken())}` });

    assert.strictEqual(r.taller, 'principal', 'no debe resolver al taller inventado');
    assert.ok(!aperturas.slice(antes).some((a) => a.taller === 'competidor'), 'no se pidió la conexión del taller inventado');
});

test('el header X-Entorno sigue eligiendo producción o demo, que es su uso legítimo', async (t) => {
    const { servidor, url } = await levantar();
    t.after(() => servidor.close());

    const demo = await preguntar(url, { 'X-Entorno': 'demo' });
    assert.strictEqual(demo.entorno, 'demo');
    assert.strictEqual(demo.taller, 'principal', 'el header elige el entorno, nunca el taller');
    assert.strictEqual(demo.db, 'principal/demo');
});

test('el header no puede elegir el taller ni aunque lo intente', async (t) => {
    const { servidor, url } = await levantar();
    t.after(() => servidor.close());

    for (const intento of [{ 'X-Entorno': 'competidor' }, { 'X-Taller': 'competidor' }, { 'X-Entorno': 'principal' }]) {
        const r = await preguntar(url, intento);
        assert.strictEqual(r.taller, 'principal', `${JSON.stringify(intento)} cambió el taller`);
    }
});

test('un token sin prefijo (sesión anterior al cambio) sigue resolviendo', async (t) => {
    const { servidor, url } = await levantar();
    t.after(() => servidor.close());

    const r = await preguntar(url, { Authorization: `Bearer ${generarToken()}` });
    assert.strictEqual(r.taller, 'principal');
    assert.strictEqual(r.db, 'principal/produccion');
});

test('una cabecera Authorization rota no tumba la request', async (t) => {
    const { servidor, url } = await levantar();
    t.after(() => servidor.close());

    for (const cabecera of ['Bearer', 'Bearer ', 'Basic abc', '...', 'Bearer .', 'Bearer ..']) {
        const r = await preguntar(url, { Authorization: cabecera });
        assert.strictEqual(r.taller, 'principal', `"${cabecera}" rompió la resolución`);
    }
});
