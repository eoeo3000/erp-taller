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

// Lo que cada taller eligió mostrar en su app. Vacío = no eligió nada.
let MARCAS = {};

// Los avisos de instalación que salieron, y un interruptor para hacer fallar el envío: lo que
// importa probar es que un correo caído no deje a un cliente nuevo sin instalar.
let correosEnviados = [];
let fallaElCorreo = false;

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
        // La marca del taller, que `/auth/yo` devuelve junto al resto.
        marcaDeTaller: (slug) => MARCAS[slug] || { nombre: '', logo: '' },
        // `conexionPedida` lo usa para resolver la pista del navegador: sin esto la prueba
        // falla por el doble incompleto y no por el código.
        resolverTaller: (slug) => {
            const t = talleres.find((x) => x.slug === String(slug || '').trim().toLowerCase());
            return t && t.estado === 'activo' ? t.slug : null;
        },
        obtenerConexion: (entorno, slug) => {
            const t = talleres.find((x) => x.slug === slug);
            if (!t) throw new Error(`Taller desconocido: ${slug}`);
            if (t.estado !== 'activo') throw new Error(`El taller "${slug}" está ${t.estado} y no puede operar`);
            return conexionDe(`base-${slug}`);
        },
        refrescarRegistro: async () => {},
        hayBaseDeControl: () => true,
    }],
    ['../src/config/mailer', {
        sendMail: async (mensaje) => {
            if (fallaElCorreo) throw new Error('Brevo no responde');
            correosEnviados.push(mensaje);
            return { messageId: 'x' };
        },
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
const authController = require('../src/controllers/authController');

function levantar() {
    const app = express();
    app.use(express.json());
    app.use(contratoRespuesta);
    // Como lo deja middlewares/entorno.js cuando NO hay sesión: el taller por defecto. Es
    // justamente la situación de quien va a instalar un taller nuevo.
    app.use((req, res, siguiente) => { req.db = conexionDe('base-principal'); req.taller = 'principal'; siguiente(); });
    app.post('/api/instalacion', instalacionController.instalar);
    app.get('/api/auth/yo', authController.yo);
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

async function instalar(cuerpo, cabeceras = {}) {
    const { servidor, base } = await levantar();
    try {
        const resp = await sinRuidoEnConsola(() => fetch(`${base}/api/instalacion`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...cabeceras }, body: JSON.stringify(cuerpo),
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
    correosEnviados = [];
    fallaElCorreo = false;
    delete process.env.EMAIL_OPERADOR;
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

// --- Que la pantalla y la instalación hablen del MISMO taller ---

async function preguntarYo(cabeceras = {}) {
    const { servidor, base } = await levantar();
    try {
        const resp = await sinRuidoEnConsola(() => fetch(`${base}/api/auth/yo`, { headers: cabeceras }));
        return { estado: resp.status, cuerpo: await resp.json().catch(() => null) };
    } finally { servidor.close(); }
}

test('EL BUG: /auth/yo y la instalación tienen que mirar el mismo taller', async () => {
    // Lo que se veía desde afuera, y era absurdo: el navegador recordaba un taller nuevo
    // (`X-Taller`, de haber abierto el enlace), /auth/yo miraba ESA base y decía "falta
    // instalar", el SPA mostraba la pantalla — y al enviarla la instalación caía en el taller
    // POR DEFECTO y respondía "este sistema ya está instalado". La pantalla preguntaba por un
    // taller e instalaba en otro.
    const cabecera = { 'X-Taller': 'taller-lopez' };

    const yo = await preguntarYo(cabecera);
    assert.strictEqual(yo.cuerpo.requiereInstalacion, true, 'taller-lopez no tiene cuentas');
    assert.strictEqual(yo.cuerpo.taller, 'taller-lopez');

    // Y la instalación, con la misma pista, tiene que ir a ESE taller.
    const { estado } = await instalar({ ...DATOS, claveInstalacion: CLAVE_BUENA }, cabecera);
    assert.strictEqual(estado, 201, 'instaló en el taller equivocado');
    assert.strictEqual(usuariosPorBase['base-taller-lopez'].length, 1);
    assert.strictEqual(usuariosPorBase['base-principal'].length, 1, 'no tocó la base del principal');
});

test('la pantalla de un taller nuevo SIEMPRE pide la clave del enlace', async () => {
    // Si no la pidiera, la pantalla se ofrecería sin ella y el envío fallaría con un 403 sin
    // explicación. Y peor: si el backend tampoco la exigiera, cualquiera que supiera el
    // identificador de un cliente nuevo podría quedarse con él antes que su dueño.
    const nuevo = await preguntarYo({ 'X-Taller': 'taller-lopez' });
    assert.strictEqual(nuevo.cuerpo.requiereClaveInstalacion, true);

    // En el taller por defecto sigue mandando SETUP_TOKEN, como siempre.
    usuariosPorBase['base-principal'] = [];
    const porDefecto = await preguntarYo();
    assert.strictEqual(porDefecto.cuerpo.requiereClaveInstalacion, false);
});

test('la pista sola no instala: sin la clave del enlace no pasa nadie', async () => {
    // El slug es ruteo, no autorización — acá también. Si bastara la cabecera, quedarse con
    // el taller de otro sería escribir su identificador.
    const { estado } = await instalar(DATOS, { 'X-Taller': 'taller-lopez' });
    assert.strictEqual(estado, 403);
    assert.strictEqual(usuariosPorBase['base-taller-lopez'].length, 0);
});

test('una pista hacia un taller que ya opera no reabre su instalación', async () => {
    usuariosPorBase['base-taller-lopez'] = [{ passwordHash: 'ya-tiene' }];
    const { estado } = await instalar({ ...DATOS, claveInstalacion: CLAVE_BUENA }, { 'X-Taller': 'taller-lopez' });
    assert.strictEqual(estado, 409);
});

test('/auth/yo dice CUÁL de las dos claves está pidiendo', async () => {
    // Son dos claves distintas: la del enlace de un solo uso, que le llegó al dueño de un
    // taller nuevo, y SETUP_TOKEN, que es del servidor y la sabe quien administra. La
    // pantalla no tiene cómo saber cuál corresponde — depende de si el taller es el por
    // defecto o no— y antes lo adivinaba mirando si la URL traía `?clave=`.
    //
    // Eso fallaba justo en el caso más probable: el dueño de un taller nuevo que abre su
    // enlace de ACCESO (`/?taller=x`, sin clave) en vez del de instalación. La pantalla le
    // decía que buscara un SETUP_TOKEN que para él no existe.
    const otro = await preguntarYo({ 'X-Taller': 'taller-lopez' });
    assert.strictEqual(otro.cuerpo.requiereClaveInstalacion, true);
    assert.strictEqual(otro.cuerpo.motivoClaveInstalacion, 'enlace');

    // Y en el principal sin instalar, con SETUP_TOKEN puesto, la clave que corresponde es
    // la otra.
    usuariosPorBase['base-principal'] = [];
    process.env.SETUP_TOKEN = 'clave-del-servidor';
    try {
        const principal = await preguntarYo();
        assert.strictEqual(principal.cuerpo.requiereClaveInstalacion, true);
        assert.strictEqual(principal.cuerpo.motivoClaveInstalacion, 'setup',
            'el taller por defecto se instala con SETUP_TOKEN, no con un enlace');
    } finally {
        delete process.env.SETUP_TOKEN;
    }
});

// --- El aviso al operador: que un cliente instaló ---
//
// No es una aprobación y no puede serlo: cuando esto sale, la persona ya entró. Lo que estas
// pruebas cuidan es que el aviso nunca pueda ser el motivo de que una instalación falle.

test('cuando un cliente instala, le llega un aviso a quien arrienda el sistema', async () => {
    process.env.EMAIL_OPERADOR = 'operador@erp.cl';
    const { estado } = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });

    assert.strictEqual(estado, 201);
    assert.strictEqual(correosEnviados.length, 1);
    const aviso = correosEnviados[0];
    assert.strictEqual(aviso.to, 'operador@erp.cl');
    assert.match(aviso.subject, /Taller López/, 'el asunto dice qué cliente, no solo que "alguien" instaló');
    assert.match(aviso.text, /taller-lopez/);
    assert.match(aviso.text, new RegExp(DATOS.email), 'quién se creó la cuenta es el dato que se quiere saber');
});

test('un correo caído NO deja al cliente nuevo sin instalar', async () => {
    // El aviso va después de crear la cuenta, de la sesión y de consumir el enlace, con su
    // propio catch. Si fuera antes —o sin catch— un Brevo caído sería un taller sin instalar,
    // y el cliente vería un error en la única pantalla que no puede reintentar: el enlace ya
    // se consumió o, peor, no se consumió y queda vivo.
    process.env.EMAIL_OPERADOR = 'operador@erp.cl';
    fallaElCorreo = true;
    const { estado, cuerpo } = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });

    assert.strictEqual(estado, 201, 'la instalación tiene que completarse igual');
    assert.strictEqual(usuariosPorBase['base-taller-lopez'].length, 1);
    assert.ok(cuerpo.token, 'y la persona entra, que es lo que vino a hacer');
});

test('sin EMAIL_OPERADOR no se manda nada y la instalación sigue igual', async () => {
    // Variable opcional, mismo criterio que EMAIL_REPLY_TO: exigirla haría que un despliegue
    // que todavía no la definió no pueda instalar un taller.
    const { estado } = await instalar({ ...DATOS, taller: 'taller-lopez', claveInstalacion: CLAVE_BUENA });
    assert.strictEqual(estado, 201);
    assert.strictEqual(correosEnviados.length, 0);
});

test('instalar el taller por defecto no manda aviso: sería mandárselo a uno mismo', async () => {
    process.env.EMAIL_OPERADOR = 'operador@erp.cl';
    usuariosPorBase['base-principal'] = [];
    const { estado } = await instalar(DATOS);
    assert.strictEqual(estado, 201);
    assert.strictEqual(correosEnviados.length, 0);
});

test('el aviso dice cómo deshacerlo, porque la cuenta ya existe', async () => {
    // El principio de vuelta atrás (docs/principio-vuelta-atras.md): si no hay aprobación
    // previa, el correo tiene que decir dónde está la palanca. Es suspender el taller desde
    // el panel, que corta en el registro y no en los controladores.
    const { armarAviso } = require('../src/servicios/avisoInstalacion');
    const aviso = armarAviso(
        { slug: 'rivas', nombreTaller: 'Taller Rivas', nombre: 'Ana', email: 'ana@rivas.cl' },
        { EMAIL_OPERADOR: 'operador@erp.cl' },
    );
    assert.match(aviso.text, /suspende el taller desde el panel/i);
    assert.match(aviso.text, /no una aprobación/i, 'que ya está adentro tiene que quedar claro');
    assert.strictEqual(
        armarAviso({ slug: 'rivas', nombre: 'Ana', email: 'ana@rivas.cl' }, {}),
        null,
        'sin destinatario no hay mensaje que armar',
    );
});
