// Mueve los archivos que están en la raíz del bucket a la carpeta de su taller.
//
//   node scripts/migrarArchivosPorTaller.js            # muestra qué haría, no toca nada
//   node scripts/migrarArchivosPorTaller.js --hacerlo  # lo hace
//   node scripts/migrarArchivosPorTaller.js --hacerlo --taller=otro
//
// Por qué existe: hasta la etapa 5 todos los archivos de todos los clientes iban al mismo
// nivel (`<clave>`). Desde ahora van a `talleres/<slug>/<clave>`. Los que ya estaban siguen
// sirviéndose igual —`config/almacenamiento.js` entiende las dos formas— pero quedan fuera
// de la cuenta de archivos de cada taller, fuera de lo que se le entrega a un cliente que
// se va, y fuera de lo que se borra cuando se va.
//
// **A qué taller van.** Al principal, porque era el único que existía cuando se subieron.
// No hay forma de averiguarlo de otra manera: la clave es una marca de tiempo y un número
// al azar, no dice de quién es. `--taller=` existe para el caso de que el primer cliente se
// haya registrado con otro identificador.
//
// **Las URL de la base NO se tocan.** Siguen diciendo `/uploads/<clave>` y siguen
// funcionando: al no encontrar la clave suelta, el backend la busca dentro del taller
// principal (ver `candidatos` en config/almacenamiento.js). Reescribir miles de URL en
// OT.reportes, OT.tareas[].registro.fotos y Solicitud.adjuntos sería un riesgo enorme para
// cero beneficio.
//
// **Copia, verifica y recién después borra.** Si algo falla en el medio, el archivo sigue
// donde estaba y se puede volver a correr: es idempotente.
require('dotenv').config();
const almacenamiento = require('../src/config/almacenamiento');
const { TALLER_PRINCIPAL } = require('../src/config/talleres');

const argumento = (nombre, porDefecto = null) => {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split('=')[1] : porDefecto;
};

const taller = (argumento('taller', TALLER_PRINCIPAL)).trim().toLowerCase();
const hacerlo = process.argv.includes('--hacerlo');

const formatear = (bytes) => (bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`);

async function main() {
    const sueltos = await almacenamiento.listarSueltos();
    if (!sueltos.length) {
        console.log('No quedan archivos sueltos: todo está separado por taller.');
        return;
    }

    const bytes = sueltos.reduce((a, r) => a + (r.tamano || 0), 0);
    console.log(`${sueltos.length} archivo(s) sueltos, ${formatear(bytes)}, van a "${almacenamiento.CARPETA_TALLERES}/${taller}/".`);

    if (!hacerlo) {
        console.log('\nEsto es un ensayo: no se movió nada. Los primeros:');
        for (const r of sueltos.slice(0, 10)) console.log(`  ${r.clave}  ${formatear(r.tamano || 0)}`);
        if (sueltos.length > 10) console.log(`  … y ${sueltos.length - 10} más.`);
        console.log('\nPara hacerlo de verdad:  node scripts/migrarArchivosPorTaller.js --hacerlo');
        return;
    }

    let movidos = 0;
    let fallados = 0;
    for (const r of sueltos) {
        const destino = `${almacenamiento.CARPETA_TALLERES}/${taller}/${r.clave}`;
        try {
            const contenido = await almacenamiento.leer(r.clave);
            if (!contenido) throw new Error('no se pudo leer');

            await almacenamiento.guardarEn(destino, contenido, almacenamiento.tipoPorNombre(r.clave));

            // Se vuelve a leer del destino antes de borrar el origen. Sin esta comprobación,
            // una escritura que falló en silencio se llevaría el archivo original con ella.
            const copia = await almacenamiento.leer(destino);
            if (!copia || copia.length !== contenido.length) throw new Error('la copia no coincide');

            await almacenamiento.borrar(r.clave);
            movidos += 1;
            if (movidos % 50 === 0) console.log(`  ${movidos}/${sueltos.length}…`);
        } catch (error) {
            fallados += 1;
            console.error(`  ❌ ${r.clave}: ${error.message} (queda donde estaba)`);
        }
    }

    console.log(`\n✅ ${movidos} archivo(s) movidos a "${almacenamiento.CARPETA_TALLERES}/${taller}/".`);
    if (fallados) console.log(`⚠️  ${fallados} quedaron sin mover. Se puede volver a correr: no mueve dos veces lo mismo.`);
    console.log('Las URL de la base no cambian: el backend busca la clave vieja dentro del taller principal.');
}

main().then(() => process.exit(0)).catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
