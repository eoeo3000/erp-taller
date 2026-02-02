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

// Definir los prefijos de las URLs
router.use('/data', dataRoutes);           // GET /api/data (Consolidado)
router.use('/recursos', personalRoutes);   // CRUD Personal
router.use('/equipos', equipoRoutes);      // CRUD Equipos
router.use('/suministros', suministroRoutes); // CRUD Suministros
router.use('/calendarios', calendarioRoutes); // CRUD Calendarios
router.use('/ots', otRoutes);              // CRUD OTs
router.use('/puestos', puestosRoutes);

module.exports = router;