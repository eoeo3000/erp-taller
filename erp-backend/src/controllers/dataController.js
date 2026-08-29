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
const getCliente = require('../models/Cliente');

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
    const Cliente = getCliente(req.db);
    try {
        const [calendarios, equipos, ots, personal, solicitudes, suministros, puestos, plantillas, tiposTrabajo, clientes] = await Promise.all([
            Calendario.find(),
            EquiposHerramientas.find(),
            OT.find().sort({ createdAt: -1 }),
            Recurso.find(),
            Solicitud.find().sort({ fechaCreacion: -1 }),
            Suministro.find(),
            Puesto.find().sort({ nombre: 1 }),
            Plantilla.find().sort({ categoria: 1, nombre: 1 }),
            TipoTrabajo.find().sort({ nombre: 1 }),
            // Solo lo esencial para resolver clienteId -> nombre actual (ver Solicitud.clienteId)
            // en las pantallas de trabajo diario — la ficha completa (contactos, etc.) se sigue
            // pidiendo aparte en ClientesScreen.
            Cliente.find().select('empresa')
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
            clientes
        });
    } catch (error) {
        console.error("Error en getAllData:", error);
        res.status(500).json({ error: "Error al consolidar los datos" });
    }
};