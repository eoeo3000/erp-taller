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

router.post('/:id/generar-link-ejecucion', otController.generarLinkEjecucion);
router.post('/:id/enviar-supervisor', otController.enviarAlSupervisor);
router.get('/:id/supervisor', otController.supervisorPortal);
router.post('/:id/supervisor', otController.supervisorAccion);
// PWA Operativa (docs/rediseno/design_handoff_pwa_movil) — token de Usuario, no de OT.
router.put('/:id/accion-movil', otController.accionMovil);
router.get('/:id/iniciar-ejecucion', otController.iniciarEjecucion);
router.post('/:id/iniciar-ejecucion', otController.confirmarEjecucion);
router.get('/:id', otController.obtenerOTPorId);
router.put('/:id', otController.actualizarOT);
router.delete('/:id', otController.eliminarOT);

module.exports = router;