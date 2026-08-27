const express = require('express');
const router = express.Router();
const puestoController = require('../controllers/puestoController');
const apiKey = require('../middlewares/apiKey');

// Prefijo base: /api/puestos — apiKey solo en las de escritura (plan de robustecimiento, punto 4).
router.get('/', puestoController.obtenerPuestos);
router.post('/', apiKey, puestoController.crearPuesto);
router.put('/:id', apiKey, puestoController.actualizarPuesto);
router.delete('/:id', apiKey, puestoController.eliminarPuesto);

module.exports = router;