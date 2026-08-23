// Fase 8 del plan "Reordenamiento de estados de OT" (ver
// C:\Users\e_ara\.claude\plans\distributed-herding-bumblebee.md). 'Aprobada'/'Rechazada'
// dejaron de ser valores de OT.estado (ver models/OT.js, subdocumento cotizacion) — este
// script migra las OT existentes en la base antes de angostar el enum (Fase 9). Correr con
// `node migrar-cotizacion-ot.js` (no está en package.json, mismo criterio que
// borrado_total.js/limpiar.js). Probar primero contra un backup/staging.
require('dotenv').config();
const mongoose = require('mongoose');

async function migrarCotizacionOT() {
    try {
        console.log("⏳ Conectando para migrar cotizacion en OT...");
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const ots = db.collection('ots');

        const ahora = new Date();

        const resultadoAprobadas = await ots.updateMany(
            { estado: 'Aprobada' },
            {
                $set: {
                    estado: 'Programada',
                    'cotizacion.respuestaCliente': 'Aprobada',
                    // No hay forma de saber retroactivamente si se verificó capacidad — se
                    // asume true para no dejar estas OT bloqueadas para enviar cotización de nuevo.
                    'cotizacion.capacidadVerificada': true,
                    'cotizacion.fechaVerificacion': ahora,
                    'cotizacion.fechaRespuesta': ahora,
                },
            }
        );
        console.log(`✔️  OT 'Aprobada' migradas a 'Programada': ${resultadoAprobadas.modifiedCount}`);

        const resultadoRechazadas = await ots.updateMany(
            { estado: 'Rechazada' },
            {
                $set: {
                    estado: 'Planificada',
                    'cotizacion.respuestaCliente': 'Rechazada',
                    'cotizacion.fechaRespuesta': ahora,
                },
            }
        );
        console.log(`✔️  OT 'Rechazada' migradas a 'Planificada': ${resultadoRechazadas.modifiedCount}`);

        const restantes = await ots.countDocuments({ estado: { $in: ['Aprobada', 'Rechazada'] } });
        if (restantes === 0) {
            console.log("✨ Migración completa: 0 OT quedan con 'Aprobada'/'Rechazada'.");
        } else {
            console.warn(`⚠️  Quedan ${restantes} OT sin migrar — revisar antes de angostar el enum (Fase 9).`);
        }

        process.exit(restantes === 0 ? 0 : 1);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

migrarCotizacionOT();
