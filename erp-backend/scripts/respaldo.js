// Respaldo manual de la base. Ver src/servicios/respaldo.js para el formato y el porqué.
//
//   node scripts/respaldo.js              # respalda producción
//   node scripts/respaldo.js --entorno=demo
//   node scripts/respaldo.js --listar     # no respalda: muestra lo que hay guardado
//
// El respaldo automático diario lo dispara .github/workflows/respaldo.yml contra
// POST /api/respaldos. Este script es para hacer uno a mano antes de tocar algo delicado —
// que es, justamente, cuando más se agradece.
require('dotenv').config();
const mongoose = require('mongoose');
const { crearRespaldo, listarRespaldos } = require('../src/servicios/respaldo');
const almacenamiento = require('../src/config/almacenamiento');

const argumento = (nombre, porDefecto) => {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split('=')[1] : porDefecto;
};

const entorno = argumento('entorno', 'produccion') === 'demo' ? 'demo' : 'produccion';
const soloListar = process.argv.includes('--listar');

const formatearTamano = (bytes) => (bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`);

async function main() {
    if (!almacenamiento.hayBucket()) {
        console.warn('⚠️  R2 sin configurar: el respaldo va a quedar en el disco local.');
        console.warn('   En el servidor eso NO sirve — el disco se borra en cada deploy.\n');
    }

    if (soloListar) {
        const respaldos = await listarRespaldos(entorno);
        if (!respaldos.length) return console.log(`No hay respaldos de ${entorno} todavía.`);
        console.log(`${respaldos.length} respaldo(s) de ${entorno}, del más nuevo al más viejo:\n`);
        for (const r of respaldos) {
            console.log(`  ${new Date(r.fecha).toISOString()}  ${formatearTamano(r.tamano).padStart(8)}  ${r.clave}`);
        }
        return;
    }

    const uri = entorno === 'demo' ? process.env.MONGO_URI_DEMO : process.env.MONGO_URI;
    if (!uri) {
        console.error(`❌ Falta ${entorno === 'demo' ? 'MONGO_URI_DEMO' : 'MONGO_URI'} en el entorno.`);
        process.exit(1);
    }

    const conexion = mongoose.createConnection(uri);
    await conexion.asPromise();
    console.log(`Conectado a ${conexion.db.databaseName} (${entorno}). Respaldando…\n`);

    const r = await crearRespaldo(conexion, entorno);
    for (const [coleccion, cantidad] of Object.entries(r.colecciones)) {
        console.log(`  ${String(cantidad).padStart(7)}  ${coleccion}`);
    }
    console.log(`\n✅ ${r.documentos} documentos → ${r.clave}`);
    console.log(`   ${formatearTamano(r.tamano)} comprimido (desde ${formatearTamano(r.tamanoSinComprimir)})`);
    if (r.podados.length) console.log(`   Se borraron ${r.podados.length} respaldo(s) antiguo(s) por retención.`);

    await conexion.close();
}

main().then(() => process.exit(0)).catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
