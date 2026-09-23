// Pruebas del almacenamiento de archivos (src/config/almacenamiento.js). Igual que
// password.test.js: `node --test`, sin framework ni dependencias nuevas.
//
// Se prueba el camino del disco de punta a punta (guardar y volver a leer de verdad) y la
// validación de claves. El camino del bucket R2 no se prueba acá: exige credenciales y red,
// así que se verifica a mano contra el bucket de prueba antes de desplegar.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');
const almacenamiento = require('../src/config/almacenamiento');

// Las pruebas corren sin credenciales de R2, así que `guardar` usa el disco. Si alguien
// corriera la suite con un .env que las tenga, escribiría en el bucket de verdad.
test('la suite corre sin credenciales de R2 (si no, estaría escribiendo en el bucket real)', () => {
    assert.strictEqual(almacenamiento.hayBucket(), false);
});

async function leerTodo(stream) {
    const partes = [];
    for await (const parte of stream) partes.push(parte);
    return Buffer.concat(partes);
}

test('lo que se guarda se puede volver a leer igual', async (t) => {
    const contenido = Buffer.from('contenido de una foto de prueba');
    const { clave, url } = await almacenamiento.guardar(contenido, 'evidencia.jpg');
    t.after(() => fs.rm(path.join(almacenamiento.CARPETA_LOCAL, clave), { force: true }));

    assert.strictEqual(url, `/uploads/${clave}`, 'devuelve ruta relativa, no URL absoluta');
    const archivo = await almacenamiento.obtener(clave);
    assert.ok(archivo, 'el archivo se encuentra');
    assert.strictEqual(archivo.contentType, 'image/jpeg');
    assert.strictEqual(archivo.largo, contenido.length);
    assert.deepStrictEqual(await leerTodo(archivo.cuerpo), contenido);
});

test('la URL devuelta es relativa: los clientes le anteponen el origen del backend', async (t) => {
    // erp-web/src/utils/fotos.js y erp-pwa-operativa/src/api.js hacen
    // `BACKEND_ORIGIN + data.url`. Si esto devolviera la URL del bucket, quedaría pegada
    // detrás del origen y toda PWA ya instalada guardaría una URL rota.
    const { clave, url } = await almacenamiento.guardar(Buffer.from('x'), 'f.png');
    t.after(() => fs.rm(path.join(almacenamiento.CARPETA_LOCAL, clave), { force: true }));
    assert.ok(url.startsWith('/uploads/'));
    assert.ok(!url.includes('://'));
});

test('dos archivos subidos seguidos no se pisan', async (t) => {
    const a = await almacenamiento.guardar(Buffer.from('primero'), 'foto.jpg');
    const b = await almacenamiento.guardar(Buffer.from('segundo'), 'foto.jpg');
    t.after(() => Promise.all([a, b].map((x) => fs.rm(path.join(almacenamiento.CARPETA_LOCAL, x.clave), { force: true }))));

    assert.notStrictEqual(a.clave, b.clave);
    assert.deepStrictEqual(await leerTodo((await almacenamiento.obtener(a.clave)).cuerpo), Buffer.from('primero'));
});

test('se conserva la extensión del archivo original', async (t) => {
    const { clave } = await almacenamiento.guardar(Buffer.from('x'), 'informe.PDF');
    t.after(() => fs.rm(path.join(almacenamiento.CARPETA_LOCAL, clave), { force: true }));
    assert.ok(clave.endsWith('.pdf'), `la clave fue ${clave}`);
    assert.strictEqual(almacenamiento.tipoPorNombre(clave), 'application/pdf');
});

test('un archivo que no existe devuelve null, no un error', async () => {
    assert.strictEqual(await almacenamiento.obtener('9999999999-1.jpg'), null);
});

test('una clave con salto de directorio se rechaza sin tocar el disco', async () => {
    // Las claves llegan desde la URL (/uploads/:clave) y terminan en una ruta de disco:
    // sin esta validación, `..%2F..%2Fetc%2Fpasswd` deja leer cualquier archivo del servidor.
    for (const clave of ['../server.js', '../../etc/passwd', 'sub/dir.jpg', '', '.', '..']) {
        assert.strictEqual(await almacenamiento.obtener(clave), null, `debió rechazar ${JSON.stringify(clave)}`);
    }
});

test('un tipo desconocido no se sirve como algo que el navegador vaya a ejecutar', () => {
    assert.strictEqual(almacenamiento.tipoPorNombre('cualquiera.xyz'), 'application/octet-stream');
    assert.strictEqual(almacenamiento.tipoPorNombre('script.html'), 'application/octet-stream');
    assert.strictEqual(almacenamiento.tipoPorNombre('sin-extension'), 'application/octet-stream');
});
