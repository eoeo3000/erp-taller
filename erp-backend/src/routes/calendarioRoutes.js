const express = require('express');
const router = express.Router();
// Importamos el controlador que tiene la lógica de $set y validaciones
const calendarioController = require('../controllers/calendarioController');
const apiKey = require('../middlewares/apiKey');

// Definimos las rutas apuntando a las funciones del controlador
// apiKey solo en las de escritura — ver plan de robustecimiento, punto 4.
router.get('/', calendarioController.getCalendarios);
router.post('/', apiKey, calendarioController.guardarCalendario);
router.put('/:id', apiKey, calendarioController.guardarCalendario);
// rutas/calendarioRoutes.js
router.delete('/:id', apiKey, calendarioController.eliminarCalendario);
module.exports = router;