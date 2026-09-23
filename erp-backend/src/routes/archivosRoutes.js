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

router.get('/:clave', async (req, res) => {
    let archivo = null;
    try {
        archivo = await almacenamiento.obtener(req.params.clave);
    } catch (error) {
        console.error('[uploads] error sirviendo', req.params.clave, error.message);
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
        console.error('[uploads] se cortó el envío de', req.params.clave, error.message);
        res.destroy();
    });
    archivo.cuerpo.pipe(res);
});

module.exports = router;
