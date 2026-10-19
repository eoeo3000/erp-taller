// Lo que el panel puede decir de un taller sin entrar a su app.
//
// Dos cosas se prueban acá por encima del resto: que una base caída salga MARCADA en vez de
// tumbar la consulta de todos —enterarse de eso es para lo que existe el panel, así que no
// puede ser lo primero que se rompa— y que la actividad mire las dos puertas, escritorio y
// PWA, porque un taller donde solo trabajan los supervisores desde el teléfono se vería
// muerto mirando una sola.
const test = require('node:test');
const assert = require('node:assert');

// Los modelos se sustituyen antes de requerir el servicio, que los desestructura al cargarse.
let base = {};
for (const [ruta, clave] of [['../src/models/OT', 'ots'], ['../src/models/Solicitud', 'solicitudes'], ['../src/models/Usuario', 'usuarios']]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = {
        id: resuelta, filename: resuelta, loaded: true,
        exports: () => ({
            countDocuments: async () => {
                if (base.caida) throw new Error('connection refused');
                return clave === 'usuarios' ? (base.cuentas ?? 0) : (base[clave] ?? 0);
            },
            findOne: (filtro) => ({
                sort: (orden) => ({
                    lean: async () => {
                        if (base.caida) throw new Error('connection refused');
                        const campo = Object.keys(orden)[0];
                        return base[campo] ? { [campo]: base[campo] } : null;
                    },
                }),
            }),
        }),
    };
}

const { metricasDeTaller, diasSinUsar, masReciente, MS_ESPERA } = require('../src/servicios/metricasTaller');

test.beforeEach(() => { base = {}; });

test('cuenta OT, solicitudes y cuentas de escritorio', async () => {
    base = { ots: 42, solicitudes: 60, cuentas: 3, ultimoAccesoSpa: '2026-10-18T10:00:00Z' };
    const m = await metricasDeTaller({});
    assert.strictEqual(m.baseResponde, true);
    assert.strictEqual(m.ots, 42);
    assert.strictEqual(m.solicitudes, 60);
    assert.strictEqual(m.cuentas, 3);
});

test('una base caída se MARCA, no hace fallar la consulta', async () => {
    // Si esto lanzara, un solo cliente con la base rota dejaría al panel sin mostrar a
    // ninguno — justo cuando más falta hace mirarlo.
    base = { caida: true };
    const m = await metricasDeTaller({});
    assert.strictEqual(m.baseResponde, false);
    assert.match(m.error, /connection refused/);
    assert.strictEqual(m.ots, null, 'no inventa un cero, que se leería como "no tienen nada"');
});

test('la actividad mira las DOS puertas: escritorio y PWA', async () => {
    // Un taller donde solo entran los supervisores desde el teléfono tiene `ultimoAcceso`
    // pero no `ultimoAccesoSpa`. Mirando solo el primero se vería abandonado.
    base = { ultimoAcceso: '2026-10-18T12:00:00Z' };
    assert.strictEqual((await metricasDeTaller({})).ultimaActividad.toISOString(), '2026-10-18T12:00:00.000Z');

    base = { ultimoAccesoSpa: '2026-10-10T12:00:00Z', ultimoAcceso: '2026-10-18T12:00:00Z' };
    assert.strictEqual((await metricasDeTaller({})).ultimaActividad.toISOString(), '2026-10-18T12:00:00.000Z',
        'se queda con la más reciente de las dos');
});

test('sin ninguna actividad devuelve null, no una fecha inventada', async () => {
    base = { ots: 0, solicitudes: 0, cuentas: 1 };
    assert.strictEqual((await metricasDeTaller({})).ultimaActividad, null);
});

test('masReciente descarta lo que no es una fecha', () => {
    assert.strictEqual(masReciente([null, undefined, '', 'cualquier cosa']), null);
    assert.strictEqual(masReciente(['2026-01-01', null, '2026-06-01']).toISOString().slice(0, 10), '2026-06-01');
});

test('diasSinUsar: lo que decide el color del aviso', () => {
    const ahora = new Date('2026-10-19T12:00:00Z').getTime();
    assert.strictEqual(diasSinUsar('2026-10-19T09:00:00Z', ahora), 0);
    assert.strictEqual(diasSinUsar('2026-10-18T09:00:00Z', ahora), 1);
    assert.strictEqual(diasSinUsar('2026-09-19T12:00:00Z', ahora), 30);
    assert.strictEqual(diasSinUsar(null, ahora), null, 'nunca entraron no es cero días');
    assert.strictEqual(diasSinUsar('no es fecha', ahora), null);
    // Un reloj corrido no debe producir días negativos.
    assert.strictEqual(diasSinUsar('2026-10-25T12:00:00Z', ahora), 0);
});

test('hay un tope de espera, y es corto', () => {
    // Sin tope, una base dormida cuelga el panel entero hasta que Mongo se rinda solo.
    assert.ok(MS_ESPERA > 0 && MS_ESPERA <= 15000, 'el tope tiene que existir y ser corto');
});
