const express = require('express');
const router = express.Router();
const { getProveedores, crearProveedor, actualizarProveedor, eliminarProveedor } = require('../controllers/proveedorController');

router.get('/', getProveedores);
router.post('/', crearProveedor);
router.put('/:id', actualizarProveedor);
router.delete('/:id', eliminarProveedor);

module.exports = router;
