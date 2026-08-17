// Resuelve req.db (conexión de Mongo) y req.entorno ('produccion' | 'demo') a partir
// del header X-Entorno enviado por el frontend en cada request. Ver §9.2 del README de
// rediseño: la resolución es por request, nunca por una variable global mutable.
const { obtenerConexion } = require('../config/conexiones');

module.exports = function resolverEntorno(req, res, next) {
    const entorno = req.headers['x-entorno'] === 'demo' ? 'demo' : 'produccion';
    try {
        req.db = obtenerConexion(entorno);
        req.entorno = entorno;
        next();
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
};
