// Usuarios de la PWA Operativa. Estas rutas las llama la SPA (planificador, con
// X-Entorno por header) — la resolución de entorno por ?entorno= en query existe
// para las rutas de asignaciones/portal que sí abren las PWA fuera de la SPA.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/usuarioController');
const apiKey = require('../middlewares/apiKey');
const { requiereSesion } = require('../middlewares/sesion');
const { requiereAdministrador } = require('../middlewares/rol');

router.get('/whoami', ctrl.whoami); // antes de '/', la usa la PWA por token (sin sesión de SPA)
// El resto es administración de accesos desde el SPA (Bodega de tokens): emitir, revocar y
// reactivar el acceso móvil de otra persona. Exige sesión Y ser de administración: dar o
// quitar acceso a alguien es justamente lo que define ese rol (config/roles.js).
const admin = [requiereSesion, requiereAdministrador];
router.post('/', ...admin, ctrl.crear);
router.get('/', ...admin, ctrl.listar);
router.post('/:id/reemitir-token', ...admin, ctrl.reemitirToken);
router.post('/:id/revocar', ...admin, ctrl.revocar);
router.post('/:id/reactivar', ...admin, ctrl.reactivar);
// apiKey solo acá: borra el registro entero (Bodega de tokens, botón "Eliminar"), a
// diferencia de revocar que solo invalida — mismo criterio de "escritura de mayor riesgo"
// que ya protege OT/contabilidad/recursos/puestos/calendarios.
router.delete('/:id', ...admin, apiKey, ctrl.eliminar);

module.exports = router;
