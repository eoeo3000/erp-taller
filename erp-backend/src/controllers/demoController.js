// Modo demostración (§9.2 del README de rediseño). Los tres endpoints solo operan sobre la
// conexión demo (erp_taller_demo) y rechazan con 409 si la request no llegó con el header
// X-Entorno: demo (ver middlewares/entorno.js) — así es imposible tocar producción desde acá.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const getPuesto = require('../models/puesto');
const getCuentaContable = require('../models/CuentaContable');
const getCalendario = require('../models/Calendario');
const getRecurso = require('../models/Recurso');
const getSuministro = require('../models/suministro');
const getEquipo = require('../models/equiposHerramientas');
const getPlantilla = require('../models/Plantilla');
const getSolicitud = require('../models/Solicitud');
const getOT = require('../models/OT');
const getAsientoContable = require('../models/AsientoContable');

const DemoMetaSchema = new mongoose.Schema({
    cargado: { type: Boolean, default: false },
    fecha: { type: Date, default: null },
    registros: { type: Number, default: 0 },
}, { collection: '_demoMeta' });
function getDemoMeta(conn) { return conn.models.DemoMeta || conn.model('DemoMeta', DemoMetaSchema); }

const seedPath = path.join(__dirname, '../../seeds/demo.json');

function hoyMas(dias) {
    const d = new Date();
    d.setHours(12, 0, 0, 0); // evita corrimientos de día por zona horaria
    d.setDate(d.getDate() + dias);
    return d;
}
function hoyMasTexto(dias) {
    return hoyMas(dias).toISOString().slice(0, 10);
}

// Recorre el seed recursivamente resolviendo los marcadores {$diasFecha:N} / {$diasTexto:N}
// a fechas reales relativas al momento de la carga.
function resolverFechas(valor) {
    if (Array.isArray(valor)) return valor.map(resolverFechas);
    if (valor && typeof valor === 'object') {
        if ('$diasFecha' in valor) return hoyMas(valor.$diasFecha);
        if ('$diasTexto' in valor) return hoyMasTexto(valor.$diasTexto);
        const out = {};
        for (const k of Object.keys(valor)) out[k] = resolverFechas(valor[k]);
        return out;
    }
    return valor;
}

function quitarRef(obj) {
    const { _ref, ...resto } = obj;
    return resto;
}

exports.cargar = async (req, res) => {
    if (req.entorno !== 'demo') return res.status(409).json({ error: 'Este endpoint solo está disponible con el entorno demo activo (header X-Entorno: demo).' });

    try {
        if (!fs.existsSync(seedPath)) {
            return res.status(500).json({ error: 'No se encontró seeds/demo.json. Ejecuta node seeds/generar-demo.js primero.' });
        }
        const seedCrudo = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        const seed = resolverFechas(seedCrudo);
        const conn = req.db;

        const modelos = {
            Puesto: getPuesto(conn),
            CuentaContable: getCuentaContable(conn),
            Calendario: getCalendario(conn),
            Recurso: getRecurso(conn),
            Suministro: getSuministro(conn),
            EquiposHerramientas: getEquipo(conn),
            Plantilla: getPlantilla(conn),
            Solicitud: getSolicitud(conn),
            OT: getOT(conn),
            AsientoContable: getAsientoContable(conn),
        };

        // Vaciar todo el contenido de demo antes de recargar — permite reutilizar este mismo
        // endpoint como "Cargar" (primera vez) y como "Regenerar" (entorno ya cargado).
        await Promise.all(Object.values(modelos).map(m => m.deleteMany({})));

        // 1) Colecciones sin dependencias.
        const puestosCreados = await modelos.Puesto.insertMany(seed.puestos.map(quitarRef));
        const cuentasCreadas = await modelos.CuentaContable.insertMany(seed.cuentasContables.map(quitarRef));
        const calendariosCreados = await modelos.Calendario.insertMany(seed.calendarios.map(quitarRef));
        await modelos.Suministro.insertMany(seed.suministros.map(quitarRef));
        await modelos.EquiposHerramientas.insertMany(seed.equipos.map(quitarRef));
        await modelos.Plantilla.insertMany(seed.plantillas.map(quitarRef));

        const mapaCalendarios = new Map(seed.calendarios.map((c, i) => [c._ref, calendariosCreados[i]._id]));
        const mapaCuentas = new Map(seed.cuentasContables.map((c, i) => [c._ref, cuentasCreadas[i]._id]));

        // 2) Recursos dependen de calendarios.
        const recursosPayload = seed.recursos.map(r => ({ ...quitarRef(r), calendarioId: mapaCalendarios.get(r.calendarioRef) }));
        recursosPayload.forEach(r => delete r.calendarioRef);
        const recursosCreados = await modelos.Recurso.insertMany(recursosPayload);
        const mapaRecursos = new Map(seed.recursos.map((r, i) => [r._ref, recursosCreados[i]]));

        // 3) Solicitudes (sin dependencias).
        const solicitudesCreadas = await modelos.Solicitud.insertMany(seed.solicitudes.map(quitarRef));
        const mapaSolicitudes = new Map(seed.solicitudes.map((s, i) => [s._ref, solicitudesCreadas[i]._id]));

        // 4) OTs dependen de solicitudes y de recursos (operarios en tareas).
        const otsPayload = seed.ots.map(ot => {
            const otLimpia = quitarRef(ot);
            otLimpia.solicitudId = mapaSolicitudes.get(ot.solicitudRef);
            delete otLimpia.solicitudRef;
            if (Array.isArray(otLimpia.tareas)) {
                otLimpia.tareas = otLimpia.tareas.map(t => {
                    const refs = t.operarioRefs || [];
                    const operarios = refs.map(ref => mapaRecursos.get(ref)).filter(Boolean);
                    const { operarioRefs, ...tareaLimpia } = t;
                    return { ...tareaLimpia, operarioId: operarios.map(r => String(r._id)), operarioNombre: operarios.map(r => r.nombre) };
                });
            }
            return otLimpia;
        });
        await modelos.OT.insertMany(otsPayload);

        // 5) Asientos contables dependen de cuentas.
        const asientosPayload = seed.asientosContables.map(a => ({
            ...a,
            lineas: a.lineas.map(l => {
                const { cuentaRef, ...lineaLimpia } = l;
                return { ...lineaLimpia, cuentaId: mapaCuentas.get(cuentaRef) };
            }),
        }));
        await modelos.AsientoContable.insertMany(asientosPayload);

        const totalRegistros = puestosCreados.length + cuentasCreadas.length + calendariosCreados.length + recursosCreados.length
            + seed.suministros.length + seed.equipos.length + seed.plantillas.length
            + solicitudesCreadas.length + otsPayload.length + asientosPayload.length;

        const DemoMeta = getDemoMeta(conn);
        await DemoMeta.deleteMany({});
        await DemoMeta.create({ cargado: true, fecha: new Date(), registros: totalRegistros });

        res.json({ mensaje: 'Datos de demostración cargados', registros: totalRegistros });
    } catch (err) {
        console.error('Error cargando demo:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.vaciar = async (req, res) => {
    if (req.entorno !== 'demo') return res.status(409).json({ error: 'Este endpoint solo está disponible con el entorno demo activo (header X-Entorno: demo).' });
    if (req.body?.confirmacion !== 'VACIAR') {
        return res.status(400).json({ error: 'Debes enviar { "confirmacion": "VACIAR" } para confirmar el vaciado.' });
    }

    try {
        const conn = req.db;
        const modelos = [
            getPuesto(conn), getCuentaContable(conn), getCalendario(conn), getRecurso(conn),
            getSuministro(conn), getEquipo(conn), getPlantilla(conn), getSolicitud(conn),
            getOT(conn), getAsientoContable(conn),
        ];
        await Promise.all(modelos.map(m => m.deleteMany({})));

        const DemoMeta = getDemoMeta(conn);
        await DemoMeta.deleteMany({});
        await DemoMeta.create({ cargado: false, fecha: null, registros: 0 });

        res.json({ mensaje: 'Entorno demo vaciado' });
    } catch (err) {
        console.error('Error vaciando demo:', err);
        res.status(500).json({ error: err.message });
    }
};

// Disponible en cualquier entorno activo — informa ambos entornos para pintar las dos tarjetas
// del bloque "Entorno de trabajo" en el frontend, sin exponer credenciales de la cadena de conexión.
exports.info = async (req, res) => {
    const { obtenerConexion, conexionDisponible } = require('../config/conexiones');
    const describir = (entorno) => {
        if (!conexionDisponible(entorno)) return { disponible: false, db: null, host: null };
        const conn = obtenerConexion(entorno);
        return { disponible: true, db: conn.name, host: conn.host || '' };
    };
    res.json({ activo: req.entorno, produccion: describir('produccion'), demo: describir('demo') });
};

exports.estado = async (req, res) => {
    if (req.entorno !== 'demo') return res.status(409).json({ error: 'Este endpoint solo está disponible con el entorno demo activo (header X-Entorno: demo).' });

    try {
        const DemoMeta = getDemoMeta(req.db);
        const meta = await DemoMeta.findOne().sort({ _id: -1 });
        res.json({ cargado: !!meta?.cargado, registros: meta?.registros || 0, fecha: meta?.fecha || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
