// Las PWAs y el taller de cada una — etapa 4 de docs/multi-taller.md.
//
// El problema que esto cierra: `middlewares/entorno.js` resolvía el taller MIRANDO SOLO el
// `Authorization: Bearer` de la sesión de escritorio. La PWA Operativa y el portal del
// cliente no mandan eso — mandan `?token=` —, así que toda llamada suya caía en la base del
// taller por defecto. Con un cliente no se notaba. Con dos, la gente de terreno del segundo
// y sus clientes buscaban su token en la base del primero, no lo encontraban, y no podían
// entrar: la app de escritorio andaba y las dos PWAs no, sin un solo error que lo explicara.
//
// Lo que se prueba acá es lo mismo que ya se probó para el login (test/loginTaller.test.js):
// que el prefijo sirva para encontrar TU base, y que no sirva para entrar a la de otro.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { ObjectId } = require('bson');
const { conPrefijo } = require('../src/utils/tokens');

const REGISTRADOS = { principal: 'activo', 'taller-lopez': 'activo' };

// Personas por base. El MISMO token en dos talleres no se prueba —son aleatorios— pero sí
// una persona por base, que es lo que distingue "buscó en la base correcta" de "buscó en
// cualquiera".
let personasPorBase = {};

const conexionDe = (slug) => ({ name: `base-${slug}`, slug });

for (const [ruta, exports] of [
    ['../src/config/conexiones', {
        resolverTaller: (slug) => {
            const limpio = String(slug || '').trim().toLowerCase();
            return REGISTRADOS[limpio] === 'activo' ? limpio : null;
        },
        obtenerConexion: (entorno, slug) => {
            if (!REGISTRADOS[slug]) throw new Error(`Taller desconocido: ${slug}`);
            return conexionDe(slug);
        },
        conexionDisponible: () => true,
        inicializarConexiones: async () => {},
        conexionDeControl: () => null,
        marcaDeTaller: () => ({ nombre: '', logo: '' }),
    }],
    ['../src/models/Usuario', (conn) => ({
        findOne: async (filtro) => {
            const hallado = (personasPorBase[conn.slug] || [])
                .find((u) => u.token === filtro.token && u.estado === filtro.estado);
            return hallado ? { ...hallado, save: async () => {} } : null;
        },
    })],
]) {
    const resuelta = require.resolve(ruta);
    require.cache[resuelta] = { id: resuelta, filename: resuelta, loaded: true, exports };
}

const resolverEntorno = require('../src/middlewares/entorno');
const usuarioController = require('../src/controllers/usuarioController');

function levantar() {
    const app = express();
    app.use(express.json());
    app.use(resolverEntorno);
    // La ruta tal como la monta el router de verdad: la llama la PWA, por token y sin sesión.
    app.get('/api/usuarios/whoami', usuarioController.whoami);
    return new Promise((listo) => {
        const servidor = app.listen(0, () => listo({ servidor, base: `http://127.0.0.1:${servidor.address().port}` }));
    });
}

async function quienSoy(token, { porCabecera = false } = {}) {
    const { servidor, base } = await levantar();
    try {
        const url = porCabecera ? `${base}/api/usuarios/whoami` : `${base}/api/usuarios/whoami?token=${encodeURIComponent(token)}`;
        const resp = await fetch(url, porCabecera ? { headers: { 'X-Token-Operativo': token } } : undefined);
        return { estado: resp.status, cuerpo: await resp.json().catch(() => null) };
    } finally { servidor.close(); }
}

test.beforeEach(() => {
    const persona = (tallerId, nombre, token) => ({
        _id: new ObjectId(), nombre, puesto: 'Supervisor', rol: 'supervisor',
        estado: 'activo', token, tallerId, fechaEmision: new Date(),
    });
    personasPorBase = {
        principal: [
            persona('principal', 'Pedro del principal', 'aaaa1111'),
            // Sin tallerId: un acceso emitido antes de que el campo existiera.
            { ...persona(undefined, 'Antigua sin tallerId', 'cccc3333'), tallerId: undefined },
        ],
        'taller-lopez': [persona('taller-lopez', 'Laura de López', 'bbbb2222')],
    };
});

test('EL TOKEN DE OTRO TALLER ENCUENTRA SU BASE, NO LA DEL PRINCIPAL', async () => {
    // Es el bug entero de la etapa 4 en una línea: sin el prefijo, esto buscaba a Laura en
    // la base del principal, no la encontraba, y la PWA le respondía "token inválido".
    const { estado, cuerpo } = await quienSoy(conPrefijo('taller-lopez', 'bbbb2222'));
    assert.strictEqual(estado, 200);
    assert.strictEqual(cuerpo.nombre, 'Laura de López');
});

test('el token del principal sigue encontrando el principal', async () => {
    const { estado, cuerpo } = await quienSoy(conPrefijo('principal', 'aaaa1111'));
    assert.strictEqual(estado, 200);
    assert.strictEqual(cuerpo.nombre, 'Pedro del principal');
});

test('un token SIN prefijo sigue sirviendo: son los que ya están en los teléfonos', async () => {
    // Si esto fallara, desplegar dejaría sin app a toda la gente que está en terreno con la
    // copia instalada — justo el escenario que el rollout de IDENTIDAD_REQUERIDA evita.
    const { estado, cuerpo } = await quienSoy('aaaa1111');
    assert.strictEqual(estado, 200);
    assert.strictEqual(cuerpo.nombre, 'Pedro del principal');
});

test('una persona sin tallerId se entiende del taller por defecto', async () => {
    // Accesos anteriores a que el campo existiera. Rechazarlos sería dejar afuera a gente
    // que hoy trabaja.
    const { estado, cuerpo } = await quienSoy('cccc3333');
    assert.strictEqual(estado, 200);
    assert.strictEqual(cuerpo.nombre, 'Antigua sin tallerId');
});

test('EL PREFIJO NO SIRVE PARA ENTRAR A LA BASE DE OTRO', async () => {
    // El prefijo es ruteo y lo manda el cliente: elegir el de otro taller lleva a una base
    // donde ese token no está. 403, no los datos ajenos.
    const { estado } = await quienSoy(conPrefijo('taller-lopez', 'aaaa1111'));
    assert.strictEqual(estado, 403);
});

test('una persona que quedó en la base equivocada no entra, aunque su token esté ahí', async () => {
    // El caso que la comprobación de pertenencia existe para atajar, y que NO lo atrapa la
    // búsqueda por token: un documento que terminó en la base de otro taller —restaurar el
    // respaldo equivocado es la forma más fácil de que pase, y por eso restaurar.js avisa—.
    // El token SÍ está en esa base; lo que no cuadra es de quién dice ser.
    personasPorBase['taller-lopez'].push({
        _id: new ObjectId(), nombre: 'Pedro, mal restaurado', rol: 'supervisor',
        estado: 'activo', token: 'eeee5555', tallerId: 'principal',
    });
    const { estado } = await quienSoy(conPrefijo('taller-lopez', 'eeee5555'));
    assert.strictEqual(estado, 403, 'su tallerId dice principal y la base abierta es la de López');
});

test('un prefijo inventado se trata igual que ninguno: se busca en la base por defecto', async () => {
    // No se responde "ese taller no existe": eso convertiría el prefijo en un buscador de
    // qué clientes hay. Se ignora y se sigue, exactamente como con un token sin prefijo —
    // mismo criterio que `conexionPedida` para el login.
    //
    // Que el token del principal entre igual escribiendo un prefijo cualquiera no regala
    // nada: es su propio token, y termina en su propia base.
    const propio = await quienSoy('inventado.aaaa1111');
    assert.strictEqual(propio.estado, 200);
    assert.strictEqual(propio.cuerpo.nombre, 'Pedro del principal');

    // Y el de otro taller no entra por ahí: la base por defecto no lo tiene.
    assert.strictEqual((await quienSoy(conPrefijo('inventado', 'bbbb2222'))).estado, 403);
});

test('también funciona por cabecera, que es a donde la PWA puede migrar', async () => {
    const { estado, cuerpo } = await quienSoy(conPrefijo('taller-lopez', 'bbbb2222'), { porCabecera: true });
    assert.strictEqual(estado, 200);
    assert.strictEqual(cuerpo.nombre, 'Laura de López');
});

test('sin token no se identifica a nadie', async () => {
    // `findOne({ token: undefined })` viaja a Mongo como `{ token: null }` y hace match con
    // los documentos que NO tienen el campo: las cuentas de oficina.
    const { servidor, base } = await levantar();
    try {
        assert.strictEqual((await fetch(`${base}/api/usuarios/whoami`)).status, 403);
        assert.strictEqual((await fetch(`${base}/api/usuarios/whoami?token=`)).status, 403);
    } finally { servidor.close(); }
});

// --- El portal del cliente ---
//
// Misma historia que la PWA Operativa, por la otra puerta: el link que se le manda al
// cliente por WhatsApp lleva `?token=`, y su `SesionPortal` vive en la base de SU taller.
// Lo que cambia es que acá lo guardado es el HASH del token, así que el prefijo tiene que
// salir ANTES de hashear o no coincide nunca.
const crypto = require('node:crypto');
const portalController = require('../src/controllers/portalController');

test('el hash del portal se calcula sobre el token pelado', async () => {
    // Si el prefijo entrara al hash, el cliente de cualquier taller que no sea el principal
    // abriría su link y el portal le diría que no existe esa sesión.
    const pelado = 'd4d4d4d4';
    const esperado = crypto.createHash('sha256').update(pelado).digest('hex');

    assert.strictEqual(portalController.hashToken(conPrefijo('taller-lopez', pelado)), esperado);
    assert.strictEqual(portalController.hashToken(pelado), esperado, 'y uno sin prefijo da el mismo hash de siempre');
});

test('el link del portal lleva el prefijo del taller de ese cliente', async () => {
    const link = portalController.armarLinkPortalCliente('d4d4d4d4', 'produccion', 'taller-lopez');
    assert.ok(link.includes('token=taller-lopez.d4d4d4d4'), link);
});

test('el link de la PWA Operativa lleva el prefijo del taller de esa persona', async () => {
    const usuarioController = require('../src/controllers/usuarioController');
    const link = usuarioController.armarLink({ token: 'bbbb2222', tallerId: 'taller-lopez' }, 'produccion');
    assert.ok(link.includes('token=taller-lopez.bbbb2222'), link);

    // Sin tallerId —un acceso anterior al campo— sale como del taller por defecto, que es
    // donde de verdad está.
    assert.ok(usuarioController.armarLink({ token: 'aaaa1111' }, 'produccion').includes('token=principal.aaaa1111'));
});
