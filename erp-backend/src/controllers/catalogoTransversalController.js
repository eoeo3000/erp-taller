// Lectura de las listas transversales del catálogo de tipos de trabajo — ver
// docs/plan-formulario-adaptativo.md §3.3. Se cargan por Excel (importExportController.js,
// junto con TipoTrabajo) — este controlador es solo lectura por ahora.
const getCatalogoTransversal = require('../models/CatalogoTransversal');

exports.obtenerCatalogosTransversales = async (req, res) => {
    const CatalogoTransversal = getCatalogoTransversal(req.db);
    try {
        const catalogos = await CatalogoTransversal.find().sort({ clave: 1 });
        res.json(catalogos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener los catálogos transversales' });
    }
};
