require('dotenv').config();
const mongoose = require('mongoose');

async function bombaDeLimpieza() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;

        // 1. Listar todas las colecciones que existen actualmente
        const collections = await db.listCollections().toArray();
        const nombres = collections.map(c => c.name);
        console.log("📂 Colecciones encontradas en Atlas:", nombres);

        // 2. Borrar todas las que tengan que ver con solicitudes o OTs
        for (let nombre of nombres) {
            if (nombre.includes('solicitud') || nombre.includes('ot')) {
                await db.dropCollection(nombre);
                console.log(`🗑️  Eliminada colección completa: ${nombre}`);
            }
        }

        console.log("✨ Base de datos impecable.");
        process.exit();
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

bombaDeLimpieza();