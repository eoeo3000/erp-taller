// El endpoint de respaldos, por HTTP real contra el router de verdad.
//
// Lo que importa acá es el control de acceso: esta ruta la llama un programador externo
// (.github/workflows/respaldo.yml), no una persona con sesión, así que su única protección
// es RESPALDO_TOKEN. Si se abriera, cualquiera podría disparar respaldos y leer el listado
// de lo que hay en la base.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { ObjectId } = require('bson');

const CLAVE = 'clave-de-respaldo-para-pruebas';

// obtenerConexion() viene de config/conexiones y necesitaría Mongo. Se sustituye el módulo
// en la caché de require por una base falsa.
//
// El orden importa y por eso esto va ANTES de requerir el router: el controlador
// desestructura `obtenerConexion` al cargarse, así que si se carga primero se queda con la
// función real y la sustitución no sirve de nada. `node --test` corre cada archivo en su
// propio proceso, así que esto no contamina a las otras pruebas.
const rutaConexiones = require.resolve('../src/config/conexiones');
function base() {
    const datos = new Map([['ots', [{ _id: new ObjectId(), numeroOT: 'OT-2026-0001' }]]]);
    return {
        databaseName: 'taller-pruebas',
        listCollections: () => ({ toArray: async () => [...datos.keys()].map((name) => ({ name, type: 'collection' })) }),
        collection: (n) => ({
            find: () => ({ toArray: async () => [...(datos.get(n) || [])] }),
            deleteMany: async () => datos.set(n, []),
            insertMany: async (d) => datos.set(n, d),
            countDocuments: async () => (datos.get(n) || []).length,
        }),
    };
}
require.cache[rutaConexiones] = {
    id: rutaConexiones, filename: rutaConexiones, loaded: true,
    exports: { obtenerConexion: () => ({ db: base() }), conexionDisponible: () => true, inicializarConexiones: async () => {} },
};

// Recién ahora, con la conexión ya sustituida.
const contratoRespuesta = require('../src/middlewares/respuestas');
const respaldoRoutes = require('../src/routes/respaldoRoutes');
const almacenamiento = require('../src/config/almacenamiento');

function levantar() {
    const app = express();
    app.use(express.json());
    app.use(contratoRespuesta);
    app.use('/api/respaldos', respaldoRoutes);
    return new Promise((resolve) => {
        const servidor = app.listen(0, () => resolve({ servidor, base: `http://127.0.0.1:${servidor.address().port}` }));
    });
}

const limpiar = () => fs.rm(path.join(almacenamiento.CARPETA_LOCAL, 'respaldos'), { recursive: true, force: true });

test('sin RESPALDO_TOKEN configurado, la ruta está cerrada', async (t) => {
    const { servidor, base: url } = await levantar();
    const previo = process.env.RESPALDO_TOKEN;
    delete process.env.RESPALDO_TOKEN;
    t.after(() => { servidor.close(); if (previo) process.env.RESPALDO_TOKEN = previo; });

    // Cerrado y no abierto: al revés que API_KEY y AUTH_REQUERIDA, esta ruta nace hoy, así
    // que dejarla pasar por omisión sería regalar acceso, no mantener el estado anterior.
    const resp = await fetch(`${url}/api/respaldos`, { method: 'POST' });
    assert.strictEqual(resp.status, 503);
    assert.match((await resp.json()).error, /no están configurados/);
});

test('con la clave equivocada responde 401 y no respalda nada', async (t) => {
    const { servidor, base: url } = await levantar();
    process.env.RESPALDO_TOKEN = CLAVE;
    t.after(() => { servidor.close(); delete process.env.RESPALDO_TOKEN; return limpiar(); });

    for (const intento of ['', 'otra-cosa', CLAVE.slice(0, -1), `${CLAVE} `.repeat(2)]) {
        const resp = await fetch(`${url}/api/respaldos`, {
            method: 'POST', headers: intento ? { 'X-Respaldo-Token': intento } : {},
        });
        assert.strictEqual(resp.status, 401, `"${intento}" respondió ${resp.status}`);
    }
    assert.strictEqual((await almacenamiento.listar('respaldos/produccion')).length, 0);
});

test('con la clave correcta crea el respaldo e informa qué guardó', async (t) => {
    const { servidor, base: url } = await levantar();
    process.env.RESPALDO_TOKEN = CLAVE;
    t.after(() => { servidor.close(); delete process.env.RESPALDO_TOKEN; return limpiar(); });

    const resp = await fetch(`${url}/api/respaldos`, {
        method: 'POST', headers: { 'X-Respaldo-Token': CLAVE },
    });
    assert.strictEqual(resp.status, 201);

    const datos = await resp.json();
    assert.strictEqual(datos.documentos, 1);
    assert.deepStrictEqual(datos.colecciones, { ots: 1 });
    assert.match(datos.clave, /^respaldos\/produccion\//);
    assert.ok(datos.tamano > 0);

    // La respuesta la lee el workflow de GitHub Actions y queda en su log: tiene que traer
    // el conteo, nunca los datos del taller.
    const texto = JSON.stringify(datos);
    assert.ok(!texto.includes('OT-2026-0001'), 'la respuesta no debe filtrar contenido de la base');
});

test('el listado también exige la clave', async (t) => {
    const { servidor, base: url } = await levantar();
    process.env.RESPALDO_TOKEN = CLAVE;
    t.after(() => { servidor.close(); delete process.env.RESPALDO_TOKEN; return limpiar(); });

    assert.strictEqual((await fetch(`${url}/api/respaldos`)).status, 401);

    await fetch(`${url}/api/respaldos`, { method: 'POST', headers: { 'X-Respaldo-Token': CLAVE } });
    const resp = await fetch(`${url}/api/respaldos`, { headers: { 'X-Respaldo-Token': CLAVE } });
    assert.strictEqual(resp.status, 200);

    const datos = await resp.json();
    assert.strictEqual(datos.total, 1);
    assert.ok(datos.masReciente, 'informa cuándo fue el último — es lo que se mira para saber si el respaldo dejó de correr');
});
