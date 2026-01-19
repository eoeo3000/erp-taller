require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. IMPORTACIONES DE MODELOS (Para la ruta /api/data)
const OT = require('./src/models/OT');
const Recurso = require('./src/models/Recurso');
const Calendario = require('./src/models/Calendario'); // <--- Descomentado
const Solicitud = require('./src/models/Solicitud');

// 2. IMPORTACIONES DE RUTAS (Una sola vez cada una)
const otRoutes = require('./src/routes/otRoutes');
const recursosRoutes = require('./src/routes/recursosRoutes');
const calendarioRoutes = require('./src/routes/calendarioRoutes'); // <--- Solo una vez aquí
const solicitudRoutes = require('./src/routes/solicitudRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Logger
app.use((req, res, next) => {
    next();
});

// --- CONEXIÓN A MONGODB ---
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ CONECTADO A MONGODB ATLAS"))
    .catch((err) => console.error("❌ ERROR CONECTANDO A MONGO:", err));

// --- RUTA MAESTRA DE DATOS (Sincronización global) ---
// --- RUTA MAESTRA DE DATOS (Sincronización global) ---
app.get('/api/data', async (req, res) => {
    try {
        // Verificamos que la conexión esté abierta (1 = conectado)
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Base de datos conectando..." });
        }

        // Consultas limpias sin comandos de diagnóstico que causan errores
        const [ots, solicitudes, recursos, calendarios] = await Promise.all([
            OT.find().sort({ createdAt: -1 }),
            Solicitud.find().sort({ createdAt: -1 }),
            Recurso.find(),
            Calendario.find()
        ]);

        res.json({
            ots: ots || [],
            solicitudes: solicitudes || [],
            recursos: recursos || [],
            calendarios: calendarios || []
        });
    } catch (error) {
        console.error("❌ Error en sincronización:", error);
        res.status(500).json({ error: "Error en la sincronización con Atlas" });
    }
});

const dir = './uploads';
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}

// Configuración de dónde y cómo se guardan los archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Ahora estamos seguros de que existe
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Ruta para recibir la solicitud con archivo
// 'archivo' es el nombre del campo que enviará el frontend
app.post('/api/solicitudes', upload.single('archivo'), async (req, res) => {
    try {
        // req.body ya contiene los campos sueltos gracias a Multer
        // No necesitamos JSON.parse()
        const datosRecibidos = { ...req.body };

        // Si se subió un archivo, lo asignamos al campo adjuntos
        if (req.file) {
            datosRecibidos.adjuntos = `/uploads/${req.file.filename}`;
        }

        const solicitud = new Solicitud(datosRecibidos);
        await solicitud.save();

        res.status(201).json(solicitud);
    } catch (error) {
        console.error("❌ Error en POST /api/solicitudes:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- RUTAS POR MÓDULO ---
//app.use('/api/solicitudes', solicitudRoutes); // Ahora usa su propia lógica
app.use('/api/ots', otRoutes);
app.use('/api/recursos', recursosRoutes);
app.use('/api/calendarios', calendarioRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// En server.js
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR ERP CORRIENDO EN PUERTO: ${PORT}`);
});