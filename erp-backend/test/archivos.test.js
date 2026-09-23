// Subir y servir archivos, por HTTP de verdad y contra los mismos routers que monta
// server.js — no una copia de su lógica. Sin framework de pruebas ni dependencias nuevas:
// `node --test`, express (que ya es dependencia) y el fetch que trae Node.
//
// Lo que se prueba es el contrato del que dependen las dos PWA y el SPA:
// subir devuelve una ruta relativa, y esa ruta sirve el archivo de vuelta.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const archivosRoutes = require('../src/routes/archivosRoutes');
const uploadRoutes = require('../src/routes/uploadRoutes');
const almacenamiento = require('../src/config/almacenamiento');

// Mismo montaje que server.js: los archivos se sirven fuera de /api y se suben dentro.
function levantar() {
    const app = express();
    app.use('/uploads', archivosRoutes);
    app.use('/api/uploads', uploadRoutes);
    return new Promise((resolve) => {
        const servidor = app.listen(0, () => resolve({
            servidor, base: `http://127.0.0.1:${servidor.address().port}`,
        }));
    });
}

// Un JPEG mínimo de verdad, para no subir texto disfrazado de foto.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=', 'base64');

async function subir(base, contenido, nombre = 'foto.jpg', tipo = 'image/jpeg') {
    const cuerpo = new FormData();
    cuerpo.append('foto', new Blob([contenido], { type: tipo }), nombre);
    const resp = await fetch(`${base}/api/uploads/foto`, { method: 'POST', body: cuerpo });
    return { resp, datos: await resp.json().catch(() => ({})) };
}

const limpiar = (clave) => fs.rm(path.join(almacenamiento.CARPETA_LOCAL, clave), { force: true });

test('una foto subida se puede volver a bajar por la URL que devolvió', async (t) => {
    const { servidor, base } = await levantar();
    t.after(() => servidor.close());

    const { resp, datos } = await subir(base, JPEG);
    assert.strictEqual(resp.status, 201);
    assert.match(datos.url, /^\/uploads\/[0-9]+-[0-9]+\.jpg$/, `url devuelta: ${datos.url}`);
    t.after(() => limpiar(datos.url.replace('/uploads/', '')));

    const bajada = await fetch(`${base}${datos.url}`);
    assert.strictEqual(bajada.status, 200);
    assert.strictEqual(bajada.headers.get('content-type'), 'image/jpeg');
    assert.strictEqual(bajada.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(bajada.headers.get('cache-control').includes('immutable'));
    assert.deepStrictEqual(Buffer.from(await bajada.arrayBuffer()), JPEG);
});

test('la URL devuelta es la que los clientes saben concatenar', async (t) => {
    // erp-web/src/utils/fotos.js y erp-pwa-operativa/src/api.js hacen
    // `BACKEND_ORIGIN + data.url`. Si acá se devolviera la URL del bucket, toda PWA ya
    // instalada guardaría en la base una URL con dos orígenes pegados.
    const { servidor, base } = await levantar();
    t.after(() => servidor.close());

    const { datos } = await subir(base, JPEG);
    t.after(() => limpiar(datos.url.replace('/uploads/', '')));

    assert.ok(datos.url.startsWith('/uploads/'), `url: ${datos.url}`);
    assert.ok(!datos.url.includes('://'), 'no debe ser absoluta');
    const comoLoArmaElCliente = `${base}${datos.url}`;
    assert.strictEqual((await fetch(comoLoArmaElCliente)).status, 200);
});

test('una foto que no existe da 404, no 500 ni una página en blanco', async (t) => {
    const { servidor, base } = await levantar();
    t.after(() => servidor.close());

    const resp = await fetch(`${base}/uploads/1111111111-2222.jpg`);
    assert.strictEqual(resp.status, 404);
    assert.strictEqual((await resp.json()).error, 'Archivo no encontrado');
});

test('no se puede salir de la carpeta de archivos por la URL', async (t) => {
    const { servidor, base } = await levantar();
    t.after(() => servidor.close());

    // Con el separador codificado, Express entrega el valor ya decodificado al parámetro:
    // sin la validación de clave, esto leería archivos del servidor.
    for (const intento of ['..%2F..%2Fserver.js', '..%2Fpackage.json', '%2E%2E%2Fserver.js', '..']) {
        const resp = await fetch(`${base}/uploads/${intento}`);
        assert.ok(resp.status === 404 || resp.status === 400, `${intento} respondió ${resp.status}`);
        const texto = await resp.text();
        assert.ok(!texto.includes('require('), `${intento} devolvió contenido de un archivo del servidor`);
    }
});

test('una foto demasiado pesada se rechaza con un mensaje entendible', async (t) => {
    // Sin manejar el error de multer esto sale como un 500 sin explicación. Quien está en
    // terreno necesita saber que el problema es el peso, no que "falló el sistema".
    const { servidor, base } = await levantar();
    t.after(() => servidor.close());

    const enorme = Buffer.alloc(13 * 1024 * 1024, 1);
    const { resp, datos } = await subir(base, enorme, 'gigante.jpg');
    assert.strictEqual(resp.status, 413);
    assert.match(datos.error, /demasiado pesada/);
});

test('subir sin archivo avisa en vez de guardar algo vacío', async (t) => {
    const { servidor, base } = await levantar();
    t.after(() => servidor.close());

    const resp = await fetch(`${base}/api/uploads/foto`, { method: 'POST', body: new FormData() });
    assert.strictEqual(resp.status, 400);
    assert.match((await resp.json()).error, /Falta el archivo/);
});
