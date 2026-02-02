const express = require('express');
const router = express.Router();
const otController = require('../controllers/otController');
const auth = require('../middlewares/auth');

// --- 1. Rutas específicas (Deben ir primero) ---

// Esta es la que recupera la OT usando el ID de la solicitud
router.get('/solicitud/:solicitudId', otController.obtenerOTPorSolicitud);

router.post('/convertir-ot', otController.convertirOT);
router.post('/webhook-emails', auth, otController.webhookEmail);

// --- 2. Rutas con parámetros generales (Deben ir al final) ---

router.get('/:id', otController.obtenerOTPorId);
router.put('/:id', otController.actualizarOT);
router.delete('/:id', otController.eliminarOT);

module.exports = router;