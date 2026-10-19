// De dónde sale la base de datos de un taller nuevo.
//
// Existe para que dar de alta un cliente sea escribir su nombre y nada más. El paso que
// reemplaza —pegar una cadena de conexión a mano— es el más peligroso del alta: un error de
// copiado deja a DOS CLIENTES COMPARTIENDO BASE, que es exactamente lo que toda esta
// arquitectura existe para impedir.
const test = require('node:test');
const assert = require('node:assert');
const { conOtraBase, slugDesdeNombre, nombreDeBaseValido, uriParaTaller } = require('../src/servicios/baseDelTaller');

test('cambia SOLO el nombre de la base, en los formatos que existen', () => {
    // El tercero es el que obliga a no usar `new URL()`: una cadena con varios hosts —un
    // replica set escrito a mano— no parsea, y ahí se habría caído el alta.
    const casos = [
        ['mongodb+srv://u:p@c0.ab12c.mongodb.net/?retryWrites=true&w=majority&appName=C0',
         'mongodb+srv://u:p@c0.ab12c.mongodb.net/taller-lopez?retryWrites=true&w=majority&appName=C0'],
        ['mongodb+srv://u:p@c0.ab12c.mongodb.net/test?retryWrites=true&w=majority',
         'mongodb+srv://u:p@c0.ab12c.mongodb.net/taller-lopez?retryWrites=true&w=majority'],
        ['mongodb://u:p@host1:27017,host2:27017/test?replicaSet=rs0',
         'mongodb://u:p@host1:27017,host2:27017/taller-lopez?replicaSet=rs0'],
        ['mongodb://127.0.0.1:27017/test', 'mongodb://127.0.0.1:27017/taller-lopez'],
        ['mongodb://127.0.0.1:27017', 'mongodb://127.0.0.1:27017/taller-lopez'],
    ];
    for (const [entrada, esperado] of casos) {
        assert.strictEqual(conOtraBase(entrada, 'taller-lopez'), esperado, `falló con ${entrada}`);
    }
});

test('los parámetros se conservan enteros', () => {
    // Ahí viven retryWrites, w=majority y appName. Perderlos cambia cómo se conecta, y en
    // silencio: la conexión igual abre.
    const salida = conOtraBase('mongodb+srv://u:p@c0.net/test?retryWrites=true&w=majority&appName=C0&tls=true', 'x');
    assert.ok(salida.endsWith('?retryWrites=true&w=majority&appName=C0&tls=true'));
});

test('la clave de la cadena no se toca ni se rompe', () => {
    // Una clave con @ adentro es el caso que rompe un corte ingenuo por el primer arroba.
    const conArroba = 'mongodb+srv://usuario:cla@ve@c0.ab12c.mongodb.net/test?w=majority';
    assert.strictEqual(conOtraBase(conArroba, 'nuevo'), 'mongodb+srv://usuario:cla@ve@c0.ab12c.mongodb.net/nuevo?w=majority');
});

test('sin MONGO_URI falla claro en vez de armar una cadena rota', () => {
    assert.throws(() => conOtraBase('', 'x'), /No hay MONGO_URI/);
    assert.throws(() => conOtraBase(null, 'x'), /No hay MONGO_URI/);
});

test('el identificador sale del nombre, con los acentos reducidos y no borrados', () => {
    // Borrarlos convertiría "Montaña" en "montaa".
    assert.strictEqual(slugDesdeNombre('Taller López'), 'taller-lopez');
    assert.strictEqual(slugDesdeNombre('  Montaña  Sur '), 'montana-sur');
    assert.strictEqual(slugDesdeNombre('Refrigeración & Clima S.A.'), 'refrigeracion-clima-s-a');
    assert.strictEqual(slugDesdeNombre('ÁÉÍÓÚ'), 'aeiou');
    assert.strictEqual(slugDesdeNombre('---'), '');
});

test('el identificador derivado nunca queda con guion al final ni pasa de 40', () => {
    // El corte a 40 puede caer justo en un guion, y un slug terminado en guion no pasa la
    // validación: el alta fallaría con un nombre largo y nadie sabría por qué.
    const largo = slugDesdeNombre('Taller de Mantención Industrial y Refrigeración del Sur Limitada');
    assert.ok(largo.length <= 40);
    assert.ok(!largo.endsWith('-'), `quedó "${largo}"`);
});

test('rechaza nombres de base que Mongo no acepta', () => {
    for (const malo of ['con.punto', 'con/barra', 'con espacio', 'con"comilla', 'con$peso', '', 'x'.repeat(64)]) {
        assert.strictEqual(nombreDeBaseValido(malo), false, `aceptó ${JSON.stringify(malo)}`);
    }
    assert.strictEqual(nombreDeBaseValido('taller-lopez'), true);
});

test('uriParaTaller rechaza un identificador inválido antes de armar nada', () => {
    assert.throws(() => uriParaTaller('con.punto', 'mongodb://h/test'), /Identificador inválido/);
    assert.throws(() => uriParaTaller('', 'mongodb://h/test'), /Identificador inválido/);
    assert.strictEqual(uriParaTaller('taller-lopez', 'mongodb://h/test'), 'mongodb://h/taller-lopez');
});
