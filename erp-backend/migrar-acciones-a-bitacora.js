// Migración idempotente: mueve a OT.bitacora las acciones que quedaron guardadas como
// "evidencia de terreno" (OT.reportes). Hasta este cambio, posponer / interrumpir / reabrir /
// reprogramar / replanificar se empujaban a `reportes` con un emoji de prefijo, así que en el
// escritorio salían listadas bajo "Evidencias de terreno" — donde no corresponden: no son
// evidencia de nada visto en la faena, son cosas que alguien hizo. Ahora van a la bitácora
// (ver aplicarAccionOT), y esto pone al día lo ya guardado para no tener que dejar en el
// código un detector de emojis permanente en las tres apps.
//
// `reportes` conserva solo lo que sí es evidencia: comentario + foto desde terreno.
//
//   node migrar-acciones-a-bitacora.js             → solo muestra qué haría
//   node migrar-acciones-a-bitacora.js --aplicar   → escribe
require('dotenv').config();
const mongoose = require('mongoose');
const getOT = require('./src/models/OT');

const aplicar = process.argv.includes('--aplicar');

// Los prefijos exactos que usaba aplicarAccionOT antes del cambio, con el texto que les
// seguía. Se traduce a la redacción nueva, sin emoji ni mayúsculas sostenidas.
const PREFIJOS = [
    ['⏸️ TRABAJO POSPUESTO:', 'Trabajo pospuesto:'],
    ['⚠️ TRABAJO INTERRUMPIDO:', 'Trabajo interrumpido:'],
    ['🔓 OT REABIERTA:', 'OT reabierta:'],
    ['📅 REPROGRAMACIÓN SOLICITADA:', 'Reprogramación solicitada:'],
    ['🔧 REPLANIFICACIÓN SOLICITADA:', 'Replanificación solicitada:'],
];

const comoAccion = (comentario) => {
    for (const [viejo, nuevo] of PREFIJOS) {
        if ((comentario || '').startsWith(viejo)) return `${nuevo}${comentario.slice(viejo.length)}`;
    }
    return null;
};

async function migrar(uri, nombre) {
    if (!uri) { console.log(`(${nombre}) sin URI configurada, se omite`); return; }
    const conn = await mongoose.createConnection(uri).asPromise();
    const OT = getOT(conn);

    const ots = await OT.find({ 'reportes.0': { $exists: true } }).select('numeroOT reportes bitacora').lean();
    const escrituras = [];

    for (const ot of ots) {
        const acciones = [];
        const evidencias = [];
        for (const r of ot.reportes || []) {
            const texto = comoAccion(r.comentario);
            if (texto) acciones.push({ fecha: r.fecha || new Date(), texto, autor: r.usuario || '' });
            else evidencias.push(r);
        }
        if (acciones.length === 0) continue;

        // La bitácora queda ordenada por fecha: las acciones migradas son viejas y tienen que
        // intercalarse donde corresponde, no amontonarse al final.
        const bitacora = [...(ot.bitacora || []), ...acciones]
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        escrituras.push({ updateOne: { filter: { _id: ot._id }, update: { $set: { reportes: evidencias, bitacora } } } });
        acciones.forEach((a) => console.log(`(${nombre}) ${ot.numeroOT} → bitácora: ${a.texto}`));
    }

    if (escrituras.length === 0) {
        console.log(`(${nombre}) no hay acciones guardadas como evidencia — nada que hacer`);
    } else if (!aplicar) {
        console.log(`(${nombre}) SIMULACIÓN — se moverían acciones en ${escrituras.length} OT. Volver a correr con --aplicar para escribir.`);
    } else {
        const r = await OT.bulkWrite(escrituras);
        console.log(`(${nombre}) OT actualizadas: ${r.modifiedCount}`);
    }

    await conn.close();
}

(async () => {
    await migrar(process.env.MONGO_URI, 'producción');
    await migrar(process.env.MONGO_URI_DEMO, 'demo');
    process.exit(0);
})().catch((err) => { console.error('Error en la migración:', err.message); process.exit(1); });
