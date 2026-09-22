// Hash de contraseñas para las cuentas de escritorio (SPA) — ver plan de login, Fase 1.
//
// scrypt de `node:crypto` en vez de bcrypt/argon2: el proyecto ya usa `crypto` para todos
// sus tokens (portalController, usuarioController) y no tiene ninguna dependencia con
// compilación nativa — agregar bcrypt obligaría a compilar en cada deploy de Render.
// scrypt está en la biblioteca estándar, es resistente a hardware dedicado (a diferencia de
// un sha256 con sal) y no suma nada al package.json.
//
// El formato guardado incluye los parámetros usados, no solo el hash: si algún día hay que
// subir el costo, las contraseñas viejas siguen verificándose con los parámetros con que
// fueron creadas, y se re-hashean al próximo login en vez de invalidarse todas de golpe.
const crypto = require('crypto');

// N=16384 (~16MB de memoria, ~100ms de CPU) es el punto habitual para un login interactivo:
// suficientemente caro para fuerza bruta, imperceptible para quien entra a la app.
const N = 16384;
const R = 8;
const P = 1;
const LARGO_CLAVE = 64;
const LARGO_SAL = 16;

// Versión asíncrona a propósito: scryptSync bloquea el event loop ~100ms y el backend es
// de un solo hilo — con la versión sync, dos logins simultáneos congelan TODAS las demás
// requests (incluido el polling de /api/data de quienes ya están trabajando).
function derivar(password, sal, largo, params) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(String(password), sal, largo, params, (err, derivada) => {
            if (err) reject(err); else resolve(derivada);
        });
    });
}

async function hashPassword(password) {
    const sal = crypto.randomBytes(LARGO_SAL);
    const derivada = await derivar(password, sal, LARGO_CLAVE, { N, r: R, p: P });
    return `scrypt$${N}$${R}$${P}$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

async function verificarPassword(password, almacenado) {
    const partes = String(almacenado || '').split('$');
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

    const [, n, r, p, salHex, hashHex] = partes;
    const esperado = Buffer.from(hashHex, 'hex');
    if (esperado.length === 0) return false;

    let derivada;
    try {
        derivada = await derivar(password, Buffer.from(salHex, 'hex'), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
    } catch {
        return false; // parámetros corruptos en el registro: se trata como clave inválida
    }
    // timingSafeEqual y no ===: comparar strings corta en el primer byte distinto y filtra,
    // por el tiempo de respuesta, cuántos caracteres del hash se acertaron.
    return derivada.length === esperado.length && crypto.timingSafeEqual(derivada, esperado);
}

module.exports = { hashPassword, verificarPassword };
