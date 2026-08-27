const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/contabilidadController');
const apiKey = require('../middlewares/apiKey');

// apiKey solo en las de escritura — ver plan de robustecimiento, punto 4.
router.get('/cuentas',              ctrl.getCuentas);
router.post('/cuentas',             apiKey, ctrl.crearCuenta);
router.put('/cuentas/:id',          apiKey, ctrl.actualizarCuenta);
router.delete('/cuentas/:id',       apiKey, ctrl.eliminarCuenta);

router.get('/asientos',             ctrl.getAsientos);
router.post('/asientos',            apiKey, ctrl.crearAsientoManual);
router.put('/asientos/:id/anular',  apiKey, ctrl.anularAsiento);

router.get('/mayor/:cuentaId',      ctrl.getLibroMayor);

router.get('/balance-comprobacion', ctrl.getBalanceComprobacion);
router.get('/estado-resultados',    ctrl.getEstadoResultados);
router.get('/balance-general',      ctrl.getBalanceGeneral);

module.exports = router;
