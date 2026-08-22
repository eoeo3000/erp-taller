const express = require('express');
const router = express.Router();
const multer = require('multer');
const ctrl = require('../controllers/importExportController');

// Multer en memoria (no guarda en disco, pasa buffer directo al controller)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── IMPORTAR ──────────────────────────────────────────────────────────────────
router.post('/recursos',    upload.single('archivo'), ctrl.importarRecursos);
router.post('/suministros', upload.single('archivo'), ctrl.importarSuministros);
router.post('/equipos',     upload.single('archivo'), ctrl.importarEquipos);
router.post('/puestos',     upload.single('archivo'), ctrl.importarPuestos);
router.post('/tipos-trabajo', upload.single('archivo'), ctrl.importarTiposTrabajo);

// ── EXPORTAR BATCH ────────────────────────────────────────────────────────────
router.get('/exportar/batch',        ctrl.exportarBatch);

// ── EXPORTAR INDIVIDUAL ───────────────────────────────────────────────────────
router.get('/exportar/recursos',     ctrl.exportarRecursos);
router.get('/exportar/suministros',  ctrl.exportarSuministros);
router.get('/exportar/equipos',      ctrl.exportarEquipos);
router.get('/exportar/puestos',      ctrl.exportarPuestos);
router.get('/exportar/ots',          ctrl.exportarOTs);
router.get('/exportar/solicitudes',  ctrl.exportarSolicitudes);
router.get('/exportar/tipos-trabajo', ctrl.exportarTiposTrabajo);

// ── PLANTILLAS VACÍAS ─────────────────────────────────────────────────────────
router.get('/plantilla/recursos',    ctrl.plantillaRecursos);
router.get('/plantilla/suministros', ctrl.plantillaSuministros);
router.get('/plantilla/equipos',     ctrl.plantillaEquipos);
router.get('/plantilla/puestos',     ctrl.plantillaPuestos);
router.get('/plantilla/tipos-trabajo', ctrl.plantillaTiposTrabajo);

// ── ADMINISTRACIÓN DEL SISTEMA ───────────────────────────────────────────────
router.get('/uso-disco', ctrl.usoDisco);

module.exports = router;
