require('dotenv').config();
const mongoose = require('mongoose');
const { confirmarDestructivo } = require('./_confirmar');

async function limpiezaAtomica() {
    try {
        await confirmarDestructivo('Vacía por completo (deleteMany) las colecciones "solicitudes"/"solicituds" y "ots".');

        console.log("⏳ Conectando para limpieza profunda...");
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;

        // 1. Obtenemos todas las colecciones
        const collections = await db.listCollections().toArray();
        const nombres = collections.map(c => c.name);

        console.log("📂 Colecciones actuales:", nombres);

        // 2. Vaciamos las colecciones de datos directamente (sin importar el modelo)
        for (let nombre of nombres) {
            if (nombre === 'solicitudes' || nombre === 'solicituds' || nombre === 'ots') {
                await db.collection(nombre).deleteMany({});
                console.log(`🗑️  Vaciada por completo la colección: ${nombre}`);
            }
        }

        console.log("✨ Ahora sí, Atlas está totalmente vacío.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

limpiezaAtomica();
