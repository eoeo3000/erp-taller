require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./src/routes/index');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Asegurar carpeta de subidas
const dir = './uploads';
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ CONECTADO A MONGODB ATLAS"))
    .catch((err) => console.error("❌ ERROR CONECTANDO A MONGO:", err));

// --- TODAS LAS RUTAS (Incluyendo /data, /solicitudes, /recursos, etc.) ---
// Al usar /api aquí, todas las rutas del index.js heredarán el prefijo
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR ERP CORRIENDO EN PUERTO: ${PORT}`);
});