// Dejar lista la base de un taller nuevo: los índices.
//
// En Mongo la base aparece sola al escribir. Los índices NO. Mongoose los construye perezoso,
// la primera vez que usa cada modelo, así que en una base recién nacida un modelo que nadie
// tocó todavía no tiene su índice único — y el día que dos documentos choquen no hay error:
// entran los dos. Son once índices únicos en el proyecto, todos contra duplicados que después
// no se separan a mano.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { aprovisionarTaller, archivosDeModelos } = require('../src/servicios/aprovisionamiento');

test('cubre TODOS los modelos del proyecto, sin lista escrita a mano', () => {
    // La lista se lee de la carpeta justamente para que un modelo nuevo quede cubierto sin
    // que nadie se acuerde de agregarlo acá. Esta prueba fija esa propiedad.
    const enDisco = fs.readdirSync(path.join(__dirname, '..', 'src', 'models')).filter((f) => f.endsWith('.js'));
    const cubiertos = archivosDeModelos();
    assert.strictEqual(cubiertos.length, enDisco.length - 1, 'todos menos uno');
    for (const archivo of enDisco) {
        if (archivo === 'Taller.js') continue;
        assert.ok(cubiertos.includes(archivo), `falta ${archivo}`);
    }
});

test('NO incluye Taller: ese vive en la base de control', () => {
    // Construirlo acá crearía una colección de talleres dentro de los datos de un cliente —y
    // se la llevaría en sus respaldos.
    assert.ok(!archivosDeModelos().includes('Taller.js'));
});

test('construye los índices de cada modelo y dice en qué base', async () => {
    const llamados = [];
    const conn = {
        name: 'base-taller-lopez',
        models: {},
        model(nombre) {
            this.models[nombre] = this.models[nombre] || {
                modelName: nombre,
                syncIndexes: async () => { llamados.push(nombre); },
            };
            return this.models[nombre];
        },
    };

    const informe = await aprovisionarTaller(conn);
    assert.strictEqual(informe.base, 'base-taller-lopez');
    assert.strictEqual(informe.fallidos.length, 0);
    assert.strictEqual(llamados.length, archivosDeModelos().length, 'uno por modelo');
    for (const esperado of ['OT', 'Solicitud', 'Usuario', 'Recurso']) {
        assert.ok(llamados.includes(esperado), `no se sincronizó ${esperado}`);
    }
});

test('un índice que no se puede construir no aborta el resto: se junta y se informa', async () => {
    // Pasa cuando la base ya traía datos duplicados. Si cortara, el alta quedaría a medias sin
    // decir dónde; así queda dicho exactamente qué falló.
    const conn = {
        name: 'base-con-problemas',
        models: {},
        model(nombre) {
            this.models[nombre] = this.models[nombre] || {
                modelName: nombre,
                syncIndexes: async () => {
                    if (nombre === 'OT') throw new Error('E11000 duplicate key');
                },
            };
            return this.models[nombre];
        },
    };

    const informe = await aprovisionarTaller(conn);
    assert.deepStrictEqual(informe.fallidos.map((f) => f.modelo), ['OT']);
    assert.match(informe.fallidos[0].error, /duplicate key/);
    assert.ok(informe.modelos.length > 15, 'los demás sí se construyeron');
});

test('correrlo dos veces sobre la misma base no rompe nada', async () => {
    // Idempotente a propósito: así sirve además para reparar una base a la que le faltó algo.
    let veces = 0;
    const conn = {
        name: 'base-x', models: {},
        model(nombre) {
            this.models[nombre] = this.models[nombre] || { modelName: nombre, syncIndexes: async () => { veces += 1; } };
            return this.models[nombre];
        },
    };
    await aprovisionarTaller(conn);
    const despuesDeLaPrimera = veces;
    await aprovisionarTaller(conn);
    assert.strictEqual(veces, despuesDeLaPrimera * 2);
});
