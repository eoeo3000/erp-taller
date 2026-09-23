require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const apiRoutes = require('./src/routes/index');
const mailRoutes = require('./src/routes/mailRoutes');
const archivosRoutes = require('./src/routes/archivosRoutes');
const resolverEntorno = require('./src/middlewares/entorno');
const contratoRespuesta = require('./src/middlewares/respuestas');
const { inicializarConexiones } = require('./src/config/conexiones');
const almacenamiento = require('./src/config/almacenamiento');
const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
// Los archivos guardados (fotos de terreno, adjuntos de solicitudes) se sirven desde
// /uploads/<clave>, fuera de /api, porque esa es la ruta que quedó escrita dentro de los
// documentos de la base. Ver src/routes/archivosRoutes.js.
app.use('/uploads', archivosRoutes);
// res.ok/res.fail — contrato de respuesta consistente para controladores nuevos o ya
// tocados por otra razón (ver src/middlewares/respuestas.js). Antes de las rutas para que
// esté disponible en /api/mail también, no solo en /api.
app.use(contratoRespuesta);
app.use('/api/mail', mailRoutes);
// Asegurar carpeta de subidas — sigue siendo el destino cuando R2 no está configurado, y
// el respaldo de lectura de todo lo que se subió antes de que existiera el bucket.
if (!fs.existsSync(almacenamiento.CARPETA_LOCAL)) fs.mkdirSync(almacenamiento.CARPETA_LOCAL, { recursive: true });
almacenamiento.avisarConfiguracion();

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