// Cuentas de escritorio (correo + clave). Todas exigen sesión REAL — requiereSesionEstricta
// y no requiereSesion — porque acá se crean y se quitan credenciales: dejar pasar mientras
// AUTH_REQUERIDA sigue apagada permitiría que cualquiera se invitara a sí mismo y conservara
// el acceso después de encender el gate (ver middlewares/sesion.js).
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cuentasController');
const { requiereSesionEstricta } = require('../middlewares/sesion');

router.use(requiereSesionEstricta);

router.get('/', ctrl.listar);
router.post('/invitar', ctrl.invitar);
router.put('/:id', ctrl.actualizar);
router.post('/:id/reenviar', ctrl.reenviar);
router.post('/:id/revocar', ctrl.revocar);
router.post('/:id/reactivar', ctrl.reactivar);

module.exports = router;
