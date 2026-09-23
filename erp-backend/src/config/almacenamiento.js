// Dónde viven los archivos que la app guarda para siempre: las fotos de evidencia de
// terreno y los adjuntos de las solicitudes.
//
// Hasta ahora iban al disco del contenedor (`uploads/`). En Render eso es un sistema de
// archivos efímero: cada deploy, reinicio o despertar del plan gratis lo deja vacío, y la
// OT se queda con una URL que ya no apunta a nada. La evidencia de terreno desaparecía
// sola, sin aviso.
//
// Acá el disco pasa a ser el plan B y el almacén real es un bucket S3-compatible
// (Cloudflare R2). Dos decisiones que vale la pena dejar escritas:
//
// 1. **Las URL no cambian.** Se sigue guardando `/uploads/<clave>` en la base y el backend
//    sirve esa ruta leyendo del bucket. Los dos clientes arman la URL absoluta con
//    `BACKEND_ORIGIN + data.url` (ver erp-web/src/utils/fotos.js y
//    erp-pwa-operativa/src/api.js), así que devolver una URL de bucket la dejaría rota en
//    toda PWA ya instalada. Además esto deja el bucket **privado**: las fotos son de las
//    instalaciones de los clientes del taller, no material público.
// 2. **Sin credenciales, funciona igual que antes.** Mismo criterio que `API_KEY` y
//    `AUTH_REQUERIDA`: si faltan las variables se usa el disco y se avisa por consola, para
//    que el entorno de desarrollo no necesite cuenta en ningún lado.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const CARPETA_LOCAL = path.join(__dirname, '..', '..', 'uploads');

// Las claves viajan en la URL y terminan en una ruta de disco: sin esto, un `..` en el
// nombre deja leer cualquier archivo del servidor. Sin barras a propósito: los archivos
// públicos viven todos en el mismo nivel.
const CLAVE_VALIDA = /^[A-Za-z0-9._-]{1,120}$/;

// Las claves internas (respaldos) sí llevan prefijo con barras — `respaldos/produccion/...`.
// Nunca vienen de una URL ni de nada que escriba un usuario, pero igual se valida: son las
// mismas funciones que terminan en una ruta de disco.
const RUTA_VALIDA = /^[A-Za-z0-9._/-]{1,200}$/;
function rutaSegura(clave) {
    const texto = String(clave || '');
    return RUTA_VALIDA.test(texto) && !texto.split('/').includes('..');
}

const TIPOS = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
    '.pdf': 'application/pdf', '.gz': 'application/gzip', '.json': 'application/json',
};

const config = {
    cuenta: process.env.R2_ACCOUNT_ID || '',
    clave: process.env.R2_ACCESS_KEY_ID || '',
    secreto: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
    // Opcional. R2 se arma solo desde la cuenta; esto existe para apuntar a otro servicio
    // compatible con S3 (Backblaze B2, MinIO, el propio S3) sin tocar código, y es lo que
    // usa la prueba de test/almacenamientoBucket.test.js. La promesa de no quedar amarrado
    // a un proveedor se sostiene en esta línea.
    endpoint: process.env.R2_ENDPOINT || '',
};

function hayBucket() {
    return !!((config.cuenta || config.endpoint) && config.clave && config.secreto && config.bucket);
}

// El cliente se arma una sola vez y solo si hace falta: requerir el SDK cuesta bastante al
// arranque y en desarrollo normalmente no se usa.
let clienteCache = null;
function cliente() {
    if (!clienteCache) {
        const { S3Client } = require('@aws-sdk/client-s3');
        clienteCache = new S3Client({
            region: 'auto',
            endpoint: config.endpoint || `https://${config.cuenta}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId: config.clave, secretAccessKey: config.secreto },
            // El bucket va en la ruta y no en el subdominio. R2 acepta las dos formas, y
            // así un endpoint propio (una máquina local, otro proveedor) funciona igual —
            // con la otra forma el SDK buscaría el host "mi-bucket.localhost".
            forcePathStyle: true,
        });
    }
    return clienteCache;
}

// Solo para las pruebas: vuelve a leer el entorno. En producción la configuración se lee
// una vez al arrancar y no cambia.
function releerEntorno() {
    config.cuenta = process.env.R2_ACCOUNT_ID || '';
    config.clave = process.env.R2_ACCESS_KEY_ID || '';
    config.secreto = process.env.R2_SECRET_ACCESS_KEY || '';
    config.bucket = process.env.R2_BUCKET || '';
    config.endpoint = process.env.R2_ENDPOINT || '';
    clienteCache = null;
}

function tipoPorNombre(nombre) {
    return TIPOS[path.extname(String(nombre || '')).toLowerCase()] || 'application/octet-stream';
}

// Misma convención que traía middlewares/upload.js: marca de tiempo + sufijo al azar. El
// sufijo no es decorativo — solicitudRoutes usaba solo `Date.now()` y dos adjuntos subidos
// en el mismo milisegundo se pisaban entre sí.
function nombreUnico(nombreOriginal) {
    const extension = path.extname(String(nombreOriginal || '')).toLowerCase().slice(0, 10);
    return `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
}

async function guardar(buffer, nombreOriginal) {
    const clave = nombreUnico(nombreOriginal);
    const contentType = tipoPorNombre(clave);

    if (hayBucket()) {
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        await cliente().send(new PutObjectCommand({
            Bucket: config.bucket, Key: clave, Body: buffer, ContentType: contentType,
        }));
    } else {
        await fsp.mkdir(CARPETA_LOCAL, { recursive: true });
        await fsp.writeFile(path.join(CARPETA_LOCAL, clave), buffer);
    }

    // Ruta relativa, no URL absoluta: es lo que los clientes esperan concatenar.
    return { clave, url: `/uploads/${clave}` };
}

// Devuelve `{ cuerpo, contentType, largo }` o null si no está en ninguna parte. `cuerpo` es
// un stream, así que una foto grande no se carga entera en memoria para servirla.
async function obtener(clave) {
    if (!CLAVE_VALIDA.test(String(clave || ''))) return null;

    if (hayBucket()) {
        try {
            const { GetObjectCommand } = require('@aws-sdk/client-s3');
            const r = await cliente().send(new GetObjectCommand({ Bucket: config.bucket, Key: clave }));
            return { cuerpo: r.Body, contentType: r.ContentType || tipoPorNombre(clave), largo: r.ContentLength };
        } catch (error) {
            // Un archivo que no está en el bucket puede seguir en el disco: es exactamente
            // la situación mientras se migra lo viejo, y también si alguien sube algo con
            // las credenciales apagadas. Cualquier otro error sí se avisa.
            if (error?.name !== 'NoSuchKey' && error?.$metadata?.httpStatusCode !== 404) {
                console.warn('[almacenamiento] error leyendo del bucket:', error.message);
            }
        }
    }

    const ruta = path.join(CARPETA_LOCAL, clave);
    try {
        const info = await fsp.stat(ruta);
        if (!info.isFile()) return null;
        return { cuerpo: fs.createReadStream(ruta), contentType: tipoPorNombre(clave), largo: info.size };
    } catch {
        return null;
    }
}

// --- Operaciones con clave explícita ---
// `guardar()` inventa el nombre porque para una foto da lo mismo cuál sea. Los respaldos
// necesitan controlarlo: la fecha va en la clave, y es lo que permite listarlos ordenados y
// saber cuál borrar. Mismo almacén, mismo interruptor de credenciales.

async function guardarEn(clave, buffer, contentType) {
    if (!rutaSegura(clave)) throw new Error(`Clave de almacenamiento inválida: ${clave}`);
    const tipo = contentType || tipoPorNombre(clave);

    if (hayBucket()) {
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        await cliente().send(new PutObjectCommand({
            Bucket: config.bucket, Key: clave, Body: buffer, ContentType: tipo,
        }));
    } else {
        const ruta = path.join(CARPETA_LOCAL, clave);
        await fsp.mkdir(path.dirname(ruta), { recursive: true });
        await fsp.writeFile(ruta, buffer);
    }
    return { clave, tamano: buffer.length };
}

// Devuelve el contenido completo en memoria, no un stream: quien llama a esto necesita el
// archivo entero para descomprimirlo, no para reenviarlo por la red.
async function leer(clave) {
    if (!rutaSegura(clave)) return null;

    if (hayBucket()) {
        try {
            const { GetObjectCommand } = require('@aws-sdk/client-s3');
            const r = await cliente().send(new GetObjectCommand({ Bucket: config.bucket, Key: clave }));
            const partes = [];
            for await (const parte of r.Body) partes.push(parte);
            return Buffer.concat(partes);
        } catch (error) {
            if (error?.name !== 'NoSuchKey' && error?.$metadata?.httpStatusCode !== 404) throw error;
        }
    }

    try {
        return await fsp.readFile(path.join(CARPETA_LOCAL, clave));
    } catch {
        return null;
    }
}

// Devuelve [{ clave, tamano, fecha }] ordenado de más nuevo a más viejo.
async function listar(prefijo) {
    if (!rutaSegura(prefijo)) throw new Error(`Prefijo inválido: ${prefijo}`);

    if (hayBucket()) {
        const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
        const encontrados = [];
        let continuacion;
        // Un listado devuelve como máximo 1000 claves por llamada; con retención de 30
        // respaldos nunca se llega, pero paginar cuesta tres líneas y evita que un día
        // alguien vea media lista sin entender por qué.
        do {
            const r = await cliente().send(new ListObjectsV2Command({
                Bucket: config.bucket, Prefix: prefijo, ContinuationToken: continuacion,
            }));
            for (const o of r.Contents || []) {
                encontrados.push({ clave: o.Key, tamano: o.Size, fecha: o.LastModified });
            }
            continuacion = r.IsTruncated ? r.NextContinuationToken : null;
        } while (continuacion);
        return encontrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    }

    const carpeta = path.join(CARPETA_LOCAL, prefijo);
    try {
        const nombres = await fsp.readdir(carpeta);
        const encontrados = [];
        for (const nombre of nombres) {
            const info = await fsp.stat(path.join(carpeta, nombre));
            if (info.isFile()) encontrados.push({ clave: `${prefijo}/${nombre}`, tamano: info.size, fecha: info.mtime });
        }
        return encontrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    } catch {
        return [];
    }
}

async function borrar(clave) {
    if (!rutaSegura(clave)) throw new Error(`Clave de almacenamiento inválida: ${clave}`);

    if (hayBucket()) {
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        await cliente().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: clave }));
        return;
    }
    await fsp.rm(path.join(CARPETA_LOCAL, clave), { force: true });
}

function avisarConfiguracion() {
    if (hayBucket()) {
        console.log(`📦 Archivos en bucket R2 "${config.bucket}" (el disco queda de respaldo de lectura)`);
    } else {
        console.warn(
            '⚠️  R2 sin configurar: los archivos van al disco del contenedor.\n'
            + '   En Render ese disco se borra en cada deploy y las fotos de terreno se pierden.\n'
            + '   Define R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET.',
        );
    }
}

module.exports = {
    guardar, obtener, nombreUnico, tipoPorNombre, hayBucket, avisarConfiguracion, releerEntorno,
    guardarEn, leer, listar, borrar, rutaSegura,
    CLAVE_VALIDA, CARPETA_LOCAL,
};
