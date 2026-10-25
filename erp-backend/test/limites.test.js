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

test('un tope que ROMPE avisa antes de que no quede espacio', () => {
    // Ámbar en 90 y no en 95: entre que alguien lo nota y que cambia de plan pasan días, y
    // el bucket no espera.
    const l = recargar();
    assert.strictEqual(l.nivel(0, 'rompe'), 'ok');
    assert.strictEqual(l.nivel(69.9, 'rompe'), 'ok');
    assert.strictEqual(l.nivel(70, 'rompe'), 'tibio');
    assert.strictEqual(l.nivel(89.9, 'rompe'), 'tibio');
    assert.strictEqual(l.nivel(90, 'rompe'), 'mal');
    assert.strictEqual(l.nivel(150, 'rompe'), 'mal', 'pasarse del tope no vuelve a verde');
});

test('UN TOPE QUE SOLO COBRA NUNCA SE PINTA DE ROJO', () => {
    // Pasarse de los 10 GB gratuitos de R2 teniendo el plan pago no rompe nada: cuesta unos
    // centavos por GB. Pintarlo igual que un clúster lleno entrena a ignorar el rojo — la
    // primera vez que el rojo resulta ser "te van a cobrar 20 centavos", el rojo dejó de
    // significar algo.
    const l = recargar();
    assert.strictEqual(l.nivel(0, 'cobra'), 'ok');
    assert.strictEqual(l.nivel(70, 'cobra'), 'ok', 'antes de cruzarlo no pasa nada: avisar sería ruido');
    assert.strictEqual(l.nivel(99.9, 'cobra'), 'ok');
    assert.strictEqual(l.nivel(100, 'cobra'), 'tibio', 'cruzarlo se avisa');
    assert.strictEqual(l.nivel(400, 'cobra'), 'tibio', 'pero nunca es una emergencia');
});

test('por omisión los dos topes rompen: se avisa de más, no de menos', () => {
    // Cuál es cuál depende del plan contratado, que solo sabe quien paga. Si alguien se
    // olvida de configurarlo, el error seguro es el que avisa.
    const l = recargar({ LIMITE_BASE_AL_PASAR: '', LIMITE_ARCHIVOS_AL_PASAR: '' });
    assert.strictEqual(l.AL_PASAR_BASE, 'rompe');
    assert.strictEqual(l.AL_PASAR_ARCHIVOS, 'rompe');
    assert.strictEqual(l.nivel(95), 'mal', 'y sin decir cuál, se asume el que rompe');

    const pagado = recargar({ LIMITE_ARCHIVOS_AL_PASAR: 'COBRA' });
    assert.strictEqual(pagado.AL_PASAR_ARCHIVOS, 'cobra', 'no distingue mayúsculas');
    assert.strictEqual(recargar({ LIMITE_ARCHIVOS_AL_PASAR: 'cualquier cosa' }).AL_PASAR_ARCHIVOS, 'rompe');
});

test('el uso dice qué pasa al pasar el tope, para que el panel no tenga que adivinarlo', () => {
    const l = recargar();
    assert.strictEqual(l.uso(l.MB, 2 * l.MB, 'cobra').alPasar, 'cobra');
    assert.strictEqual(l.uso(l.MB, 2 * l.MB).alPasar, 'rompe');
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
