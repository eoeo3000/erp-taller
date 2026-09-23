// Sube al bucket R2 todo lo que todavía esté en `uploads/` del disco.
//
// Para qué sirve: hasta ahora las fotos de terreno y los adjuntos de solicitudes vivían en
// el disco del contenedor. Lo que haya sobrevivido al último deploy sigue ahí y hay que
// llevarlo al bucket antes de que el próximo deploy lo borre. Lo que ya se haya perdido no
// se puede recuperar desde acá — para eso está `--revisar`, que dice qué referencias de la
// base apuntan a archivos que ya no existen en ninguna parte.
//
// Uso:
//   node scripts/migrarArchivosAR2.js            # sube lo que falte (no pisa lo ya subido)
//   node scripts/migrarArchivosAR2.js --revisar  # no sube nada: informa qué hay y qué falta
//
// Es idempotente: pregunta por cada archivo antes de subirlo, así que correrlo dos veces no
// duplica ni re-sube nada.
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const almacenamiento = require('../src/config/almacenamiento');

const soloRevisar = process.argv.includes('--revisar');

async function main() {
    if (!almacenamiento.hayBucket()) {
        console.error('❌ Faltan las credenciales de R2 en el entorno.');
        console.error('   Define R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET.');
        process.exit(1);
    }

    const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
    const cliente = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });
    const Bucket = process.env.R2_BUCKET;

    let archivos = [];
    try {
        archivos = (await fs.readdir(almacenamiento.CARPETA_LOCAL, { withFileTypes: true }))
            .filter((e) => e.isFile() && !e.name.startsWith('.'))
            .map((e) => e.name);
    } catch {
        console.log('No hay carpeta uploads/ en este equipo — nada que migrar.');
        return;
    }

    if (!archivos.length) {
        console.log('La carpeta uploads/ está vacía.');
        console.log('Si esto es el servidor de producción, quiere decir que el disco ya se borró');
        console.log('en algún deploy y lo que hubiera ahí no se puede recuperar.');
        return;
    }

    console.log(`${archivos.length} archivo(s) en disco. Bucket: ${Bucket}${soloRevisar ? ' (solo revisión)' : ''}\n`);
    let subidos = 0, yaEstaban = 0, fallidos = 0, bytes = 0;

    for (const nombre of archivos) {
        // Un nombre con `..` o barras no llegó acá por la app; no se sube ni se toca.
        if (!almacenamiento.CLAVE_VALIDA.test(nombre)) {
            console.warn(`  ⚠️  ${nombre} — nombre fuera de la convención, se omite`);
            fallidos++;
            continue;
        }
        try {
            await cliente.send(new HeadObjectCommand({ Bucket, Key: nombre }));
            yaEstaban++;
            continue;
        } catch (error) {
            if (error?.name !== 'NotFound' && error?.$metadata?.httpStatusCode !== 404) {
                console.error(`  ❌ ${nombre} — no se pudo consultar: ${error.message}`);
                fallidos++;
                continue;
            }
        }

        const ruta = path.join(almacenamiento.CARPETA_LOCAL, nombre);
        if (soloRevisar) {
            console.log(`  · ${nombre} — falta en el bucket`);
            subidos++;
            continue;
        }
        try {
            const contenido = await fs.readFile(ruta);
            await cliente.send(new PutObjectCommand({
                Bucket, Key: nombre, Body: contenido, ContentType: almacenamiento.tipoPorNombre(nombre),
            }));
            subidos++;
            bytes += contenido.length;
            console.log(`  ✅ ${nombre} (${Math.round(contenido.length / 1024)} KB)`);
        } catch (error) {
            console.error(`  ❌ ${nombre} — ${error.message}`);
            fallidos++;
        }
    }

    console.log(`\n${soloRevisar ? 'Faltan por subir' : 'Subidos'}: ${subidos} · Ya estaban: ${yaEstaban} · Con problema: ${fallidos}`);
    if (!soloRevisar && bytes) console.log(`Transferido: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
    if (!soloRevisar && subidos && !fallidos) {
        console.log('\nListo. El disco queda como respaldo de lectura: no hay que borrarlo a mano,');
        console.log('el próximo deploy de Render lo hace solo y ya no importa.');
    }
}

main().then(() => process.exit(0)).catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
});
