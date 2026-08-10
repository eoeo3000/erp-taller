require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./src/routes/index');
const mailRoutes = require('./src/routes/mailRoutes');
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