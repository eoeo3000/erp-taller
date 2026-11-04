// Cuentas de escritorio (correo + clave). Todas exigen sesión REAL — requiereSesionEstricta
// y no requiereSesion — porque acá se crean y se quitan credenciales: dejar pasar mientras
// AUTH_REQUERIDA sigue apagada permitiría que cualquiera se invitara a sí mismo y conservara
// el acceso después de encender el gate (ver middlewares/sesion.js).
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cuentasController');
const { requiereSesionEstricta } = require('../middlewares/sesion');
const { requiereAdministrador } = require('../middlewares/rol');

router.use(requiereSesionEstricta);
// Invitar, revocar y cambiarle el rol a alguien es dar o quitar acceso: administración.
// Sin esto, una cuenta de operación podría invitarse a sí misma una segunda cuenta de
// administración, y el rol no habría servido de nada.
router.use(requiereAdministrador);

router.get('/', ctrl.listar);
router.post('/invitar', ctrl.invitar);
router.put('/:id', ctrl.actualizar);
router.post('/:id/reenviar', ctrl.reenviar);
router.post('/:id/revocar', ctrl.revocar);
router.post('/:id/reactivar', ctrl.reactivar);

module.exports = router;
