const mongoose = require('mongoose');
const OT = require('./models/OT'); // Ajusta la ruta a tu modelo

async function verificarReportes() {
    await mongoose.connect('mongodb://localhost:27017/tu_base_de_datos'); // Tu URL de conexión

    const ot = await OT.findOne({ numeroOT: "OT-2026-0001" });

    if (ot) {
        console.log(`✅ OT Encontrada: ${ot.numeroOT}`);
        console.log(`📸 Cantidad de reportes: ${ot.reportes.length}`);
        console.log("Detalle de reportes:", JSON.stringify(ot.reportes, null, 2));
    } else {
        console.log("❌ No se encontró la OT");
    }

    process.exit();
}

verificarReportes();