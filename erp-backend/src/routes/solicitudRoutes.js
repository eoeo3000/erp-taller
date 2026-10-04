const express = require('express');
const router = express.Router();
const solicitudController = require('../controllers/solicitudController');
// Antes acá había un multer propio escribiendo en `uploads/` del disco, duplicando el de
// middlewares/upload.js. Ahora comparten el mismo, que trabaja en memoria y deja que
// config/almacenamiento.js decida el destino (bucket R2, o disco si no está configurado).
// De paso desaparece un choque de nombres: aquel usaba solo `Date.now()`, así que dos
// adjuntos subidos en el mismo milisegundo se pisaban entre sí.
const upload = require('../middlewares/upload');
const { requiereSesion } = require('../middlewares/sesion');
const { requiereIdentidad } = require('../middlewares/identidad');

// Este router estaba montado entero fuera de cualquier gate, porque la PWA Operativa usa
// una de sus rutas. El precio era que las otras cinco quedaban abiertas también, y la peor
// de todas era el listado: `GET /api/solicitudes` devolvía la cartera completa de clientes
// del taller —nombre, contacto, qué pidieron— a cualquiera que supiera la URL del backend.
// El gate va por ruta y no por router, que es lo que permite distinguirlas.

// Listado completo: **no lo llama nadie** fuera de la oficina. La SPA arma sus pantallas
// con /api/data, y la PWA Operativa pide solicitudes de a una. Comprobado en los tres
// frontends antes de cerrarlo.
router.get('/', requiereSesion, solicitudController.obtenerSolicitudes);
// Una sola solicitud: acá sí entra la PWA Operativa (S4, informe de evaluación), que se
// identifica con el token de la persona y no con una sesión de escritorio.
router.get('/:id', requiereIdentidad, solicitudController.obtenerSolicitud);

// Alta desde la oficina (IngresoScreen). El cliente NO entra por acá: el portal tiene su
// propia ruta (`POST /api/portal/solicitud`), con su propia sesión.
// Usamos upload.single('archivo') para interceptar el archivo físico
// El nombre 'archivo' debe coincidir con el formData.append('archivo', ...) de App.js
router.post('/', requiereSesion, upload.single('archivo'), solicitudController.crearSolicitud);

router.patch('/:id', requiereSesion, solicitudController.actualizarEstado);
// Agrega esto en tu archivo de rutas de solicitudes
router.put('/:id', requiereSesion, solicitudController.actualizarEstado);
router.delete('/:id', requiereSesion, solicitudController.eliminarSolicitud);
module.exports = router;
