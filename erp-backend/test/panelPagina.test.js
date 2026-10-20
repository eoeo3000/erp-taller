// La página del panel, servida por el backend.
//
// Lo único que importa probar acá —y es lo que la hace segura— es que la página NO traiga
// datos ni credenciales: es un formulario y el código que pinta la tabla. Todo lo que
// muestra lo pide después a /api/talleres con la clave en una cabecera. Si alguien algún día
// "simplifica" metiendo la clave en la URL o los talleres en el HTML, esto se pone rojo.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const panelRoutes = require('../src/routes/panelRoutes');

function levantar() {
    const app = express();
    app.use('/panel', panelRoutes);
    return new Promise((listo) => {
        const servidor = app.listen(0, () => listo({ servidor, url: `http://127.0.0.1:${servidor.address().port}/panel` }));
    });
}

async function traer() {
    const { servidor, url } = await levantar();
    try {
        const resp = await fetch(url);
        return { estado: resp.status, tipo: resp.headers.get('content-type'), cache: resp.headers.get('cache-control'), html: await resp.text() };
    } finally { servidor.close(); }
}

test('la página se sirve y es HTML', async () => {
    const r = await traer();
    assert.strictEqual(r.estado, 200);
    assert.match(r.tipo, /text\/html/);
    assert.match(r.html, /<title>Talleres/);
});

test('NO trae ningún dato ni la clave: todo lo pide después con la cabecera', async () => {
    const r = await traer();
    // Si la clave estuviera en el HTML servido, cualquiera que abra /panel la tendría.
    assert.ok(!r.html.includes('PANEL_TOKEN=') && !/token\s*[:=]\s*['"][A-Za-z0-9]{8,}/.test(r.html),
        'parece haber una clave incrustada en la página');
    assert.ok(!r.html.includes('mongodb'), 'ninguna cadena de conexión');
    // Y la clave viaja en cabecera, nunca en la dirección.
    assert.match(r.html, /'X-Panel-Token'/);
    assert.ok(!/\?clave=|&clave=|token=\$\{/.test(r.html), 'la clave no puede viajar en la URL');
});

test('no se queda pegada en el caché del navegador', async () => {
    assert.match((await traer()).cache || '', /no-store/);
});

test('no carga nada de afuera: ni tipografías, ni librerías, ni imágenes remotas', async () => {
    // Un panel que depende de un CDN deja de verse el día que ese CDN falla, y de paso le
    // cuenta a un tercero cada vez que alguien lo abre.
    const r = await traer();
    const externos = (r.html.match(/https?:\/\/[^\s"'<>]+/g) || []).filter((u) => !u.startsWith('http://127.0.0.1'));
    assert.deepStrictEqual(externos, [], `la página carga recursos externos: ${externos.join(', ')}`);
});

test('pide a los buscadores que no la indexen', async () => {
    assert.match((await traer()).html, /name="robots"[^>]*noindex/);
});

test('la página ofrece reemitir la instalación SOLO a quien no tiene cuentas', async () => {
    // Un taller que ya opera no necesita ese enlace nunca más, y el backend lo rechaza con
    // 409. Ofrecer un botón que va a fallar es peor que no ofrecerlo: parece que se puede.
    const r = await traer();
    assert.match(r.html, /t\.cuentas > 0/, 'la decisión tiene que mirar las cuentas');
    assert.match(r.html, /data-reemitir/);
    assert.match(r.html, /data-acceso/);
});

test('el link de acceso se arma con el host que manda el servidor, no escrito a mano', async () => {
    // Si estuviera escrito en la página, el día que cambie SPA_URL el panel seguiría dando el
    // link viejo sin que nadie lo note.
    const r = await traer();
    assert.match(r.html, /spaUrl/);
    assert.ok(!r.html.includes('onrender.com'), 'no puede haber un host escrito a mano');
});

test('el link de acceso lleva el ?taller=, que es lo que lo hace servir', async () => {
    // Sin él, el correo de esa persona se busca en la base del taller por defecto y no puede
    // entrar. Es el error más fácil de cometer al mandar el link.
    assert.match((await traer()).html, /\?taller=\$\{encodeURIComponent/);
});

test('reemitir avisa antes: el enlace anterior deja de servir', async () => {
    // Es una acción que rompe algo que ya se mandó. Que pregunte no es trámite: si el dueño
    // ya tenía el link en el correo, reemitir se lo mata.
    assert.match((await traer()).html, /confirm\(/);
});
