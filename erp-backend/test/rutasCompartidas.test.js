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
// Con qué taller/entorno se llamó a `almacenamiento.guardar` en la última subida.
const guardadoEn = [];
let tallerDeTurno = 'principal';
const cuentaDeOficina = { _id: new ObjectId(), nombre: 'Jefa de taller', estado: 'activo', rol: 'administrador' };
const operario = { _id: new ObjectId(), nombre: 'Supervisor en terreno', estado: 'activo', rol: 'supervisor', token: TOKEN_OPERARIO };
// Alguien de OTRO taller. Hace falta porque `resolverUsuarioPorToken` confronta el taller
// que resolvió la request contra el `tallerId` guardado: reusar el operario de arriba con
// la request resuelta a "rivas" se rechaza, y con razón — es justo el caso que la
// comprobación de pertenencia existe para atrapar (un documento que terminó en la base de
// otro taller, que es lo que pasa al restaurar el respaldo equivocado).
const TOKEN_OPERARIO_RIVAS = 'token-de-alguien-de-rivas';
const operarioDeRivas = { _id: new ObjectId(), nombre: 'Supervisor de Rivas', estado: 'activo', rol: 'supervisor', token: TOKEN_OPERARIO_RIVAS, tallerId: 'rivas' };
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
            const candidatos = [cuentaDeOficina, operarioDeRivas,
                { ...operario, estado: operarioRevocado ? 'revocado' : 'activo' }];
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
    ['../src/config/almacenamiento', {
        // Sustituido para que la prueba no escriba en disco ni en un bucket: lo que se
        // comprueba es el cableado del gate, no dónde termina el archivo. Guarda con qué
        // taller fue llamado, que es lo segundo que esto tiene que demostrar.
        guardar: async (buffer, nombre, opciones) => {
            guardadoEn.push(opciones);
            return { url: '/uploads/clave-de-mentira.jpg' };
        },
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
const { requiereIdentidad } = require('../src/middlewares/identidad');
const otRoutes = require('../src/routes/otRoutes');
const solicitudRoutes = require('../src/routes/solicitudRoutes');
const uploadRoutes = require('../src/routes/uploadRoutes');

function levantar() {
    const app = express();
    app.use(express.json());
    app.use((req, res, siguiente) => {
        // `tallerDeTurno` imita lo que `middlewares/entorno.js` ya dejó resuelto. Se fija a
        // mano porque esta prueba levanta los routers sueltos, sin ese middleware (que
        // necesitaría conexiones de Mongo de verdad). QUE el montaje de producción tenga el
        // gate puesto lo prueba montajes.test.js, contra la tabla de rutas real.
        req.db = {}; req.taller = tallerDeTurno; req.entorno = 'produccion'; siguiente();
    });
    app.use(identificar);
    app.use('/api/ots', otRoutes);
    app.use('/api/solicitudes', solicitudRoutes);
    app.use('/api/uploads', requiereIdentidad, uploadRoutes);
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

// --- POST /api/uploads/foto ---
//
// Era la última ruta de escritura sin ninguna credencial: cualquiera que supiera la URL del
// backend podía llenar el bucket, y el bucket se mide contra el tope del plan, que es del
// bucket ENTERO y no de cada cliente.

// `node --test` habla con sus procesos hijos por un protocolo binario sobre stdout: un
// `console.warn` suelto del código bajo prueba le corrompe el marco cada tantas corridas.
// El gate de identidad avisa cuando rechaza, así que hay que taparlo.
async function sinRuidoEnConsola(fn) {
    const { log, warn, error } = console;
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    try { return await fn(); } finally { Object.assign(console, { log, warn, error }); }
}

function fotoDeMentira() {
    const cuerpo = new FormData();
    cuerpo.append('foto', new Blob([Buffer.from('no-es-una-foto')], { type: 'image/jpeg' }), 'foto.jpg');
    return cuerpo;
}

async function subir({ token, sesion, cuerpo } = {}) {
    process.env.AUTH_REQUERIDA = 'true';
    process.env.IDENTIDAD_REQUERIDA = 'true';
    guardadoEn.length = 0;
    const { servidor, base } = await levantar();
    try {
        const url = `${base}/api/uploads/foto${token !== undefined ? `?token=${token}` : ''}`;
        const resp = await sinRuidoEnConsola(() => fetch(url, {
            method: 'POST',
            // Sin `Content-Type` a mano: lo pone `fetch` con el boundary del FormData.
            headers: { ...(sesion ? { Authorization: `Bearer ${sesion}` } : {}) },
            body: cuerpo || fotoDeMentira(),
        }));
        return { estado: resp.status, cuerpo: await resp.json().catch(() => null) };
    } finally {
        servidor.close();
        delete process.env.AUTH_REQUERIDA;
        delete process.env.IDENTIDAD_REQUERIDA;
    }
}

test('subir una foto ya no es gratis: sin credencial, 401', async () => {
    const { estado } = await subir();
    assert.strictEqual(estado, 401);
    assert.strictEqual(guardadoEn.length, 0, 'no puede haber llegado a guardar nada');
});

test('suben los dos clientes que de verdad suben: la oficina y la PWA', async () => {
    // El gate es `requiereIdentidad` y no `requiereSesion` justamente por esto: la PWA
    // Operativa sube fotos de evidencia desde terreno y no tiene sesión de escritorio. Si
    // alguien lo cambiara por `requiereSesion`, la segunda línea se pone roja — y lo que se
    // rompería en producción es la evidencia de un trabajo en curso.
    assert.strictEqual((await subir({ sesion: sesionDeOficina() })).estado, 201, 'oficina');
    assert.strictEqual((await subir({ token: TOKEN_OPERARIO })).estado, 201, 'PWA Operativa');
});

test('un token vacío tampoco sirve para subir', async () => {
    // Misma trampa que en las otras rutas: las cuentas de oficina no tienen el campo
    // `token`, y en Mongo `{ token: null }` hace match con ellas.
    for (const vacio of ['', '%20']) {
        assert.strictEqual((await subir({ token: vacio })).estado, 401, `token "${vacio}"`);
    }
});

test('la foto queda archivada en el taller de quien la sube, no en el por defecto', async () => {
    // El otro problema que cerró el gate, y que no era un agujero sino un extravío: sin
    // credencial, `middlewares/entorno.js` resuelve al taller por defecto, así que TODA foto
    // de TODO taller caía en `talleres/principal/`. La carpeta por cliente existe para
    // respaldar, medir y borrar por cliente; con las fotos de todos revueltas no sirve para
    // ninguna de las tres.
    tallerDeTurno = 'rivas';
    try {
        const { estado } = await subir({ token: TOKEN_OPERARIO_RIVAS });
        assert.strictEqual(estado, 201);
        assert.strictEqual(guardadoEn[0]?.taller, 'rivas', 'se archivó en el taller equivocado');
    } finally {
        tallerDeTurno = 'principal';
    }
});

test('el taller NUNCA sale del cuerpo de la request', async () => {
    // Si `guardar()` tomara el taller de lo que manda el cliente, escribir un nombre ajeno
    // bastaría para dejar archivos en la carpeta de otro cliente — y para contarlos en su
    // medición. Tiene que ganar `req.taller`, que lo puso el servidor.
    const cuerpo = new FormData();
    cuerpo.append('taller', 'rivas');
    cuerpo.append('entorno', 'demo');
    cuerpo.append('foto', new Blob([Buffer.from('x')], { type: 'image/jpeg' }), 'foto.jpg');
    const { estado } = await subir({ token: TOKEN_OPERARIO, cuerpo });
    assert.strictEqual(estado, 201);
    assert.strictEqual(guardadoEn[0]?.taller, 'principal', 'el cuerpo no puede elegir el taller');
    assert.strictEqual(guardadoEn[0]?.entorno, 'produccion', 'el cuerpo no puede elegir el entorno');
});

test('el token de alguien de otro taller no sube a la carpeta de este', async () => {
    // El gate no es solo "trae un token": `resolverUsuarioPorToken` confronta el taller que
    // resolvió la request contra el `tallerId` del documento. Sin eso, quien tuviera un
    // token válido de SU taller podría dejar archivos en la carpeta de otro —y contarlos en
    // su medición— con solo escribir otro prefijo.
    assert.strictEqual((await subir({ token: TOKEN_OPERARIO_RIVAS })).estado, 401, 'rivas sobre principal');
    assert.strictEqual(guardadoEn.length, 0, 'no puede haber guardado nada');
});
