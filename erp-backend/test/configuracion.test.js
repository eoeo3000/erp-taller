// Las dos validaciones de arranque: que las URLs de los correos sirvan, y que el correo esté
// bien configurado.
//
// Las dos existen por el mismo motivo: eran errores que el backend aceptaba sin una queja y
// que se descubrían días después, cuando alguien no recibía su invitación o abría un link
// muerto. Un error de configuración que no se nota al arrancar se paga en horas de
// adivinanza.
const test = require('node:test');
const assert = require('node:assert');
const { urlUsable, avisarUrlsInvalidas } = require('../src/config/urls');
const { revisarConfiguracion } = require('../src/config/mailer');

test('los dos valores reales que costaron una tarde cada uno se rechazan', async (t) => {
    // Este es el corazón de la prueba: no son casos inventados, son los dos valores que
    // estuvieron puestos en SPA_URL en Render.
    await t.test('falta el nombre del servicio: el host queda con una etiqueta vacía', () => {
        // El que se escapa de una validación ingenua: `new URL()` LO ACEPTA y deja el
        // hostname en ".onrender.com". Si esto se rompe, volvemos a mandar links muertos.
        assert.strictEqual(new URL('https://.onrender.com').hostname, '.onrender.com', 'new URL lo acepta');
        assert.strictEqual(urlUsable('https://.onrender.com'), false);
    });
    await t.test('se pegó la línea entera del panel en el valor', () => {
        assert.strictEqual(urlUsable('SPA_URL = https://erp-taller-web.onrender.com'), false);
    });
});

test('una URL normal se acepta, con y sin puerto, con y sin ruta', () => {
    for (const buena of [
        'https://erp-taller-web.onrender.com',
        'https://erp-taller-web.onrender.com/',
        'http://localhost:5173',
        'http://127.0.0.1:5000',
        'https://taller.cl/app',
    ]) {
        assert.strictEqual(urlUsable(buena), true, `debería aceptar ${buena}`);
    }
});

test('lo que no es una URL usable se rechaza', () => {
    for (const mala of [
        '', null, undefined, '   ',
        'erp-taller-web.onrender.com',          // sin esquema: no parsea
        'ftp://taller.cl',                      // un link así no lo abre un navegador
        'javascript:alert(1)',                  // y esto además no debería viajar en un correo
        'https://onrender..com',                // etiqueta vacía al medio
        'https://taller.cl.',                   // punto final
    ]) {
        assert.strictEqual(urlUsable(mala), false, `debería rechazar ${JSON.stringify(mala)}`);
    }
});

test('avisarUrlsInvalidas nombra cuáles están malas y no corta el arranque', () => {
    // Que devuelva los nombres en vez de lanzar es deliberado: una URL mala rompe los links
    // de los correos, no la app entera, y dejar el sistema abajo sería peor que el problema.
    const malas = avisarUrlsInvalidas({
        API_URL: 'https://erp-taller-backend.onrender.com',
        SPA_URL: 'https://.onrender.com',
        PWA_OPERATIVA_URL: 'SPA_URL = https://algo.onrender.com',
        PWA_CLIENTE_URL: 'http://localhost:5175',
    });
    assert.deepStrictEqual(malas.sort(), ['PWA_OPERATIVA_URL', 'SPA_URL']);
});

test('con todo bien configurado, avisarUrlsInvalidas no dice nada', () => {
    assert.deepStrictEqual(avisarUrlsInvalidas({
        API_URL: 'https://a.onrender.com', SPA_URL: 'https://b.onrender.com',
        PWA_OPERATIVA_URL: 'https://c.onrender.com', PWA_CLIENTE_URL: 'https://d.onrender.com',
    }), []);
});

// --- correo ---

const codigos = (env) => revisarConfiguracion(env).map((h) => h.codigo).sort();
const COMPLETO = {
    BREVO_SMTP_USER: 'a31194001@smtp-brevo.com', BREVO_API_KEY: 'xsmtpsib-lo-que-sea',
    EMAIL_FROM: 'contacto@taller.cl', EMAIL_REPLY_TO: 'contacto@taller.cl',
};

test('una configuración de correo completa no genera ningún aviso', () => {
    assert.deepStrictEqual(codigos(COMPLETO), []);
});

test('sin BREVO_API_KEY se avisa como error y no se sigue revisando', () => {
    // No tiene sentido opinar del remitente cuando no va a salir ningún correo.
    const hallazgos = revisarConfiguracion({ ...COMPLETO, BREVO_API_KEY: '' });
    assert.deepStrictEqual(hallazgos.map((h) => h.codigo), ['sin-clave']);
    assert.strictEqual(hallazgos[0].nivel, 'error');
});

test('sin EMAIL_FROM se avisa como error: cada correo iba a fallar de a uno', () => {
    // El síntoma sin esto: los nueve `from` del proyecto arman `"ERP" <undefined>` y el envío
    // falla correo por correo, sin que nada lo anuncie al arrancar.
    const hallazgos = revisarConfiguracion({ ...COMPLETO, EMAIL_FROM: '' });
    assert.ok(hallazgos.some((h) => h.codigo === 'sin-remitente' && h.nivel === 'error'));
});

test('un EMAIL_FROM de dominio personal se avisa, pero solo como aviso', () => {
    // Es el estado real de hoy y el correo sale: no es un error, es una deuda. Brevo reescribe
    // el remitente a uno suyo y el cliente ve una dirección de máquina.
    for (const personal of ['thexeos00@gmail.com', 'alguien@hotmail.com', 'ALGUIEN@Outlook.COM']) {
        const hallazgos = revisarConfiguracion({ ...COMPLETO, EMAIL_FROM: personal });
        const encontrado = hallazgos.find((h) => h.codigo === 'remitente-personal');
        assert.ok(encontrado, `debería avisar por ${personal}`);
        assert.strictEqual(encontrado.nivel, 'aviso');
    }
});

test('un dominio propio no se confunde con uno personal', () => {
    // Que no salte con algo como `taller-gmail.cl` ni con un subdominio.
    for (const propio of ['contacto@taller.cl', 'ot@mail.taller.cl', 'hola@no-es-gmail.com']) {
        assert.deepStrictEqual(codigos({ ...COMPLETO, EMAIL_FROM: propio }), []);
    }
});

test('faltar BREVO_SMTP_USER avisa pero no rompe: hay un respaldo en el código', () => {
    // A propósito: exigirla de golpe dejaría sin correo a un despliegue que todavía no la
    // definió, y lo primero que se rompería son las invitaciones.
    const hallazgos = revisarConfiguracion({ ...COMPLETO, BREVO_SMTP_USER: '' });
    const encontrado = hallazgos.find((h) => h.codigo === 'smtp-user-respaldo');
    assert.ok(encontrado);
    assert.strictEqual(encontrado.nivel, 'aviso');
});

test('ningún aviso de correo incluye el valor de BREVO_API_KEY', () => {
    // La regla de CLAUDE.md: un secreto no se registra ni a medias. Había un console.log con
    // sus primeros caracteres en cada arranque.
    const clave = 'xsmtpsib-secreto-que-no-debe-aparecer';
    for (const env of [COMPLETO, { ...COMPLETO, BREVO_API_KEY: clave, EMAIL_FROM: '' }, { ...COMPLETO, BREVO_API_KEY: clave, EMAIL_FROM: 'x@gmail.com' }]) {
        const texto = revisarConfiguracion({ ...env, BREVO_API_KEY: clave }).map((h) => h.mensaje).join(' ');
        assert.ok(!texto.includes('xsmtpsib'), 'no puede aparecer ni el prefijo de la clave');
        assert.ok(!texto.includes(clave));
    }
});
