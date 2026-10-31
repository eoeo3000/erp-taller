// Qué queda escrito cuando algo le pasa a una cuenta.
//
// Nace de una semana entera sin poder contestar «¿esta cuenta estuvo activa alguna vez?».
// `ultimoAccesoSpa` dice cuándo fue la última y pisa la anterior; las OT ya tenían su
// bitácora y las cuentas no tenían nada, que es justo sobre lo que llegan las preguntas
// incómodas.
//
// Dos contratos en tensión, como en el log de recuperación:
//   1. Tiene que decir lo suficiente para contestar la pregunta.
//   2. NUNCA guarda credenciales. Esto se respalda, se restaura y se mira; un token de la
//      PWA ahí adentro sería un acceso regalado con fecha.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ObjectId } = require('bson');
const { armarLinea } = require('../src/servicios/bitacoraCuentas');
const { ACCIONES } = require('../src/models/BitacoraCuenta');

const usuario = {
    _id: new ObjectId(), email: 'eliseo@hotmail.com', nombre: 'Eliseo',
    passwordHash: 'HASH-SECRETO', token: 'TOKEN-DE-LA-PWA', resetHash: 'RESET-SECRETO',
};

test('registra quién lo hizo cuando lo hace alguien de la oficina', async () => {
    const linea = armarLinea({
        accion: 'revocada', usuario,
        req: { usuario: { nombre: 'Ana', email: 'ana@erp.cl' }, ip: '190.1.2.3' },
    });
    assert.strictEqual(linea.accion, 'revocada');
    assert.strictEqual(linea.email, 'eliseo@hotmail.com');
    assert.strictEqual(linea.porNombre, 'Ana');
    assert.strictEqual(linea.origen, 'app');
    assert.strictEqual(linea.ip, '190.1.2.3');
});

test('distingue lo que hace el PANEL de lo que hace la oficina', async () => {
    // Es media respuesta: sin esto, «revocada» no dice si fue el taller o el proveedor. Y
    // desde el panel no hay `req.usuario` porque quien arrienda no es una cuenta de esa base.
    const linea = armarLinea({ accion: 'revocada', usuario, req: { ip: '1.2.3.4' }, origen: 'panel' });
    assert.strictEqual(linea.origen, 'panel');
    assert.strictEqual(linea.porNombre, '', 'el panel no es una persona de ese taller');
});

test('lo que hace la propia persona queda sin autor, y eso se lee', async () => {
    // Entrar o activar la invitación lo hace uno mismo. Poner su propio nombre en «quién lo
    // hizo» no agrega nada y haría parecer que alguien actuó sobre otro.
    const linea = armarLinea({ accion: 'ingreso', usuario, req: { ip: '190.1.2.3' } });
    assert.strictEqual(linea.porNombre, '');
    assert.strictEqual(linea.origen, 'app');
});

test('NUNCA guarda credenciales, aunque el usuario las traiga', async () => {
    // Esto se respalda y se restaura. Un token de la PWA acá adentro sería un acceso
    // regalado, con fecha y nombre.
    const linea = armarLinea({ accion: 'ingreso', usuario, req: { ip: '1.2.3.4' } });
    const texto = JSON.stringify(linea);
    assert.ok(!texto.includes('HASH-SECRETO'), 'no puede salir el passwordHash');
    assert.ok(!texto.includes('TOKEN-DE-LA-PWA'), 'no puede salir el token de la PWA');
    assert.ok(!texto.includes('RESET-SECRETO'), 'no puede salir el hash de recuperación');
});

test('guarda el id Y el correo: cada uno sirve para algo distinto', async () => {
    // El id permite seguir a la cuenta aunque le cambien el correo; el correo mantiene la
    // línea legible si esa cuenta ya no existe.
    const linea = armarLinea({ accion: 'invitada', usuario, req: {} });
    assert.deepStrictEqual(linea.usuarioId, usuario._id);
    assert.strictEqual(linea.email, 'eliseo@hotmail.com');
});

test('sin req es un script, no la app', async () => {
    // crearAdmin.js y compañía corren en el servidor, sin nadie del otro lado.
    assert.strictEqual(armarLinea({ accion: 'clave-restablecida', usuario }).origen, 'script');
});

test('las acciones son una lista cerrada', async () => {
    // Un enum obliga a nombrar el evento nuevo en el modelo y no deja que cada controlador
    // invente el suyo — así es como una bitácora termina con 'revocar', 'revocada' y
    // 'REVOCAR' significando lo mismo.
    const { ACCIONES } = require('../src/models/BitacoraCuenta');
    assert.ok(ACCIONES.includes('ingreso') && ACCIONES.includes('activada'));
    assert.strictEqual(new Set(ACCIONES).size, ACCIONES.length, 'sin repetidas');
});

test('cada acción declarada la escribe alguien, y la pantalla sabe contarla', () => {
    // Una acción en el enum que nadie registra es una pregunta que el historial promete
    // contestar y no contesta. Pasó con `editada`: estaba en el enum y en los textos de la
    // página, y el handler que corrige una cuenta no la escribía — así que el cambio de
    // correo, que es el único de esa pantalla que nadie puede reconstruir después porque
    // pisa el campo, no quedaba en ninguna parte. Al revés también importa: una acción que
    // se registra y la página no sabe nombrar sale en pantalla como su slug crudo.
    const leer = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    const fuentes = ['src/controllers/authController.js', 'src/controllers/cuentasController.js',
        'src/controllers/tallerController.js'].map(leer).join('\n');
    const pagina = leer('src/paneles/panel.html');
    const comoSeLee = pagina.match(/const COMO_SE_LEE = \{[\s\S]*?\n\};/)[0];

    // Se busca el literal suelto y no `accion: 'x'`: una de las acciones se elige con un
    // ternario (`usuario.passwordHash ? 'clave-restablecida' : 'activada'`), porque activar
    // una invitación y reponer una clave olvidada son la misma ruta. Exigir la forma exacta
    // obligaría a escribir el código de una manera para que la prueba pase.
    for (const accion of ACCIONES) {
        assert.ok(fuentes.includes(`'${accion}'`), `nadie registra '${accion}'`);
        assert.ok(comoSeLee.includes(`'${accion}':`), `la página no sabe nombrar '${accion}'`);
    }
});
