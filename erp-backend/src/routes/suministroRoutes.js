const express = require('express');
const router = express.Router();
const {
    getSuministros,
    crearSuministro,
    eliminarSuministro,
    editarSuministro,
    actualizarSuministro,
    ajustarStock,
    getMovimientosStock
} = require('../controllers/suministroController');

router.get('/', getSuministros);
router.post('/', crearSuministro);
router.delete('/:id', eliminarSuministro);
router.put('/:id', actualizarSuministro);
router.put('/:id/stock', ajustarStock);
router.get('/:id/movimientos', getMovimientosStock);

module.exports = router;