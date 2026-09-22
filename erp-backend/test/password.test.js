// Primeras pruebas automatizadas del backend. `node --test` viene con Node, sin agregar
// ninguna dependencia ni framework (mismo criterio que el resto del proyecto).
// Se prueban las funciones puras del login: no necesitan Mongo ni levantar el servidor.
const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verificarPassword } = require('../src/utils/password');
const { generarToken, hashToken } = require('../src/utils/tokens');

test('una clave correcta se verifica contra su hash', async () => {
    const hash = await hashPassword('clave-de-prueba-123');
    assert.strictEqual(await verificarPassword('clave-de-prueba-123', hash), true);
});

test('una clave incorrecta no se verifica', async () => {
    const hash = await hashPassword('clave-de-prueba-123');
    assert.strictEqual(await verificarPassword('clave-de-prueba-124', hash), false);
    assert.strictEqual(await verificarPassword('', hash), false);
});

test('la misma clave produce hashes distintos (sal aleatoria)', async () => {
    const a = await hashPassword('misma-clave-1234');
    const b = await hashPassword('misma-clave-1234');
    assert.notStrictEqual(a, b);
    // ...pero ambos verifican: la sal va guardada dentro del propio hash.
    assert.strictEqual(await verificarPassword('misma-clave-1234', a), true);
    assert.strictEqual(await verificarPassword('misma-clave-1234', b), true);
});

test('el hash guardado no contiene la clave en claro', async () => {
    const hash = await hashPassword('clave-secreta-visible');
    assert.ok(!hash.includes('clave-secreta-visible'));
    assert.ok(hash.startsWith('scrypt$'));
});

test('un hash ausente o corrupto no valida ninguna clave', async () => {
    // Importa porque un usuario de la PWA no tiene passwordHash: nunca debe poder entrar
    // por el login de escritorio, ni siquiera mandando una clave vacía.
    assert.strictEqual(await verificarPassword('lo-que-sea', undefined), false);
    assert.strictEqual(await verificarPassword('lo-que-sea', ''), false);
    assert.strictEqual(await verificarPassword('lo-que-sea', 'texto-cualquiera'), false);
    assert.strictEqual(await verificarPassword('lo-que-sea', 'scrypt$16384$8$1$aa$'), false);
});

test('los tokens son distintos en cada llamada y su hash es estable', () => {
    const a = generarToken();
    const b = generarToken();
    assert.notStrictEqual(a, b);
    assert.strictEqual(a.length, 40); // 20 bytes en hexadecimal
    assert.strictEqual(hashToken(a), hashToken(a));
    assert.notStrictEqual(hashToken(a), hashToken(b));
});

test('el hash de un token no permite reconstruirlo', () => {
    const token = generarToken();
    assert.ok(!hashToken(token).includes(token));
});
