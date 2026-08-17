require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./src/routes/index');
const mailRoutes = require('./src/routes/mailRoutes');
const resolverEntorno = require('./src/middlewares/entorno');
const { inicializarConexiones } = require('./src/config/conexiones');
const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/mail', mailRoutes);
// Asegurar carpeta de subidas
const dir = './uploads';
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

// --- TODAS LAS RUTAS (Incluyendo /data, /solicitudes, /recursos, etc.) ---
// resolverEntorno resuelve req.db/req.entorno según el header X-Entorno antes de
// llegar a cualquier controlador (ver src/middlewares/entorno.js).
app.use('/api', resolverEntorno, apiRoutes);

const PORT = process.env.PORT || 5000;

// --- CONEXIÓN A MONGODB (producción + demo) ---
inicializarConexiones()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 SERVIDOR ERP CORRIENDO EN PUERTO: ${PORT}`);
        });
    })
    .catch((err) => console.error("❌ ERROR CONECTANDO A MONGO:", err));