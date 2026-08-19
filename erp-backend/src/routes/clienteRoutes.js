const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clienteController');

router.get('/',    ctrl.listar);
router.post('/',   ctrl.crear);
router.post('/poblar-desde-solicitudes', ctrl.poblarDesdeSolicitudes);
router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
