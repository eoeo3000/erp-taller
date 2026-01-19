const express = require('express');
const router = express.Router();
const recursosController = require('../controllers/recursosController');

// Usamos la referencia directa al objeto del controlador
router.get('/', recursosController.getRecursos);
router.post('/', recursosController.crearRecurso);
router.put('/:id', recursosController.updateRecurso); // Usaremos PUT para actualizar
router.post('/:id/ausencia', recursosController.registrarAusenciaRecurso);
router.delete('/:id', recursosController.eliminarRecurso);
module.exports = router;