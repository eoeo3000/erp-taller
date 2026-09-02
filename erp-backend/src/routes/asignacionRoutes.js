// /mi-dia y /mi-semana los llama la PWA Operativa por token, fuera de la SPA: el
// entorno viaja en ?entorno= de la query, nunca en el header X-Entorno (ver
// CORRECCIONES.md punto 7). Van antes de /:id para no chocar con la ruta paramétrica.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/asignacionController');

router.get('/mi-dia', ctrl.miDia);
router.get('/mi-semana', ctrl.miSemana);
router.get('/mi-panel', ctrl.miPanel);
router.get('/solicitudes-sin-informe', ctrl.solicitudesSinInforme);
router.put('/tomar-solicitud/:solicitudId', ctrl.tomarSolicitud);
router.get('/mis-trabajos', ctrl.misTrabajos);
router.get('/mis-informes', ctrl.misInformes);
router.get('/ejecutadas', ctrl.ejecutadas);
router.get('/tablero-supervisores', ctrl.tableroSupervisores);
router.post('/', ctrl.crear);
router.get('/', ctrl.listar);
router.put('/:id/cerrar', ctrl.cerrar);

module.exports = router;
