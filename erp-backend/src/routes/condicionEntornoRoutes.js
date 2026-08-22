const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/condicionEntornoController');

// Prefijo base: /api/condiciones-entorno
router.get('/', ctrl.obtenerCondiciones);
router.post('/', ctrl.crearCondicion);
router.put('/:id', ctrl.actualizarCondicion);
router.delete('/:id', ctrl.eliminarCondicion);

module.exports = router;
