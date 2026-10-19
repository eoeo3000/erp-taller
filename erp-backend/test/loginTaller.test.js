// Entrar a un taller que no es el principal.
//
// Todo lo que ocurre ANTES de tener sesión —entrar, recuperar la clave, activar una
// invitación— resolvía al taller por defecto, porque el taller sale del prefijo del token y
// ahí todavía no hay token. Resultado: el correo de alguien de otro taller se buscaba en la
// base del principal, no se encontraba, y esa persona no podía entrar NUNCA. Un cliente
// recién instalado quedaba afuera en cuanto se le vencía la sesión de la instalación.
//
// La salida es la misma que ya usan el prefijo del token y el enlace de instalación: el slug
// viaja como pista y no autoriza nada. Lo que se prueba acá es justamente eso — que sirva
// para encontrar tu base, y que no sirva para entrar a la de otro.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { ObjectId } = require('bson');
const { hashPassword } = require('../src/utils/password');
const { separarPrefijo } = require('../src/utils/tokens');

const CLAVE = 'una-clave-larga-123';
const REGISTRADOS = { principal: 'activo', 'taller-lopez': 'activo', 'taller-suspendido': 'suspendido' };

// Cuentas por base: el mismo correo existe en dos talleres distintos, que es el caso que
// de verdad distingue "buscó en la base correcta" de "buscó en cualquiera".
let cuentasPorBase = {};
let sesionesCreadas = [];

const conexionDe = (slug) => ({ name: `base-${slug}`, slug });

for (const [ruta, exports] of [
    ['../src/config/conexiones', {
        resolverTaller: (slug) => {
            const limpio = String(slug || '').trim().toLowerCase();
            return REGISTRADOS[limpio] === 'activo' ? limpio : null;
        },
        obtenerConexion: (entorno, slug) => {
            if (!REGISTRADOS[slug]) throw new Error(`Taller desconocido: ${slug}`);
            if (REGISTRADOS[slug] !== 'activo') throw new Error(`El taller "${slug}" está suspendido`);
            return conexionDe(slug);
        },
        conexionDisponible: () => true,
        inicializarConexiones: async () => {},
        conexionDeControl: () => null,
    }],
    ['../src/models/Usuario', (conn) => ({
        findOne: async (filtro) => (cuentasPorBase[conn.slug] || []).find((u) => u.email === filtro.email) || null,
        updateOne: async () => ({}),
        exists: async () => ((cuentasPorBase[conn.slug] || []).length ? { _id: 1 } : null),
    })],
    ['../src/models/SesionStaff', (conn) => ({
        create: async (d) => { sesionesCreadas.push({ base: conn.slug, ...d }); return d; },
        updateMany: async () => ({}), updateOne: async () => ({}), findOne: async () => null,
    })],
]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports };
}

const resolverEntorno = require('../src/middlewares/entorno');
const authController = require('../src/controllers/authController');

function levantar() {
    const app = express();
    app.use(express.json());
    app.use(resolverEntorno);
    app.post('/api/auth/login', authController.login);
    app.get('/api/auth/yo', authController.yo);
    return new Promise((listo) => {
        const servidor = app.listen(0, () => listo({ servidor, base: `http://127.0.0.1:${servidor.address().port}` }));
    });
}

async function entrar({ email, password = CLAVE, taller, porQuery = false }) {
    const { servidor, base } = await levantar();
    try {
        const url = `${base}/api/auth/login${porQuery && taller ? `?taller=${encodeURIComponent(taller)}` : ''}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(taller && !porQuery ? { 'X-Taller': taller } : {}) },
            body: JSON.stringify({ email, password }),
        });
        return { estado: resp.status, cuerpo: await resp.json().catch(() => null) };
    } finally { servidor.close(); }
}

test.before(async () => {
    const hash = await hashPassword(CLAVE);
    // El MISMO correo en dos talleres: así "entró" solo puede significar "en la base correcta".
    const cuenta = (tallerId) => ({
        _id: new ObjectId(), nombre: `Jefa de ${tallerId}`, email: 'jefa@taller.cl',
        passwordHash: hash, estado: 'activo', rol: 'administrador', tallerId,
    });
    cuentasPorBase = {
        principal: [cuenta('principal')],
        'taller-lopez': [cuenta('taller-lopez')],
    };
});
test.beforeEach(() => { sesionesCreadas = []; });

test('sin pedir taller se entra al principal, como siempre', async () => {
    const { estado, cuerpo } = await entrar({ email: 'jefa@taller.cl' });
    assert.strictEqual(estado, 200);
    assert.strictEqual(separarPrefijo(cuerpo.token).taller, 'principal');
    assert.deepStrictEqual(sesionesCreadas.map((s) => s.base), ['principal']);
});

test('pidiendo su taller, la persona de OTRO taller entra — y en SU base', async () => {
    // El agujero que esto cierra. Antes esta misma llamada buscaba el correo en la base del
    // principal; como ahí hay otra cuenta con el mismo correo, hasta habría "entrado"… al
    // taller equivocado.
    const { estado, cuerpo } = await entrar({ email: 'jefa@taller.cl', taller: 'taller-lopez' });
    assert.strictEqual(estado, 200);
    assert.strictEqual(cuerpo.usuario.nombre, 'Jefa de taller-lopez', 'buscó en la base equivocada');
    assert.strictEqual(separarPrefijo(cuerpo.token).taller, 'taller-lopez');
    assert.deepStrictEqual(sesionesCreadas.map((s) => s.base), ['taller-lopez'], 'la sesión va en SU base');
});

test('por la query también, que es como llega el link del correo', async () => {
    const { cuerpo } = await entrar({ email: 'jefa@taller.cl', taller: 'taller-lopez', porQuery: true });
    assert.strictEqual(cuerpo.usuario.nombre, 'Jefa de taller-lopez');
});

test('el slug NO es una credencial: sin la clave correcta no entra nadie', async () => {
    // Lo que convierte esto en seguro: apuntar a la base de otro te lleva a un lugar donde
    // tu clave no vale. El slug elige dónde buscar, nunca si pasas.
    const { estado } = await entrar({ email: 'jefa@taller.cl', password: 'la-que-no-es', taller: 'taller-lopez' });
    assert.strictEqual(estado, 401);
    assert.strictEqual(sesionesCreadas.length, 0);
});

test('un taller inventado cae en la base por defecto, no lanza ni filtra', async () => {
    // Si respondiera distinto para un slug inexistente, esto sería un buscador de qué
    // clientes existen. Cae al principal, donde la credencial decide.
    const { estado, cuerpo } = await entrar({ email: 'jefa@taller.cl', taller: 'taller-fantasma' });
    assert.strictEqual(estado, 200, 'la credencial del principal sí es válida');
    assert.strictEqual(cuerpo.usuario.nombre, 'Jefa de principal');
});

test('un taller SUSPENDIDO tampoco se resuelve', async () => {
    const { cuerpo } = await entrar({ email: 'jefa@taller.cl', taller: 'taller-suspendido' });
    assert.strictEqual(cuerpo.usuario.nombre, 'Jefa de principal', 'no debe abrir la base del suspendido');
});

test('alguien de un taller no encuentra su cuenta en la base de otro', async () => {
    // El caso inverso y el que prueba que la separación es real: el correo que existe solo
    // en taller-lopez no sirve apuntando al principal.
    cuentasPorBase['taller-lopez'].push({
        _id: new ObjectId(), nombre: 'Solo de López', email: 'solo@lopez.cl',
        passwordHash: cuentasPorBase['taller-lopez'][0].passwordHash, estado: 'activo', rol: 'administrador', tallerId: 'taller-lopez',
    });
    assert.strictEqual((await entrar({ email: 'solo@lopez.cl' })).estado, 401, 'no existe en el principal');
    assert.strictEqual((await entrar({ email: 'solo@lopez.cl', taller: 'taller-lopez' })).estado, 200);
});

test('GET /auth/yo mira la base del taller pedido', async () => {
    // Si no, un taller recién creado y todavía sin cuentas le diría "requiere instalación" a
    // quien pregunta desde otro, o al revés.
    const { servidor, base } = await levantar();
    try {
        const sinCuentas = await fetch(`${base}/api/auth/yo`, { headers: { 'X-Taller': 'taller-suspendido' } }).then((r) => r.json());
        assert.strictEqual(sinCuentas.usuario, null);
        const conCuentas = await fetch(`${base}/api/auth/yo`, { headers: { 'X-Taller': 'taller-lopez' } }).then((r) => r.json());
        assert.ok(!conCuentas.requiereInstalacion, 'taller-lopez ya tiene cuentas');
    } finally { servidor.close(); }
});

test('CON sesión válida, la cabecera NO puede saltar a otra base', async () => {
    // El candado que hace que esto no sea un agujero: la pista solo se mira cuando NO hay
    // sesión. Con sesión manda el prefijo del token, que ya resolvió `resolverEntorno`.
    //
    // Se prueba sobre `login` y no sobre `yo` a propósito: `yo` responde y corta en cuanto
    // ve una sesión, así que nunca llega a consultar la base pedida — la prueba parecería
    // verde con el candado quitado. `login` sí la consulta, y es donde se notaría.
    const app = express();
    app.use(express.json());
    app.use(resolverEntorno);
    // Como lo deja `identificar` cuando el token de sesión era válido: la persona ya está
    // adentro, y su taller es el que dijo el prefijo de su token (acá, el principal).
    app.use((req, res, siguiente) => {
        req.usuario = { _id: new ObjectId(), nombre: 'Ya adentro', tallerId: req.taller };
        siguiente();
    });
    app.post('/api/auth/login', authController.login);

    const servidor = await new Promise((listo) => { const s = app.listen(0, () => listo(s)); });
    try {
        const r = await fetch(`http://127.0.0.1:${servidor.address().port}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Taller': 'taller-lopez' },
            body: JSON.stringify({ email: 'jefa@taller.cl', password: CLAVE }),
        }).then((x) => x.json());

        // Las dos bases tienen ese correo. Sin el candado, la cabecera habría abierto la de
        // López y devuelto SU cuenta y un token con SU prefijo.
        assert.strictEqual(r.usuario.nombre, 'Jefa de principal', 'la cabecera abrió la base de otro taller');
        assert.strictEqual(separarPrefijo(r.token).taller, 'principal');
    } finally { servidor.close(); }
});
