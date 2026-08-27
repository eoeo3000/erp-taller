const express = require('express');
const router = express.Router();
const recursosController = require('../controllers/recursosController');
const apiKey = require('../middlewares/apiKey');

// apiKey solo en las de escritura — ver plan de robustecimiento, punto 4.
router.get('/', recursosController.getRecursos);
router.post('/', apiKey, recursosController.crearRecurso);
router.put('/:id', apiKey, recursosController.updateRecurso); // Usaremos PUT para actualizar
router.post('/:id/ausencia', apiKey, recursosController.registrarAusenciaRecurso);
router.delete('/:id', apiKey, recursosController.eliminarRecurso);
module.exports = router;