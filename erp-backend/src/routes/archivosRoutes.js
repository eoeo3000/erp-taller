// Sirve los archivos guardados: GET /uploads/<clave>.
//
// Va montado fuera de /api (en server.js) porque esa es la ruta que quedó escrita dentro de
// los documentos: los clientes guardan `BACKEND_ORIGIN + /uploads/<clave>` desde antes de
// que existiera el bucket, y esas URL están en OT.reportes, OT.tareas[].registro.fotos y
// Solicitud.adjuntos. Cambiar la forma de la URL obligaría a migrar la base y a redesplegar
// las dos PWA; servir el bucket por detrás no obliga a nada.
//
// Reemplaza al `express.static` que había antes, que solo sabía leer del disco del
// contenedor — efímero en Render, ver src/config/almacenamiento.js.
const express = require('express');
const router = express.Router();
const almacenamiento = require('../config/almacenamiento');

// Tres rutas explícitas y ningún comodín, a propósito. Desde la etapa 5 la clave puede
// llevar carpeta (`talleres/<slug>/<archivo>`, `demo/<archivo>`) además del nombre suelto
// de antes, y un comodín que acepte cualquier cosa después de /uploads vuelve a abrir la
// puerta que `..` cerraba: con parámetros separados, ninguno puede contener una barra, así
// que no hay forma de escaparse de la carpeta.
//
// **Que la carpeta venga en la URL no autoriza nada ni lo pretende.** /uploads sigue
// abierto, igual que antes de esta etapa: para leer una foto hay que saber su nombre, que
// es una marca de tiempo más un número al azar. Separar por taller es para poder
// respaldar, medir y borrar por cliente — no es un control de acceso, y tratarlo como si
// lo fuera sería el error.
async function servir(clave, req, res) {
    let archivo = null;
    try {
        archivo = await almacenamiento.obtener(clave);
    } catch (error) {
        console.error('[uploads] error sirviendo', clave, error.message);
    }
    // 404 y no 500 también cuando falla la lectura: para quien mira la pantalla el caso es
    // el mismo (esa foto no está), y el detalle queda en el log del servidor.
    if (!archivo) return res.status(404).json({ error: 'Archivo no encontrado' });

    res.setHeader('Content-Type', archivo.contentType);
    if (archivo.largo) res.setHeader('Content-Length', archivo.largo);
    // Cada archivo tiene nombre único y nunca se sobrescribe, así que el navegador puede
    // quedárselo para siempre: evita que abrir una OT vuelva a bajar las mismas fotos.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // Las fotos las sube gente de terreno: si alguna resultara ser HTML o SVG, esto impide
    // que el navegador la ejecute como página dentro del dominio del backend.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');

    // El listener va en el origen y no en `archivo.cuerpo.pipe(res)`: pipe() devuelve el
    // destino, así que encadenarlo ahí escucharía a `res` y un corte leyendo del bucket no
    // lo atraparía nadie.
    archivo.cuerpo.on('error', (error) => {
        console.error('[uploads] se cortó el envío de', clave, error.message);
        res.destroy();
    });
    archivo.cuerpo.pipe(res);
}

// Las formas nuevas, primero: una ruta más específica tiene que ir antes que la general o
// `/:clave` se tragaría la palabra "talleres" como si fuera un nombre de archivo.
router.get('/talleres/:taller/:clave', (req, res) => servir(`talleres/${req.params.taller}/${req.params.clave}`, req, res));
router.get('/demo/:clave', (req, res) => servir(`demo/${req.params.clave}`, req, res));
// La forma vieja: miles de URL ya escritas en la base. No se puede dejar de entender.
router.get('/:clave', (req, res) => servir(req.params.clave, req, res));

module.exports = router;
