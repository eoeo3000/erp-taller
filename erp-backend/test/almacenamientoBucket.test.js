// El camino del bucket, ejercitado de verdad.
//
// Las demás pruebas corren sin credenciales, así que solo tocan el disco — el código que
// habla con R2 quedaría sin probar y llegaría a producción a ciegas. Acá se levanta un
// servicio compatible con S3 mínimo (put, get, 404) y se apunta el almacenamiento a él con
// `R2_ENDPOINT`. No reemplaza una prueba contra el bucket real, pero sí verifica lo que se
// puede verificar sin cuenta: que el SDK esté bien configurado, que se guarde y se lea la
// misma clave, que el tipo de contenido viaje, y que un archivo ausente del bucket caiga al
// disco en vez de romperse (que es lo que pasa mientras se migra lo viejo).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const almacenamiento = require('../src/config/almacenamiento');

// Servicio S3 falso: guarda en memoria. No valida la firma — lo que se prueba acá es el
// contrato de la app con el almacén, no la criptografía del SDK de AWS.
function levantarS3Falso() {
    const objetos = new Map();
    const app = express();

    app.put('/:bucket/:clave', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
        objetos.set(req.params.clave, {
            cuerpo: req.body,
            contentType: req.headers['content-type'] || 'application/octet-stream',
        });
        res.set('ETag', '"falso"').status(200).end();
    });

    app.get('/:bucket/:clave', (req, res) => {
        const o = objetos.get(req.params.clave);
        // Mismo cuerpo de error que devuelve S3/R2: es lo que el SDK convierte en NoSuchKey.
        if (!o) {
            return res.status(404).type('application/xml')
                .send('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>');
        }
        res.set('Content-Type', o.contentType).set('Content-Length', String(o.cuerpo.length)).send(o.cuerpo);
    });

    return new Promise((resolve) => {
        const servidor = app.listen(0, () => resolve({
            servidor, objetos, url: `http://127.0.0.1:${servidor.address().port}`,
        }));
    });
}

// Apunta el almacenamiento al S3 falso y deja todo como estaba al terminar.
async function conBucket(t) {
    const falso = await levantarS3Falso();
    const previo = { ...process.env };
    process.env.R2_ENDPOINT = falso.url;
    process.env.R2_BUCKET = 'erp-taller-pruebas';
    process.env.R2_ACCESS_KEY_ID = 'clave-de-prueba';
    process.env.R2_SECRET_ACCESS_KEY = 'secreto-de-prueba';
    process.env.R2_ACCOUNT_ID = '';
    almacenamiento.releerEntorno();

    t.after(() => {
        falso.servidor.close();
        process.env = previo;
        almacenamiento.releerEntorno();
    });
    return falso;
}

async function leerTodo(stream) {
    const partes = [];
    for await (const parte of stream) partes.push(parte);
    return Buffer.concat(partes);
}

test('con credenciales, el archivo va al bucket y no al disco', async (t) => {
    const falso = await conBucket(t);
    assert.strictEqual(almacenamiento.hayBucket(), true);

    const contenido = Buffer.from('foto de evidencia de terreno');
    const { clave } = await almacenamiento.guardar(contenido, 'evidencia.jpg');

    assert.ok(falso.objetos.has(clave), 'quedó guardado en el bucket');
    assert.deepStrictEqual(falso.objetos.get(clave).cuerpo, contenido);
    assert.strictEqual(falso.objetos.get(clave).contentType, 'image/jpeg', 'el tipo viaja al bucket');

    // Y NO quedó en el disco: si quedara, el deploy se lo llevaría igual que antes.
    await assert.rejects(fs.stat(path.join(almacenamiento.CARPETA_LOCAL, clave)));
});

test('lo guardado en el bucket se lee de vuelta igual', async (t) => {
    await conBucket(t);
    const contenido = Buffer.from('contenido que tiene que volver intacto');
    const { clave } = await almacenamiento.guardar(contenido, 'f.png');

    const archivo = await almacenamiento.obtener(clave);
    assert.ok(archivo, 'se encontró en el bucket');
    assert.strictEqual(archivo.contentType, 'image/png');
    assert.deepStrictEqual(await leerTodo(archivo.cuerpo), contenido);
});

test('una foto vieja que sigue en disco se sirve aunque no esté en el bucket', async (t) => {
    // Es la situación mientras se migra: el bucket ya está configurado, pero lo subido
    // antes todavía vive en el disco. Si esto no funcionara, encender R2 dejaría todas las
    // fotos anteriores en 404 de golpe.
    await fs.mkdir(almacenamiento.CARPETA_LOCAL, { recursive: true });
    const clave = '1700000000000-123456789.jpg';
    await fs.writeFile(path.join(almacenamiento.CARPETA_LOCAL, clave), 'foto anterior al bucket');
    t.after(() => fs.rm(path.join(almacenamiento.CARPETA_LOCAL, clave), { force: true }));

    const falso = await conBucket(t);
    assert.ok(!falso.objetos.has(clave), 'no está en el bucket');

    const archivo = await almacenamiento.obtener(clave);
    assert.ok(archivo, 'igual se encontró, en el disco');
    assert.strictEqual((await leerTodo(archivo.cuerpo)).toString(), 'foto anterior al bucket');
});

test('un archivo que no está en ninguna parte devuelve null', async (t) => {
    await conBucket(t);
    assert.strictEqual(await almacenamiento.obtener('1700000000000-999999.jpg'), null);
});

test('sin credenciales se vuelve al disco, sin tocar el bucket', async (t) => {
    const falso = await conBucket(t);
    process.env.R2_BUCKET = '';
    almacenamiento.releerEntorno();
    assert.strictEqual(almacenamiento.hayBucket(), false);

    const { clave } = await almacenamiento.guardar(Buffer.from('al disco'), 'x.jpg');
    t.after(() => fs.rm(path.join(almacenamiento.CARPETA_LOCAL, clave), { force: true }));

    assert.ok(!falso.objetos.has(clave));
    assert.deepStrictEqual(await leerTodo((await almacenamiento.obtener(clave)).cuerpo), Buffer.from('al disco'));
});
