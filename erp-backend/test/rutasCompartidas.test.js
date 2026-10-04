// Las rutas que comparten la oficina y la PWA Operativa (/ots y /solicitudes), por HTTP
// real contra las tablas de rutas de verdad.
//
// Lo que se prueba acá es el cableado del gate, no los controladores: por eso los
// controladores se sustituyen por respuestas vacías. Si alguien agrega una ruta nueva sin
// gate, o le pone el gate equivocado, es esto lo que tiene que ponerse rojo.
//
// El agujero que cerró este cambio: `GET /api/solicitudes` devolvía la cartera completa de
// clientes del taller —nombre, contacto, qué pidieron— sin pedir ninguna credencial.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { ObjectId } = require('bson');
const { hashToken, conPrefijo, generarToken } = require('../src/utils/tokens');

const TOKEN_OPERARIO = 'token-permanente-de-la-pwa';

// Una cuenta de oficina NO tiene el campo `token`. Está acá a propósito: es contra este
// documento que una búsqueda con token vacío haría match si alguien quitara el descarte.
// `save()` está porque resolverUsuarioPorToken marca el último acceso sobre el documento
// que encuentra: un doble sin ese método hace fallar la identificación por un motivo que no
// tiene nada que ver con lo que se está probando.
const guardable = (doc) => ({ ...doc, save: async () => {} });
const cuentaDeOficina = { _id: new ObjectId(), nombre: 'Jefa de taller', estado: 'activo', rol: 'administrador' };
const operario = { _id: new ObjectId(), nombre: 'Supervisor en terreno', estado: 'activo', rol: 'supervisor', token: TOKEN_OPERARIO };
let operarioRevocado = false;

// Las sustituciones van ANTES de requerir los routers: los módulos desestructuran sus
// dependencias al cargarse. `node --test` corre cada archivo en su propio proceso.
const futuro = new Date(Date.now() + 60 * 60 * 1000);
let sesionDeEscritorio = null;

const stub = (req, res) => res.json({ ok: true });
for (const [ruta, exports] of [
    ['../src/models/Usuario', () => ({
        findOne: async (filtro) => {
            // Imita lo que hace Mongo: `null` hace match con los documentos SIN el campo.
            const candidatos = [cuentaDeOficina, { ...operario, estado: operarioRevocado ? 'revocado' : 'activo' }];
            const hallado = candidatos.find((u) => (filtro.token == null ? u.token == null : u.token === filtro.token)
                && u.estado === filtro.estado);
            return hallado ? guardable(hallado) : null;
        },
        findById: async (id) => (String(id) === String(cuentaDeOficina._id) ? { ...cuentaDeOficina } : null),
    })],
    ['../src/models/SesionStaff', () => ({
        findOne: async ({ tokenHash }) => (sesionDeEscritorio?.tokenHash === tokenHash ? { ...sesionDeEscritorio } : null),
        updateOne: async () => ({}),
    })],
    ['../src/controllers/otController', {
        obtenerOTPorSolicitud: stub, convertirOT: stub, webhookEmail: stub, accionMovil: stub,
        antecedentes: stub, asignarSupervisor: stub, obtenerOTPorId: stub, actualizarOT: stub, eliminarOT: stub,
    }],
    ['../src/controllers/solicitudController', {
        obtenerSolicitudes: (req, res) => res.json([{ solicitante: 'Cliente Secreto S.A.', telefono: '+569...' }]),
        obtenerSolicitud: stub, crearSolicitud: stub, actualizarEstado: stub, eliminarSolicitud: stub,
    }],
]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports };
}

const { identificar } = require('../src/middlewares/sesion');
const otRoutes = require('../src/routes/otRoutes');
const solicitudRoutes = require('../src/routes/solicitudRoutes');

function levantar() {
    const app = express();
    app.use(express.json());
    app.use((req, res, siguiente) => { req.db = {}; req.taller = 'principal'; req.entorno = 'produccion'; siguiente(); });
    app.use(identificar);
    app.use('/api/ots', otRoutes);
    app.use('/api/solicitudes', solicitudRoutes);
    return new Promise((listo) => {
        const servidor = app.listen(0, () => listo({ servidor, base: `http://127.0.0.1:${servidor.address().port}` }));
    });
}

function sesionDeOficina() {
    const token = generarToken();
    sesionDeEscritorio = {
        _id: new ObjectId(), usuarioId: cuentaDeOficina._id, tokenHash: hashToken(token),
        estado: 'activa', expira: futuro, expiraAbsoluto: futuro, ultimoAcceso: new Date(),
    };
    return conPrefijo('principal', token);
}

// Corre una request con los gates ENCENDIDOS, que es como queda producción al terminar el
// rollout. Devuelve el estado y el cuerpo.
async function pedir(ruta, { token, sesion, metodo = 'GET' } = {}) {
    process.env.AUTH_REQUERIDA = 'true';
    process.env.IDENTIDAD_REQUERIDA = 'true';
    const { servidor, base } = await levantar();
    try {
        const url = `${base}${ruta}${token !== undefined ? `${ruta.includes('?') ? '&' : '?'}token=${token}` : ''}`;
        const resp = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json', ...(sesion ? { Authorization: `Bearer ${sesion}` } : {}) },
            ...(metodo === 'GET' || metodo === 'DELETE' ? {} : { body: '{}' }),
        });
        return { estado: resp.status, cuerpo: await resp.json().catch(() => null) };
    } finally {
        servidor.close();
        delete process.env.AUTH_REQUERIDA;
        delete process.env.IDENTIDAD_REQUERIDA;
    }
}

test('el listado de solicitudes ya no se entrega sin credenciales', async () => {
    // El agujero concreto: con la URL del backend, cualquiera bajaba la cartera de clientes.
    const { estado, cuerpo } = await pedir('/api/solicitudes');
    assert.strictEqual(estado, 401);
    assert.ok(!JSON.stringify(cuerpo).includes('Cliente Secreto'), 'no puede devolver datos de clientes');
});

test('el listado es solo de la oficina: ni siquiera vale el token de un operario', async () => {
    // Es `requiereSesion`, no `requiereIdentidad`: ninguna app móvil pide esta ruta, y lo
    // comprobé en los tres frontends antes de cerrarla.
    const { estado } = await pedir('/api/solicitudes', { token: TOKEN_OPERARIO });
    assert.strictEqual(estado, 401);
    assert.strictEqual((await pedir('/api/solicitudes', { sesion: sesionDeOficina() })).estado, 200);
});

test('una OT no se lee sin identidad, y sí con cualquiera de las dos', async () => {
    const id = new ObjectId();
    assert.strictEqual((await pedir(`/api/ots/${id}`)).estado, 401, 'sin nada');
    assert.strictEqual((await pedir(`/api/ots/${id}`, { token: TOKEN_OPERARIO })).estado, 200, 'con token de la PWA');
    assert.strictEqual((await pedir(`/api/ots/${id}`, { sesion: sesionDeOficina() })).estado, 200, 'con sesión de oficina');
});

test('una solicitud suelta la lee la PWA con su token, no cualquiera', async () => {
    const id = new ObjectId();
    assert.strictEqual((await pedir(`/api/solicitudes/${id}`)).estado, 401);
    assert.strictEqual((await pedir(`/api/solicitudes/${id}`, { token: TOKEN_OPERARIO })).estado, 200);
});

test('guardar el informe desde la PWA sigue funcionando; borrar la OT no', async () => {
    const id = new ObjectId();
    // PUT /ots/:id es donde la PWA guarda el informe de evaluación: si esto se rompe, el
    // supervisor pierde su trabajo en terreno.
    assert.strictEqual((await pedir(`/api/ots/${id}`, { token: TOKEN_OPERARIO, metodo: 'PUT' })).estado, 200);
    // Borrar es de la oficina y de nadie más.
    assert.strictEqual((await pedir(`/api/ots/${id}`, { token: TOKEN_OPERARIO, metodo: 'DELETE' })).estado, 401);
});

test('un token vacío NO se hace pasar por una cuenta de oficina', async () => {
    // La trampa del esquema: las cuentas de oficina no tienen el campo `token`, y en Mongo
    // `{ token: null }` hace match justamente con esos documentos. Sin el descarte del valor
    // vacío, llamar sin token identificaría a la primera cuenta administrativa que aparezca.
    for (const vacio of ['', '%20']) {
        const { estado } = await pedir(`/api/ots/${new ObjectId()}`, { token: vacio });
        assert.strictEqual(estado, 401, `token "${vacio}" no puede valer`);
    }
});

test('un operario revocado deja de entrar al instante', async () => {
    operarioRevocado = true;
    const { estado } = await pedir(`/api/ots/${new ObjectId()}`, { token: TOKEN_OPERARIO });
    operarioRevocado = false;
    assert.strictEqual(estado, 401);
});

test('un token inventado no sirve', async () => {
    assert.strictEqual((await pedir(`/api/ots/${new ObjectId()}`, { token: 'me-lo-invente' })).estado, 401);
});

test('sin IDENTIDAD_REQUERIDA el gate deja pasar: el rollout no rompe las PWAs instaladas', async () => {
    // A propósito, y es la parte reversible del cambio. Un teléfono en terreno con una copia
    // vieja de la app tiene que seguir funcionando entre el deploy del backend y el de la
    // PWA; recién cuando se confirma en un teléfono de verdad se enciende la variable.
    const { servidor, base } = await levantar();
    try {
        const resp = await fetch(`${base}/api/ots/${new ObjectId()}`);
        assert.strictEqual(resp.status, 200);
    } finally {
        servidor.close();
    }
});

test('se avisa de la combinación que deja a la oficina afuera', () => {
    // IDENTIDAD_REQUERIDA sin AUTH_REQUERIDA: el SPA no manda sesión, así que recibiría 401
    // en cada pantalla de OT y solicitudes. Es una configuración que nadie quiere y que sin
    // esto solo se descubre con la app muerta.
    const { avisarConfiguracion } = require('../src/middlewares/identidad');
    const errores = [];
    const original = console.error;
    console.error = (...a) => errores.push(a.join(' '));
    try {
        process.env.IDENTIDAD_REQUERIDA = 'true';
        delete process.env.AUTH_REQUERIDA;
        assert.strictEqual(avisarConfiguracion(), false);
        assert.match(errores.join('\n'), /AUTH_REQUERIDA/);

        process.env.AUTH_REQUERIDA = 'true';
        assert.strictEqual(avisarConfiguracion(), true, 'con las dos activas no hay nada que avisar');

        delete process.env.IDENTIDAD_REQUERIDA;
        delete process.env.AUTH_REQUERIDA;
        assert.strictEqual(avisarConfiguracion(), true, 'con las dos apagadas tampoco');
    } finally {
        console.error = original;
        delete process.env.IDENTIDAD_REQUERIDA;
        delete process.env.AUTH_REQUERIDA;
    }
});
