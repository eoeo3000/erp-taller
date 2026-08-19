// Usuarios de la PWA Operativa. Estas rutas las llama la SPA (planificador, con
// X-Entorno por header) — la resolución de entorno por ?entorno= en query existe
// para las rutas de asignaciones/portal que sí abren las PWA fuera de la SPA.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/usuarioController');

router.get('/whoami', ctrl.whoami); // antes de '/', la usa la PWA por token (sin sesión de SPA)
router.post('/', ctrl.crear);
router.get('/', ctrl.listar);
router.post('/:id/reemitir-token', ctrl.reemitirToken);
router.post('/:id/revocar', ctrl.revocar);
router.post('/:id/reactivar', ctrl.reactivar);

module.exports = router;
