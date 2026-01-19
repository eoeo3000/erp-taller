const express = require('express');
const router = express.Router();
const solicitudController = require('../controllers/solicitudController');
const multer = require('multer');
const path = require('path');

// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Asegúrate de que esta carpeta exista en la raíz de tu backend
    },
    filename: (req, file, cb) => {
        // Generamos un nombre único: timestamp + extensión original
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- ENDPOINTS ACTUALIZADOS ---

router.get('/', solicitudController.obtenerSolicitudes);

// Usamos upload.single('archivo') para interceptar el archivo físico
// El nombre 'archivo' debe coincidir con el formData.append('archivo', ...) de App.js
router.post('/', upload.single('archivo'), solicitudController.crearSolicitud);

router.patch('/:id', solicitudController.actualizarEstado);

module.exports = router;