// Qué puede hacer cada cuenta de escritorio.
//
// Hasta acá el campo `rol` existía y no decidía nada: `invitar` escribía `rol: 'administrador'`
// a mano, así que toda cuenta invitada al escritorio veía todo. Y esconder Finanzas y
// Contabilidad del menú tampoco protegía: respondían a cualquiera con sesión que escribiera la
// URL. El criterio, en config/roles.js: administración es lo que da o quita acceso a personas,
// la plata del taller y lo masivo. Lo demás —incluidos los PRECIOS dentro de una OT— es operación.
//
// Tres grupos de pruebas: el gate, quién lo lleva (contra las tablas de rutas de verdad), y los
// candados de las cuentas — el que importa es que un taller no pueda quedarse sin nadie que
// pueda dar acceso.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { ObjectId } = require('bson');

// --- Una base de mentira, compartida por los modelos sustituidos ---
let usuarios = [];
let bitacora = [];
const coincide = (u, filtro) => Object.entries(filtro).every(([campo, cond]) => {
    if (cond && typeof cond === 'object' && '$exists' in cond) {
        const v = u[campo];
        return cond.$exists ? (v !== undefined && v !== null && v !== cond.$ne) : v === undefined;
    }
    return (u[campo] ?? (campo === 'estado' ? 'activo' : undefined)) === cond;
});
const Usuario = {
    findOne: async (f) => usuarios.find((u) => coincide(u, f)) || null,
    findById: async (id) => {
        const u = usuarios.find((x) => String(x._id) === String(id));
        return u ? { ...u, save: async function () { Object.assign(u, this); } } : null;
    },
    create: async (doc) => { const u = { _id: new ObjectId(), estado: 'activo', ...doc }; usuarios.push(u); return u; },
    updateOne: async ({ _id }, cambios) => { Object.assign(usuarios.find((u) => String(u._id) === String(_id)), cambios); },
    countDocuments: async (f) => usuarios.filter((u) => coincide(u, f)).length,
};
for (const [ruta, exports] of [
    ['../src/models/Usuario', () => Usuario],
    ['../src/models/SesionStaff', () => ({ updateMany: async () => ({}) })],
    ['../src/models/BitacoraCuenta', () => ({ create: async (l) => { bitacora.push(l); return l; } })],
    ['../src/config/mailer', { sendMail: async () => ({}) }],
]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports };
}

const contratoRespuesta = require('../src/middlewares/respuestas');
const { requiereAdministrador } = require('../src/middlewares/rol');
const { revisarCambioDeRol, revocarCuenta, administradoresQuePuedenEntrar } = require('../src/servicios/cuentasDeTaller');
const cuentasRoutes = require('../src/routes/cuentasRoutes');

// `node --test` habla con sus hijos por un protocolo binario sobre stdout: un console.warn del
// código bajo prueba le corrompe el marco cada tantas corridas.
async function sinRuido(fn) {
    const { log, warn, error } = console;
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    try { return await fn(); } finally { Object.assign(console, { log, warn, error }); }
}

const admin = (extra = {}) => ({ _id: new ObjectId(), nombre: 'Jefa', email: `a${Math.random()}@t.cl`, rol: 'administrador', passwordHash: 'h', ...extra });
const operacion = (extra = {}) => ({ _id: new ObjectId(), nombre: 'Planificador', email: `o${Math.random()}@t.cl`, rol: 'operacion', passwordHash: 'h', ...extra });

test.beforeEach(() => { usuarios = []; bitacora = []; delete process.env.AUTH_REQUERIDA; });

// ============================================================================================
// 1. El gate
// ============================================================================================

function appCon(usuario) {
    const app = express();
    app.use((req, res, sig) => { if (usuario) req.usuario = usuario; sig(); });
    app.get('/x', requiereAdministrador, (req, res) => res.json({ ok: true }));
    return new Promise((listo) => { const s = app.listen(0, () => listo(s)); });
}
async function pedirX(usuario) {
    const s = await appCon(usuario);
    try {
        const r = await fetch(`http://127.0.0.1:${s.address().port}/x`);
        return { estado: r.status, cuerpo: await r.json() };
    } finally { s.close(); }
}

test('administración pasa', async () => {
    assert.strictEqual((await pedirX(admin())).estado, 200);
});

test('operación recibe 403 —no 401— y un motivo que se entiende', async () => {
    // 401 haría que el interceptor del SPA mande a esa persona a la pantalla de ingreso, como si
    // se le hubiera caído la sesión, y volvería a entrar para encontrarse con lo mismo.
    const { estado, cuerpo } = await pedirX(operacion());
    assert.strictEqual(estado, 403);
    assert.match(cuerpo.error, /solo para administración/);
});

test('un rol de terreno tampoco pasa', async () => {
    // No debería existir una sesión de escritorio con rol de terreno, pero si existiera no
    // puede valer como administración por no ser «operación».
    assert.strictEqual((await pedirX(admin({ rol: 'supervisor' }))).estado, 403);
});

test('sin login encendido, deja pasar: mismo rollout que los otros gates', async () => {
    // Antes del login no hay a quién preguntarle el rol. Cortar ahí dejaría a la oficina sin
    // Finanzas ni Contabilidad el día del deploy.
    assert.strictEqual((await pedirX(null)).estado, 200);
});

test('con login encendido, sin sesión es 401', async () => {
    process.env.AUTH_REQUERIDA = 'true';
    assert.strictEqual((await pedirX(null)).estado, 401);
});

// ============================================================================================
// 2. Quién lo lleva — contra las tablas de rutas de verdad
// ============================================================================================

// La cadena de middlewares de una ruta montada en un router, por nombre. Para `router.use`
// (montajes) la reconstruye preguntándole a cada capa si acepta la ruta; para rutas declaradas
// con verbo, mira el `route.stack` de esa ruta.
function cadenaDeMontaje(router, ruta) {
    return router.stack.filter((c) => c.matchers?.some((m) => m(ruta))).map((c) => c.name);
}
function cadenaDeRuta(router, metodo, ruta) {
    const capa = router.stack.find((c) => c.route && c.matchers?.some((m) => m(ruta)) && c.route.methods[metodo]);
    return capa ? capa.route.stack.map((h) => h.name) : null;
}

const api = require('../src/routes/index');
const portal = require('../src/routes/portalRoutes');
const usuariosRouter = require('../src/routes/usuarioRoutes');

test('la plata y lo masivo son de administración', () => {
    for (const ruta of ['/finanzas', '/contabilidad', '/import', '/demo']) {
        const pasos = cadenaDeMontaje(api, ruta);
        assert.ok(pasos.includes('requiereAdministrador'), `${ruta}: ${JSON.stringify(pasos)}`);
        assert.ok(pasos.indexOf('requiereSesion') < pasos.indexOf('requiereAdministrador'),
            `${ruta}: primero quién eres, después qué puedes`);
    }
});

test('quien arma una OT NO queda afuera de nada que necesite para armarla', () => {
    // La decisión del dueño: la operación ve los precios. Los precios salen de puestos
    // (costoHora), suministros, equipos y plantillas, y la OT se arma en /data, /ots y
    // /solicitudes. Si alguien le pusiera el gate a una de estas, la pantalla central del
    // sistema dejaría de funcionar para la operación — y esta prueba se pone roja.
    for (const ruta of ['/data', '/recursos', '/equipos', '/suministros', '/calendarios', '/puestos',
        '/plantillas', '/proveedores', '/ordenes-compra', '/clientes', '/ots', '/solicitudes', '/uploads/foto']) {
        const pasos = cadenaDeMontaje(api, ruta);
        assert.ok(!pasos.includes('requiereAdministrador'), `${ruta} no puede ser solo de administración`);
    }
});

test('administrar los accesos de los clientes exige sesión y administración', () => {
    // EL AGUJERO: el router del portal está montado sin gate (la PWA del cliente entra con su
    // propio token), y adentro vivía también la administración de esos accesos. GET
    // /api/portal/sesiones devolvía nombre, correo y empresa de cada contacto de cada cliente
    // sin pedir ninguna credencial.
    for (const [metodo, ruta] of [['get', '/sesiones'], ['get', '/stock-tokens'], ['post', '/sesiones/lote'],
        ['post', '/sesiones/x/revocar'], ['post', '/sesiones/x/reactivar'], ['post', '/sesiones/x/regenerar'],
        ['post', '/sesiones/x/reenviar'], ['delete', '/sesiones/x']]) {
        const pasos = cadenaDeRuta(portal, metodo, ruta);
        assert.ok(pasos, `no encontré ${metodo.toUpperCase()} ${ruta}`);
        assert.ok(pasos.includes('requiereSesion') && pasos.includes('requiereAdministrador'),
            `${metodo.toUpperCase()} ${ruta}: ${JSON.stringify(pasos)}`);
    }
});

test('lo que usa el propio cliente sigue abierto: entra con su token, no con sesión', () => {
    // Cerrar esto dejaría a todos los clientes sin portal. Comprobado en erp-pwa-cliente.
    for (const [metodo, ruta] of [['post', '/acceso'], ['get', '/mis-solicitudes'], ['post', '/solicitud'],
        ['post', '/solicitudes/x/cancelar'], ['post', '/ot/x/responder'], ['post', '/ot/x/hes']]) {
        const pasos = cadenaDeRuta(portal, metodo, ruta);
        assert.ok(pasos, `no encontré ${metodo.toUpperCase()} ${ruta}`);
        assert.ok(!pasos.includes('requiereSesion'), `${metodo.toUpperCase()} ${ruta} no puede exigir sesión de escritorio`);
    }
});

test('mandarle el link del portal a un cliente es de operación', () => {
    // Ingreso y Clientes lo usan todos los días. Sesión sí, administración no.
    const pasos = cadenaDeRuta(portal, 'post', '/emitir-token');
    assert.ok(pasos.includes('requiereSesion'));
    assert.ok(!pasos.includes('requiereAdministrador'));
});

test('dar acceso de terreno es de administración; whoami de la PWA sigue abierto', () => {
    for (const [metodo, ruta] of [['post', '/'], ['get', '/'], ['post', '/x/reemitir-token'],
        ['post', '/x/revocar'], ['post', '/x/reactivar'], ['delete', '/x']]) {
        const pasos = cadenaDeRuta(usuariosRouter, metodo, ruta);
        assert.ok(pasos?.includes('requiereAdministrador'), `${metodo.toUpperCase()} /usuarios${ruta}`);
    }
    const whoami = cadenaDeRuta(usuariosRouter, 'get', '/whoami');
    assert.ok(!whoami.includes('requiereSesion') && !whoami.includes('requiereAdministrador'),
        'whoami lo llama la PWA con su token: si se cierra, nadie de terreno puede entrar');
});

// ============================================================================================
// 3. Las cuentas: invitar con rol, cambiarlo, y no quedarse sin administración
// ============================================================================================

function appCuentas(quien) {
    const app = express();
    app.use(express.json());
    app.use(contratoRespuesta);
    app.use((req, res, sig) => { req.db = {}; req.taller = 'principal'; req.entorno = 'produccion'; req.usuario = quien; sig(); });
    app.use('/api/cuentas', cuentasRoutes);
    return new Promise((listo) => { const s = app.listen(0, () => listo(s)); });
}
async function cuentas(quien, metodo, ruta, cuerpo) {
    const s = await appCuentas(quien);
    try {
        const r = await sinRuido(() => fetch(`http://127.0.0.1:${s.address().port}/api/cuentas${ruta}`, {
            method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        }));
        return { estado: r.status, cuerpo: await r.json().catch(() => null) };
    } finally { s.close(); }
}

test('se puede invitar a alguien como operación', async () => {
    const jefa = admin(); usuarios.push(jefa);
    const { estado } = await cuentas(jefa, 'POST', '/invitar', { nombre: 'Ana', email: 'ana@t.cl', rol: 'operacion' });
    assert.strictEqual(estado, 201);
    assert.strictEqual(usuarios.find((u) => u.email === 'ana@t.cl').rol, 'operacion');
});

test('una invitación sin rol nace con el MENOR privilegio, no con el mayor', async () => {
    // Es lo que manda un SPA desplegado antes que este backend. Fallar hacia administración le
    // regalaría todo a quien se invite en esa ventana; hacia operación solo obliga a subírselo.
    const jefa = admin(); usuarios.push(jefa);
    await cuentas(jefa, 'POST', '/invitar', { nombre: 'Ana', email: 'ana@t.cl' });
    assert.strictEqual(usuarios.find((u) => u.email === 'ana@t.cl').rol, 'operacion');
});

test('un rol inventado se rechaza; tampoco se puede invitar con un rol de terreno', async () => {
    const jefa = admin(); usuarios.push(jefa);
    for (const rol of ['superadmin', 'supervisor', 'ejecutor']) {
        const { estado } = await cuentas(jefa, 'POST', '/invitar', { nombre: 'X', email: `${rol}@t.cl`, rol });
        assert.strictEqual(estado, 400, `rol ${rol}`);
    }
});

test('operación no puede invitar a nadie, ni siquiera a sí misma como administración', async () => {
    // Si pudiera, el rol no serviría de nada: bastaría con invitarse una segunda cuenta.
    const plan = operacion(); usuarios.push(admin(), plan);
    const { estado } = await cuentas(plan, 'POST', '/invitar', { nombre: 'Yo', email: 'yo2@t.cl', rol: 'administrador' });
    assert.strictEqual(estado, 403);
    assert.ok(!usuarios.some((u) => u.email === 'yo2@t.cl'), 'no puede haber creado nada');
});

test('el rol se cambia con Editar, y queda en la bitácora con el antes y el después', async () => {
    const jefa = admin(); const plan = operacion(); usuarios.push(jefa, plan);
    const { estado } = await cuentas(jefa, 'PUT', `/${plan._id}`, { rol: 'administrador' });
    assert.strictEqual(estado, 200);
    assert.strictEqual(usuarios.find((u) => String(u._id) === String(plan._id)).rol, 'administrador');
    const linea = bitacora.find((l) => l.accion === 'editada');
    assert.match(linea?.detalle || '', /Operación → Administración/);
});

test('nadie se cambia el rol a sí mismo', async () => {
    // Un administrador que se baja a operación por error ya no puede deshacerlo.
    const jefa = admin(); usuarios.push(jefa, admin());
    const { estado, cuerpo } = await cuentas(jefa, 'PUT', `/${jefa._id}`, { rol: 'operacion' });
    assert.strictEqual(estado, 409);
    assert.match(cuerpo.error, /a ti mismo/);
});

test('NO se baja de rol a la única cuenta de administración que puede entrar', async () => {
    // La forma nueva de quedarse sin salida que trajeron los roles: siguen habiendo cuentas que
    // entran, pero ninguna que pueda invitar, revocar ni dar acceso. Desde la app no se arregla.
    const unica = admin(); const otra = admin(); usuarios.push(unica, otra);
    otra.passwordHash = undefined; // invitación sin activar: NO cuenta como que puede entrar
    const problema = await revisarCambioDeRol({ Usuario, usuario: unica, rolNuevo: 'operacion', quien: null });
    assert.strictEqual(problema?.estado, 409);
    assert.match(problema.error, /única cuenta de administración/);
});

test('con dos administraciones que entran, sí se puede bajar una', async () => {
    const a = admin(); usuarios.push(a, admin());
    assert.strictEqual(await revisarCambioDeRol({ Usuario, usuario: a, rolNuevo: 'operacion', quien: null }), null);
});

test('NO se revoca a la única administración, aunque queden cuentas de operación', async () => {
    // El candado de siempre —«la única cuenta que puede entrar»— no lo ve: con una operación
    // activa, siguen quedando cuentas que entran.
    const unica = admin(); usuarios.push(unica, operacion());
    assert.strictEqual(await administradoresQuePuedenEntrar(Usuario), 1);
    const r = await revocarCuenta({ Usuario, SesionStaff: null, id: unica._id });
    assert.strictEqual(r.estado, 409);
    assert.match(r.error, /única cuenta de administración/);
});

test('una cuenta de operación sí se revoca aunque sea la única de su rol', async () => {
    const plan = operacion(); usuarios.push(admin(), plan);
    const r = await revocarCuenta({ Usuario, SesionStaff: null, id: plan._id });
    assert.ok(!r.error, r.error);
});
