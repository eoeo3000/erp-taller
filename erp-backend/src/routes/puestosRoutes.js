const express = require('express');
const router = express.Router();
const puestoController = require('../controllers/puestoController');

// Prefijo base: /api/puestos
router.get('/', puestoController.obtenerPuestos);
router.post('/', puestoController.crearPuesto);
router.put('/:id', puestoController.actualizarPuesto);
router.delete('/:id', puestoController.eliminarPuesto);

module.exports = router;