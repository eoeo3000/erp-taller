// Qué clave se acepta y cuál no.
//
// Dos contratos en tensión, como en todo lo demás de acceso:
//   1. Rechazar una clave que ya está en un volcado público — está en los diccionarios que
//      se usan para adivinar, así que el largo mínimo no la salva.
//   2. **Nunca dejar a alguien sin poder elegir su clave** porque un servicio de terceros
//      está caído. Eso lo deja sin entrar a trabajar, que es un daño inmediato y cierto
//      contra un riesgo que no lo es.
//
// Y una regla que no se negocia: la clave NO sale de este servidor. Se consulta por
// k-anonimato — salen 5 caracteres hexadecimales del SHA-1 y nada más.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { revisarClave, vecesFiltrada, LARGO_MINIMO } = require('../src/servicios/claves');

const sha1 = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex').toUpperCase();

// Una API falsa que registra QUÉ se le pidió — que es la mitad de lo que hay que probar.
function apiFalsa({ filtradas = {}, estado = 200, demora = 0, revienta = false } = {}) {
    const pedidos = [];
    const traer = async (url, opciones) => {
        pedidos.push(url);
        if (revienta) throw new Error('getaddrinfo ENOTFOUND');
        if (demora) {
            await new Promise((listo, falla) => {
                const t = setTimeout(listo, demora);
                opciones?.signal?.addEventListener('abort', () => { clearTimeout(t); falla(new Error('abortada')); });
            });
        }
        const prefijo = url.split('/').pop();
        const lineas = Object.entries(filtradas)
            .map(([clave, veces]) => [sha1(clave), veces])
            .filter(([h]) => h.startsWith(prefijo))
            .map(([h, veces]) => `${h.slice(5)}:${veces}`);
        // Relleno, como el servicio real: la respuesta trae cientos de sufijos que no son.
        lineas.push('0000000000000000000000000000000000A:3');
        return { ok: estado === 200, status: estado, text: async () => lineas.join('\r\n') };
    };
    return { traer, pedidos };
}

test('una clave corta se rechaza sin salir a la red', async () => {
    const api = apiFalsa();
    const r = await revisarClave('corta12', { traer: api.traer });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, new RegExp(`${LARGO_MINIMO} caracteres`));
    assert.strictEqual(api.pedidos.length, 0, 'no tiene sentido preguntar por algo ya rechazado');
});

test('una clave que está en un volcado público se rechaza', async () => {
    const api = apiFalsa({ filtradas: { 'Password123': 2918 } });
    const r = await revisarClave('Password123', { traer: api.traer });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /listas públicas/);
});

test('el texto del rechazo NO dice que le robaron la cuenta', async () => {
    // Es otra cosa y manda a otro lado: una clave filtrada se arregla eligiendo otra, no
    // revisando el correo ni cambiando nada más. Confundirlas asusta sin motivo.
    const api = apiFalsa({ filtradas: { 'Password123': 10 } });
    const { error } = await revisarClave('Password123', { traer: api.traer });
    assert.match(error, /No significa que te hayan robado nada/i);
    assert.ok(!/robaron|hackea|vulnerad/i.test(error), `el texto alarma de más: ${error}`);
});

test('una clave que no está en ningún volcado pasa', async () => {
    const api = apiFalsa({ filtradas: { 'Password123': 2918 } });
    assert.deepStrictEqual(await revisarClave('caracol-vereda-91', { traer: api.traer }), { ok: true });
});

test('NUNCA sale la clave ni su hash completo: solo 5 caracteres', async () => {
    // La regla que hace que esto sea aceptable. Sin ella, revisar una clave contra un
    // servicio de terceros sería bastante peor que el problema que resuelve.
    const clave = 'caracol-vereda-91';
    const api = apiFalsa();
    await revisarClave(clave, { traer: api.traer });

    const [url] = api.pedidos;
    const prefijo = url.split('/').pop();
    assert.strictEqual(prefijo.length, 5, 'tiene que salir un prefijo de 5 y nada más');
    assert.strictEqual(prefijo, sha1(clave).slice(0, 5));
    assert.ok(!url.includes(clave), 'la clave no puede ir en la URL');
    assert.ok(!url.includes(sha1(clave)), 'el hash completo tampoco');
    assert.ok(!url.includes(sha1(clave).slice(5, 20)), 'ni un pedazo del sufijo');
});

test('si el servicio se cae, la clave se acepta igual', async () => {
    // Falla hacia el lado de dejar pasar, igual que el correo. Que HIBP esté caído no puede
    // ser el motivo de que alguien quede sin entrar a trabajar.
    const api = apiFalsa({ revienta: true });
    const r = await revisarClave('caracol-vereda-91', { traer: api.traer });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.sinRevisar, true, 'tiene que quedar dicho que no se pudo revisar');
});

test('si el servicio responde un error, tampoco bloquea', async () => {
    const api = apiFalsa({ estado: 503 });
    const r = await revisarClave('caracol-vereda-91', { traer: api.traer });
    assert.deepStrictEqual(r, { ok: true, sinRevisar: true });
});

test('si el servicio tarda demasiado, se corta y se deja pasar', async () => {
    // Sin corte, un servicio lento deja colgada la pantalla de alguien eligiendo su clave.
    const api = apiFalsa({ demora: 500 });
    const empezo = Date.now();
    const r = await revisarClave('caracol-vereda-91', { traer: api.traer, esperaMs: 60 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.sinRevisar, true);
    assert.ok(Date.now() - empezo < 400, 'tiene que cortar, no esperar a que conteste');
});

test('«no se pudo averiguar» y «no está filtrada» no se confunden', async () => {
    // null ≠ 0. Si se confundieran, un servicio caído se leería como «esta clave está
    // limpia», que es la lectura más peligrosa de las dos.
    const caida = apiFalsa({ revienta: true });
    assert.strictEqual(await vecesFiltrada('x', { traer: caida.traer }), null);
    const sana = apiFalsa();
    assert.strictEqual(await vecesFiltrada('caracol-vereda-91', { traer: sana.traer }), 0);
});
