// ¿En qué taller está esta cuenta?
//
// Nace de un caso real: la recuperación de clave decía «ninguna cuenta con ese correo en este
// taller (@hotmail.com, taller principal)» y con eso quedaban dos explicaciones igual de
// plausibles —no existe, o existe en otro taller y el navegador apunta al principal— que se
// arreglan de forma distinta. Lo que se prueba acá es que la respuesta diga CUÁL de las dos.
const test = require('node:test');
const assert = require('node:assert');
const { buscarCuenta, queHacer } = require('../src/servicios/buscarCuenta');

// Bases falsas: slug -> lista de usuarios. `getUsuario(conexion)` devuelve algo con findOne,
// igual que el modelo de verdad.
function bases(porTaller, caidos = []) {
    const talleres = Object.keys(porTaller).map((slug) => ({ slug, conexion: { slug } }));
    const getUsuario = (conexion) => ({
        findOne: async ({ email }) => {
            if (caidos.includes(conexion.slug)) throw new Error('no se pudo conectar');
            return (porTaller[conexion.slug] || []).find((u) => u.email === email) || null;
        },
    });
    return { talleres, getUsuario };
}

const activa = (email) => ({ email, nombre: 'Eliseo', estado: 'activo', passwordHash: 'hash' });

test('encuentra la cuenta en el taller donde SÍ está', async () => {
    // El caso que no se podía cerrar mirando el log: el navegador buscaba en principal y la
    // cuenta estaba en otro cliente.
    const { talleres, getUsuario } = bases({
        principal: [activa('otro@hotmail.com')],
        'taller-lopez': [activa('eliseo@hotmail.com')],
    });
    const r = await buscarCuenta('Eliseo@Hotmail.com', talleres, getUsuario);

    assert.strictEqual(r.email, 'eliseo@hotmail.com', 'normaliza igual que el login');
    assert.deepStrictEqual(r.hallazgos.map((h) => h.taller), ['taller-lopez']);
    const consejo = queHacer(r, 'principal');
    assert.match(consejo, /taller-lopez/);
    assert.match(consejo, /\?taller=taller-lopez/, 'tiene que decir qué enlace mandar');
});

test('cuando no está en ninguno, dice que hay que invitar', async () => {
    const { talleres, getUsuario } = bases({ principal: [], 'taller-lopez': [] });
    const r = await buscarCuenta('nadie@hotmail.com', talleres, getUsuario);
    assert.deepStrictEqual(r.hallazgos, []);
    assert.match(queHacer(r, 'principal'), /invitarlo/);
});

test('una base caída no corta la búsqueda, y la respuesta avisa que está incompleta', async () => {
    // El que se busca puede estar en otro taller. Y si no se encontró en ninguno, decir
    // «no existe» con una base sin revisar sería mandar a invitar una cuenta que ya existe.
    const { talleres, getUsuario } = bases({ principal: [], 'taller-lopez': [] }, ['taller-lopez']);
    const r = await buscarCuenta('nadie@hotmail.com', talleres, getUsuario);

    assert.deepStrictEqual(r.fallidos.map((f) => f.taller), ['taller-lopez']);
    assert.match(queHacer(r, 'principal'), /incompleta/);
});

test('distingue la invitación sin activar de la cuenta que puede entrar', async () => {
    // Las dos "existen" y mandan a lugares distintos: una a reenviar la invitación, la otra
    // a mirar el envío del correo.
    const { talleres, getUsuario } = bases({
        principal: [{ email: 'nueva@hotmail.com', nombre: 'Nueva', estado: 'activo' }],
    });
    const r = await buscarCuenta('nueva@hotmail.com', talleres, getUsuario);
    assert.strictEqual(r.hallazgos[0].invitacionSinActivar, true);
    assert.strictEqual(r.hallazgos[0].puedeEntrar, false);
    assert.match(queHacer(r, 'principal'), /reenviarle la invitación/);
});

test('una cuenta revocada se nombra como tal', async () => {
    const { talleres, getUsuario } = bases({
        principal: [{ ...activa('fuera@hotmail.com'), estado: 'revocado' }],
    });
    const r = await buscarCuenta('fuera@hotmail.com', talleres, getUsuario);
    assert.strictEqual(r.hallazgos[0].puedeEntrar, false);
    assert.match(queHacer(r, 'principal'), /revocado/);
});

test('NUNCA devuelve credenciales', async () => {
    // Esto se va a pegar en un chat o en un ticket. El hash de la clave y el token de la PWA
    // son credenciales; el token además entra a la app sin clave.
    const { talleres, getUsuario } = bases({
        principal: [{ ...activa('eliseo@hotmail.com'), token: 'token-de-la-pwa', passwordHash: 'hash-secreto' }],
    });
    const r = await buscarCuenta('eliseo@hotmail.com', talleres, getUsuario);
    const texto = JSON.stringify(r);
    assert.ok(!texto.includes('hash-secreto'), 'no puede salir el passwordHash');
    assert.ok(!texto.includes('token-de-la-pwa'), 'no puede salir el token de la PWA');
});
