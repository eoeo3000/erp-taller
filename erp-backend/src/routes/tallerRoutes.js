// Registro de talleres — el panel de quien arrienda el sistema. No pasa por `requiereSesion`
// ni por `requiereIdentidad`: no la llama una persona con sesión en el SPA de un taller.
// Trae su propia clave, PANEL_TOKEN, y sin ella el controlador responde 503 (cerrado por
// omisión, igual que /api/respaldos y por el mismo motivo).
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tallerController');

router.get('/', ctrl.listar);
// Antes de '/:slug' no hace falta (no hay rutas con parámetro en GET), pero igual va
// primero para que agregar una después no la tape.
router.get('/metricas', ctrl.metricas);
// Antes de '/:slug' no hay conflicto hoy (no existe GET con parámetro), pero va junto a
// /metricas para que agregar uno después no la tape.
router.get('/cuentas', ctrl.cuentas);
router.post('/', ctrl.crear);
router.patch('/:slug', ctrl.actualizar);
// Reemitir el enlace de instalación (el anterior deja de servir).
router.post('/:slug/instalacion', ctrl.reemitirInstalacion);
// Las tres acciones sobre una cuenta de un taller. Todas reversibles — borrar no está, y la
// razón está escrita en el controlador.
router.get('/:slug/cuentas/:id/bitacora', ctrl.bitacoraDeCuenta);
router.post('/:slug/cuentas/:id/reenviar', ctrl.reenviarInvitacionDeCuenta);
router.post('/:slug/cuentas/:id/revocar', ctrl.revocarCuentaDeTaller);
router.post('/:slug/cuentas/:id/reactivar', ctrl.reactivarCuentaDeTaller);

module.exports = router;
