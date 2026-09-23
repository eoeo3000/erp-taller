// Respaldos de la base. No pasa por `requiereSesion`: lo llama un programador externo (ver
// .github/workflows/respaldo.yml), no una persona con sesión abierta en el SPA. Trae su
// propia clave, RESPALDO_TOKEN, y sin ella el controlador responde 503 — cerrado por
// omisión, al revés que los gates con rollout (ver el comentario en respaldoController.js).
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/respaldoController');

router.get('/', ctrl.listar);
router.post('/', ctrl.crear);

module.exports = router;
