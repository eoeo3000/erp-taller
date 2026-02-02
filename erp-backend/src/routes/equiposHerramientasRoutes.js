const express = require('express');
const router = express.Router();
const {
    getEquipos,
    crearEquipo,
    eliminarEquipo,
    actualizarEquipo // 🚩 1. Importa la función
} = require('../controllers/equiposHerramientasController');

router.get('/', getEquipos);
router.post('/', crearEquipo);
router.delete('/:id', eliminarEquipo);
router.put('/:id', actualizarEquipo); // 🚩 2. Define la ruta PUT

module.exports = router;