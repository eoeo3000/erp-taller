// Usuarios de la PWA Operativa. Estas rutas las llama la SPA (planificador, con
// X-Entorno por header) — la resolución de entorno por ?entorno= en query existe
// para las rutas de asignaciones/portal que sí abren las PWA fuera de la SPA.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/usuarioController');
const apiKey = require('../middlewares/apiKey');
const { requiereSesion } = require('../middlewares/sesion');

router.get('/whoami', ctrl.whoami); // antes de '/', la usa la PWA por token (sin sesión de SPA)
// El resto es administración de accesos desde el SPA (Bodega de tokens): emitir, revocar y
// reactivar el acceso móvil de otra persona exige estar dentro de la app de escritorio.
router.post('/', requiereSesion, ctrl.crear);
router.get('/', requiereSesion, ctrl.listar);
router.post('/:id/reemitir-token', requiereSesion, ctrl.reemitirToken);
router.post('/:id/revocar', requiereSesion, ctrl.revocar);
router.post('/:id/reactivar', requiereSesion, ctrl.reactivar);
// apiKey solo acá: borra el registro entero (Bodega de tokens, botón "Eliminar"), a
// diferencia de revocar que solo invalida — mismo criterio de "escritura de mayor riesgo"
// que ya protege OT/contabilidad/recursos/puestos/calendarios.
router.delete('/:id', requiereSesion, apiKey, ctrl.eliminar);

module.exports = router;
