// Restaura un respaldo sobre la base de datos. DESTRUCTIVO: reemplaza el contenido de cada
// colección que venga en el archivo.
//
//   node scripts/peligrosos/restaurar.js --listar
//   node scripts/peligrosos/restaurar.js --clave=respaldos/produccion/principal/2026-09-23T14-05-09.json.gz
//   node scripts/peligrosos/restaurar.js --ultimo --taller=rivas
//   ... --entorno=demo     restaura sobre la base de demostración (y lee los respaldos de esa)
//
// Desde la etapa 5 hay un respaldo por taller, así que hay que decir SOBRE CUÁL se restaura
// (`--taller=`, por omisión el principal). La conexión sale del registro y no del `.env`:
// restaurar el respaldo de un cliente sobre la base de otro es la peor cosa que este script
// podría hacer, y la única forma de impedirlo es que el taller elija la base. Además, si el
// archivo dice venir de otro taller, hay que escribirlo para confirmar.
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
const { confirmarDestructivo } = require('./_confirmar');
const { listarRespaldos, leerRespaldo, restaurar, crearRespaldo, talleresConRespaldo } = require('../../src/servicios/respaldo');
const { conexionDeTaller } = require('../_conexion');
const { TALLER_PRINCIPAL } = require('../../src/config/talleres');
const almacenamiento = require('../../src/config/almacenamiento');

const argumento = (nombre) => {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split('=')[1] : null;
};

const entorno = argumento('entorno') === 'demo' ? 'demo' : 'produccion';
const taller = (argumento('taller') || TALLER_PRINCIPAL).trim().toLowerCase();

const formatearTamano = (bytes) => (bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`);

async function main() {
    if (!almacenamiento.hayBucket()) {
        console.warn('⚠️  R2 sin configurar: se van a buscar los respaldos en el disco local.\n');
    }

    const disponibles = await listarRespaldos(entorno, taller);

    if (process.argv.includes('--listar') || (!argumento('clave') && !process.argv.includes('--ultimo'))) {
        if (!disponibles.length) {
            console.log(`No hay respaldos de ${taller} (${entorno}). Crea uno con: node scripts/respaldo.js --taller=${taller}`);
            const otros = (await talleresConRespaldo(entorno)).filter((t) => t !== taller);
            if (otros.length) console.log(`\nTalleres que sí tienen respaldos: ${otros.join(', ')}`);
            return;
        }
        console.log(`Respaldos de ${taller} (${entorno}), del más nuevo al más viejo:\n`);
        for (const r of disponibles) {
            console.log(`  ${new Date(r.fecha).toISOString()}  ${formatearTamano(r.tamano).padStart(8)}  ${r.clave}`);
        }
        console.log('\nPara restaurar uno:');
        console.log(`  node scripts/peligrosos/restaurar.js --taller=${taller} --clave=${disponibles[0].clave}`);
        console.log(`  node scripts/peligrosos/restaurar.js --taller=${taller} --ultimo    (el más reciente)`);
        return;
    }

    const clave = argumento('clave') || disponibles[0]?.clave;
    if (!clave) {
        console.error(`❌ No hay ningún respaldo de ${taller} (${entorno}) para restaurar.`);
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
    //
    // La conexión sale del REGISTRO a partir de `--taller`, no del `.env`: así "el taller
    // que dije" y "la base que se va a pisar" no pueden ser dos cosas distintas.
    const conexion = await conexionDeTaller(entorno, taller);
    if (conexion.db.databaseName !== contenido.base) {
        console.log(`⚠️  OJO: el respaldo viene de "${contenido.base}" y vas a restaurarlo sobre "${conexion.db.databaseName}".\n`);
    }
    // Los respaldos de antes de la etapa 5 no traen taller; eran del principal.
    const tallerDelArchivo = contenido.taller || TALLER_PRINCIPAL;
    if (tallerDelArchivo !== taller) {
        console.log(`🚨 ESTE RESPALDO ES DE OTRO CLIENTE: salió de "${tallerDelArchivo}" y lo vas a restaurar sobre "${taller}".`);
        console.log('   Eso le mete a un taller los datos de otro. Si no es exactamente lo que querés, cancela.\n');
    }

    await confirmarDestructivo(
        `Vacía y vuelve a llenar ${conteos.length} colección(es) de "${conexion.db.databaseName}" (taller ${taller}) con el contenido de ${clave}.`,
        null,
        conexion.db.databaseName,
    );

    if (!process.argv.includes('--sin-respaldo-previo')) {
        console.log('Guardando un respaldo del estado actual, por si esto hay que deshacerlo…');
        const previo = await crearRespaldo(conexion, entorno, taller);
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
