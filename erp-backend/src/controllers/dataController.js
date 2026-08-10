// controllers/dataController.js
const Calendario = require('../models/Calendario');
const EquiposHerramientas = require('../models/equiposHerramientas');
const OT = require('../models/OT');
const Recurso = require('../models/Recurso');
const Solicitud = require('../models/Solicitud');
const Suministro = require('../models/suministro');
const Puesto = require('../models/puesto');
const Plantilla = require('../models/Plantilla');

exports.getAllData = async (req, res) => {
    try {
        const [calendarios, equipos, ots, personal, solicitudes, suministros, puestos, plantillas] = await Promise.all([
            Calendario.find(),
            EquiposHerramientas.find(),
            OT.find().sort({ createdAt: -1 }),
            Recurso.find(),
            Solicitud.find().sort({ fechaCreacion: -1 }),
            Suministro.find(),
            Puesto.find().sort({ nombre: 1 }),
            Plantilla.find().sort({ categoria: 1, nombre: 1 })
        ]);

        res.json({
            calendarios,
            equipos,
            ots,
            recursos: personal,
            solicitudes,
            suministros,
            puestos,
            plantillas
        });
    } catch (error) {
        console.error("Error en getAllData:", error);
        res.status(500).json({ error: "Error al consolidar los datos" });
    }
};