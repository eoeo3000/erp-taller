// Qué gate tiene cada router, leído de la TABLA DE RUTAS DE VERDAD.
//
// Nace de un agujero en las propias pruebas. `rutasCompartidas.test.js` levanta los routers
// y los monta por su cuenta, así que prueba que `requiereIdentidad` funciona — pero no que
// `routes/index.js` lo tenga puesto. Al verificar la guarda en rojo se vio: sacando el gate
// del montaje de producción, las dieciséis pruebas seguían verdes. O sea que el día que
// alguien lo quitara, nada avisaría.
//
// Esto mira el `router.stack` real: para una ruta dada, qué middlewares la atraviesan y en
// qué orden. No sustituye nada y no levanta ningún servidor.
const test = require('node:test');
const assert = require('node:assert');

const api = require('../src/routes/index');

// La cadena de middlewares que atraviesa una ruta, por nombre y en orden. En Express 5 un
// `router.use('/x', gate, sub)` deja DOS capas con el mismo matcher, así que preguntarle a
// cada una si acepta la ruta reconstruye la cadena tal como corre.
function cadena(ruta) {
    return api.stack.filter((capa) => capa.matchers?.some((m) => m(ruta))).map((capa) => capa.name);
}

// Qué prueba tiene que traer quien llama a cada grupo. Está escrito a mano a propósito: que
// una ruta quede abierta tiene que ser una decisión que alguien escribe acá, no algo que
// pasa por olvido al agregar un `router.use`.
const ESPERADO = {
    // Sesión de escritorio: solo erp-web.
    '/data': 'requiereSesion',
    '/recursos': 'requiereSesion',
    '/equipos': 'requiereSesion',
    '/suministros': 'requiereSesion',
    '/calendarios': 'requiereSesion',
    '/puestos': 'requiereSesion',
    '/plantillas': 'requiereSesion',
    '/finanzas': 'requiereSesion',
    '/contabilidad': 'requiereSesion',
    '/import': 'requiereSesion',
    '/proveedores': 'requiereSesion',
    '/ordenes-compra': 'requiereSesion',
    '/disposiciones': 'requiereSesion',
    '/demo': 'requiereSesion',
    '/clientes': 'requiereSesion',

    // Lo suben erp-web (con sesión) y erp-pwa-operativa (con el token de la persona), así
    // que el gate acepta cualquiera de las dos. `requiereSesion` acá dejaría sin guardar su
    // evidencia a quien está en terreno.
    '/uploads/foto': 'requiereIdentidad',
};

// Los que NO llevan gate en el montaje, y por qué. Un router nuevo que aparezca abierto y
// no esté en esta lista pone roja la prueba de abajo.
const ABIERTOS = {
    '/auth': 'entrar, recuperar la clave y activar una invitación pasan ANTES de tener sesión',
    '/instalacion': 'la primera cuenta del taller; se cierra sola al existir una',
    '/cuentas': 'usa requiereSesionEstricta ruta por ruta, no en el montaje',
    '/respaldos': 'su propio candado, RESPALDO_TOKEN; sin la variable responde 503',
    '/talleres': 'el panel de quien arrienda, con PANEL_TOKEN; no es de ningún taller',
    '/ots': 'requiereIdentidad ruta por ruta: conviven rutas de oficina y de la PWA',
    '/solicitudes': 'igual que /ots, y por eso GET / es requiereSesion y GET /:id no',
    '/portal': 'el cliente, con su propia SesionPortal',
    '/asignaciones': 'la PWA, que comprueba el token dentro de cada controlador',
    '/tipos-trabajo': 'catálogo que no es de nadie en particular',
    '/catalogos-transversales': 'ídem',
    '/usuarios': 'mixto: /whoami por token, el resto exige sesión (ver usuarioRoutes.js)',
};

test('cada grupo de rutas lleva el gate que le corresponde', () => {
    for (const [ruta, gate] of Object.entries(ESPERADO)) {
        const pasos = cadena(ruta);
        assert.ok(pasos.includes(gate), `${ruta} debería pasar por ${gate} y pasa por ${JSON.stringify(pasos)}`);
        assert.ok(pasos.indexOf(gate) < pasos.lastIndexOf('router'),
            `${ruta}: el gate tiene que ir ANTES del router, no después`);
    }
});

test('subir una foto pasa por el gate ANTES de multer', () => {
    // No es un detalle de orden: multer lee el archivo entero a memoria (12MB de tope). Si
    // el gate corriera después, cualquiera podría hacer que el servidor reserve esa memoria
    // sin traer una sola credencial.
    const pasos = cadena('/uploads/foto');
    assert.strictEqual(pasos[0], 'requiereIdentidad', `la primera capa es ${pasos[0]}`);
});

test('ningún router queda abierto sin que alguien lo haya decidido', () => {
    const GATES = ['requiereSesion', 'requiereIdentidad'];
    for (const [ruta, porque] of Object.entries(ABIERTOS)) {
        const conGate = cadena(ruta).filter((n) => GATES.includes(n));
        assert.deepStrictEqual(conGate, [],
            `${ruta} ahora lleva ${conGate.join(', ')} — está bien, pero sácalo de ABIERTOS (motivo anotado: ${porque})`);
    }
});
