const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let db = {
    solicitudes: [],
    ots: [],
    // Nueva sección de personal
    personal: [
        { id: 1, nombre: "Pedro", puesto: "Mecánico", disponibilidad: [] },
        { id: 2, nombre: "Juan", puesto: "Mecánico", disponibilidad: [] },
        { id: 3, nombre: "Luis", puesto: "Eléctrico", disponibilidad: [] },
    ]
};

if (!db.recursos) {
    db.recursos = [
        { id: 1, nombre: "Juan Mecánico", tipo: "Humano", especialidad: "Mecánico", disponibilidad: [] }
    ];
}

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

app.post('/api/recursos/:id/ausencia', (req, res) => {
    const { id } = req.params;
    const { fecha, motivo } = req.body;

    const recurso = db.recursos.find(r => r.id === parseInt(id));
    if (recurso) {
        if (!recurso.disponibilidad) recurso.disponibilidad = [];
        recurso.disponibilidad.push({ fecha, motivo });
        res.json({ success: true });
    } else {
        res.status(404).send("Recurso no encontrado");
    }
});

// server.js
app.post('/api/convertir-ot', (req, res) => {
    const { solicitudId, tareas, componentes, esEdicion } = req.body;

    if (esEdicion) {
        // --- MODO EDICIÓN ---
        const indexOT = db.ots.findIndex(ot => ot.id === solicitudId);
        if (indexOT !== -1) {
            // Actualizamos solo las tareas y componentes, manteniendo el resto igual
            db.ots[indexOT].tareas = tareas;
            db.ots[indexOT].componentes = componentes;
            console.log(`📝 OT #${solicitudId} actualizada`);
        }
    } else {
        // --- MODO NUEVO ---
        const solicitudOriginal = db.solicitudes.find(s => s.id === solicitudId);
        if (solicitudOriginal) {
            solicitudOriginal.estado = 'Tratada';

            const nuevaOT = {
                id: solicitudId,
                cliente: solicitudOriginal.solicitante,
                descripcion: solicitudOriginal.descripcion,
                tareas: tareas,
                componentes: componentes,
                fechaCreacion: new Date().toISOString()
            };
            db.ots.push(nuevaOT);
            console.log(`✅ Nueva OT #${solicitudId} creada`);
        }
    }
    res.json({ success: true });
});



app.get('/api/recursos', (req, res) => res.json(db.recursos));

app.get('/api/recursos', (req, res) => {
    console.log("Enviando lista de recursos...");
    res.json(db.recursos || []);
});

app.post('/api/recursos', (req, res) => {
    const nuevo = {
        id: Date.now(),
        ...req.body,
        disponibilidad: []
    };
    db.recursos.push(nuevo);
    res.json(nuevo);
});
// server.js
// Asegúrate de que esto esté después de declarar 'app' y 'db'

app.delete('/api/ots/:id', (req, res) => {
    const { id } = req.params;

    // Buscamos si la OT existe
    const existe = db.ots.find(ot => ot.id === parseInt(id));

    if (existe) {
        // Filtramos para eliminarla
        db.ots = db.ots.filter(ot => ot.id !== parseInt(id));

        // OPCIONAL: Si quieres que la solicitud vuelva a estar "Pendiente" al borrar la OT:
        const solicitud = db.solicitudes.find(s => s.id === parseInt(id));
        if (solicitud) solicitud.estado = 'Pendiente';

        console.log(`🗑️ OT #${id} eliminada correctamente`);
        res.status(200).json({ message: "Eliminado con éxito" });
    } else {
        res.status(404).json({ message: "OT no encontrada" });
    }
});

// Rutas para gestionar personal
app.get('/api/personal', (req, res) => res.json(db.personal));

app.post('/api/personal/ausencia', (req, res) => {
    const { empleadoId, fechaInicio, fechaFin, motivo } = req.body;
    const empleado = db.personal.find(p => p.id === empleadoId);
    if (empleado) {
        empleado.disponibilidad.push({ fechaInicio, fechaFin, motivo });
        res.json({ success: true });
    }
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`SERVIDOR ERP ACTIVO EN PUERTO: ${PORT}`);
    console.log(`RUTA POST: http://localhost:${PORT}/api/convertir-ot`);
    console.log(`=========================================`);
});