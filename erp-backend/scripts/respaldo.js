// Respaldo manual de la base. Ver src/servicios/respaldo.js para el formato y el porqué.
//
//   node scripts/respaldo.js                   # respalda TODOS los talleres activos
//   node scripts/respaldo.js --taller=rivas    # solo ese
//   node scripts/respaldo.js --entorno=demo
//   node scripts/respaldo.js --listar          # no respalda: muestra lo que hay guardado
//
// Desde la etapa 5 hay un respaldo por taller. La conexión de cada uno sale del registro
// (scripts/_conexion.js) y no de MONGO_URI: así la base de la que se lee y el taller con el
// que se guarda son siempre el mismo, que es lo único que impide guardar los datos de un
// cliente bajo el nombre de otro.
//
// El respaldo automático diario lo dispara .github/workflows/respaldo.yml contra
// POST /api/respaldos. Este script es para hacer uno a mano antes de tocar algo delicado —
// que es, justamente, cuando más se agradece.
require('dotenv').config();
const { crearRespaldo, listarRespaldos, talleresConRespaldo } = require('../src/servicios/respaldo');
const { conexionDeTaller, listarTalleres } = require('./_conexion');
const almacenamiento = require('../src/config/almacenamiento');

const argumento = (nombre, porDefecto) => {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split('=')[1] : porDefecto;
};

const entorno = argumento('entorno', 'produccion') === 'demo' ? 'demo' : 'produccion';
const tallerPedido = argumento('taller', null);
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
        // Listar NO abre ninguna base: lo que hay guardado se lee del almacén, y ese es
        // justo el dato que se busca cuando Mongo no está respondiendo.
        const talleres = tallerPedido ? [tallerPedido] : await talleresConRespaldo(entorno);
        if (!talleres.length) console.log(`No hay respaldos de ${entorno} todavía.`);
        for (const taller of talleres) {
            const respaldos = await listarRespaldos(entorno, taller);
            console.log(`\n${taller} (${entorno}): ${respaldos.length} respaldo(s)`);
            for (const r of respaldos) {
                console.log(`  ${new Date(r.fecha).toISOString()}  ${formatearTamano(r.tamano).padStart(8)}  ${r.clave}`);
            }
            if (!respaldos.length) console.log('  (ninguno todavía)');
        }
        return;
    }

    // Uno a uno, y un taller que falla no corta a los demás: si la base de un cliente está
    // caída, los otros igual tienen que quedar respaldados. Al final se sale con error para
    // que no parezca que salió todo bien.
    let huboError = false;
    for (const taller of (tallerPedido ? [tallerPedido] : await listarTalleres())) {
        try {
            const conexion = await conexionDeTaller(entorno, taller);
            console.log(`\n${taller} → ${conexion.db.databaseName} (${entorno}). Respaldando…`);
            const r = await crearRespaldo(conexion, entorno, taller);
            for (const [coleccion, cantidad] of Object.entries(r.colecciones)) {
                console.log(`  ${String(cantidad).padStart(7)}  ${coleccion}`);
            }
            console.log(`  ✅ ${r.documentos} documentos → ${r.clave}`);
            console.log(`     ${formatearTamano(r.tamano)} comprimido (desde ${formatearTamano(r.tamanoSinComprimir)})`);
            if (r.podados.length) console.log(`     Se borraron ${r.podados.length} respaldo(s) antiguo(s) por retención.`);
        } catch (error) {
            huboError = true;
            console.error(`  ❌ ${taller}: ${error.message}`);
        }
    }
    if (huboError) process.exit(1);
}

main().then(() => process.exit(0)).catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
