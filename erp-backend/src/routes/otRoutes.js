const express = require('express');
const router = express.Router();
const otController = require('../controllers/otController');
const auth = require('../middlewares/auth');

// 1. Rutas específicas (Sin parámetros :id)
router.post('/convertir-ot', otController.convertirOT);
router.post('/webhook-emails', auth, otController.webhookEmail);

// 2. Rutas con parámetros (Estas siempre abajo)
router.get('/:id', otController.obtenerOTPorId);
router.put('/:id', otController.actualizarOT); // <--- ESTA es la que usa App.jsx:218
router.delete('/:id', otController.eliminarOT);

module.exports = router;