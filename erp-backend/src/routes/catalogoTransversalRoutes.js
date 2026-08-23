const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/catalogoTransversalController');

// Prefijo base: /api/catalogos-transversales
router.get('/', ctrl.obtenerCatalogosTransversales);

module.exports = router;
