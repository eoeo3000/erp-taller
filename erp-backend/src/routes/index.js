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

// Definir los prefijos de las URLs
router.use('/data', dataRoutes);
router.use('/recursos', personalRoutes);
router.use('/equipos', equipoRoutes);
router.use('/suministros', suministroRoutes);
router.use('/calendarios', calendarioRoutes);
router.use('/ots', otRoutes);
router.use('/puestos', puestosRoutes);
// ✅ PASO 2: Registrar solicitudes (Esto habilita /api/solicitudes)
router.use('/solicitudes', solicitudRoutes);

module.exports = router;