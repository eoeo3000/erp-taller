// El cierre de la cadena: aunque el prefijo del token haya elegido una base, la sesión solo
// vale si la persona pertenece a ESE taller.
//
// Es la prueba que más importa de la etapa 1. El prefijo del token lo manda el cliente, así
// que por sí solo no prueba nada; lo que convierte eso en seguro es confrontarlo con lo que
// dice la base. Hoy, con un solo taller, esta comprobación nunca falla — existe desde ahora
// justamente para no tener que acordarse de agregarla el día que haya dos, que es el olvido
// que convierte un sistema multi-cliente en una filtración. Ver docs/multi-taller.md §4.
const test = require('node:test');
const assert = require('node:assert');
const { ObjectId } = require('bson');
const { hashToken, conPrefijo, generarToken } = require('../src/utils/tokens');

// Los modelos se sustituyen antes de requerir el middleware: `sesion.js` desestructura las
// fábricas al cargarse. Sin Mongo en este entorno, es la forma de ejercitar el camino real.
const ahora = new Date();
const futuro = new Date(Date.now() + 60 * 60 * 1000);
let sesionGuardada = null;
let usuarioGuardado = null;

for (const [ruta, fabrica] of [
    ['../src/models/SesionStaff', () => ({
        findOne: async ({ tokenHash }) => (sesionGuardada && sesionGuardada.tokenHash === tokenHash ? { ...sesionGuardada } : null),
        updateOne: async () => ({}),
    })],
    ['../src/models/Usuario', () => ({
        findById: async (id) => (usuarioGuardado && String(usuarioGuardado._id) === String(id) ? { ...usuarioGuardado } : null),
    })],
]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports: fabrica };
}

const { identificar } = require('../src/middlewares/sesion');

// Arma la request como la dejaría middlewares/entorno.js y corre `identificar`.
async function identificarCon({ tokenEnviado, tallerResuelto }) {
    const req = {
        db: {}, taller: tallerResuelto,
        headers: { authorization: `Bearer ${tokenEnviado}` },
        get(nombre) { return this.headers[String(nombre).toLowerCase()]; },
    };
    await new Promise((listo) => identificar(req, {}, listo));
    return req.usuario || null;
}

function prepararSesion({ tallerDelUsuario }) {
    const token = generarToken();
    const usuarioId = new ObjectId();
    usuarioGuardado = {
        _id: usuarioId, nombre: 'Jefa de taller', estado: 'activo',
        // undefined = cuenta anterior a que el campo existiera.
        ...(tallerDelUsuario === undefined ? {} : { tallerId: tallerDelUsuario }),
    };
    sesionGuardada = {
        _id: new ObjectId(), usuarioId, tokenHash: hashToken(token),
        estado: 'activa', expira: futuro, expiraAbsoluto: futuro, ultimoAcceso: ahora,
    };
    return token;
}

test('la sesión vale cuando el usuario pertenece al taller que se resolvió', async () => {
    const token = prepararSesion({ tallerDelUsuario: 'principal' });
    const usuario = await identificarCon({
        tokenEnviado: conPrefijo('principal', token), tallerResuelto: 'principal',
    });
    assert.ok(usuario, 'debería identificar');
    assert.strictEqual(usuario.nombre, 'Jefa de taller');
});

test('NO vale si el usuario es de otro taller que el resuelto', async () => {
    // El escenario que esto previene: mañana hay dos talleres, y por cualquier camino
    // —un prefijo forjado que sí exista, un error al resolver— la base abierta no es la de
    // quien tiene el token. Acá se corta.
    const token = prepararSesion({ tallerDelUsuario: 'competidor' });
    const usuario = await identificarCon({
        tokenEnviado: conPrefijo('principal', token), tallerResuelto: 'principal',
    });
    assert.strictEqual(usuario, null, 'un usuario de otro taller no debe quedar identificado');
});

test('una cuenta sin tallerId (anterior al cambio) se entiende del taller por defecto', async () => {
    // Si esto no funcionara, desplegar dejaría afuera a todas las cuentas que ya existen.
    const token = prepararSesion({ tallerDelUsuario: undefined });
    const usuario = await identificarCon({
        tokenEnviado: conPrefijo('principal', token), tallerResuelto: 'principal',
    });
    assert.ok(usuario, 'las cuentas existentes tienen que seguir entrando');
});

test('un token sin prefijo, de una sesión abierta antes, sigue sirviendo', async () => {
    const token = prepararSesion({ tallerDelUsuario: 'principal' });
    const usuario = await identificarCon({ tokenEnviado: token, tallerResuelto: 'principal' });
    assert.ok(usuario, 'las sesiones abiertas no deben cortarse al desplegar');
});

test('el prefijo no es parte del secreto: cambiarlo no hace válido un token inválido', async () => {
    prepararSesion({ tallerDelUsuario: 'principal' });
    const usuario = await identificarCon({
        tokenEnviado: conPrefijo('principal', generarToken()), tallerResuelto: 'principal',
    });
    assert.strictEqual(usuario, null);
});

test('un usuario revocado no entra, tenga el taller que tenga', async () => {
    const token = prepararSesion({ tallerDelUsuario: 'principal' });
    usuarioGuardado.estado = 'revocado';
    const usuario = await identificarCon({
        tokenEnviado: conPrefijo('principal', token), tallerResuelto: 'principal',
    });
    assert.strictEqual(usuario, null);
});

test('identificar nunca tumba la request, aunque el taller resuelto venga vacío', async () => {
    const token = prepararSesion({ tallerDelUsuario: 'principal' });
    const usuario = await identificarCon({ tokenEnviado: conPrefijo('principal', token), tallerResuelto: undefined });
    // Sin taller resuelto se usa el por defecto, que hoy es 'principal': identifica igual.
    assert.ok(usuario);
});
