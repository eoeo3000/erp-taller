// Cierra una ruta a quien no sea de administración. Va SIEMPRE después de `requiereSesion` (o
// `requiereSesionEstricta`): esto decide qué puede hacer alguien, no quién es.
//
// --- Mismo rollout que los otros gates, y por el mismo motivo ---
//
// Sin `req.usuario` y con `AUTH_REQUERIDA` apagada, deja pasar: es la situación de antes de
// que existiera el login, donde no hay a quién preguntarle el rol. Cortar ahí dejaría a la
// oficina sin Finanzas ni Contabilidad el mismo día del deploy, sin ninguna cuenta que pueda
// hacer nada al respecto. Con el login encendido nunca se llega acá sin usuario: `requiereSesion`
// ya respondió 401 antes.
//
// **Desplegar esto no le quita nada a nadie**: todas las cuentas que existen hoy son
// `administrador` —`invitar`, `crearAdmin.js` y la instalación las crearon así—, de modo que el
// corte empieza a importar recién con la primera cuenta que se invite como operación.
const { authRequerida } = require('./sesion');
const { esAdministrador } = require('../config/roles');

function requiereAdministrador(req, res, next) {
    if (!req.usuario) {
        if (!authRequerida()) return next();
        return res.status(401).json({ error: 'Sesión requerida' });
    }
    if (esAdministrador(req.usuario)) return next();
    // 403 y no 401: la sesión es buena, lo que falta es el permiso. Un 401 haría que el
    // interceptor del SPA mande a esa persona a la pantalla de ingreso, como si se le hubiera
    // caído la sesión — y volvería a entrar para encontrarse con lo mismo.
    return res.status(403).json({ error: 'Esta sección es solo para administración.' });
}

module.exports = { requiereAdministrador };
