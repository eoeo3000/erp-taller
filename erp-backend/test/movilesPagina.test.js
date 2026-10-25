// La página para probar las dos apps móviles en una pantalla.
//
// Es una herramienta, no una pantalla del producto, así que lo que importa probar es corto:
// que siga sin ser una puerta. No habla con la API, no pide ninguna clave y no guarda nada
// en el servidor — y los links que se le pegan llevan el token de una persona adentro, así
// que tampoco puede quedárselos.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

async function traer(entorno = {}) {
    // La ruta arma la página al cargarse (lee las direcciones del entorno una vez), así que
    // hay que fijar el entorno ANTES de requerirla y limpiar la caché entre pruebas.
    const previo = { ...process.env };
    Object.assign(process.env, entorno);
    delete require.cache[require.resolve('../src/routes/movilesRoutes')];
    delete require.cache[require.resolve('../src/config/urls')];
    const movilesRoutes = require('../src/routes/movilesRoutes');

    const app = express();
    app.use('/moviles', movilesRoutes);
    const servidor = app.listen(0);
    await new Promise((listo) => servidor.once('listening', listo));
    try {
        const resp = await fetch(`http://127.0.0.1:${servidor.address().port}/moviles`);
        return { estado: resp.status, tipo: resp.headers.get('content-type'), cache: resp.headers.get('cache-control'), html: await resp.text() };
    } finally {
        servidor.close();
        process.env = previo;
    }
}

test('la página se sirve y es HTML', async () => {
    const r = await traer();
    assert.strictEqual(r.estado, 200);
    assert.match(r.tipo, /text\/html/);
    assert.match(r.html, /<title>Probador/);
    assert.match(r.cache || '', /no-store/);
    assert.match(r.html, /name="robots"[^>]*noindex/);
});

test('NO habla con la API ni pide ninguna clave', async () => {
    // Si alguna vez se le agregara "traer los tokens del servidor para no pegarlos", esto se
    // pone rojo. `usuarioController.listar` los esconde a propósito (`.select('-token')`):
    // son credenciales, y ahorrarse un pegado no vale abrir esa puerta.
    const r = await traer();
    assert.ok(!r.html.includes('/api/'), 'no debería llamar a ninguna ruta de la API');
    assert.ok(!/PANEL_TOKEN|RESPALDO_TOKEN|X-Panel-Token/.test(r.html), 'no pide ninguna clave');
    assert.ok(!r.html.includes('mongodb'), 'ninguna cadena de conexión');
});

test('los links se recuerdan solo mientras dure la pestaña', async () => {
    // Llevan el token de una persona adentro, que es su acceso permanente. En localStorage
    // quedarían ahí después de cerrar el navegador.
    const r = await traer();
    assert.match(r.html, /sessionStorage\.setItem/);
    // Se mira el USO, no la palabra: el comentario que explica por qué no es localStorage
    // menciona localStorage, y eso no es un uso.
    assert.ok(!/localStorage\.(set|get)Item/.test(r.html), 'un token no se guarda en localStorage');
});

test('no carga nada de afuera', async () => {
    // Mismo criterio que el panel: una herramienta que depende de un CDN deja de verse el
    // día que ese CDN falla. Las direcciones de las PWAs son la excepción obvia —son lo que
    // se va a incrustar— así que se miran aparte en la prueba de abajo.
    const r = await traer({ PWA_OPERATIVA_URL: 'http://localhost:5174', PWA_CLIENTE_URL: 'http://localhost:5175' });
    const externos = (r.html.match(/(src|href)="https?:\/\/[^"]+"/g) || []);
    assert.deepStrictEqual(externos, [], `la página carga recursos externos: ${externos.join(', ')}`);
});

test('el marco deja usar la cámara: sin eso la app de terreno parece rota', async () => {
    // Las fotos de evidencia son el corazón de la PWA Operativa. Un iframe le niega la
    // cámara por omisión y la app falla sin decir por qué — el peor modo de fallar en una
    // herramienta cuyo único trabajo es mostrar si algo funciona.
    assert.match((await traer()).html, /allow = 'camera; geolocation/);
});

test('abrir aparte no deja que la pestaña nueva toque esta', async () => {
    assert.match((await traer()).html, /window\.open\(.*'noopener'\)/);
});

test('las direcciones configuradas se inyectan como datos, no pegadas en el script', async () => {
    // Si se pegaran como texto, una comilla en una variable de entorno rompería el script
    // de la página entera — y el síntoma sería un probador en blanco, sin ningún error que
    // apunte al `.env`.
    const r = await traer({ PWA_OPERATIVA_URL: "http://raro'comilla", PWA_CLIENTE_URL: 'http://cliente.ejemplo' });
    assert.ok(r.html.includes(JSON.stringify({ operativa: "http://raro'comilla", cliente: 'http://cliente.ejemplo' })),
        'las direcciones tienen que ir serializadas');
    assert.ok(!r.html.includes("= { operativa: 'http://raro'comilla'"), 'no pegadas a mano');
});
