// Comparar una clave de servidor con la que llegó en una cabecera.
//
// Vive sola porque ya hay dos rutas que se protegen así —respaldos y el registro de
// talleres— y la comparación tiene una sutileza que es exactamente la que se pierde al
// copiar y pegar: `===` sobre strings corta en la primera diferencia, y ese corte se nota
// en el tiempo de respuesta. Con suficientes intentos, eso filtra cuántos caracteres del
// principio son correctos y convierte adivinar la clave en un trabajo de minutos.
//
// Mismo criterio que `resolverUsuarioPorToken` o `fechasDeTrabajo`: una definición, no tres
// copias que alguna vez van a dejar de coincidir.
const crypto = require('crypto');

function comparaSegura(esperada, recibida) {
    const a = String(esperada || '').trim();
    const b = String(recibida || '').trim();
    // Una clave vacía no vale como clave: sin este descarte, un servidor sin configurar
    // aceptaría una petición que tampoco manda nada.
    if (!a || !b) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    // timingSafeEqual exige el mismo largo. Comparar los largos sí filtra el largo de la
    // clave, que no es un secreto que importe: lo que se protege es el contenido.
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { comparaSegura };
