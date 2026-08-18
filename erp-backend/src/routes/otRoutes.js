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

// generarLinkEjecucion / iniciarEjecucion / confirmarEjecucion se retiraron en M4: sin
// llamador en ningún frontend (ver docs/estrategia-movil.md §11) y ya cubiertos por la
// PWA Operativa. enviarAlSupervisor/supervisorPortal/supervisorAccion SIGUEN — hay OT en
// producción con tokenEjecucion activo todavía sin abrir; ver la nota en otController.js.
router.post('/:id/enviar-supervisor', otController.enviarAlSupervisor);
router.get('/:id/supervisor', otController.supervisorPortal);
router.post('/:id/supervisor', otController.supervisorAccion);
// PWA Operativa (docs/rediseno/design_handoff_pwa_movil) — token de Usuario, no de OT.
router.put('/:id/accion-movil', otController.accionMovil);
// Pestaña Antecedentes (asignación de supervisor) — antes de '/:id' para no chocar.
router.get('/:id/antecedentes', otController.antecedentes);
router.patch('/:id/asignacion', otController.asignarSupervisor);
router.get('/:id', otController.obtenerOTPorId);
router.put('/:id', otController.actualizarOT);
router.delete('/:id', otController.eliminarOT);

module.exports = router;