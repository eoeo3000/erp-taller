const express = require('express');
const router = express.Router();
const {
    getSuministros,
    crearSuministro,
    eliminarSuministro,
    editarSuministro,
    actualizarSuministro
} = require('../controllers/suministroController');

router.get('/', getSuministros);
router.post('/', crearSuministro);
router.delete('/:id', eliminarSuministro);
router.put('/:id', actualizarSuministro);

module.exports = router;