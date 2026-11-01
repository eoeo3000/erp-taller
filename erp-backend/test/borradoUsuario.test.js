// Qué pasa al apretar «Eliminar» en Bodega de tokens.
//
// Esta prueba nace de un incidente en producción: desde la pestaña «Cuentas de oficina» se
// borraron TODAS las cuentas de un taller. El borrado no tenía ninguna guarda, y como
// `Usuario` es la única tabla de personas, en el mismo clic se fueron las cuentas de oficina,
// los tokens de terreno y —en cascada— las asignaciones de cada persona. Al irse la última
// cuenta con clave, `GET /auth/yo` volvió a responder `requiereInstalacion`: el taller quedó
// afuera de su propia app, con la ventana de instalación reabierta.
//
// Lo que se prueba es que ninguna de las tres cosas pueda repetirse.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { ObjectId } = require('bson');

const ID_OFICINA = new ObjectId();
const ID_CON_TRABAJO = new ObjectId();
const ID_LIBRE = new ObjectId();
const ID_RECURSO = new ObjectId();

let borrados = [];
let asignacionesBorradas = 0;
let consultaDeListar = null;

const USUARIOS = () => [
    // Una cuenta de oficina: entra con correo y clave, NO tiene token de terreno.
    { _id: ID_OFICINA, nombre: 'Jefa de taller', email: 'jefa@taller.cl', passwordHash: 'scrypt$…' },
    // Terreno, con trabajo registrado.
    { _id: ID_CON_TRABAJO, nombre: 'Supervisor con historial', token: 'abc', recursoId: ID_RECURSO },
    // Terreno, sin nada: el único caso que de verdad se puede borrar.
    { _id: ID_LIBRE, nombre: 'Acceso de prueba', token: 'xyz' },
];

for (const [ruta, exports] of [
    ['../src/models/Usuario', () => ({
        findById: async (id) => USUARIOS().find((u) => String(u._id) === String(id)) || null,
        deleteOne: async ({ _id }) => { borrados.push(String(_id)); return { deletedCount: 1 }; },
        // Imita lo que hace Mongo con `{ email: { $in: [null, ''] } }`: también hace match
        // con los documentos que NO tienen el campo.
        find: (filtro) => {
            consultaDeListar = filtro;
            const quiereSinCorreo = Array.isArray(filtro?.email?.$in);
            const filas = USUARIOS().filter((u) => !quiereSinCorreo || !u.email);
            const cadena = { select: () => cadena, sort: () => filas };
            return cadena;
        },
    })],
    ['../src/models/Asignacion', () => ({
        countDocuments: async ({ usuarioId }) => (String(usuarioId) === String(ID_CON_TRABAJO) ? 34 : 0),
        deleteMany: async () => { asignacionesBorradas += 1; return {}; },
    })],
    ['../src/models/Recurso', () => ({ updateOne: async () => ({}) })],
]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports };
}

const ctrl = require('../src/controllers/usuarioController');

function levantar() {
    const app = express();
    app.use(express.json());
    app.use((req, res, siguiente) => { req.db = {}; req.taller = 'principal'; siguiente(); });
    app.delete('/api/usuarios/:id', ctrl.eliminar);
    return new Promise((listo) => {
        const servidor = app.listen(0, () => listo({ servidor, base: `http://127.0.0.1:${servidor.address().port}` }));
    });
}

async function borrar(id) {
    borrados = [];
    asignacionesBorradas = 0;
    const { servidor, base } = await levantar();
    try {
        const resp = await fetch(`${base}/api/usuarios/${id}`, { method: 'DELETE' });
        return { estado: resp.status, cuerpo: await resp.json().catch(() => ({})) };
    } finally {
        servidor.close();
    }
}

test('una cuenta de oficina NO se borra desde la pantalla de tokens de terreno', async () => {
    // Que las dos cosas vivan en la misma tabla es un detalle de implementación. No puede
    // traducirse en que el botón de una sirva para destruir la otra — que es exactamente lo
    // que pasó.
    const { estado, cuerpo } = await borrar(ID_OFICINA);
    assert.strictEqual(estado, 409);
    assert.match(cuerpo.error, /cuenta de oficina/i);
    assert.match(cuerpo.error, /Revocar/i, 'tiene que decir qué hacer en su lugar');
    assert.deepStrictEqual(borrados, [], 'no puede haber borrado nada');
});

test('borrar la última cuenta con clave es imposible, así que la app no puede dejarte afuera', async () => {
    // El daño real del incidente: sin ninguna cuenta con clave, GET /auth/yo vuelve a
    // responder `requiereInstalacion` y reabre la ventana de instalación del taller. La
    // guarda de arriba lo hace inalcanzable, porque NINGUNA cuenta de oficina se borra.
    for (const u of USUARIOS().filter((x) => x.email)) {
        assert.strictEqual((await borrar(u._id)).estado, 409, `${u.email} no puede borrarse`);
    }
});

test('una persona con trabajo registrado no se borra, y el mensaje dice cuánto', async () => {
    // «Tiene asignaciones» no deja decidir; «tiene 34» sí.
    const { estado, cuerpo } = await borrar(ID_CON_TRABAJO);
    assert.strictEqual(estado, 409);
    assert.match(cuerpo.error, /34/, 'el número tiene que estar en el mensaje');
    assert.match(cuerpo.error, /Revocar/i);
    assert.deepStrictEqual(borrados, []);
});

test('las asignaciones ya no se borran en cascada: ese camino no existe', async () => {
    // Era la pérdida que no se podía deshacer — el registro de qué trabajo hizo cada
    // persona, que no estaba en ninguna otra parte. Ahora ninguna de las tres rutas llega a
    // un deleteMany.
    for (const id of [ID_OFICINA, ID_CON_TRABAJO, ID_LIBRE]) await borrar(id);
    assert.strictEqual(asignacionesBorradas, 0);
});

test('un acceso de terreno sin trabajo sí se borra: la pantalla sigue sirviendo', async () => {
    // Las guardas no pueden dejar inútil el botón. El caso para el que existe —un token
    // emitido por error, que nunca se usó— sigue funcionando.
    const { estado } = await borrar(ID_LIBRE);
    assert.strictEqual(estado, 200);
    assert.deepStrictEqual(borrados, [String(ID_LIBRE)]);
});

test('un id que no existe sigue dando 404 y no 409', async () => {
    assert.strictEqual((await borrar(new ObjectId())).estado, 404);
});


test('la lista de Bodega de tokens NO muestra las cuentas de oficina', async () => {
    // Este es el camino por el que pasó el incidente: `listar` era un `find()` pelado, así
    // que las cuentas de oficina salían en esa tabla con su botón «Eliminar» apuntando a
    // DELETE /api/usuarios/:id. El backend ahora las rechaza, pero ofrecer un botón que va a
    // fallar es peor que no ofrecerlo — mismo criterio que el enlace de instalación de un
    // taller que ya opera.
    const app = express();
    app.use((req, res, siguiente) => { req.db = {}; siguiente(); });
    app.get('/api/usuarios', ctrl.listar);
    const servidor = await new Promise((listo) => {
        const s = app.listen(0, () => listo(s));
    });
    try {
        const resp = await fetch(`http://127.0.0.1:${servidor.address().port}/api/usuarios`);
        const filas = await resp.json();
        const correos = filas.filter((u) => u.email);
        assert.deepStrictEqual(correos, [], 'ninguna cuenta de oficina puede salir acá');
        assert.ok(filas.some((u) => String(u._id) === String(ID_LIBRE)), 'los de terreno sí');
        // Y que el corte esté en la CONSULTA y no en un filtro posterior: traer a toda la
        // gente de la base para después descartarla es trabajo de más y, sobre todo, deja
        // el documento completo pasando por un lugar donde no tiene nada que hacer.
        assert.ok(consultaDeListar?.email, 'el filtro tiene que ir en el find(), no después');
    } finally {
        servidor.close();
    }
});
