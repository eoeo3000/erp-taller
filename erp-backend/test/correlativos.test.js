// Pruebas de la numeración correlativa (SOL-2026-0001 / OT-2026-0001). Funciones puras: no
// necesitan Mongo ni levantar el servidor, igual que password.test.js.
const test = require('node:test');
const assert = require('node:assert');
const { prefijoAnual, patronDelPrefijo, proximoCorrelativo } = require('../src/utils/correlativos');

test('el prefijo sale del año de la fecha, no de una constante', () => {
    assert.strictEqual(prefijoAnual('OT', new Date(2026, 5, 15)), 'OT-2026-');
    assert.strictEqual(prefijoAnual('SOL', new Date(2026, 5, 15)), 'SOL-2026-');
    // Este es el caso que estaba roto: con el prefijo escrito a mano, acá seguía diciendo 2026.
    assert.strictEqual(prefijoAnual('OT', new Date(2027, 0, 1)), 'OT-2027-');
});

test('el primer número de un prefijo nuevo es 0001', () => {
    assert.strictEqual(proximoCorrelativo([], 'OT-2027-'), 'OT-2027-0001');
});

test('el 1 de enero el correlativo arranca de nuevo, sin chocar con el año anterior', () => {
    // Una base con todo 2026 emitido, y se pide el primero de 2027.
    const emitidos = ['OT-2026-0001', 'OT-2026-0841', 'OT-2026-0842'];
    assert.strictEqual(proximoCorrelativo(emitidos, prefijoAnual('OT', new Date(2027, 0, 1))), 'OT-2027-0001');
    // Y los de 2026 siguen su propia cuenta si se emite uno con ese prefijo.
    assert.strictEqual(proximoCorrelativo(emitidos, 'OT-2026-'), 'OT-2026-0843');
});

test('se usa el máximo real, no el último del arreglo ni el orden alfabético', () => {
    // Desordenados a propósito: si se confiara en el orden, daría 0011.
    assert.strictEqual(proximoCorrelativo(['OT-2026-0010', 'OT-2026-0120', 'OT-2026-0003'], 'OT-2026-'), 'OT-2026-0121');
});

test('un número cargado a mano no rompe ni reinicia la cuenta', () => {
    // El bug original: "OT-2026-TEST2" ordena después de "OT-2026-0012" como texto, así que la
    // "última OT" quedaba mal y el correlativo volvía a 0001, chocando con el índice unique.
    const emitidos = ['OT-2026-0012', 'OT-2026-TEST2', 'OT-2026-', 'sin-formato', null, undefined];
    assert.strictEqual(proximoCorrelativo(emitidos, 'OT-2026-'), 'OT-2026-0013');
});

test('los números de otro prefijo no se mezclan', () => {
    const emitidos = ['SOL-2026-0500', 'OT-2026-0007', 'OT-2025-0999'];
    assert.strictEqual(proximoCorrelativo(emitidos, 'OT-2026-'), 'OT-2026-0008');
    assert.strictEqual(proximoCorrelativo(emitidos, 'SOL-2026-'), 'SOL-2026-0501');
});

test('el correlativo pasa de 4 dígitos sin perder el número', () => {
    // Un taller con más de 9999 trabajos en un año: el número crece, no se trunca.
    assert.strictEqual(proximoCorrelativo(['OT-2026-9999'], 'OT-2026-'), 'OT-2026-10000');
});

test('el patrón solo acepta el prefijo con dígitos, y captura el correlativo', () => {
    const patron = patronDelPrefijo('OT-2026-');
    assert.strictEqual(patron.exec('OT-2026-0042')[1], '0042');
    assert.strictEqual(patron.exec('OT-2026-TEST'), null);
    assert.strictEqual(patron.exec('OT-2027-0042'), null);
    assert.strictEqual(patron.exec('XOT-2026-0042'), null);
});
