const express = require('express');
const router = express.Router();
const {
    getOrdenesCompra,
    crearOrdenCompra,
    actualizarOrdenCompra,
    eliminarOrdenCompra,
    enviarOrdenCompra,
    recibirOrdenCompra
} = require('../controllers/ordenCompraController');

router.get('/', getOrdenesCompra);
router.post('/', crearOrdenCompra);
router.put('/:id', actualizarOrdenCompra);
router.delete('/:id', eliminarOrdenCompra);
router.post('/:id/enviar', enviarOrdenCompra);
router.post('/:id/recibir', recibirOrdenCompra);

module.exports = router;
