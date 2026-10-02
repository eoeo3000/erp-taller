// Bloquea las acciones destructivas cuando el entorno activo es el de demostración.
//
// La demo se muestra a gente que no conoce el sistema (el video de la landing, una
// presentación en vivo, alguien probando por su cuenta). Un botón de eliminar apretado por
// curiosidad deja el juego de datos cojo justo antes de grabar, y peor: borrar una OT devuelve
// su Solicitud a 'Pendiente' (ver otController.eliminarOT), así que el daño no es solo el
// registro que se fue.
//
// Bloquea por VERBO y no por lista de rutas a propósito: una ruta nueva de borrado queda
// cubierta el día que se escribe, sin que nadie tenga que acordarse de agregarla acá. Todo lo
// que destruye datos en esta API es DELETE; lo que no lo es (POST /api/demo/cargar y
// /api/demo/vaciar, que rehacen el juego de datos) sigue pasando, igual que scripts/seed-demo.js,
// que escribe directo en Mongo y no atraviesa este middleware.
//
// Producción no se ve afectada: sin el header X-Entorno: demo, req.entorno es 'produccion' y
// esto no hace nada (ver middlewares/entorno.js). Va DESPUÉS de resolverEntorno en server.js,
// porque necesita req.entorno ya resuelto.
module.exports = function demoSoloLectura(req, res, next) {
    if (req.entorno === 'demo' && req.method === 'DELETE') {
        return res.status(403).json({
            error: 'El entorno de demostración no permite eliminar. Para volver al estado inicial, recarga los datos de demostración.',
        });
    }
    next();
};
