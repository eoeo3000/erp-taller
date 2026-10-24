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

test('se puede entrar al taller desde su fila, y la pestaña nueva no puede tocar esta', async () => {
    // «Abrir» lleva a la puerta del cliente, no adentro. Y `noopener` no es decoración: sin
    // él, la pestaña que se abre puede cambiar la dirección de ESTA, que es la que tiene la
    // clave del panel en su sessionStorage.
    const r = await traer();
    assert.match(r.html, /data-abrir/);
    assert.match(r.html, /window\.open\(.*'noopener'\)/);
});

test('la marca de cada taller se edita desde el panel', async () => {
    const r = await traer();
    assert.match(r.html, /data-marca/);
    assert.match(r.html, /marca: cambios/, 'tiene que mandarse como PATCH del campo marca');
});

test('el logo se reduce en el navegador antes de subirlo', async () => {
    // El tope del servidor son 150 KB. Si la página mandara el archivo tal cual, el logo
    // original de cualquier taller —que suele venir en 2000px— lo pasaría siempre, y la
    // persona vería un error sin forma de arreglarlo desde acá.
    const r = await traer();
    assert.match(r.html, /LADO_MAXIMO_LOGO/);
    assert.match(r.html, /toDataURL\('image\/png'\)/);
    // Y si el PNG no entra en el tope, JPEG sobre blanco: sin pintar el fondo, lo
    // transparente saldría negro.
    assert.match(r.html, /destination-over/);
});

test('quitar el logo avisa antes', async () => {
    // Deja las cotizaciones de ese cliente sin imagen. No es un cambio que se deshaga solo:
    // hay que volver a subir el archivo, que quien administra puede no tener a mano.
    assert.match((await traer()).html, /sus cotizaciones vuelven a salir sin imagen/);
});

test('la tabla pinta una celda por columna', async () => {
    // Esto estaba mal desde que nació el panel: el `<th>Base</th>` existía y la función que
    // decide qué poner ahí también, pero la fila nunca la llamaba. Resultado: todo lo que
    // venía después salía corrido una columna y la última quedaba vacía — y la columna que
    // se perdía era justamente la que dice si la base de ese cliente responde, que es de lo
    // que el panel existe para enterarte.
    const r = await traer();
    const encabezados = (r.html.match(/<thead>[\s\S]*?<\/tr>/)[0].match(/<th[ >]/g) || []).length;
    const celdas = (r.html.match(/datos\.talleres\.map[\s\S]*?<\/tr>/)[0].match(/<td/g) || []).length;
    assert.strictEqual(celdas, encabezados, `${encabezados} columnas y ${celdas} celdas`);
});

test('el panel muestra archivos y respaldo DE CADA taller', async () => {
    // Hasta la etapa 5 decía que esto no se podía medir: los archivos y los respaldos iban
    // todos juntos, y mostrar el total de todos para cada cliente habría parecido un dato
    // siendo mentira. Ya no es así, y el cartel tiene que haberse ido con ellos.
    const r = await traer();
    assert.match(r.html, /fila\.archivos/);
    assert.match(r.html, /fila\.respaldo/);
    assert.ok(!r.html.includes('pendienteEtapa5'), 'el cartel de "todavía no se puede medir" ya no corresponde');
});

test('un taller sin respaldo se ve en rojo, no en blanco', async () => {
    // Es el dato que hay que mirar cuando algo se rompe. Un cliente sin respaldo tiene que
    // saltar a la vista, no pasar como una celda vacía más.
    assert.match((await traer()).html, /nunca<\/span>/);
});

test('avisa cuántos archivos quedan sin separar por taller', async () => {
    // Mientras queden, la cuenta por taller está incompleta — y un número incompleto que se
    // ve completo es peor que ninguno.
    const r = await traer();
    assert.match(r.html, /sinSeparar/);
    assert.match(r.html, /migrarArchivosPorTaller/);
});
