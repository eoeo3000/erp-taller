require('dotenv').config();
const mongoose = require('mongoose');
const { confirmarDestructivo } = require('./_confirmar');

async function borrarIndiceCorrupto() {
    try {
        await confirmarDestructivo('Elimina el índice "patente_1" de la colección "suministros".');

        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;

        // Borramos el índice específico que está causando el bloqueo
        await db.collection('suministros').dropIndex("patente_1");
        console.log("✅ Índice 'patente_1' eliminado con éxito.");

        // Opcional: listar índices para estar seguros
        const indexes = await db.collection('suministros').indexes();
        console.log("Índices restantes:", indexes.map(i => i.name));

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

borrarIndiceCorrupto();
