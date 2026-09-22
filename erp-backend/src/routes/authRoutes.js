// Login de la app de escritorio. Ninguna de estas rutas puede exigir sesión para entrar
// (son justamente las que la crean), salvo las dos que operan sobre la sesión en curso.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { requiereSesion } = require('../middlewares/sesion');

router.post('/login', ctrl.login);
router.post('/recuperar', ctrl.recuperar);
router.post('/restablecer', ctrl.restablecer);

// `yo` valida la sesión por su cuenta y responde 401 sin ella — el SPA la usa al arrancar
// justamente para saber si hay que mostrar el login, así que no pasa por requiereSesion
// (que durante el rollout deja pasar sin sesión y haría que el SPA creyera que hay una).
router.get('/yo', ctrl.yo);
router.post('/logout', ctrl.logout);
router.post('/cambiar-password', requiereSesion, ctrl.cambiarPassword);

module.exports = router;
