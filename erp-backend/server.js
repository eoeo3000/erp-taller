const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let db = {
    solicitudes: [
        { id: 1, estado: 'Pendiente', solicitante: 'Minera Escondida', descripcion: 'Mantención Generador', fecha: '06/01/2026', origen: 'WhatsApp' }
    ],
    ots: []
};

// Log de depuración para ver qué entra al servidor
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Ruta de datos global
app.get('/api/data', (req, res) => res.json(db));

// Ruta de solicitudes
app.post('/api/solicitudes', (req, res) => {
    const nueva = { id: db.solicitudes.length + 1, estado: 'Pendiente', fecha: new Date().toLocaleDateString(), ...req.body };
    db.solicitudes.push(nueva);
    res.json(nueva);
});

// server.js
app.post('/api/convertir-ot', (req, res) => {
    // Recibimos el objeto completo con el array de tareas
    const { solicitudId, tareas, componentes } = req.body;

    const nuevaOT = {
        id: solicitudId, // Usamos el ID de la solicitud para identificarla
        tareas: tareas,   // Guardamos la lista de puestos, horas y fechas
        componentes: componentes,
        fechaCreacion: new Date()
    };

    db.ots.push(nuevaOT);

    // Actualizamos el estado de la solicitud original
    db.solicitudes = db.solicitudes.map(s =>
        s.id === solicitudId ? { ...s, estado: 'Tratada' } : s
    );

    console.log("✅ OT Creada con tareas:", tareas);
    res.status(201).json(nuevaOT);
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`SERVIDOR ERP ACTIVO EN PUERTO: ${PORT}`);
    console.log(`RUTA POST: http://localhost:${PORT}/api/convertir-ot`);
    console.log(`=========================================`);
});