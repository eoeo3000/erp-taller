const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/portalController');
const apiKey = require('../middlewares/apiKey');
const { requiereSesion } = require('../middlewares/sesion');
const { requiereAdministrador } = require('../middlewares/rol');

// Este router está montado SIN gate en routes/index.js, porque la PWA del cliente entra por
// acá con su propio token (`?token=`, SesionPortal) y no tiene sesión de escritorio. El precio
// era que todo lo que vive adentro quedaba abierto también — incluida la ADMINISTRACIÓN de
// esos accesos, que es de la oficina y no del cliente:
//
//   GET /api/portal/sesiones devolvía, sin pedir ninguna credencial, el nombre, el correo y
//   la empresa de cada contacto de cada cliente del taller. Y regenerar, reenviar, revocar o
//   fabricar un lote de tokens se podía disparar desde afuera.
//
// Se cierran ruta por ruta —igual que en solicitudRoutes— porque acá sí conviven las dos
// clases. Ninguna de las cerradas la usa la PWA del cliente (comprobado en erp-pwa-cliente);
// las usan Bodega de tokens, Ingreso y Clientes, que son escritorio y tienen sesión.
const deAdministracion = [requiereSesion, requiereAdministrador];

router.get('/buscar',          ctrl.buscar);
router.get('/solicitud/:id',   ctrl.detalle);
router.post('/solicitud',      ctrl.crearSolicitud);

// PWA Cliente (docs/rediseno/design_handoff_pwa_movil/README.md §6, C1) — el entorno
// viaja en ?entorno= de la query, la PWA se abre fuera de la SPA (CORRECCIONES.md punto 7).
router.post('/acceso',            ctrl.acceso);
// Mandar el link del portal a un contacto es trabajo de todos los días de la operación
// (Ingreso, Clientes): sesión sí, rol de administración no.
router.post('/emitir-token',      requiereSesion, ctrl.emitirTokenContacto);
router.get('/mis-solicitudes',    ctrl.misSolicitudes);
router.post('/solicitudes/:id/cancelar',    ctrl.cancelarSolicitud);
router.post('/solicitudes/:id/reactivar',   ctrl.reactivarSolicitud);
router.post('/solicitudes/:id/descripcion', ctrl.editarDescripcionSolicitud);
router.post('/ot/:id/responder',  ctrl.responderCotizacion);
router.post('/ot/:id/excepciones/:excepcionId/responder', ctrl.responderExcepcion);
router.post('/ot/:id/orden-compra', ctrl.actualizarOrdenCompra);
router.post('/ot/:id/edp', ctrl.actualizarEdp);
router.post('/ot/:id/hes', ctrl.actualizarHes);
// --- Administración de los accesos de clientes: oficina, rol de administración ---
router.get('/sesiones',              ...deAdministracion, ctrl.listarSesiones);
router.get('/stock-tokens',          ...deAdministracion, ctrl.stockTokens);
router.post('/sesiones/lote',        ...deAdministracion, ctrl.generarLote);
router.post('/sesiones/:id/revocar',   ...deAdministracion, ctrl.revocarSesion);
router.post('/sesiones/:id/reactivar', ...deAdministracion, ctrl.reactivarSesion);
router.post('/sesiones/:id/regenerar', ...deAdministracion, ctrl.regenerarToken);
router.post('/sesiones/:id/reenviar',  ...deAdministracion, ctrl.reenviarToken);
// apiKey solo acá: borra el registro entero (Bodega de tokens, botón "Eliminar"), a
// diferencia de revocar que solo invalida — mismo criterio de "escritura de mayor riesgo"
// que ya protege OT/contabilidad/recursos/puestos/calendarios.
router.delete('/sesiones/:id',         ...deAdministracion, apiKey, ctrl.eliminarSesion);

module.exports = router;
