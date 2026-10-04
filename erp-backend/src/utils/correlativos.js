// Numeración correlativa de Solicitudes y OT (SOL-2026-0001, OT-2026-0001).
//
// Existe porque el prefijo del año estaba ESCRITO A MANO en otController
// (`/^OT-2026-\d+$/` y `` `OT-2026-${n}` ``), con fecha de vencimiento: el 1 de enero de 2027
// las Solicitudes pasan a SOL-2027- (solicitudController ya usa el año real), así que el
// respaldo del correlativo de OT habría seguido devolviendo OT-2026-0001 y choca con el índice
// `unique` de numeroOT — E11000 y conversión fallida, sin ninguna señal previa.
//
// La parte que decide el número es una función pura y vive acá para poder probarla sin Mongo
// (mismo criterio que utils/password.js y utils/tokens.js: la batería de `node --test` no
// necesita base ni servidor).

const LARGO_CORRELATIVO = 4;

// Prefijo del año en curso: prefijoAnual('OT') -> 'OT-2026-'.
// `fecha` solo se pasa en las pruebas; en producción es siempre hoy.
function prefijoAnual(tipo, fecha = new Date()) {
    return `${tipo}-${fecha.getFullYear()}-`;
}

// Expresión para buscar en Mongo los números YA emitidos de ese prefijo. El grupo de captura
// es el correlativo, y lo usa proximoCorrelativo para leerlo; a Mongo le da lo mismo.
function patronDelPrefijo(prefijo) {
    // El prefijo lo arma prefijoAnual con un tipo del propio código ('OT'/'SOL'), no con
    // entrada de nadie, así que no hace falta escapar nada.
    return new RegExp(`^${prefijo}(\\d+)$`);
}

// El siguiente número a partir de los ya emitidos.
//
// Se calcula el MÁXIMO real entre los que calzan con el patrón, y no se confía en el orden:
// ordenar por número como texto se rompe apenas existe uno no numérico en el medio
// ("OT-2026-TEST2" ordena después de "OT-2026-0012"), y ahí el correlativo volvía a 0001 y
// chocaba con una OT existente. Fue un bug real, visto al probar "Aprobar crea la OT".
//
// Los que no calzan con el patrón se ignoran en vez de romper: una base vieja puede tener
// números cargados a mano, y eso no debe impedir emitir el siguiente.
function proximoCorrelativo(numerosEmitidos, prefijo) {
    const patron = patronDelPrefijo(prefijo);
    const maximo = (numerosEmitidos || []).reduce((max, numero) => {
        const calce = patron.exec(String(numero || ''));
        if (!calce) return max;
        const valor = parseInt(calce[1], 10);
        return Number.isNaN(valor) ? max : Math.max(max, valor);
    }, 0);
    return `${prefijo}${String(maximo + 1).padStart(LARGO_CORRELATIVO, '0')}`;
}

module.exports = { prefijoAnual, patronDelPrefijo, proximoCorrelativo };
