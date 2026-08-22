// controllers/dataController.js
const getCalendario = require('../models/Calendario');
const getEquiposHerramientas = require('../models/equiposHerramientas');
const getOT = require('../models/OT');
const getRecurso = require('../models/Recurso');
const getSolicitud = require('../models/Solicitud');
const getSuministro = require('../models/suministro');
const getPuesto = require('../models/puesto');
const getPlantilla = require('../models/Plantilla');
const getTipoTrabajo = require('../models/TipoTrabajo');
const getCondicionEntorno = require('../models/CondicionEntorno');

exports.getAllData = async (req, res) => {
    const Calendario = getCalendario(req.db);
    const EquiposHerramientas = getEquiposHerramientas(req.db);
    const OT = getOT(req.db);
    const Recurso = getRecurso(req.db);
    const Solicitud = getSolicitud(req.db);
    const Suministro = getSuministro(req.db);
    const Puesto = getPuesto(req.db);
    const Plantilla = getPlantilla(req.db);
    const TipoTrabajo = getTipoTrabajo(req.db);
    const CondicionEntorno = getCondicionEntorno(req.db);
    try {
        const [calendarios, equipos, ots, personal, solicitudes, suministros, puestos, plantillas, tiposTrabajo, condicionesEntorno] = await Promise.all([
            Calendario.find(),
            EquiposHerramientas.find(),
            OT.find().sort({ createdAt: -1 }),
            Recurso.find(),
            Solicitud.find().sort({ fechaCreacion: -1 }),
            Suministro.find(),
            Puesto.find().sort({ nombre: 1 }),
            Plantilla.find().sort({ categoria: 1, nombre: 1 }),
            TipoTrabajo.find().sort({ nombre: 1 }),
            CondicionEntorno.find().sort({ nombre: 1 })
        ]);

        res.json({
            calendarios,
            equipos,
            ots,
            recursos: personal,
            solicitudes,
            suministros,
            puestos,
            plantillas,
            tiposTrabajo,
            condicionesEntorno
        });
    } catch (error) {
        console.error("Error en getAllData:", error);
        res.status(500).json({ error: "Error al consolidar los datos" });
    }
};