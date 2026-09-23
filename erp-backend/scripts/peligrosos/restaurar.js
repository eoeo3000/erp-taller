// Restaura un respaldo sobre la base de datos. DESTRUCTIVO: reemplaza el contenido de cada
// colección que venga en el archivo.
//
//   node scripts/peligrosos/restaurar.js --listar
//   node scripts/peligrosos/restaurar.js --clave=respaldos/produccion/2026-09-23T14-05-09.json.gz
//   node scripts/peligrosos/restaurar.js --ultimo
//   ... --entorno=demo     restaura sobre la base de demostración (y lee los respaldos de esa)
//
// Está en scripts/peligrosos/ y pide escribir el nombre de la base, igual que el resto de
// esta carpeta. Un respaldo que nunca se probó a restaurar no es un respaldo: vale la pena
// correr esto contra la demo alguna vez, antes de necesitarlo de verdad.
//
// **Toda etapa tiene vuelta atrás** (docs/principio-vuelta-atras.md) también acá: antes de
// pisar nada se guarda un respaldo del estado actual. Si la restauración resulta ser un
// error —el archivo equivocado, la base equivocada— ese respaldo previo es el camino de
// regreso. Se puede saltar con --sin-respaldo-previo, pero hay que pedirlo a propósito.
require('dotenv').config();
const mongoose = require('mongoose');
const { confirmarDestructivo } = require('./_confirmar');
const { listarRespaldos, leerRespaldo, restaurar, crearRespaldo } = require('../../src/servicios/respaldo');
const almacenamiento = require('../../src/config/almacenamiento');

const argumento = (nombre) => {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split('=')[1] : null;
};

const entorno = argumento('entorno') === 'demo' ? 'demo' : 'produccion';
const uri = entorno === 'demo' ? process.env.MONGO_URI_DEMO : process.env.MONGO_URI;

const formatearTamano = (bytes) => (bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`);

async function main() {
    if (!almacenamiento.hayBucket()) {
        console.warn('⚠️  R2 sin configurar: se van a buscar los respaldos en el disco local.\n');
    }

    const disponibles = await listarRespaldos(entorno);

    if (process.argv.includes('--listar') || (!argumento('clave') && !process.argv.includes('--ultimo'))) {
        if (!disponibles.length) {
            console.log(`No hay respaldos de ${entorno}. Crea uno con: node scripts/respaldo.js`);
            return;
        }
        console.log(`Respaldos de ${entorno}, del más nuevo al más viejo:\n`);
        for (const r of disponibles) {
            console.log(`  ${new Date(r.fecha).toISOString()}  ${formatearTamano(r.tamano).padStart(8)}  ${r.clave}`);
        }
        console.log('\nPara restaurar uno:');
        console.log(`  node scripts/peligrosos/restaurar.js --clave=${disponibles[0].clave}`);
        console.log('  node scripts/peligrosos/restaurar.js --ultimo    (el más reciente)');
        return;
    }

    // Recién acá se exige la conexión: listar respaldos no necesita tocar la base, y pedir
    // MONGO_URI para eso obligaría a configurar el entorno solo para mirar qué hay guardado.
    if (!uri) {
        console.error(`❌ Falta ${entorno === 'demo' ? 'MONGO_URI_DEMO' : 'MONGO_URI'} en el entorno.`);
        process.exit(1);
    }

    const clave = argumento('clave') || disponibles[0]?.clave;
    if (!clave) {
        console.error(`❌ No hay ningún respaldo de ${entorno} para restaurar.`);
        process.exit(1);
    }

    console.log(`Leyendo ${clave}…`);
    const contenido = await leerRespaldo(clave);
    if (!contenido) {
        console.error(`❌ No se encontró el respaldo ${clave}.`);
        process.exit(1);
    }

    const conteos = Object.entries(contenido.colecciones).map(([n, d]) => [n, d.length]);
    const total = conteos.reduce((a, [, n]) => a + n, 0);

    console.log(`\nRespaldo del ${contenido.fecha}, tomado de la base "${contenido.base}":`);
    for (const [nombre, cantidad] of conteos) console.log(`  ${String(cantidad).padStart(7)}  ${nombre}`);
    console.log(`  ${String(total).padStart(7)}  TOTAL\n`);

    // El respaldo se tomó de una base y se puede estar restaurando sobre otra. No es
    // necesariamente un error (restaurar producción sobre la demo para probar es
    // legítimo), pero tiene que verse antes de confirmar, no descubrirse después.
    const conexion = mongoose.createConnection(uri);
    await conexion.asPromise();
    if (conexion.db.databaseName !== contenido.base) {
        console.log(`⚠️  OJO: el respaldo viene de "${contenido.base}" y vas a restaurarlo sobre "${conexion.db.databaseName}".\n`);
    }

    await confirmarDestructivo(
        `Vacía y vuelve a llenar ${conteos.length} colección(es) de "${conexion.db.databaseName}" con el contenido de ${clave}.`,
        uri,
    );

    if (!process.argv.includes('--sin-respaldo-previo')) {
        console.log('Guardando un respaldo del estado actual, por si esto hay que deshacerlo…');
        const previo = await crearRespaldo(conexion, entorno);
        console.log(`  ✅ Estado anterior guardado en ${previo.clave}\n`);
    }

    console.log('Restaurando…');
    const resultado = await restaurar(conexion, contenido);
    for (const [nombre, cantidad] of Object.entries(resultado)) {
        const esperado = contenido.colecciones[nombre].length;
        const marca = cantidad === esperado ? '✅' : '⚠️ ';
        console.log(`  ${marca} ${String(cantidad).padStart(7)}  ${nombre}${cantidad === esperado ? '' : ` (se esperaban ${esperado})`}`);
    }

    const restaurados = Object.values(resultado).reduce((a, b) => a + b, 0);
    console.log(restaurados === total
        ? `\n✅ Restauración completa: ${restaurados} documentos.`
        : `\n⚠️  Se restauraron ${restaurados} de ${total} documentos — revisa las líneas marcadas arriba.`);

    await conexion.close();
}

main().then(() => process.exit(0)).catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
