const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/portalController');

router.get('/buscar',          ctrl.buscar);
router.get('/solicitud/:id',   ctrl.detalle);
router.post('/solicitud',      ctrl.crearSolicitud);

// PWA Cliente (docs/rediseno/design_handoff_pwa_movil/README.md §6, C1) — el entorno
// viaja en ?entorno= de la query, la PWA se abre fuera de la SPA (CORRECCIONES.md punto 7).
router.post('/acceso',            ctrl.acceso);
router.post('/emitir-token',      ctrl.emitirTokenContacto);
router.get('/mis-solicitudes',    ctrl.misSolicitudes);
router.get('/sesiones',              ctrl.listarSesiones);
router.post('/sesiones/lote',            ctrl.generarLote);
router.post('/sesiones/:id/revocar',   ctrl.revocarSesion);
router.post('/sesiones/:id/reactivar', ctrl.reactivarSesion);
router.post('/sesiones/:id/regenerar', ctrl.regenerarToken);
router.post('/sesiones/:id/reenviar',  ctrl.reenviarToken);

module.exports = router;
