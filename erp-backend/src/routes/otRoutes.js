const express = require('express');
const router = express.Router();
const otController = require('../controllers/otController');
const auth = require('../middlewares/auth');
const apiKey = require('../middlewares/apiKey');
const { requiereSesion } = require('../middlewares/sesion');
const { requiereIdentidad } = require('../middlewares/identidad');

// Este router estaba montado entero fuera de cualquier gate porque la PWA Operativa usa
// tres de sus rutas. El gate va por ruta y no por router: así las que solo usa la oficina
// exigen sesión de escritorio, y las compartidas aceptan además el token de la persona.
// `webhook-emails` queda como estaba (su clave compartida es otro problema, aparte).

// --- 1. Rutas específicas (Deben ir primero) ---

// Esta es la que recupera la OT usando el ID de la solicitud. Solo la oficina
// (TratamientoScreen); la PWA pide la OT por su propio id.
router.get('/solicitud/:solicitudId', requiereSesion, otController.obtenerOTPorSolicitud);

router.post('/convertir-ot', requiereSesion, otController.convertirOT);
router.post('/webhook-emails', auth, otController.webhookEmail);

// --- 2. Rutas con parámetros generales (Deben ir al final) ---

// generarLinkEjecucion / iniciarEjecucion / confirmarEjecucion se retiraron en M4, y
// enviarAlSupervisor/supervisorPortal/supervisorAccion (portal por token de OT, previo a la
// PWA) se retiraron después: la app del supervisor (PWA Operativa) es ahora el único canal.
// PWA Operativa (docs/rediseno/design_handoff_pwa_movil) — token de Usuario, no de OT.
// La única que ya comprobaba la identidad por su cuenta —y además autoriza por asignación
// sobre esa OT, que es el nivel al que el resto debería llegar—. Pasa igual por el gate: no
// cuesta nada y deja el router entero sin huecos por omisión.
router.put('/:id/accion-movil', requiereIdentidad, otController.accionMovil);
// Pestaña Antecedentes (asignación de supervisor) — antes de '/:id' para no chocar.
router.get('/:id/antecedentes', requiereSesion, otController.antecedentes);
router.patch('/:id/asignacion', requiereSesion, otController.asignarSupervisor);
// Compartida: la oficina la abre en Tratamiento y la PWA Operativa la lee en terreno.
router.get('/:id', requiereIdentidad, otController.obtenerOTPorId);
// apiKey acá porque es donde vive el pago de la OT (OT.pago no tiene ruta propia, se
// escribe junto con el resto en actualizarOT) — ver plan de robustecimiento, punto 4.
// Compartida también: acá guarda la PWA el informe de evaluación. apiKey se queda —
// protege contra el acceso directo a la API, identidad dice quién es; son dos cosas.
router.put('/:id', requiereIdentidad, apiKey, otController.actualizarOT);
// Borrar una OT es de la oficina y de nadie más.
router.delete('/:id', requiereSesion, apiKey, otController.eliminarOT);

module.exports = router;