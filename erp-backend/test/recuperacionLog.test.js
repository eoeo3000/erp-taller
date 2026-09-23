// Qué queda escrito en el log cuando alguien pide recuperar su clave.
//
// Estas pruebas nacen de un caso real que costó horas: la recuperación "no llegaba" y desde
// afuera era imposible distinguir entre las tres razones posibles, porque la respuesta al
// navegador es siempre idéntica a propósito (si no, el formulario se vuelve una forma de
// averiguar qué correos tienen cuenta). El diagnóstico tiene que salir del log del servidor.
//
// Hay dos contratos que se prueban juntos porque están en tensión:
//   1. El log distingue las tres razones. Si no, no sirve de nada.
//   2. El log NUNCA trae la dirección completa ni el token de reset. El log de Render lo lee
//      cualquiera con acceso al panel: una dirección completa deja ahí la lista de quién
//      tiene cuenta, y el token es una credencial viva por 60 minutos.
const test = require('node:test');
const assert = require('node:assert');
const { ObjectId } = require('bson');

// Se sustituyen los módulos ANTES de requerir el controlador, que los desestructura al
// cargarse. `node --test` corre cada archivo en su propio proceso, así que no contamina.
let cuenta = null;
let enviados = [];
let fallarEnvio = null;

for (const [ruta, exports] of [
    ['../src/models/Usuario', () => ({
        findOne: async ({ email, estado }) => (cuenta && cuenta.email === email && cuenta.estado === estado ? { ...cuenta } : null),
        updateOne: async () => ({}),
    })],
    ['../src/config/mailer', {
        sendMail: async (mensaje) => {
            if (fallarEnvio) throw new Error(fallarEnvio);
            enviados.push(mensaje);
            return { messageId: 'x' };
        },
    }],
]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports };
}

const authController = require('../src/controllers/authController');

// Corre `recuperar` capturando lo que escribe en el log.
async function pedirRecuperacion(email) {
    cuenta = cuenta || null;
    enviados = [];
    const lineas = [];
    const log = console.log;
    const warn = console.warn;
    console.log = (...a) => lineas.push(a.join(' '));
    console.warn = (...a) => lineas.push(a.join(' '));

    let cuerpo = null;
    const res = {
        json: (d) => { cuerpo = d; return res; },
        status: (c) => { cuerpo = { ...(cuerpo || {}), _status: c }; return res; },
    };
    try {
        await authController.recuperar({ db: {}, entorno: 'produccion', body: { email } }, res);
    } finally {
        console.log = log;
        console.warn = warn;
    }
    return { lineas, log: lineas.join('\n'), cuerpo, enviados };
}

const cuentaActiva = (email, conClave) => ({
    _id: new ObjectId(), email, nombre: 'Eliseo', estado: 'activo',
    ...(conClave ? { passwordHash: 'hash-cualquiera' } : {}),
});

const RESPUESTA_UNICA = 'Si el correo está registrado, te llegará un mensaje con las instrucciones.';

test('cuando no existe la cuenta, el log lo dice', async () => {
    cuenta = null;
    const { log, cuerpo } = await pedirRecuperacion('nadie@hotmail.com');
    assert.match(log, /ninguna cuenta activa/);
    assert.strictEqual(cuerpo.mensaje, RESPUESTA_UNICA, 'la respuesta al navegador no cambia');
});

test('cuando la cuenta existe pero es una invitación sin activar, el log lo distingue', async () => {
    // El caso más confuso de los tres: la cuenta está, pero no tiene clave que reponer. Lo
    // que corresponde es reenviar la invitación, no insistir con la recuperación.
    cuenta = cuentaActiva('eliseo@hotmail.com', false);
    const { log, cuerpo, enviados } = await pedirRecuperacion('eliseo@hotmail.com');
    assert.match(log, /invitación sin activar/);
    assert.strictEqual(enviados.length, 0, 'no se manda correo en este caso');
    assert.strictEqual(cuerpo.mensaje, RESPUESTA_UNICA);
});

test('cuando el correo sale, el log lo dice y el link apunta al SPA', async () => {
    cuenta = cuentaActiva('eliseo@hotmail.com', true);
    const { log, enviados } = await pedirRecuperacion('eliseo@hotmail.com');
    assert.match(log, /correo entregado al proveedor/);
    assert.strictEqual(enviados.length, 1);
    const { SPA_URL } = require('../src/config/urls');
    assert.ok(enviados[0].text.includes(`${SPA_URL}/restablecer?token=`), 'el link tiene que salir de SPA_URL');
});

test('cuando el proveedor rechaza el envío, el log trae el motivo', async () => {
    // Antes esto se veía igual que un envío exitoso desde el punto de vista de quien pedía.
    cuenta = cuentaActiva('eliseo@hotmail.com', true);
    fallarEnvio = 'Invalid login: 535 authentication failed';
    const { log, cuerpo } = await pedirRecuperacion('eliseo@hotmail.com');
    fallarEnvio = null;
    assert.match(log, /FALLÓ el envío/);
    assert.match(log, /535 authentication failed/);
    assert.strictEqual(cuerpo.mensaje, RESPUESTA_UNICA, 'tampoco se le cuenta a quien pidió');
});

test('un formulario enviado vacío también deja rastro', async () => {
    cuenta = null;
    const { log } = await pedirRecuperacion('');
    assert.match(log, /pedida sin correo/);
});

test('el log NUNCA trae la dirección completa, en ninguna de las ramas', async () => {
    // La regla que hace que esto sea publicable en un log compartido: el dominio sirve para
    // diagnosticar (el error típico es escribir el correo de otra cuenta), la parte local no.
    const casos = [
        { preparar: () => { cuenta = null; }, email: 'eliseo.perez@hotmail.com' },
        { preparar: () => { cuenta = cuentaActiva('eliseo.perez@hotmail.com', false); }, email: 'eliseo.perez@hotmail.com' },
        { preparar: () => { cuenta = cuentaActiva('eliseo.perez@hotmail.com', true); }, email: 'eliseo.perez@hotmail.com' },
    ];
    for (const caso of casos) {
        caso.preparar();
        const { log } = await pedirRecuperacion(caso.email);
        assert.ok(!log.includes('eliseo.perez'), `se filtró la parte local del correo: ${log}`);
        assert.ok(!log.includes(caso.email), `se filtró el correo completo: ${log}`);
        assert.match(log, /@hotmail\.com/, 'el dominio sí tiene que estar, es lo que sirve para diagnosticar');
    }
});

test('el token de reset no se escribe en el log', async () => {
    // Es una credencial viva por 60 minutos: quien la lea en el log puede cambiar la clave
    // de esa cuenta.
    cuenta = cuentaActiva('eliseo@hotmail.com', true);
    const { log, enviados } = await pedirRecuperacion('eliseo@hotmail.com');
    const token = enviados[0].text.match(/token=([a-f0-9]+)/)[1];
    assert.ok(token.length >= 32, 'el token debería ser largo');
    assert.ok(!log.includes(token), 'el token no puede aparecer en el log');
});
