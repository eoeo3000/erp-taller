// El registro de talleres (etapa 2 de docs/multi-taller.md), por HTTP contra el router real.
//
// Lo que más importa acá son dos cosas que, si fallan, no fallan ruidosamente:
//   - La URI de la base de cada taller NUNCA sale por la API. Lleva usuario y clave.
//   - Dos talleres no pueden quedar apuntando a la misma base. Eso sería que un cliente vea
//     los datos de otro, que es justamente lo que toda esta arquitectura existe para impedir.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const CLAVE = 'clave-del-panel-para-pruebas';
const URI_PRINCIPAL = 'mongodb://servidor/taller-principal';

// Base de control falsa: una lista en memoria con la forma que usa el controlador.
let filas = [];
// ¿El taller ya tiene cuentas que pueden entrar? Decide si se le puede reemitir el enlace.
let yaInstalado = false;
// Talleres cuya conexión no se puede abrir: así se prueba que el panel los marque en vez de
// quedarse sin mostrar a nadie.
let SIN_BASE = [];
// Lo que devuelve el servicio de métricas para cada taller medible.
let metricasFalsas = { baseResponde: true, ots: 10, solicitudes: 12, cuentas: 2, ultimaActividad: new Date('2026-10-18T10:00:00Z'), error: null };
function fabricaTaller() {
    const doc = (d) => ({
        ...d,
        save: async function () {
            const i = filas.findIndex((f) => f.slug === this.slug);
            if (i >= 0) filas[i] = { ...filas[i], ...this };
            return this;
        },
    });
    return {
        find: () => ({ sort: () => ({ lean: async () => filas.map((f) => ({ ...f })) }) }),
        findOne: async (filtro) => {
            const hallado = filas.find((f) => Object.entries(filtro).every(([k, v]) => f[k] === v));
            return hallado ? doc({ ...hallado }) : null;
        },
        countDocuments: async (filtro) => filas.filter((f) => {
            if (filtro.estado && f.estado !== filtro.estado) return false;
            if (filtro.slug?.$ne && f.slug === filtro.slug.$ne) return false;
            return true;
        }).length,
        create: async (d) => {
            const nuevo = { plan: '', estado: 'activo', fechaAlta: new Date(), fechaBaja: null, ...d };
            filas.push(nuevo);
            return doc({ ...nuevo });
        },
    };
}

// Sustituciones antes de requerir el router, que desestructura al cargarse.
for (const [ruta, exports] of [
    ['../src/models/Taller', () => fabricaTaller()],
    ['../src/servicios/metricasTaller', {
        metricasDeTaller: async () => metricasFalsas,
        diasSinUsar: () => 1,
    }],
    ['../src/servicios/respaldo', {
        listarRespaldos: async () => [{ clave: 'respaldos/produccion/2026-10-19.json.gz' }, { clave: 'respaldos/produccion/2026-10-18.json.gz' }],
    }],
    ['../src/models/Usuario', (conn) => ({
        exists: async () => (yaInstalado ? { _id: 1 } : null),
    })],
    ['../src/config/conexiones', {
        conexionDeControl: () => ({}),
        obtenerConexion: (entorno, slug) => {
            if (SIN_BASE.includes(slug)) throw new Error(`Taller desconocido: ${slug}`);
            return { name: `base-${slug}` };
        },
        refrescarRegistro: async () => {},
        hayBaseDeControl: () => String(process.env.MONGO_URI_CONTROL || '').trim() !== '',
    }],
]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports };
}

const contratoRespuesta = require('../src/middlewares/respuestas');
const tallerRoutes = require('../src/routes/tallerRoutes');

function levantar() {
    const app = express();
    app.use(express.json());
    app.use(contratoRespuesta);
    app.use('/api/talleres', tallerRoutes);
    return new Promise((listo) => {
        const servidor = app.listen(0, () => listo({ servidor, base: `http://127.0.0.1:${servidor.address().port}` }));
    });
}

async function pedir(ruta, { metodo = 'GET', cuerpo, clave = CLAVE, control = true } = {}) {
    if (control) process.env.MONGO_URI_CONTROL = 'mongodb://servidor/control';
    else delete process.env.MONGO_URI_CONTROL;
    const { servidor, base } = await levantar();
    try {
        const resp = await fetch(`${base}${ruta}`, {
            method: metodo,
            headers: { 'Content-Type': 'application/json', ...(clave ? { 'X-Panel-Token': clave } : {}) },
            ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
        });
        return { estado: resp.status, cuerpo: await resp.json().catch(() => null) };
    } finally {
        servidor.close();
    }
}

test.beforeEach(() => {
    filas = [{ slug: 'principal', nombre: 'Taller principal', estado: 'activo', plan: '', mongoUri: URI_PRINCIPAL, fechaAlta: new Date(), fechaBaja: null }];
    process.env.PANEL_TOKEN = CLAVE;
    yaInstalado = false;
    SIN_BASE = [];
});
test.after(() => { delete process.env.PANEL_TOKEN; delete process.env.MONGO_URI_CONTROL; });

test('sin base de control, la ruta está cerrada', async () => {
    const { estado, cuerpo } = await pedir('/api/talleres', { control: false });
    assert.strictEqual(estado, 503);
    assert.match(cuerpo.error, /MONGO_URI_CONTROL/);
});

test('sin PANEL_TOKEN configurado, la ruta está cerrada', async () => {
    // Cerrado por omisión y no abierto: estas rutas nacen hoy, así que dejarlas pasar no
    // conservaría un estado anterior — regalaría la lista de todos los clientes.
    delete process.env.PANEL_TOKEN;
    const { estado } = await pedir('/api/talleres');
    assert.strictEqual(estado, 503);
});

test('con la clave equivocada, 401', async () => {
    assert.strictEqual((await pedir('/api/talleres', { clave: 'otra-cosa' })).estado, 401);
    assert.strictEqual((await pedir('/api/talleres', { clave: '' })).estado, 401);
});

test('la URI de la base NUNCA sale por la API', async () => {
    // Lleva usuario y clave de Mongo. Quien mira el panel no la necesita para nada, y el log
    // de un navegador o un proxy la dejaría escrita.
    const { estado, cuerpo } = await pedir('/api/talleres');
    assert.strictEqual(estado, 200);
    assert.strictEqual(cuerpo.talleres.length, 1);
    assert.ok(!JSON.stringify(cuerpo).includes(URI_PRINCIPAL), 'se filtró la URI de la base');
    assert.ok(!('mongoUri' in cuerpo.talleres[0]));
});

test('dar de alta un taller nuevo', async () => {
    const { estado, cuerpo } = await pedir('/api/talleres', {
        metodo: 'POST', cuerpo: { slug: 'taller-lopez', nombre: 'Taller López', mongoUri: 'mongodb://servidor/lopez', plan: 'básico' },
    });
    assert.strictEqual(estado, 201);
    assert.strictEqual(cuerpo.taller.slug, 'taller-lopez');
    assert.strictEqual(cuerpo.taller.estado, 'activo');
    assert.ok(!('mongoUri' in cuerpo.taller), 'tampoco al crearlo');
});

test('el identificador no puede llevar un punto: el punto separa el prefijo del token', async () => {
    // `principal.a3f9…` — si el slug llevara un punto, dividir el token sería ambiguo.
    for (const malo of ['con.punto', 'CON-MAYUSCULA'.toLowerCase() + '.x', 'a', '', 'con espacio', 'con_guion_bajo']) {
        const { estado } = await pedir('/api/talleres', {
            metodo: 'POST', cuerpo: { slug: malo, nombre: 'X', mongoUri: `mongodb://servidor/${malo}` },
        });
        assert.strictEqual(estado, 400, `debería rechazar "${malo}"`);
    }
});

test('no se puede repetir el identificador', async () => {
    const { estado } = await pedir('/api/talleres', {
        metodo: 'POST', cuerpo: { slug: 'principal', nombre: 'Otro', mongoUri: 'mongodb://servidor/otro' },
    });
    assert.strictEqual(estado, 409);
});

test('DOS TALLERES NO PUEDEN COMPARTIR BASE', async () => {
    // El error de copiar y pegar la URI al dar de alta un cliente nuevo. Si pasara, el
    // cliente nuevo abriría la base del anterior y vería sus OT, sus clientes y sus precios.
    const { estado, cuerpo } = await pedir('/api/talleres', {
        metodo: 'POST', cuerpo: { slug: 'taller-lopez', nombre: 'Taller López', mongoUri: URI_PRINCIPAL },
    });
    assert.strictEqual(estado, 409);
    assert.match(cuerpo.error, /se verían los datos/);
});

test('la base de control tampoco puede ser la base de un taller', async () => {
    const { estado } = await pedir('/api/talleres', {
        metodo: 'POST', cuerpo: { slug: 'taller-lopez', nombre: 'L', mongoUri: 'mongodb://servidor/control' },
    });
    assert.strictEqual(estado, 409);
});

test('suspender y reactivar son la misma puerta en los dos sentidos', async () => {
    filas.push({ slug: 'taller-lopez', nombre: 'L', estado: 'activo', plan: '', mongoUri: 'mongodb://servidor/lopez', fechaAlta: new Date(), fechaBaja: null });

    const suspendido = await pedir('/api/talleres/taller-lopez', { metodo: 'PATCH', cuerpo: { estado: 'suspendido' } });
    assert.strictEqual(suspendido.estado, 200);
    assert.strictEqual(suspendido.cuerpo.taller.estado, 'suspendido');

    const vuelta = await pedir('/api/talleres/taller-lopez', { metodo: 'PATCH', cuerpo: { estado: 'activo' } });
    assert.strictEqual(vuelta.cuerpo.taller.estado, 'activo', 'tiene que poder volver');
});

test('dar de baja sella la fecha, y deshacerla la borra', async () => {
    // Si la fecha quedara escrita, una baja deshecha seguiría contando por detrás sus plazos
    // de borrado (§9.4) y el cliente perdería sus datos igual.
    filas.push({ slug: 'taller-lopez', nombre: 'L', estado: 'activo', plan: '', mongoUri: 'mongodb://servidor/lopez', fechaAlta: new Date(), fechaBaja: null });

    const baja = await pedir('/api/talleres/taller-lopez', { metodo: 'PATCH', cuerpo: { estado: 'baja' } });
    assert.ok(baja.cuerpo.taller.fechaBaja, 'la baja tiene que quedar fechada');

    const vuelta = await pedir('/api/talleres/taller-lopez', { metodo: 'PATCH', cuerpo: { estado: 'activo' } });
    assert.strictEqual(vuelta.cuerpo.taller.fechaBaja, null);
});

test('no se puede suspender el ÚNICO taller activo', async () => {
    // Mismo principio que "nadie puede revocarse a sí mismo" en las cuentas de oficina:
    // dejar el sistema sin ningún taller activo no deja a nadie entrar a arreglarlo.
    const { estado, cuerpo } = await pedir('/api/talleres/principal', { metodo: 'PATCH', cuerpo: { estado: 'suspendido' } });
    assert.strictEqual(estado, 409);
    assert.match(cuerpo.error, /único taller activo/);
});

test('con otro taller activo, sí se puede suspender el principal', async () => {
    filas.push({ slug: 'taller-lopez', nombre: 'L', estado: 'activo', plan: '', mongoUri: 'mongodb://servidor/lopez', fechaAlta: new Date(), fechaBaja: null });
    assert.strictEqual((await pedir('/api/talleres/principal', { metodo: 'PATCH', cuerpo: { estado: 'suspendido' } })).estado, 200);
});

test('un taller que no existe da 404, no 500', async () => {
    assert.strictEqual((await pedir('/api/talleres/no-existe', { metodo: 'PATCH', cuerpo: { estado: 'activo' } })).estado, 404);
});

test('dar de alta devuelve el enlace de instalación UNA vez', async () => {
    // Es lo que se le manda al dueño del taller nuevo. Viaja en claro solo acá: en la base de
    // control queda su hash, igual que un token de sesión o un resetHash.
    const { cuerpo } = await pedir('/api/talleres', {
        metodo: 'POST', cuerpo: { slug: 'taller-lopez', nombre: 'Taller López', mongoUri: 'mongodb://servidor/lopez' },
    });
    assert.match(cuerpo.instalacion.url, /\/instalar\?taller=taller-lopez&clave=[a-f0-9]{16,}/);
    assert.ok(new Date(cuerpo.instalacion.expira) > new Date(), 'tiene que venir con vencimiento futuro');

    const guardado = filas.find((f) => f.slug === 'taller-lopez');
    assert.ok(guardado.instalacionHash, 'en la base queda el hash');
    const clave = cuerpo.instalacion.url.split('clave=')[1];
    assert.ok(!JSON.stringify(filas).includes(clave), 'la clave en claro NO puede quedar guardada');
});

test('reemitir el enlace mata el anterior', async () => {
    // Si el correo se perdió o se mandó a la persona equivocada, se emite otro — y el viejo
    // tiene que dejar de servir en el acto, o quedan dos llaves dando vueltas.
    const alta = await pedir('/api/talleres', {
        metodo: 'POST', cuerpo: { slug: 'taller-lopez', nombre: 'L', mongoUri: 'mongodb://servidor/lopez' },
    });
    const hashViejo = filas.find((f) => f.slug === 'taller-lopez').instalacionHash;

    const reemitido = await pedir('/api/talleres/taller-lopez/instalacion', { metodo: 'POST' });
    assert.strictEqual(reemitido.estado, 200);
    assert.notStrictEqual(reemitido.cuerpo.instalacion.url, alta.cuerpo.instalacion.url);
    assert.notStrictEqual(filas.find((f) => f.slug === 'taller-lopez').instalacionHash, hashViejo);
});

test('no se reemite el enlace de un taller que ya opera', async () => {
    // La ventana de instalación se cierra sola cuando hay una cuenta que puede entrar, sin un
    // interruptor que alguien pueda dejar encendido.
    yaInstalado = true;
    const { estado, cuerpo } = await pedir('/api/talleres/principal/instalacion', { metodo: 'POST' });
    assert.strictEqual(estado, 409);
    assert.match(cuerpo.error, /ya está instalado/);
});

// --- Las métricas que alimentan el panel ---

test('las métricas exigen la misma clave', async () => {
    assert.strictEqual((await pedir('/api/talleres/metricas', { clave: 'otra' })).estado, 401);
    assert.strictEqual((await pedir('/api/talleres/metricas', { control: false })).estado, 503);
});

test('trae el contrato y los conteos de cada taller', async () => {
    filas.push({ slug: 'taller-lopez', nombre: 'L', estado: 'activo', plan: 'básico', mongoUri: 'mongodb://servidor/lopez', fechaAlta: new Date(), fechaBaja: null });
    const { estado, cuerpo } = await pedir('/api/talleres/metricas');
    assert.strictEqual(estado, 200);
    assert.strictEqual(cuerpo.talleres.length, 2);
    const lopez = cuerpo.talleres.find((t) => t.slug === 'taller-lopez');
    assert.strictEqual(lopez.medible, true);
    assert.strictEqual(lopez.ots, 10);
    assert.strictEqual(lopez.plan, 'básico');
    assert.ok(!JSON.stringify(cuerpo).includes('mongodb://'), 'la URI tampoco sale por acá');
});

test('UNA BASE CAÍDA NO DEJA AL PANEL SIN MOSTRAR A NADIE', async () => {
    // Enterarse de que la base de un cliente no responde es justamente para lo que existe el
    // panel. Si una caída tumbara la consulta, el panel se apagaría justo cuando hace falta.
    filas.push({ slug: 'taller-roto', nombre: 'Roto', estado: 'activo', plan: '', mongoUri: 'mongodb://servidor/roto', fechaAlta: new Date(), fechaBaja: null });
    SIN_BASE = ['taller-roto'];

    const { estado, cuerpo } = await pedir('/api/talleres/metricas');
    assert.strictEqual(estado, 200, 'la consulta completa tiene que responder igual');
    assert.strictEqual(cuerpo.talleres.length, 2);
    const roto = cuerpo.talleres.find((t) => t.slug === 'taller-roto');
    assert.strictEqual(roto.medible, false);
    assert.strictEqual(roto.baseResponde, false);
    assert.strictEqual(cuerpo.talleres.find((t) => t.slug === 'principal').ots, 10, 'los demás se miden igual');
});

test('un taller suspendido no se mide, y eso no es "base caída"', async () => {
    // Su conexión está cortada a propósito (el corte vive en el registro). Marcarlo como
    // caído confundiría una decisión comercial con un problema técnico.
    filas.push({ slug: 'taller-pausa', nombre: 'Pausa', estado: 'suspendido', plan: '', mongoUri: 'mongodb://servidor/pausa', fechaAlta: new Date(), fechaBaja: null });
    const { cuerpo } = await pedir('/api/talleres/metricas');
    const pausa = cuerpo.talleres.find((t) => t.slug === 'taller-pausa');
    assert.strictEqual(pausa.medible, false);
    assert.strictEqual(pausa.baseResponde, null, 'null, no false: no se intentó');
    assert.match(pausa.motivo, /suspendido/);
});

test('dice qué todavía no puede medir, en vez de inventarlo', async () => {
    // Las fotos y los respaldos no están separados por taller (etapa 5). Mostrar el total de
    // todos los clientes para cada uno parecería un dato y sería mentira.
    const { cuerpo } = await pedir('/api/talleres/metricas');
    assert.ok(cuerpo.pendienteEtapa5.length >= 2);
    assert.strictEqual(cuerpo.respaldo.compartido, true, 'el respaldo es del entorno, no del taller');
    assert.match(cuerpo.respaldo.ultimo, /2026-10-19/, 'y muestra el más reciente');
});

// --- Dar de alta escribiendo solo el nombre ---

test('con solo el nombre se derivan el identificador Y la base', async () => {
    // Es lo que saca el paso más peligroso del alta: pegar una cadena de conexión a mano.
    process.env.MONGO_URI = 'mongodb+srv://u:p@c0.ab12c.mongodb.net/test?retryWrites=true&w=majority';
    const { estado, cuerpo } = await pedir('/api/talleres', { metodo: 'POST', cuerpo: { nombre: 'Taller López' } });

    assert.strictEqual(estado, 201);
    assert.strictEqual(cuerpo.taller.slug, 'taller-lopez');
    const guardado = filas.find((f) => f.slug === 'taller-lopez');
    assert.strictEqual(guardado.mongoUri, 'mongodb+srv://u:p@c0.ab12c.mongodb.net/taller-lopez?retryWrites=true&w=majority');
    assert.ok(!JSON.stringify(cuerpo).includes('mongodb'), 'la cadena derivada tampoco sale por la API');
});

test('dos nombres que derivan al mismo identificador chocan en vez de pisarse', async () => {
    // "Taller López" y "taller lopez" dan el mismo slug. Si el segundo pisara al primero,
    // dos clientes terminarían en la misma base.
    process.env.MONGO_URI = 'mongodb+srv://u:p@c0.net/test';
    assert.strictEqual((await pedir('/api/talleres', { metodo: 'POST', cuerpo: { nombre: 'Taller López' } })).estado, 201);
    const segundo = await pedir('/api/talleres', { metodo: 'POST', cuerpo: { nombre: 'taller lopez' } });
    assert.strictEqual(segundo.estado, 409);
});

test('se puede seguir mandando una mongoUri propia: mover a un cliente que creció', async () => {
    // §9.1 — pasar un taller a su propio clúster es cambiar un campo, no rehacer nada.
    process.env.MONGO_URI = 'mongodb+srv://u:p@c0.net/test';
    const propia = 'mongodb+srv://otro:otra@clusterpropio.net/lopez?w=majority';
    await pedir('/api/talleres', { metodo: 'POST', cuerpo: { nombre: 'Taller López', mongoUri: propia } });
    assert.strictEqual(filas.find((f) => f.slug === 'taller-lopez').mongoUri, propia, 'la explícita manda');
});

test('un nombre del que no sale ningún identificador se rechaza con su motivo', async () => {
    process.env.MONGO_URI = 'mongodb+srv://u:p@c0.net/test';
    const { estado, cuerpo } = await pedir('/api/talleres', { metodo: 'POST', cuerpo: { nombre: '---' } });
    assert.strictEqual(estado, 400);
    assert.match(cuerpo.error, /identificador/i);
});

test('sin MONGO_URI en el servidor, el alta dice por qué en vez de romperse', async () => {
    const previo = process.env.MONGO_URI;
    delete process.env.MONGO_URI;
    try {
        const { estado, cuerpo } = await pedir('/api/talleres', { metodo: 'POST', cuerpo: { nombre: 'Taller López' } });
        assert.strictEqual(estado, 400);
        assert.match(cuerpo.error, /MONGO_URI/);
    } finally { process.env.MONGO_URI = previo; }
});

test('la marca se edita por partes: el nombre sin pisar el logo, y el logo sin pisar el nombre', async () => {
    // El panel tiene dos controles separados —un campo de texto y un selector de archivo— y
    // guardar el nombre no puede obligar a reenviar el logo entero, que son decenas de KB.
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    filas[0].marca = { nombre: 'Maestranza Rivas', logo: PNG };

    const soloNombre = await pedir('/api/talleres/principal', { metodo: 'PATCH', cuerpo: { marca: { nombre: 'Rivas Hermanos' } } });
    assert.strictEqual(soloNombre.estado, 200);
    assert.strictEqual(soloNombre.cuerpo.taller.marca.nombre, 'Rivas Hermanos');
    assert.strictEqual(soloNombre.cuerpo.taller.marca.logo, PNG, 'el logo tiene que quedar donde estaba');
});

test('quitar el logo se puede, y deja el nombre', async () => {
    filas[0].marca = { nombre: 'Maestranza Rivas', logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' };
    const { estado, cuerpo } = await pedir('/api/talleres/principal', { metodo: 'PATCH', cuerpo: { marca: { logo: '' } } });
    assert.strictEqual(estado, 200);
    assert.strictEqual(cuerpo.taller.marca.logo, '');
    assert.strictEqual(cuerpo.taller.marca.nombre, 'Maestranza Rivas');
});

test('un logo que la cotización no podría insertar se rechaza con el motivo, no se guarda a medias', async () => {
    const { estado, cuerpo } = await pedir('/api/talleres/principal', {
        metodo: 'PATCH', cuerpo: { marca: { nombre: 'Rivas', logo: 'data:image/webp;base64,UklGRh4AAABXRUJQ' } },
    });
    assert.strictEqual(estado, 400);
    assert.match(cuerpo.error, /PNG o JPEG/);
    // Y el nombre que venía en la MISMA petición tampoco quedó escrito: o entra todo o no
    // entra nada, porque si no el panel diría "error" con media cosa ya guardada.
    assert.notStrictEqual(filas[0].marca?.nombre, 'Rivas');
});

test('una ficha anterior a la marca se lee sin romperse', async () => {
    // Los talleres dados de alta antes de que este campo existiera no tienen `marca`. Si la
    // respuesta llegara sin esas claves, el SPA mostraría "undefined" donde va el nombre.
    delete filas[0].marca;
    const { cuerpo } = await pedir('/api/talleres');
    assert.deepStrictEqual(cuerpo.talleres[0].marca, { nombre: '', logo: '' });
});
