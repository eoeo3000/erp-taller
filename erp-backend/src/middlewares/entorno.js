// Resuelve req.db (conexión de Mongo) y req.entorno ('produccion' | 'demo') a partir
// del header X-Entorno enviado por el frontend en cada request. Ver §9.2 del README de
// rediseño: la resolución es por request, nunca por una variable global mutable.
//
// Segunda fuente: req.query.entorno. Las páginas que el backend sirve fuera de la SPA
// (portal del supervisor, confirmación de ejecución) no pasan nunca por axios.defaults,
// así que no hay forma de que lleven el header — el entorno viaja como parámetro en el
// link en su lugar (ver CORRECCIONES.md, punto 7). El header manda cuando ambos están
// presentes, para no cambiar el comportamiento de la SPA.
const { obtenerConexion } = require('../config/conexiones');

module.exports = function resolverEntorno(req, res, next) {
    const valor = req.headers['x-entorno'] || req.query.entorno;
    const entorno = valor === 'demo' ? 'demo' : 'produccion';
    try {
        req.db = obtenerConexion(entorno);
        req.entorno = entorno;
        next();
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
};
