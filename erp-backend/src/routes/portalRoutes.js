const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/portalController');
const apiKey = require('../middlewares/apiKey');

router.get('/buscar',          ctrl.buscar);
router.get('/solicitud/:id',   ctrl.detalle);
router.post('/solicitud',      ctrl.crearSolicitud);

// PWA Cliente (docs/rediseno/design_handoff_pwa_movil/README.md §6, C1) — el entorno
// viaja en ?entorno= de la query, la PWA se abre fuera de la SPA (CORRECCIONES.md punto 7).
router.post('/acceso',            ctrl.acceso);
router.post('/emitir-token',      ctrl.emitirTokenContacto);
router.get('/mis-solicitudes',    ctrl.misSolicitudes);
router.post('/ot/:id/responder',  ctrl.responderCotizacion);
router.post('/ot/:id/excepciones/:excepcionId/responder', ctrl.responderExcepcion);
router.get('/sesiones',              ctrl.listarSesiones);
router.get('/stock-tokens',              ctrl.stockTokens);
router.post('/sesiones/lote',            ctrl.generarLote);
router.post('/sesiones/:id/revocar',   ctrl.revocarSesion);
router.post('/sesiones/:id/reactivar', ctrl.reactivarSesion);
router.post('/sesiones/:id/regenerar', ctrl.regenerarToken);
router.post('/sesiones/:id/reenviar',  ctrl.reenviarToken);
// apiKey solo acá: borra el registro entero (Bodega de tokens, botón "Eliminar"), a
// diferencia de revocar que solo invalida — mismo criterio de "escritura de mayor riesgo"
// que ya protege OT/contabilidad/recursos/puestos/calendarios.
router.delete('/sesiones/:id',         apiKey, ctrl.eliminarSesion);

module.exports = router;
