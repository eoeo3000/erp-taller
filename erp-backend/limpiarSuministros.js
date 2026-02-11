require('dotenv').config();
const mongoose = require('mongoose');

async function limpiezaSuministros() {
    try {
        console.log("⏳ Conectando para limpieza de suministros...");
        // Asegúrate de que tu .env tenga MONGO_URI
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;

        // 1. Obtenemos las colecciones
        const collections = await db.listCollections().toArray();
        const nombres = collections.map(c => c.name);

        console.log("📂 Colecciones detectadas:", nombres);

        // 2. Buscamos y vaciamos solo 'suministros'
        let encontrado = false;
        for (let nombre of nombres) {
            // El nombre suele ser 'suministros' o 'suministros' (plural)
            if (nombre === 'suministros') {
                const resultado = await db.collection(nombre).deleteMany({});
                console.log(`🗑️  Vaciada: ${nombre} (${resultado.deletedCount} documentos eliminados)`);
                encontrado = true;
            }
        }

        if (!encontrado) {
            console.log("⚠️  No se encontró la colección 'suministros'. Verifica el nombre en Atlas.");
        }

        console.log("✨ Proceso terminado.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error en la limpieza:", error);
        process.exit(1);
    }
}

limpiezaSuministros();