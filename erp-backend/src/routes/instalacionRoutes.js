// Primera puesta en marcha. Es pública a propósito: quien la usa todavía no tiene cuenta
// con qué autenticarse — ese es justamente el problema que resuelve. Lo que la protege no es
// una sesión sino su propia condición: deja de funcionar en cuanto existe una cuenta con
// clave (ver instalacionController). Con SETUP_TOKEN en el .env se cierra del todo.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/instalacionController');

router.post('/', ctrl.instalar);

module.exports = router;
