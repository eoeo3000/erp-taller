// Migración idempotente: rellena informeEvaluacion.fecha / actualizadoEn en los informes que
// se guardaron ANTES de que O5_InformeEvaluacion empezara a estamparlos. Hasta ese cambio el
// informe se grababa sin fecha ninguna, así que la pestaña "Informe inicial" del escritorio
// muestra "Sin registrar" aunque el informe esté completo y firmado.
//
// La fecha sale de la Asignacion de evaluación de esa solicitud: updatedAt es cuándo el
// supervisor la cerró al enviar el informe — el mismo dato que la PWA Operativa ya muestra
// como "enviado" en sus informes. Se formatea en horario de Chile, no en el del servidor
// (Render corre en UTC: un informe enviado a las 21:00 en Santiago cae al día siguiente si
// se lee el UTC crudo).
//
// Un informe sin Asignacion de evaluación queda como está: mejor "Sin registrar" que
// inventarle una fecha. Lo ya estampado tampoco se pisa, así que se puede correr las veces
// que haga falta.
//
//   node migrar-fecha-informe-evaluacion.js             → solo muestra qué haría
//   node migrar-fecha-informe-evaluacion.js --aplicar   → escribe
require('dotenv').config();
const mongoose = require('mongoose');
const getOT = require('./src/models/OT');
const getAsignacion = require('./src/models/Asignacion');

const aplicar = process.argv.includes('--aplicar');

// 'en-CA' con timeZone da directamente YYYY-MM-DD, que es el formato en que se guarda
// informeEvaluacion.fecha (ver el modelo y el sello de O5_InformeEvaluacion).
const fechaChile = (valor) => new Date(valor).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

async function migrar(uri, nombre) {
    if (!uri) { console.log(`(${nombre}) sin URI configurada, se omite`); return; }
    const conn = await mongoose.createConnection(uri).asPromise();
    const OT = getOT(conn);
    const Asignacion = getAsignacion(conn);

    const sinFecha = await OT.find({
        'informeEvaluacion.completo': true,
        $or: [
            { 'informeEvaluacion.fecha': { $exists: false } },
            { 'informeEvaluacion.fecha': null },
            { 'informeEvaluacion.fecha': '' },
        ],
    }).select('_id numeroOT solicitudId informeEvaluacion.responsable').lean();

    if (sinFecha.length === 0) {
        console.log(`(${nombre}) no hay informes completos sin fecha — nada que hacer`);
        await conn.close();
        return;
    }

    // OT._id y Solicitud._id son el mismo id (el upsert de otController.actualizarOT reusa el
    // de la solicitud), así que solicitudId puede venir vacío en OT viejas: se cae al propio _id.
    const idsSolicitud = sinFecha.map((ot) => ot.solicitudId || ot._id);
    const asignaciones = await Asignacion.find({
        tipo: 'evaluacion',
        estado: 'completada',
        solicitudId: { $in: idsSolicitud },
    }).select('solicitudId updatedAt').lean();
    const cierrePorSolicitud = new Map(asignaciones.map((a) => [String(a.solicitudId), a.updatedAt]));

    const escrituras = [];
    const sinReferencia = [];
    for (const ot of sinFecha) {
        const cerrada = cierrePorSolicitud.get(String(ot.solicitudId || ot._id));
        if (!cerrada) { sinReferencia.push(ot.numeroOT || String(ot._id)); continue; }
        escrituras.push({
            updateOne: {
                filter: { _id: ot._id },
                update: {
                    $set: {
                        'informeEvaluacion.fecha': fechaChile(cerrada),
                        'informeEvaluacion.actualizadoEn': cerrada,
                    },
                },
            },
        });
        console.log(`(${nombre}) ${ot.numeroOT || ot._id} · ${ot.informeEvaluacion?.responsable || 'sin responsable'} → ${fechaChile(cerrada)}`);
    }

    if (sinReferencia.length > 0) {
        console.log(`(${nombre}) sin Asignacion de evaluación, se dejan sin fecha: ${sinReferencia.join(', ')}`);
    }

    if (!aplicar) {
        console.log(`(${nombre}) SIMULACIÓN — se rellenarían ${escrituras.length} de ${sinFecha.length}. Volver a correr con --aplicar para escribir.`);
    } else if (escrituras.length > 0) {
        const r = await OT.bulkWrite(escrituras);
        console.log(`(${nombre}) informes actualizados: ${r.modifiedCount}`);
    } else {
        console.log(`(${nombre}) nada que escribir`);
    }

    await conn.close();
}

(async () => {
    await migrar(process.env.MONGO_URI, 'producción');
    await migrar(process.env.MONGO_URI_DEMO, 'demo');
    process.exit(0);
})().catch((err) => { console.error('Error en la migración:', err.message); process.exit(1); });
