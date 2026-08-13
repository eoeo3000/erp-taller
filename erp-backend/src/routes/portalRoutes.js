const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/portalController');

router.get('/buscar',          ctrl.buscar);
router.get('/solicitud/:id',   ctrl.detalle);
router.post('/solicitud',      ctrl.crearSolicitud);

module.exports = router;
