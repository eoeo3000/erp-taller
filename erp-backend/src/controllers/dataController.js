// controllers/dataController.js
const Calendario = require('../models/Calendario');
const EquiposHerramientas = require('../models/equiposHerramientas');
const OT = require('../models/OT');
const Recurso = require('../models/Recurso');
const Solicitud = require('../models/Solicitud');
const Suministro = require('../models/suministro');
const Puesto = require('../models/puesto'); // 🚩 Importamos el nuevo modelo

exports.getAllData = async (req, res) => {
    try {
        // Ejecutamos todas las consultas en paralelo para mayor velocidad
        const [calendarios, equipos, ots, personal, solicitudes, suministros, puestos] = await Promise.all([
            Calendario.find(),
            EquiposHerramientas.find(),
            OT.find().sort({ createdAt: -1 }),
            Recurso.find(),
            Solicitud.find().sort({ fechaCreacion: -1 }),
            Suministro.find(),
            Puesto.find().sort({ nombre: 1 }) // 🚩 Traemos los puestos ordenados alfabéticamente
        ]);

        res.json({
            calendarios,
            equipos,
            ots,
            recursos: personal,
            solicitudes,
            suministros,
            puestos // 🚩 Lo enviamos al objeto de respuesta
        });
    } catch (error) {
        console.error("Error en getAllData:", error);
        res.status(500).json({ error: "Error al consolidar los datos" });
    }
};