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
    ['../src/config/conexiones', {
        conexionDeControl: () => ({}),
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
