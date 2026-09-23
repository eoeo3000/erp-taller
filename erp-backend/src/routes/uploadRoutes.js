const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const almacenamiento = require('../config/almacenamiento');

// POST /api/uploads/foto — sube una foto de evidencia (S3/O4/O5, PWA Operativa modo
// supervisor) como archivo real, en vez de texto base64 incrustado en el documento de la
// OT. Una sola foto de 256KB en base64 hacía que CUALQUIER consulta que trajera esa OT
// tardara varios segundos — visto directo en producción (mi-semana, mi-panel, etc.), no
// relacionado con índices ni con la red: el propio driver de Mongo tardaba igual sirviendo
// esa OT.
//
// Devuelve la ruta relativa `/uploads/<clave>` y NO una URL absoluta: los dos clientes
// arman la absoluta con `BACKEND_ORIGIN + data.url`, así que devolver la del bucket la
// dejaría rota en toda PWA ya instalada. El bucket se sirve desde esa misma ruta.
// El límite de tamaño se maneja acá y no se deja caer al manejador de errores global:
// multer lanza LIMIT_FILE_SIZE, que sin esto sale como un 500 sin explicación, y quien está
// en terreno con una foto pesada no tendría forma de saber qué pasó.
const recibirFoto = (req, res, next) => upload.single('foto')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'La foto es demasiado pesada. Vuelve a tomarla desde la app, que la comprime antes de subirla.' });
    }
    console.error('[uploads] multer rechazó la subida:', error.message);
    res.status(400).json({ error: 'No se pudo recibir el archivo' });
});

router.post('/foto', recibirFoto, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo "foto"' });
    try {
        const { url } = await almacenamiento.guardar(req.file.buffer, req.file.originalname);
        res.status(201).json({ url });
    } catch (error) {
        console.error('[uploads] no se pudo guardar la foto:', error.message);
        res.status(500).json({ error: 'No se pudo guardar la foto' });
    }
});

module.exports = router;
