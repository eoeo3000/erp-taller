const express = require('express');
const router = express.Router();

// Importar todas las rutas individuales
const dataRoutes = require('./dataRoutes');
const personalRoutes = require('./recursosRoutes');
const equipoRoutes = require('./equiposHerramientasRoutes');
const suministroRoutes = require('./suministroRoutes');
const calendarioRoutes = require('./calendarioRoutes');
const otRoutes = require('./otRoutes');
const puestosRoutes = require('./puestosRoutes');
// ✅ PASO 1: Importar solicitudes
const solicitudRoutes = require('./solicitudRoutes');
const plantillaRoutes = require('./plantillaRoutes');
const finanzasRoutes = require('./finanzasRoutes');

// Definir los prefijos de las URLs
router.use('/data', dataRoutes);
router.use('/recursos', personalRoutes);
router.use('/equipos', equipoRoutes);
router.use('/suministros', suministroRoutes);
router.use('/calendarios', calendarioRoutes);
router.use('/ots', otRoutes);
router.use('/puestos', puestosRoutes);
router.use('/solicitudes', solicitudRoutes);
router.use('/plantillas', plantillaRoutes);
router.use('/finanzas', finanzasRoutes);

module.exports = router;