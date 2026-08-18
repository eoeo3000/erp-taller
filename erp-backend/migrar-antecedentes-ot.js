// Migración idempotente: agrega prioridad: 'Normal' a las OT que no la tengan y deja
// supervisorId: null explícito (Mongoose solo aplica defaults a documentos nuevos, no
// retroactivamente a los ya guardados — ver docs/estrategia-movil.md / pestaña Antecedentes).
// Corre contra MONGO_URI y, si está definida, también MONGO_URI_DEMO. Se puede ejecutar
// las veces que haga falta: solo toca documentos que de verdad les falta el campo.
require('dotenv').config();
const mongoose = require('mongoose');
const getOT = require('./src/models/OT');

async function migrar(uri, nombre) {
    if (!uri) { console.log(`(${nombre}) sin URI configurada, se omite`); return; }
    const conn = await mongoose.createConnection(uri).asPromise();
    const OT = getOT(conn);

    const rPrioridad = await OT.updateMany({ prioridad: { $exists: false } }, { $set: { prioridad: 'Normal' } });
    const rSupervisor = await OT.updateMany({ supervisorId: { $exists: false } }, { $set: { supervisorId: null } });

    console.log(`(${nombre}) prioridad agregada: ${rPrioridad.modifiedCount} · supervisorId agregado: ${rSupervisor.modifiedCount}`);
    await conn.close();
}

(async () => {
    await migrar(process.env.MONGO_URI, 'producción');
    await migrar(process.env.MONGO_URI_DEMO, 'demo');
    process.exit(0);
})().catch((err) => { console.error('Error en la migración:', err.message); process.exit(1); });
