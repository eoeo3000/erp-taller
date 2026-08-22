const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tipoTrabajoController');

// Prefijo base: /api/tipos-trabajo
router.get('/casos-no-cubiertos', ctrl.casosNoCubiertos); // antes de '/:id', misma convención que el resto de rutas con sub-recursos
router.get('/', ctrl.obtenerTiposTrabajo);
router.post('/', ctrl.crearTipoTrabajo);
router.put('/:id', ctrl.actualizarTipoTrabajo);
router.delete('/:id', ctrl.eliminarTipoTrabajo);

module.exports = router;
