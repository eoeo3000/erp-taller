const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');

// Esta ruta responderá a GET /api/data
router.get('/', dataController.getAllData);

module.exports = router;