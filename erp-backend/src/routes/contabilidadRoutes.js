const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/contabilidadController');

router.get('/cuentas',              ctrl.getCuentas);
router.post('/cuentas',             ctrl.crearCuenta);
router.put('/cuentas/:id',          ctrl.actualizarCuenta);
router.delete('/cuentas/:id',       ctrl.eliminarCuenta);

router.get('/asientos',             ctrl.getAsientos);
router.post('/asientos',            ctrl.crearAsientoManual);
router.put('/asientos/:id/anular',  ctrl.anularAsiento);

router.get('/mayor/:cuentaId',      ctrl.getLibroMayor);

router.get('/balance-comprobacion', ctrl.getBalanceComprobacion);
router.get('/estado-resultados',    ctrl.getEstadoResultados);
router.get('/balance-general',      ctrl.getBalanceGeneral);

module.exports = router;
