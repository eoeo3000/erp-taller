// Cuánto se está usando contra el techo del plan.
//
// Es una función pura a propósito: de acá sale el color que decide si alguien mira la
// factura o no, y equivocarse en el redondeo o en el umbral significa enterarse tarde.
const test = require('node:test');
const assert = require('node:assert');

function recargar(entorno = {}) {
    const previo = { ...process.env };
    Object.assign(process.env, entorno);
    delete require.cache[require.resolve('../src/servicios/limites')];
    const limites = require('../src/servicios/limites');
    process.env = previo;
    return limites;
}

test('los topes por omisión son los de los planes gratuitos', () => {
    // Es donde está hoy. Si alguien pasa a un plan pago cambia dos variables y el panel
    // sigue diciendo la verdad; escritos en el código, seguiría avisando de un techo que ya
    // no existe.
    const l = recargar({ LIMITE_BASE_MB: '', LIMITE_ARCHIVOS_GB: '' });
    assert.strictEqual(l.topeDeBases(), 512 * l.MB, '512 MB: el clúster M0 de Atlas');
    assert.strictEqual(l.topeDeArchivos(), 10 * l.GB, '10 GB: el plan gratuito de R2');
});

test('los topes se cambian desde el entorno', () => {
    const l = recargar({ LIMITE_BASE_MB: '2048', LIMITE_ARCHIVOS_GB: '100' });
    assert.strictEqual(l.topeDeBases(), 2048 * l.MB);
    assert.strictEqual(l.topeDeArchivos(), 100 * l.GB);
});

test('el color avisa ANTES de que no quede espacio', () => {
    // Ámbar en 90 y no en 95: entre que alguien lo nota y que cambia de plan pasan días, y
    // el bucket no espera.
    const l = recargar();
    assert.strictEqual(l.nivel(0), 'ok');
    assert.strictEqual(l.nivel(69.9), 'ok');
    assert.strictEqual(l.nivel(70), 'tibio');
    assert.strictEqual(l.nivel(89.9), 'tibio');
    assert.strictEqual(l.nivel(90), 'mal');
    assert.strictEqual(l.nivel(150), 'mal', 'pasarse del tope no vuelve a verde');
});

test('sin tope configurado se informa el uso y no se inventa un porcentaje', () => {
    // Un porcentaje contra un número que nadie puso se lee como un dato y es una
    // suposición. Mejor decir cuánto se usa y nada más.
    const l = recargar();
    const u = l.uso(1234, 0);
    assert.strictEqual(u.porcentaje, null);
    assert.strictEqual(u.bytes, 1234);
    assert.strictEqual(u.nivel, 'ok');
});

test('el porcentaje se redondea a un decimal y nunca sale negativo', () => {
    const l = recargar();
    assert.strictEqual(l.uso(l.MB, 3 * l.MB).porcentaje, 33.3);
    assert.strictEqual(l.uso(-5, l.MB).bytes, 0);
    assert.strictEqual(l.uso(undefined, l.MB).bytes, 0);
});
