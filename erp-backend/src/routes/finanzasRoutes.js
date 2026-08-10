const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/finanzasController');

router.get('/cuentas-cobrar', ctrl.getCuentasPorCobrar);
router.get('/registros-pago', ctrl.getRegistrosPago);
router.post('/registros-pago/marcar-pagado', ctrl.marcarPagado);
router.post('/registros-pago', ctrl.crearRegistroPago);
router.put('/registros-pago/:id', ctrl.actualizarRegistroPago);
router.delete('/registros-pago/:id', ctrl.eliminarRegistroPago);
router.get('/resumen-mensual', ctrl.getResumenMensual);

module.exports = router;
