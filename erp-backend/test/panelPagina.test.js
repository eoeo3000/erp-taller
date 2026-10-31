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

// `acciones()` se saca de la página y se corre de verdad: es puro armado de texto, sin DOM.
// Mirar el HTML con una expresión regular diría que los dos botones están —y están, cada uno
// en su rama—, que es justo lo que no se quiere probar acá.
async function accionesDe(fila) {
    const { html } = await traer();
    const fuente = html.match(/function acciones\(t\) \{[\s\S]*?\n\}/)[0];
    // eslint-disable-next-line no-new-func
    return new Function(`${fuente}; return acciones(arguments[0]);`)(fila);
}

test('a un taller sin instalar NO se le ofrece el link de acceso: no lleva la clave', async () => {
    // Esto pasó de verdad. La fila de un taller nuevo ofrecía las dos cosas, se compartió el
    // link de acceso —que no lleva `?clave=`— y el dueño cayó en la pantalla de instalación
    // con el campo vacío y sin nada que escribir ahí: la clave no se puede recuperar, solo
    // reemitir. Mientras el taller no esté instalado, lo único que sirve es su enlace de
    // instalación, y es lo único que la fila ofrece.
    const sinInstalar = await accionesDe({ slug: 'taller-nuevo', cuentas: 0, medible: true });
    assert.match(sinInstalar, /data-reemitir/, 'tiene que ofrecer el enlace de instalación');
    assert.ok(!sinInstalar.includes('data-acceso'), 'y NO el de acceso, que lo deja a mitad de camino');

    // Instalado es al revés: el de instalación ya no sirve y el backend lo rechaza con 409.
    const operando = await accionesDe({ slug: 'taller-viejo', cuentas: 3, medible: true });
    assert.match(operando, /data-acceso/);
    assert.ok(!operando.includes('data-reemitir'));
});

test('el botón del enlace de instalación dice qué entrega, no el verbo interno', async () => {
    // Quien administra no está "reemitiendo" nada la primera vez que lo necesita: está
    // buscando el enlace para mandárselo al cliente. Que el botón se llame por el mecanismo
    // es lo que hace que no se encuentre cuando se lo busca.
    const sinInstalar = await accionesDe({ slug: 'taller-nuevo', cuentas: 0, medible: true });
    assert.match(sinInstalar, />Enlace de instalación</);
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

test('el panel muestra el uso total contra el techo del plan', async () => {
    // Los topes de Atlas y de R2 son del clúster y del bucket enteros, así que mirar fila
    // por fila no alcanza: un taller en verde no dice nada si entre todos ya se llenó.
    const r = await traer();
    assert.match(r.html, /pintarUso/);
    assert.match(r.html, /totales\.bases|datos\.totales/);
    assert.match(r.html, /LIMITE_BASE_MB/, 'dice de dónde salen los topes');
});

test('el panel MIDE y no corta', async () => {
    // Si alguna vez se agregara un corte por cuota, este texto tendría que cambiar — y es
    // una decisión que no debería pasar sin que alguien la escriba. Lo que se subiría al
    // tope son las fotos de evidencia: rechazarlas deja a un supervisor en terreno sin
    // poder guardar su trabajo.
    assert.match((await traer()).html, /no corta nada/);
});

test('cada fila dice cuánto ocupa su base', async () => {
    assert.match((await traer()).html, /fila\.bytesBase/);
});

test('el panel dice qué pasa al pasar cada tope, y el rojo queda para lo que se rompe', async () => {
    // Un tope que solo cobra pintado de rojo entrena a ignorar el rojo: la primera vez que
    // resulta ser "te van a cobrar 20 centavos", el rojo dejó de significar algo.
    const r = await traer();
    assert.match(r.html, /deja de poder escribir/);
    assert.match(r.html, /empieza a cobrarse por uso/);
    assert.match(r.html, /LIMITE_ARCHIVOS_AL_PASAR/, 'dice de dónde sale cuál es cuál');
});

test('la tarjeta de cuentas existe y pregunta por la API, no trae datos', async () => {
    // Misma regla que el resto del panel: la página es un formulario y el código que pinta.
    const r = await traer();
    assert.match(r.html, /id="formCuentas"/);
    assert.match(r.html, /\/api\/talleres\/cuentas/);
    // Con forma de correo: `@media` del CSS no cuenta, una dirección de verdad sí.
    const correos = r.html.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
    assert.deepStrictEqual(correos, [], `hay correos incrustados: ${correos.join(', ')}`);
});

test('el texto que escriben OTROS se escapa antes de pintarlo', async () => {
    // Hasta esta tarjeta, todo lo que pintaba la página lo había escrito quien administra.
    // Los nombres de las cuentas no: los escribe la gente de cada taller, en su propia app, y
    // ESTA página es la que guarda PANEL_TOKEN en su sessionStorage. Un nombre con una
    // etiqueta adentro correría acá y se llevaría esa clave, y quien lo pusiera no necesitaría
    // más que una cuenta en su propio taller.
    const r = await traer();
    assert.match(r.html, /const seguro =/, 'tiene que existir el escapado');
    const filaCuenta = r.html.match(/function filaCuenta\(c\) \{[\s\S]*?\n\}/)[0];
    for (const campo of ['c.email', 'c.nombre', 'c.taller', 'c.estado']) {
        assert.ok(
            !filaCuenta.includes(`texto(${campo})`),
            `${campo} se pinta con texto() en vez de seguro(): eso es HTML sin escapar`,
        );
    }
    assert.match(filaCuenta, /seguro\(c\.email\)/);
    assert.match(filaCuenta, /seguro\(c\.nombre\)/);
});

test('escapar de verdad convierte una etiqueta en texto', async () => {
    // Que la función exista no basta: tiene que hacer lo que dice. Se saca de la página y se
    // corre, igual que `acciones()`.
    const { html } = await traer();
    const fuente = html.match(/const seguro = [\s\S]*?\n\)\);/)[0];
    // eslint-disable-next-line no-new-func
    const seguro = new Function(`
        const texto = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
        ${fuente}
        return seguro(arguments[0]);
    `);
    assert.strictEqual(seguro('<img src=x onerror=robar()>'), '&lt;img src=x onerror=robar()&gt;');
    assert.strictEqual(seguro('a & b'), 'a &amp; b');
    assert.strictEqual(seguro('"comillas"'), '&quot;comillas&quot;');
});

test('la tabla de cuentas pinta una celda por columna', async () => {
    // Mismo cuidado que con la tabla de talleres, donde la columna Base existía en el <th> y
    // la fila nunca la llamaba: todo salía corrido y lo que se perdía era el dato que importa.
    const r = await traer();
    const encabezados = (r.html.match(/<th>Correo<\/th>[\s\S]*?<\/tr>/)[0].match(/<th>/g) || []).length;
    const filaCuenta = r.html.match(/function filaCuenta\(c\) \{[\s\S]*?\n\}/)[0];
    const celdas = (filaCuenta.match(/<td>/g) || []).length;
    assert.strictEqual(celdas, encabezados, `${encabezados} columnas y ${celdas} celdas`);
});
