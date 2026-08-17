const express = require('express');
const router = express.Router();
const disposicionController = require('../controllers/disposicionController');

// Prefijo base: /api/disposiciones
router.get('/', disposicionController.obtenerDisposiciones);
router.post('/', disposicionController.guardarDisposicion);
router.delete('/:id', disposicionController.eliminarDisposicion);

module.exports = router;
