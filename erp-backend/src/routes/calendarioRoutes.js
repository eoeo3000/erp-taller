const express = require('express');
const router = express.Router();
// Importamos el controlador que tiene la lógica de $set y validaciones
const calendarioController = require('../controllers/calendarioController');

// Definimos las rutas apuntando a las funciones del controlador
router.get('/', calendarioController.getCalendarios);
router.post('/', calendarioController.guardarCalendario);
router.put('/:id', calendarioController.guardarCalendario);
// rutas/calendarioRoutes.js
router.delete('/:id', calendarioController.eliminarCalendario);
module.exports = router;