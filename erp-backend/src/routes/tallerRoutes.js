// Registro de talleres — el panel de quien arrienda el sistema. No pasa por `requiereSesion`
// ni por `requiereIdentidad`: no la llama una persona con sesión en el SPA de un taller.
// Trae su propia clave, PANEL_TOKEN, y sin ella el controlador responde 503 (cerrado por
// omisión, igual que /api/respaldos y por el mismo motivo).
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tallerController');

router.get('/', ctrl.listar);
router.post('/', ctrl.crear);
router.patch('/:slug', ctrl.actualizar);

module.exports = router;
