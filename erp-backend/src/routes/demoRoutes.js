const express = require('express');
const router = express.Router();
const demoController = require('../controllers/demoController');

router.post('/cargar', demoController.cargar);
router.post('/vaciar', demoController.vaciar);
router.get('/estado', demoController.estado);
router.get('/info', demoController.info);

module.exports = router;
