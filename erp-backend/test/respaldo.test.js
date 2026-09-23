// Pruebas del respaldo de la base (src/servicios/respaldo.js).
//
// Sin Mongo: la red de este entorno bloquea la descarga de su binario, así que no se prueba
// contra una base real. Lo que sí se prueba es donde un respaldo falla EN SILENCIO —la
// serialización— usando una base falsa con la misma forma que expone el driver.
//
// Ese es el riesgo de verdad: un respaldo que se crea sin error, se ve bien en el listado, y
// el día que hay que restaurarlo mete ObjectId convertidos en `{}` y fechas convertidas en
// texto. Las referencias entre OT y Solicitud quedarían rotas y nadie se enteraría hasta
// mucho después.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ObjectId, Decimal128 } = require('bson');
const respaldo = require('../src/servicios/respaldo');
const almacenamiento = require('../src/config/almacenamiento');

// Base falsa con la superficie del driver que usa el servicio: listCollections, find,
// deleteMany, insertMany, countDocuments.
function baseFalsa(colecciones, databaseName = 'taller-pruebas') {
    const datos = new Map(Object.entries(colecciones).map(([n, d]) => [n, [...d]]));
    return {
        databaseName,
        listCollections: () => ({
            toArray: async () => [...datos.keys()].map((name) => ({ name, type: 'collection' })),
        }),
        collection: (nombre) => {
            if (!datos.has(nombre)) datos.set(nombre, []);
            return {
                find: () => ({ toArray: async () => [...datos.get(nombre)] }),
                deleteMany: async () => { datos.set(nombre, []); },
                insertMany: async (docs) => { datos.set(nombre, [...datos.get(nombre), ...docs]); },
                countDocuments: async () => datos.get(nombre).length,
            };
        },
        _datos: datos,
    };
}

const conexionFalsa = (base) => ({ db: base });

async function limpiarRespaldos(entorno = 'produccion') {
    await fs.rm(path.join(almacenamiento.CARPETA_LOCAL, 'respaldos', entorno), { recursive: true, force: true });
}

test('un ObjectId sigue siendo un ObjectId después de respaldar y restaurar', async (t) => {
    t.after(() => limpiarRespaldos());
    // Es LA prueba de este archivo. Con JSON.stringify, un ObjectId se guarda como `{}` y al
    // restaurar la OT pierde el vínculo con su Solicitud, que es como se relacionan
    // (OT.solicitudId reusa el _id de la Solicitud, ver CLAUDE.md).
    const idSolicitud = new ObjectId();
    const base = baseFalsa({
        ots: [{ _id: new ObjectId(), solicitudId: idSolicitud, numeroOT: 'OT-2026-0001' }],
        solicitudes: [{ _id: idSolicitud, estado: 'Pendiente' }],
    });

    const creado = await respaldo.crearRespaldo(conexionFalsa(base), 'produccion');
    const leido = await respaldo.leerRespaldo(creado.clave);

    const ot = leido.colecciones.ots[0];
    assert.ok(ot.solicitudId instanceof ObjectId, `solicitudId quedó como ${ot.solicitudId?.constructor?.name}`);
    assert.strictEqual(String(ot.solicitudId), String(idSolicitud), 'el vínculo OT → Solicitud se conserva');
    assert.ok(leido.colecciones.solicitudes[0]._id instanceof ObjectId);
});

test('una fecha sigue siendo una fecha, no un string', async (t) => {
    t.after(() => limpiarRespaldos());
    const fecha = new Date('2026-03-15T08:30:00.000Z');
    const base = baseFalsa({ ots: [{ _id: new ObjectId(), fechaEjecucion: fecha }] });

    const creado = await respaldo.crearRespaldo(conexionFalsa(base), 'produccion');
    const leido = await respaldo.leerRespaldo(creado.clave);

    const recuperada = leido.colecciones.ots[0].fechaEjecucion;
    assert.ok(recuperada instanceof Date, `quedó como ${typeof recuperada}`);
    assert.strictEqual(recuperada.getTime(), fecha.getTime());
});

test('los tipos numéricos de Mongo no se degradan', async (t) => {
    t.after(() => limpiarRespaldos());
    // Decimal128 es lo que evita los errores de redondeo en dinero. Si volviera como número
    // de JavaScript, los totales de una cotización cambiarían al restaurar.
    const base = baseFalsa({ ots: [{ _id: new ObjectId(), granTotal: Decimal128.fromString('1234567.89') }] });

    const creado = await respaldo.crearRespaldo(conexionFalsa(base), 'produccion');
    const leido = await respaldo.leerRespaldo(creado.clave);

    const total = leido.colecciones.ots[0].granTotal;
    assert.ok(total instanceof Decimal128, `quedó como ${total?.constructor?.name}`);
    assert.strictEqual(total.toString(), '1234567.89');
});

test('restaurar deja la base con el contenido del respaldo', async (t) => {
    t.after(() => limpiarRespaldos());
    const idOriginal = new ObjectId();
    const origen = baseFalsa({
        ots: [{ _id: idOriginal, numeroOT: 'OT-2026-0001' }],
        recursos: [{ _id: new ObjectId(), nombre: 'Juan' }],
    });
    const creado = await respaldo.crearRespaldo(conexionFalsa(origen), 'produccion');

    // Mientras tanto alguien borra una OT y agrega basura.
    const destino = baseFalsa({ ots: [{ _id: new ObjectId(), numeroOT: 'OT-BASURA' }], recursos: [] });
    const contenido = await respaldo.leerRespaldo(creado.clave);
    const resultado = await respaldo.restaurar(conexionFalsa(destino), contenido);

    assert.deepStrictEqual(resultado, { ots: 1, recursos: 1 });
    assert.strictEqual(destino._datos.get('ots').length, 1);
    assert.strictEqual(destino._datos.get('ots')[0].numeroOT, 'OT-2026-0001', 'la basura fue reemplazada');
    assert.strictEqual(String(destino._datos.get('ots')[0]._id), String(idOriginal));
});

test('restaurar NO borra una colección que el respaldo no conoce', async (t) => {
    t.after(() => limpiarRespaldos());
    // Quien restaura quiere recuperar lo que perdió, no volver el mundo entero atrás. Una
    // colección creada después del respaldo se deja intacta.
    const creado = await respaldo.crearRespaldo(conexionFalsa(baseFalsa({ ots: [] })), 'produccion');
    const destino = baseFalsa({ ots: [], clientes: [{ _id: new ObjectId(), nombre: 'Nueva empresa' }] });

    await respaldo.restaurar(conexionFalsa(destino), await respaldo.leerRespaldo(creado.clave));

    assert.strictEqual(destino._datos.get('clientes').length, 1, 'clientes no estaba en el respaldo y sobrevive');
});

test('las sesiones abiertas no se respaldan', async (t) => {
    t.after(() => limpiarRespaldos());
    const base = baseFalsa({
        ots: [{ _id: new ObjectId() }],
        sesionstaffs: [{ _id: new ObjectId(), tokenHash: 'abc' }],
        sesionportals: [{ _id: new ObjectId() }],
    });

    const creado = await respaldo.crearRespaldo(conexionFalsa(base), 'produccion');
    const leido = await respaldo.leerRespaldo(creado.clave);

    assert.deepStrictEqual(Object.keys(leido.colecciones), ['ots']);
    assert.strictEqual(creado.documentos, 1);
});

test('el respaldo va comprimido y queda bajo el prefijo de su entorno', async (t) => {
    t.after(() => Promise.all([limpiarRespaldos('produccion'), limpiarRespaldos('demo')]));
    // Documentos repetitivos: sin gzip esto ocuparía mucho más que comprimido.
    const muchos = Array.from({ length: 200 }, () => ({ _id: new ObjectId(), descripcion: 'Mantención de equipo industrial' }));

    const prod = await respaldo.crearRespaldo(conexionFalsa(baseFalsa({ ots: muchos })), 'produccion');
    const demo = await respaldo.crearRespaldo(conexionFalsa(baseFalsa({ ots: [] })), 'demo');

    assert.match(prod.clave, /^respaldos\/produccion\/\d{4}-\d{2}-\d{2}T[\d-]+\.json\.gz$/, prod.clave);
    assert.match(demo.clave, /^respaldos\/demo\//, demo.clave);
    assert.ok(prod.tamano < prod.tamanoSinComprimir / 2, `comprimido ${prod.tamano} vs crudo ${prod.tamanoSinComprimir}`);
});

test('un respaldo de un formato que este código no entiende se rechaza', async (t) => {
    t.after(() => limpiarRespaldos());
    // Restaurar a medias un archivo de un formato futuro sería peor que no restaurar.
    const zlib = require('node:zlib');
    const { EJSON } = require('bson');
    const clave = 'respaldos/produccion/9999-01-01T00-00-00.json.gz';
    const futuro = zlib.gzipSync(Buffer.from(EJSON.stringify({ version: 99, colecciones: {} })));
    await almacenamiento.guardarEn(clave, futuro, 'application/gzip');

    await assert.rejects(() => respaldo.leerRespaldo(clave), /versión 99/);
});

test('leer un respaldo que no existe devuelve null', async () => {
    assert.strictEqual(await respaldo.leerRespaldo('respaldos/produccion/no-existe.json.gz'), null);
});

test('la retención borra los más viejos y conserva los más nuevos', async (t) => {
    t.after(() => limpiarRespaldos());
    // Se fabrican más respaldos que el máximo, con fechas espaciadas, y se comprueba cuáles
    // sobreviven. Sin esto el bucket crecería para siempre.
    const total = respaldo.MAXIMO_RESPALDOS + 5;
    const claves = [];
    for (let i = 0; i < total; i++) {
        const fecha = new Date(Date.UTC(2026, 0, 1 + i, 8, 0, 0));
        const clave = respaldo.claveDeRespaldo('produccion', fecha);
        await almacenamiento.guardarEn(clave, Buffer.from(`respaldo ${i}`), 'application/gzip');
        claves.push(clave);
        // El listado local ordena por mtime; se separan para que el orden sea determinista.
        await fs.utimes(path.join(almacenamiento.CARPETA_LOCAL, clave), fecha, fecha);
    }

    const podados = await respaldo.podarAntiguos('produccion');
    assert.strictEqual(podados.length, 5);

    const quedan = await respaldo.listarRespaldos('produccion');
    assert.strictEqual(quedan.length, respaldo.MAXIMO_RESPALDOS);
    assert.ok(quedan.some((r) => r.clave === claves[total - 1]), 'el más nuevo se conserva');
    assert.ok(!quedan.some((r) => r.clave === claves[0]), 'el más viejo se borró');
});

test('una clave con salto de directorio se rechaza', async () => {
    // Estas claves no vienen de la URL, pero terminan en una ruta de disco igual.
    await assert.rejects(() => almacenamiento.guardarEn('../fuera.json', Buffer.from('x')), /inválida/);
    await assert.rejects(() => almacenamiento.borrar('respaldos/../../server.js'), /inválida/);
    assert.strictEqual(await almacenamiento.leer('respaldos/../../server.js'), null);
});
