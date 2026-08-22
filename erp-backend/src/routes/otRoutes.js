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

// generarLinkEjecucion / iniciarEjecucion / confirmarEjecucion se retiraron en M4, y
// enviarAlSupervisor/supervisorPortal/supervisorAccion (portal por token de OT, previo a la
// PWA) se retiraron después: la app del supervisor (PWA Operativa) es ahora el único canal.
// PWA Operativa (docs/rediseno/design_handoff_pwa_movil) — token de Usuario, no de OT.
router.put('/:id/accion-movil', otController.accionMovil);
// Pestaña Antecedentes (asignación de supervisor) — antes de '/:id' para no chocar.
router.get('/:id/antecedentes', otController.antecedentes);
router.patch('/:id/asignacion', otController.asignarSupervisor);
router.get('/:id', otController.obtenerOTPorId);
router.put('/:id', otController.actualizarOT);
router.delete('/:id', otController.eliminarOT);

module.exports = router;