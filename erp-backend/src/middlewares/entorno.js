// Resuelve, para cada request y antes de cualquier controlador:
//
//   req.taller   — de qué cliente son los datos (config/talleres.js)
//   req.entorno  — 'produccion' | 'demo' DE ESE taller
//   req.db       — la conexión de Mongo que corresponde a ese par
//
// Ver §9.2 del README de rediseño: la resolución es por request, nunca por una variable
// global mutable.
//
// --- De dónde sale cada uno, y por qué es distinto ---
//
// **El entorno lo elige quien llama** (header `X-Entorno`, o `?entorno=` en los links que
// el backend sirve fuera de la SPA: portal del supervisor, confirmación de ejecución, que
// nunca pasan por axios.defaults — ver CORRECCIONES.md, punto 7). Eso es legítimo: elige
// entre la producción y la demo **del mismo taller**, las dos del mismo dueño.
//
// **El taller NO lo elige quien llama.** Sale del prefijo del token de sesión, que es dato
// de ruteo y no de autenticación: solo dice en qué base buscar el token, y el token igual
// tiene que existir ahí (ver utils/tokens.js y middlewares/sesion.js, que además verifica
// que el usuario encontrado pertenezca a ese taller). Un prefijo inventado lleva a una base
// donde ese token no está: 401, no los datos de otro cliente.
//
// Por qué el prefijo y no leer la sesión primero: la sesión vive DENTRO de la base del
// taller, así que para leerla hay que haber elegido la base. Sin el prefijo la cadena es
// circular. Ver docs/multi-taller.md §4.
//
// Hoy existe un solo taller y todo esto resuelve siempre a lo mismo. Se construye igual, y
// desde ahora, para que cuando haya dos ya lleve meses funcionando.
const { obtenerConexion } = require('../config/conexiones');
const { resolverTaller, tallerPorDefecto } = require('../config/talleres');
const { separarPrefijo } = require('../utils/tokens');

function tallerDeLaRequest(req) {
    const cabecera = req.headers.authorization || '';
    if (!cabecera.startsWith('Bearer ')) return tallerPorDefecto();

    const { taller } = separarPrefijo(cabecera.slice(7).trim());
    // Sin prefijo: una sesión emitida antes de que existiera. Con un prefijo que no nombra
    // ningún taller conocido: basura o un intento de colarse. En los dos casos se usa el
    // taller por defecto y se sigue — el token se validará (o no) contra esa base, que es
    // donde la request queda frenada si no corresponde. Cortar acá con un error rompería
    // las llamadas que no necesitan sesión (las PWAs, el portal del cliente).
    return resolverTaller(taller) || tallerPorDefecto();
}

module.exports = function resolverEntorno(req, res, next) {
    const valor = req.headers['x-entorno'] || req.query.entorno;
    const entorno = valor === 'demo' ? 'demo' : 'produccion';
    const taller = tallerDeLaRequest(req);
    try {
        req.db = obtenerConexion(entorno, taller);
        req.entorno = entorno;
        req.taller = taller;
        next();
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
};
