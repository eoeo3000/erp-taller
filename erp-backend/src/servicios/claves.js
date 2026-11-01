// Qué hace aceptable a una clave. **Una sola definición.**
//
// Había cuatro copias de `LARGO_MINIMO_PASSWORD = 8`: authController (dos veces),
// instalacionController y scripts/crearAdmin.js. Cuatro copias de una regla de acceso es
// exactamente la forma en que una se queda atrás — ya pasó con `fechasDeTrabajo` (B1) y con
// `resolverTaller`. Si mañana se sube el mínimo a 10 y una copia no se entera, hay una
// puerta del sistema con la regla vieja y nadie lo nota.
//
// Dos reglas, y son de distinta naturaleza:
//
//   1. El largo. Local, instantánea, nunca falla.
//   2. Que no sea una clave ya filtrada en un volcado público. Necesita red, y por eso todo
//      lo de abajo.
const crypto = require('crypto');

const LARGO_MINIMO = 8;
const API_FILTRADAS = 'https://api.pwnedpasswords.com/range';
const ESPERA_MAXIMA_MS = 2500;

// --- Por qué esto no manda la clave a ningún lado ---
//
// El servicio de Have I Been Pwned se consulta por **k-anonimato**: se calcula el SHA-1 de
// la clave y se mandan SOLO los primeros 5 caracteres hexadecimales. El servidor devuelve
// todos los sufijos que empiezan con ese prefijo —unos cientos— y la comparación se hace
// acá. O sea que sale un prefijo que comparten decenas de miles de claves distintas, y
// nunca la clave ni su hash completo. Sin esa propiedad esto no se podría hacer: mandarle
// la clave de alguien a un tercero para preguntar si es buena sería bastante peor que el
// problema que resuelve.
//
// **El SHA-1 acá no es una decisión de seguridad.** Es el formato en que ese índice está
// publicado, y nada más. Lo que se guarda en la base sigue siendo scrypt (utils/password.js);
// este hash se calcula, se usa para una comparación y se bota.
function prefijoYSufijo(clave) {
    const sha1 = crypto.createHash('sha1').update(String(clave), 'utf8').digest('hex').toUpperCase();
    return { prefijo: sha1.slice(0, 5), sufijo: sha1.slice(5) };
}

// Cuántas veces aparece esta clave en volcados públicos.
//
// Devuelve un número, o **`null` cuando no se pudo averiguar** — que no es lo mismo que
// cero y por eso no se confunden: `null` significa «no sé», y quien llama decide qué hacer
// con eso (ver `revisarClave`: deja pasar).
//
// `traer` es inyectable para poder probar esto sin red ni depender de que un servicio de
// terceros esté arriba mientras corren las pruebas.
async function vecesFiltrada(clave, { traer = fetch, esperaMs = ESPERA_MAXIMA_MS } = {}) {
    const { prefijo, sufijo } = prefijoYSufijo(clave);
    const corte = AbortSignal.timeout(esperaMs);
    try {
        const resp = await traer(`${API_FILTRADAS}/${prefijo}`, {
            signal: corte,
            headers: { 'Add-Padding': 'true' },
        });
        if (!resp.ok) return null;
        const cuerpo = await resp.text();
        for (const linea of cuerpo.split('\n')) {
            const [suf, cuenta] = linea.trim().split(':');
            if (suf === sufijo) return Number(cuenta) || 0;
        }
        return 0;
    } catch {
        // Se cayó, tardó demasiado, o este servidor no tiene salida a internet. No se
        // registra la clave ni el prefijo: el prefijo no identifica a nadie, pero tampoco
        // aporta nada en un log y acostumbrarse a escribir partes de hashes de claves es
        // cómo termina saliendo el hash entero.
        return null;
    }
}

// La revisión completa. **Falla hacia el lado de dejar pasar**, igual que el correo: que un
// servicio de terceros esté caído no puede ser el motivo de que alguien no pueda elegir su
// clave y quede sin entrar a trabajar. El riesgo que esto evita —una clave que ya está en un
// volcado público— es real pero no es inmediato; no poder entrar sí lo es.
async function revisarClave(clave, opciones = {}) {
    const texto = String(clave || '');
    if (texto.length < LARGO_MINIMO) {
        return { ok: false, error: `La clave debe tener al menos ${LARGO_MINIMO} caracteres` };
    }

    const veces = await vecesFiltrada(texto, opciones);
    if (veces === null) return { ok: true, sinRevisar: true };
    if (veces > 0) {
        // El texto importa: NO dice que le hayan robado nada. Dice que esa combinación de
        // caracteres ya está en listas que cualquiera puede bajar, que es otra cosa y es lo
        // que de verdad pasó. Confundirlas asusta sin motivo y manda a revisar el correo.
        return {
            ok: false,
            error: 'Esa clave aparece en listas públicas de claves filtradas, así que ya está'
                + ' en los diccionarios que se usan para adivinar. No significa que te hayan'
                + ' robado nada: elige otra distinta y listo.',
        };
    }
    return { ok: true };
}

module.exports = { revisarClave, vecesFiltrada, LARGO_MINIMO };
