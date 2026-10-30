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
// Archivos que todavía no se migraron a la carpeta de su taller.
let SUELTOS = [];
// Las cuentas de oficina de cada base, y las bases que no responden al listarlas.
let CUENTAS = {};
let SIN_CUENTAS = [];
// Lo que devuelve el servicio de métricas para cada taller medible.
let metricasFalsas = { baseResponde: true, ots: 10, solicitudes: 12, cuentas: 2, ultimaActividad: new Date('2026-10-18T10:00:00Z'), bytesBase: 8 * 1024 * 1024, error: null };
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
        // Cuánto ocupa cada base. El doble lo usa el total, que es lo que de verdad importa
        // mirar: los topes de Atlas y de R2 son del clúster y del bucket enteros.
        tamanoDeBase: async () => 8 * 1024 * 1024,
        // Desde la etapa 5 el panel también muestra lo que ocupa cada taller y cuándo fue
        // su último respaldo.
        almacenamientoDeTaller: async (taller) => ({
            archivos: { cantidad: 12, bytes: 3 * 1024 * 1024 },
            respaldo: { total: 7, ultimo: new Date('2026-10-23T08:00:00Z'), clave: `respaldos/produccion/${taller}/2026-10-23T08-00-00.json.gz` },
            error: null,
        }),
        diasSinUsar: () => 1,
    }],
    ['../src/config/almacenamiento', {
        // Los archivos que quedaron en la raíz, de antes de que se separaran por taller.
        listarSueltos: async () => SUELTOS,
        medir: async (prefijo) => ({ cantidad: 1, bytes: prefijo === 'respaldos' ? 4 * 1024 * 1024 : 1024 * 1024 }),
        CARPETA_DEMO: 'demo',
    }],
    ['../src/models/Usuario', (conn) => ({
        exists: async () => (yaInstalado ? { _id: 1 } : null),
        // La cadena que usa `listarCuentas`. El doble devuelve los documentos ENTEROS —con
        // passwordHash y token— a propósito: así la prueba verifica que lo que los esconde
        // sea el código y no la casualidad de que el doble no los tenga.
        find: () => ({
            select: () => ({
                limit: () => ({
                    lean: async () => {
                        if (SIN_CUENTAS.includes(conn.name)) throw new Error('base caída');
                        return CUENTAS[conn.name] || [];
                    },
                }),
            }),
        }),
    })],
    ['../src/config/conexiones', {
        conexionDeControl: () => ({}),
        conexionDisponible: () => true,
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
    SUELTOS = [];
    CUENTAS = {};
    SIN_CUENTAS = [];
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

test('cada taller trae SUS archivos y SU último respaldo', async () => {
    // Hasta la etapa 5 el panel decía que esto no se podía medir, porque los archivos y los
    // respaldos iban todos juntos y mostrar el total de todos para cada uno habría parecido
    // un dato siendo mentira. Ahora cada uno tiene su carpeta y su respaldo.
    const { cuerpo } = await pedir('/api/talleres/metricas');
    const principal = cuerpo.talleres.find((t) => t.slug === 'principal');
    assert.strictEqual(principal.archivos.cantidad, 12);
    assert.strictEqual(principal.archivos.bytes, 3 * 1024 * 1024);
    assert.match(principal.respaldo.clave, /respaldos\/produccion\/principal\//, 'el respaldo es SUYO');
    assert.ok(principal.respaldo.ultimo);
});

test('mientras queden archivos sin separar, el panel lo dice', async () => {
    // Un número de archivos por taller que no incluye los de antes de la migración se ve
    // completo y no lo es. Decirlo es más honesto que mostrarlo a secas.
    SUELTOS = [{ clave: 'a.jpg', tamano: 1024 }, { clave: 'b.jpg', tamano: 2048 }];
    const { cuerpo } = await pedir('/api/talleres/metricas');
    assert.strictEqual(cuerpo.sinSeparar.cantidad, 2);
    assert.strictEqual(cuerpo.sinSeparar.bytes, 3072);

    SUELTOS = [];
    assert.strictEqual((await pedir('/api/talleres/metricas')).cuerpo.sinSeparar.cantidad, 0, 'migrado del todo: no hay nada que avisar');
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

test('el panel suma el uso de TODO contra el techo del plan', async () => {
    // Es lo que no se puede deducir mirando fila por fila: los límites de Atlas y de R2 son
    // del clúster y del bucket enteros. Un taller en verde no dice nada si entre todos ya
    // se llenó, y enterarse tarde de eso es quedarse sin poder escribir.
    filas.push({ slug: 'taller-lopez', nombre: 'L', estado: 'activo', plan: '', mongoUri: 'mongodb://servidor/lopez', fechaAlta: new Date(), fechaBaja: null });
    SUELTOS = [{ clave: 'a.jpg', tamano: 1024 }];

    const { cuerpo } = await pedir('/api/talleres/metricas');
    const MB = 1024 * 1024;

    // Dos talleres de 8 MB + control 8 + demo 8 = 32 MB.
    assert.strictEqual(cuerpo.totales.bases.talleres, 16 * MB);
    assert.strictEqual(cuerpo.totales.bases.bytes, 32 * MB);
    assert.strictEqual(cuerpo.totales.bases.tope, 512 * MB, 'el tope por omisión: el clúster M0');

    // Y del lado del bucket: lo de cada taller, los respaldos, la demo y lo sin separar.
    assert.strictEqual(cuerpo.totales.archivos.respaldos, 4 * MB);
    assert.strictEqual(cuerpo.totales.archivos.sinSeparar, 1024);
    assert.ok(cuerpo.totales.archivos.bytes > cuerpo.totales.archivos.talleres,
        'el total tiene que incluir respaldos y demo, o se vería más vacío de lo que está');
});

test('la base de control y la demo también cuentan', async () => {
    // Viven en el mismo clúster y ocupan igual. Dejarlas afuera daría un total que se ve
    // bien y no lo es.
    const { cuerpo } = await pedir('/api/talleres/metricas');
    assert.ok(cuerpo.totales.bases.control > 0);
    assert.ok(cuerpo.totales.bases.demo > 0);
    assert.strictEqual(
        cuerpo.totales.bases.bytes,
        cuerpo.totales.bases.talleres + cuerpo.totales.bases.control + cuerpo.totales.bases.demo,
    );
});

// --- Quiénes pueden entrar, y a qué taller (GET /api/talleres/cuentas) ---
//
// Existe por una pregunta de soporte que no se podía contestar sin entrar a la Shell:
// «¿esta persona tiene cuenta, y en cuál de mis clientes?». Lo que estas pruebas cuidan es
// que responderla no se convierta en una forma de repartir accesos.

const CUENTA = (email, nombre, extra = {}) => ({
    _id: `id-${email}`, email, nombre, estado: 'activo',
    passwordHash: 'HASH-SECRETO', token: 'TOKEN-DE-LA-PWA', resetHash: 'RESET-SECRETO',
    ...extra,
});

test('lista las cuentas de todos los talleres, diciendo de cuál es cada una', async () => {
    filas.push({ slug: 'taller-lopez', nombre: 'Taller López', estado: 'activo', mongoUri: 'mongodb://servidor/lopez', fechaAlta: new Date() });
    CUENTAS['base-principal'] = [CUENTA('ana@erp.cl', 'Ana')];
    CUENTAS['base-taller-lopez'] = [CUENTA('eliseo@hotmail.com', 'Eliseo')];

    const { estado, cuerpo } = await pedir('/api/talleres/cuentas');
    assert.strictEqual(estado, 200);
    assert.deepStrictEqual(
        cuerpo.cuentas.map((c) => [c.taller, c.email]),
        [['principal', 'ana@erp.cl'], ['taller-lopez', 'eliseo@hotmail.com']],
    );
});

test('NUNCA devuelve credenciales, por más que la base las traiga', async () => {
    // La razón por la que esto no se parece a una exportación. El `token` de la PWA entra a
    // la app SIN clave: publicarlo acá sería regalar accesos para ahorrar un clic. El doble
    // devuelve los documentos enteros a propósito, así lo que los esconde es el código.
    CUENTAS['base-principal'] = [CUENTA('ana@erp.cl', 'Ana')];
    const { cuerpo } = await pedir('/api/talleres/cuentas');
    const texto = JSON.stringify(cuerpo);
    assert.ok(!texto.includes('HASH-SECRETO'), 'no puede salir el passwordHash');
    assert.ok(!texto.includes('TOKEN-DE-LA-PWA'), 'no puede salir el token de la PWA');
    assert.ok(!texto.includes('RESET-SECRETO'), 'no puede salir el hash de recuperación');
});

test('se puede buscar por parte del correo o del nombre', async () => {
    // El caso real no siempre es «¿está este correo?» sino «no me acuerdo con cuál la creé».
    // Ahí una búsqueda exacta no sirve de nada.
    CUENTAS['base-principal'] = [CUENTA('ana@erp.cl', 'Ana'), CUENTA('eliseo@hotmail.com', 'Eliseo')];

    const porCorreo = await pedir('/api/talleres/cuentas?texto=hotmail');
    assert.deepStrictEqual(porCorreo.cuerpo.cuentas.map((c) => c.email), ['eliseo@hotmail.com']);

    const porNombre = await pedir('/api/talleres/cuentas?texto=ana');
    assert.deepStrictEqual(porNombre.cuerpo.cuentas.map((c) => c.email), ['ana@erp.cl']);
});

test('una base caída no corta la consulta: se marca y las demás se muestran igual', async () => {
    // Enterarse de eso es justamente para lo que existe el panel. Y además: contestar «no
    // está» con una base sin revisar manda a invitar una cuenta que ya existe.
    filas.push({ slug: 'taller-lopez', nombre: 'Taller López', estado: 'activo', mongoUri: 'mongodb://servidor/lopez', fechaAlta: new Date() });
    CUENTAS['base-principal'] = [CUENTA('ana@erp.cl', 'Ana')];
    SIN_CUENTAS = ['base-taller-lopez'];

    const { cuerpo } = await pedir('/api/talleres/cuentas');
    assert.deepStrictEqual(cuerpo.cuentas.map((c) => c.email), ['ana@erp.cl']);
    assert.deepStrictEqual(cuerpo.fallidos.map((f) => f.taller), ['taller-lopez']);
});

test('un taller suspendido se nombra en vez de desaparecer', async () => {
    // Un taller suspendido no obtiene conexión, y el corte está en el registro. Omitirlo en
    // silencio haría creer que se revisó todo — y la cuenta buscada puede estar justo ahí.
    filas.push({ slug: 'taller-123', nombre: 'Taller 123', estado: 'activo', mongoUri: 'mongodb://servidor/123', fechaAlta: new Date() });
    SIN_BASE = ['taller-123'];
    CUENTAS['base-principal'] = [CUENTA('ana@erp.cl', 'Ana')];

    const { cuerpo } = await pedir('/api/talleres/cuentas');
    assert.deepStrictEqual(cuerpo.fallidos.map((f) => f.taller), ['taller-123']);
    assert.deepStrictEqual(cuerpo.revisados, ['principal']);
});

test('se puede acotar a un solo taller', async () => {
    filas.push({ slug: 'taller-lopez', nombre: 'Taller López', estado: 'activo', mongoUri: 'mongodb://servidor/lopez', fechaAlta: new Date() });
    CUENTAS['base-principal'] = [CUENTA('ana@erp.cl', 'Ana')];
    CUENTAS['base-taller-lopez'] = [CUENTA('eliseo@hotmail.com', 'Eliseo')];

    const { cuerpo } = await pedir('/api/talleres/cuentas?taller=taller-lopez');
    assert.deepStrictEqual(cuerpo.revisados, ['taller-lopez']);
    assert.deepStrictEqual(cuerpo.cuentas.map((c) => c.email), ['eliseo@hotmail.com']);
});

test('la lista dice si cada cuenta entró alguna vez, y cuándo se creó', async () => {
    // Es lo que cierra «creo que yo sí había entrado con esa cuenta»: una invitación que
    // nunca se activó y una cuenta que se usó y se rompió se ven idénticas sin esto. Y la
    // fecha de creación descarta de una lo otro que se sospecha enseguida, que algo la borró.
    const entrada = new Date('2026-10-20T12:00:00Z');
    const creada = new Date('2026-10-18T09:00:00Z');
    CUENTAS['base-principal'] = [
        { ...CUENTA('usada@erp.cl', 'Usada'), ultimoAccesoSpa: entrada, createdAt: creada },
        { _id: 'y', email: 'nunca@erp.cl', nombre: 'Nunca', estado: 'activo', createdAt: creada },
    ];
    const { cuerpo } = await pedir('/api/talleres/cuentas');
    const por = Object.fromEntries(cuerpo.cuentas.map((c) => [c.email, c]));
    assert.strictEqual(new Date(por['usada@erp.cl'].ultimoAcceso).toISOString(), entrada.toISOString());
    assert.strictEqual(new Date(por['usada@erp.cl'].creada).toISOString(), creada.toISOString());
    assert.strictEqual(por['nunca@erp.cl'].ultimoAcceso, null, 'nunca entró tiene que ser null');
});

test('sin la clave del panel no se lista nada', async () => {
    // Es la regla que sostiene todo lo anterior: esto ensancha lo que vale PANEL_TOKEN, así
    // que la puerta tiene que ser exactamente la misma que la del resto del panel.
    CUENTAS['base-principal'] = [CUENTA('ana@erp.cl', 'Ana')];
    const { estado } = await pedir('/api/talleres/cuentas', { clave: null });
    assert.strictEqual(estado, 401);
});

test('distingue quién puede entrar de quién tiene la invitación sin activar', async () => {
    CUENTAS['base-principal'] = [
        CUENTA('activa@erp.cl', 'Activa'),
        { _id: 'x', email: 'pendiente@erp.cl', nombre: 'Pendiente', estado: 'activo' },
        CUENTA('fuera@erp.cl', 'Fuera', { estado: 'revocado' }),
    ];
    const { cuerpo } = await pedir('/api/talleres/cuentas');
    const por = Object.fromEntries(cuerpo.cuentas.map((c) => [c.email, c]));
    assert.strictEqual(por['activa@erp.cl'].puedeEntrar, true);
    assert.strictEqual(por['pendiente@erp.cl'].invitacionSinActivar, true);
    assert.strictEqual(por['fuera@erp.cl'].puedeEntrar, false);
    assert.strictEqual(por['fuera@erp.cl'].estado, 'revocado');
});
