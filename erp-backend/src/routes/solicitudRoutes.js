const express = require('express');
const router = express.Router();
const solicitudController = require('../controllers/solicitudController');
// Antes acá había un multer propio escribiendo en `uploads/` del disco, duplicando el de
// middlewares/upload.js. Ahora comparten el mismo, que trabaja en memoria y deja que
// config/almacenamiento.js decida el destino (bucket R2, o disco si no está configurado).
// De paso desaparece un choque de nombres: aquel usaba solo `Date.now()`, así que dos
// adjuntos subidos en el mismo milisegundo se pisaban entre sí.
const upload = require('../middlewares/upload');

// --- ENDPOINTS ACTUALIZADOS ---

router.get('/', solicitudController.obtenerSolicitudes);
router.get('/:id', solicitudController.obtenerSolicitud);

// Usamos upload.single('archivo') para interceptar el archivo físico
// El nombre 'archivo' debe coincidir con el formData.append('archivo', ...) de App.js
router.post('/', upload.single('archivo'), solicitudController.crearSolicitud);

router.patch('/:id', solicitudController.actualizarEstado);
// Agrega esto en tu archivo de rutas de solicitudes
router.put('/:id', solicitudController.actualizarEstado);
router.delete('/:id', solicitudController.eliminarSolicitud);
module.exports = router;