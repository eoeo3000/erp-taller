// Dar de alta e instalar un taller nuevo (etapa 3 de docs/multi-taller.md), por HTTP.
//
// El problema que resuelve esta etapa: quien va a instalar un taller recién dado de alta no
// tiene sesión, y sin sesión el backend resuelve al taller por defecto. Sin el enlace, el
// dueño de un cliente nuevo caería sobre la base del taller PRINCIPAL. De ahí que la prueba
// que más importa acá sea "se instaló en la base correcta".
//
// Y la segunda: un enlace que quedó en un correo viejo NO puede servir para crearse un
// administrador dentro de un taller que ya está operando.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { ObjectId } = require('bson');
const { hashToken, separarPrefijo } = require('../src/utils/tokens');

const CLAVE_BUENA = 'clave-de-instalacion-de-un-solo-uso';
const EN_UNA_SEMANA = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

// --- dobles ---
let talleres = [];
let usuariosPorBase = {};     // nombre de base -> [usuarios]
let aprovisionadas = [];      // bases sobre las que se construyeron índices

const docTaller = (d) => ({
    ...d,
    save: async function () {
        const i = talleres.findIndex((t) => t.slug === this.slug);
        if (i >= 0) talleres[i] = { ...talleres[i], instalacionHash: this.instalacionHash, instalacionExpira: this.instalacionExpira };
        return this;
    },
});

// Cada "conexión" es un marcador con el nombre de su base: así se puede afirmar en qué base
// terminó escribiéndose la cuenta, que es el centro de esta etapa.
const conexionDe = (nombre) => ({ name: nombre });

for (const [ruta, exports] of [
    ['../src/models/Taller', () => ({
        findOne: async ({ slug }) => {
            const t = talleres.find((x) => x.slug === slug);
            return t ? docTaller({ ...t }) : null;
        },
    })],
    ['../src/models/Usuario', (conn) => ({
        exists: async (filtro) => {
            const lista = usuariosPorBase[conn.name] || [];
            return lista.some((u) => (filtro.passwordHash ? !!u.passwordHash : true)) ? { _id: new ObjectId() } : null;
        },
        create: async (d) => {
            const nuevo = { _id: new ObjectId(), ...d };
            (usuariosPorBase[conn.name] = usuariosPorBase[conn.name] || []).push(nuevo);
            return nuevo;
        },
        findOne: async () => null,
    })],
    ['../src/models/SesionStaff', (conn) => ({ create: async (d) => ({ _id: new ObjectId(), base: conn.name, ...d }) })],
    ['../src/config/conexiones', {
        conexionDeControl: () => ({ name: 'control' }),
        obtenerConexion: (entorno, slug) => {
            const t = talleres.find((x) => x.slug === slug);
            if (!t) throw new Error(`Taller desconocido: ${slug}`);
            if (t.estado !== 'activo') throw new Error(`El taller "${slug}" está ${t.estado} y no puede operar`);
            return conexionDe(`base-${slug}`);
        },
        refrescarRegistro: async () => {},
        hayBaseDeControl: () => true,
    }],
    ['../src/servicios/aprovisionamiento', {
        aprovisionarTaller: async (conn) => {
            aprovisionadas.push(conn.name);
            return { base: conn.name, modelos: ['OT', 'Solicitud', 'Usuario'], fallidos: [] };
        },
    }],
]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports };
}

const contratoRespuesta = require('../src/middlewares/respuestas');
const instalacionController = require('../src/controllers/instalacionController');

function levantar() {
    const app = express();
    app.use(express.json());
    app.use(contratoRespuesta);
    // Como lo deja middlewares/entorno.js cuando NO hay sesión: el taller por defecto. Es
    // justamente la situación de quien va a instalar un taller nuevo.
    app.use((req, res, siguiente) => { req.db = conexionDe('base-principal'); req.taller = 'principal'; siguiente(); });
    app.post('/api/instalacion', instalacionController.instalar);
    return new Promise((listo) => {
        const servidor = app.listen(0, () => listo({ servidor, base: `http://127.0.0.1:${servidor.address().port}` }));
    });
}

// El controlador escribe en consola al aprovisionar ("índices listos en…"). Eso tiene que
// quedar fuera de la salida del proceso de prueba: `node --test` habla con sus hijos por un
// protocolo binario sobre stdout, y un texto suelto —más todavía con emoji, que ocupa varios
// bytes y puede partirse entre dos trozos— le corrompe el marco cada tantas corridas. Se veía
// como un fallo intermitente de 1 en 5 con un error de deserialización que no tenía nada que
// ver con lo que esta prueba verifica.
async function sinRuidoEnConsola(fn) {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};
    try { return await fn(); } finally { console.log = log; console.error = error; }
}

async function instalar(cuerpo) {
    const { servidor, base } = await levantar();
    try {
        const resp = await sinRuidoEnConsola(() => fetch(`${base}/api/instalacion`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
        }));
        return { estado: resp.status, cuerpo: await resp.json().catch(() => null) };
    } finally { servidor.close(); }
}

const DATOS = { nombre: 'Dueña del taller', email: 'duena@tallerlopez.cl', password: 'clave-larga-123' };

test.beforeEach(() => {
    talleres = [
        { slug: 'principal', nombre: 'Principal', estado: 'activo', instalacionHash: '', instalacionExpira: null },
        { slug: 'taller-lopez', nombre: 'Taller López', estado: 'activo', instalacionHash: hashToken(CLAVE_BUENA), instalacionExpira: EN_UNA_SEMANA() },
    ];
    // El taller principal ya opera: tiene una cuenta con clave.
    usuariosPorBase = { 'base-principal': [{ passwordHash: 'x' }], 'base-taller-lopez': [] };
    aprovisionadas = [];
});

test('el taller nuevo se instala en SU base, no en la del principal', async () => {
    // El corazón de la etapa. Sin el enlace, esta misma request habría caído sobre
    // `base-principal` —que es lo que deja `middlewares/entorno.js` sin sesión— y la cuenta
    // del cliente nuevo se habría creado dentro de los datos de otro.
    const { estado, cuerpo } = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });

    assert.strictEqual(estado, 201);
    assert.strictEqual(usuariosPorBase['base-taller-lopez'].length, 1);
    assert.strictEqual(usuariosPorBase['base-principal'].length, 1, 'la base del principal no se tocó');
    assert.strictEqual(usuariosPorBase['base-taller-lopez'][0].tallerId, 'taller-lopez');
    assert.strictEqual(cuerpo.usuario.email, DATOS.email);
});

test('los índices se construyen ANTES de crear la cuenta', async () => {
    // Si se construyeran después, la primera cuenta entraría sin que existiera el índice
    // único del correo — y los once índices únicos del proyecto protegen contra duplicados
    // que después no se separan a mano.
    await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });
    assert.deepStrictEqual(aprovisionadas, ['base-taller-lopez']);
});

test('la sesión que devuelve lleva el prefijo del taller nuevo', async () => {
    // Si llevara el del principal, la primera request de esa persona iría a buscar su sesión
    // a la base equivocada y la dejaría afuera al instante.
    const { cuerpo } = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });
    assert.strictEqual(separarPrefijo(cuerpo.token).taller, 'taller-lopez');
});

test('el slug SOLO no alcanza: sin clave no se instala nada', async () => {
    // El slug es ruteo, no autorización (§9.3: una pista, nunca la autoridad).
    const { estado } = await instalar({ ...DATOS, taller: 'taller-lopez' });
    assert.strictEqual(estado, 403);
    assert.strictEqual(usuariosPorBase['base-taller-lopez'].length, 0);
});

test('una clave equivocada y un taller inexistente responden lo MISMO', async () => {
    // Distinguirlos convertiría esto en una forma de averiguar qué clientes existen — mismo
    // criterio que CREDENCIAL_INVALIDA en el login.
    const mala = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: 'me-la-invente' });
    const inexistente = await instalar({ ...DATOS, taller: 'taller-fantasma', claveInstalacion: CLAVE_BUENA });
    assert.strictEqual(mala.estado, 403);
    assert.strictEqual(inexistente.estado, 403);
    assert.strictEqual(mala.cuerpo.error, inexistente.cuerpo.error);
});

test('un enlace vencido no sirve', async () => {
    talleres[1].instalacionExpira = new Date(Date.now() - 1000);
    const { estado } = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });
    assert.strictEqual(estado, 403);
});

test('el enlace se consume: sirve una vez y no más', async () => {
    const primera = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });
    assert.strictEqual(primera.estado, 201);
    assert.strictEqual(talleres[1].instalacionHash, '', 'el hash tiene que quedar borrado');

    const segunda = await instalar({ ...DATOS, email: 'otro@x.cl', taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });
    assert.strictEqual(segunda.estado, 403);
});

test('UN TALLER QUE YA OPERA NO SE REINSTALA, aunque el enlace sea válido', async () => {
    // El escenario que esto previene: un enlace que quedó en un correo de hace meses, usado
    // para crearse un administrador dentro de un taller con datos reales adentro.
    usuariosPorBase['base-taller-lopez'] = [{ passwordHash: 'ya-tiene-cuenta' }];
    const { estado, cuerpo } = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });
    assert.strictEqual(estado, 409);
    assert.match(cuerpo.error, /ya está instalado/);
});

test('un taller suspendido no se instala', async () => {
    talleres[1].estado = 'suspendido';
    const { estado } = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });
    assert.strictEqual(estado, 403);
    assert.strictEqual(aprovisionadas.length, 0, 'ni siquiera debe tocar su base');
});

test('sin `taller` en el cuerpo, todo se comporta como antes de esta etapa', async () => {
    // La condición para poder desplegar esto sin romper nada: la instalación única de
    // siempre, sobre req.db, con su 409 cuando ya hay cuentas.
    const yaInstalado = await instalar(DATOS);
    assert.strictEqual(yaInstalado.estado, 409);

    usuariosPorBase['base-principal'] = [];
    const nueva = await instalar(DATOS);
    assert.strictEqual(nueva.estado, 201);
    assert.strictEqual(usuariosPorBase['base-principal'][0].tallerId, 'principal');
    assert.strictEqual(aprovisionadas.length, 0, 'la instalación de siempre no aprovisiona nada');
});

test('SETUP_TOKEN sigue guardando el camino sin taller, y no estorba al del enlace', async () => {
    process.env.SETUP_TOKEN = 'clave-del-servidor';
    usuariosPorBase['base-principal'] = [];
    try {
        assert.strictEqual((await instalar(DATOS)).estado, 403, 'sin la clave del servidor, no');
        assert.strictEqual((await instalar({ ...DATOS, claveInstalacion: 'clave-del-servidor' })).estado, 201);

        // El taller nuevo trae su propia clave de un solo uso, que es más fuerte: por taller,
        // vence y se consume. No tiene que además saber la del servidor.
        assert.strictEqual((await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA })).estado, 201);
    } finally {
        delete process.env.SETUP_TOKEN;
    }
});
