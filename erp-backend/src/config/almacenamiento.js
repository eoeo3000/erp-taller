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
const { TALLER_PRINCIPAL, esSlugValido } = require('./talleres');

const CARPETA_LOCAL = path.join(__dirname, '..', '..', 'uploads');

// --- Dónde vive el archivo de cada taller (etapa 5 de docs/multi-taller.md) ---
//
// Antes todos los archivos de todos los clientes iban al mismo nivel del bucket. Mientras
// hubo un solo taller daba igual; con dos deja de dar igual por tres razones concretas:
// el respaldo de un taller no incluye sus archivos, no se puede decir cuánto ocupa cada
// cliente, y dar de baja a uno obliga a mirar archivo por archivo de quién es.
//
// Ahora van a `talleres/<slug>/<archivo>`. La demo es aparte y NO por taller: es una sola
// para todos (§9.2), así que sus archivos —que son de prueba y se borran— no pueden
// mezclarse con los de un cliente real ni contar en su medición.
//
// **La lectura entiende las dos formas.** Hay miles de URL con el formato viejo ya escritas
// en OT.reportes, OT.tareas[].registro.fotos y Solicitud.adjuntos; cambiar la forma sin
// seguir entendiendo la anterior dejaría esas fotos en 404. Mismo criterio que se usó al
// pasar del disco al bucket.
const CARPETA_DEMO = 'demo';
const CARPETA_TALLERES = 'talleres';

// Lo que puede venir en la URL de /uploads: un nombre suelto (el formato viejo) o uno
// precedido de su carpeta. Sin `..` posible, porque el nombre no admite barras.
const NOMBRE_VALIDO = /^[A-Za-z0-9._-]{1,120}$/;
// Se mantiene el nombre de antes porque lo usan las pruebas y archivosRoutes: valida el
// nombre del archivo, que es la parte que puede venir de afuera.
const CLAVE_VALIDA = NOMBRE_VALIDO;

// Dónde guardar lo que sube este taller. Lanza si no le dicen cuál: escribir en la raíz
// compartida "porque no vino el taller" es exactamente el estado que esta etapa viene a
// terminar, y una ruta nueva que se olvide de pasarlo tiene que fallar fuerte y de
// inmediato, no acumular archivos sin dueño durante meses.
function prefijoDeArchivos(ubicacion) {
    const entorno = String(ubicacion?.entorno || 'produccion');
    if (entorno === 'demo') return CARPETA_DEMO;

    const taller = String(ubicacion?.taller || '').trim().toLowerCase();
    if (!esSlugValido(taller)) {
        throw new Error('Falta el taller al guardar un archivo: sin él no se sabría de quién es ni se podría respaldar ni borrar con él.');
    }
    return `${CARPETA_TALLERES}/${taller}`;
}

// Las claves que se pueden pedir por /uploads. Una clave vieja (nombre suelto) puede haber
// sido movida por scripts/migrarArchivosPorTaller.js, así que si no está donde dice la URL
// se busca también dentro del taller principal — que es el único que existía cuando esas
// URL se escribieron. No se adivina ningún otro taller: eso sí sería dejar que la URL
// eligiera de quién son los datos.
function candidatos(clave) {
    const texto = String(clave || '');
    if (NOMBRE_VALIDO.test(texto)) return [texto, `${CARPETA_TALLERES}/${TALLER_PRINCIPAL}/${texto}`];
    return rutaSegura(texto) ? [texto] : [];
}

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

// `ubicacion` es `{ entorno, taller }` — de dónde viene quien sube. En las rutas es
// `{ entorno: req.entorno, taller: req.taller }`, que `middlewares/entorno.js` deja puesto
// en toda request.
async function guardar(buffer, nombreOriginal, ubicacion) {
    const clave = `${prefijoDeArchivos(ubicacion)}/${nombreUnico(nombreOriginal)}`;
    const contentType = tipoPorNombre(clave);

    if (hayBucket()) {
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        await cliente().send(new PutObjectCommand({
            Bucket: config.bucket, Key: clave, Body: buffer, ContentType: contentType,
        }));
    } else {
        // La clave ahora lleva carpeta (`talleres/<slug>/…`), así que hay que crearla: antes
        // bastaba con `uploads/` porque todos los archivos iban al mismo nivel.
        const ruta = path.join(CARPETA_LOCAL, clave);
        await fsp.mkdir(path.dirname(ruta), { recursive: true });
        await fsp.writeFile(ruta, buffer);
    }

    // Ruta relativa, no URL absoluta: es lo que los clientes esperan concatenar.
    return { clave, url: `/uploads/${clave}` };
}

// Devuelve `{ cuerpo, contentType, largo }` o null si no está en ninguna parte. `cuerpo` es
// un stream, así que una foto grande no se carga entera en memoria para servirla.
async function obtener(clave) {
    // Se prueba la clave tal como viene y, si es del formato viejo, también dentro del
    // taller principal: una foto de antes de esta etapa puede estar en cualquiera de los
    // dos lugares según si ya corrió la migración. Bucket primero y disco después, para
    // cada candidata.
    for (const candidata of candidatos(clave)) {
        const encontrado = await obtenerExacta(candidata);
        if (encontrado) return encontrado;
    }
    return null;
}

async function obtenerExacta(clave) {
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

// Cuántos archivos hay bajo un prefijo y cuánto ocupan. Va aparte de `listar` porque no
// arma la lista: un taller con miles de fotos no tiene por qué construir un arreglo de
// miles de objetos para responder "2.413 archivos, 310 MB", que es todo lo que el panel
// necesita.
async function medir(prefijo) {
    if (!rutaSegura(prefijo)) throw new Error(`Prefijo inválido: ${prefijo}`);
    let cantidad = 0;
    let bytes = 0;

    if (hayBucket()) {
        const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
        let continuacion;
        do {
            const r = await cliente().send(new ListObjectsV2Command({
                Bucket: config.bucket, Prefix: `${prefijo}/`, ContinuationToken: continuacion,
            }));
            for (const o of r.Contents || []) { cantidad += 1; bytes += o.Size || 0; }
            continuacion = r.IsTruncated ? r.NextContinuationToken : null;
        } while (continuacion);
        return { cantidad, bytes };
    }

    const carpeta = path.join(CARPETA_LOCAL, prefijo);
    try {
        for (const nombre of await fsp.readdir(carpeta)) {
            const info = await fsp.stat(path.join(carpeta, nombre));
            if (info.isFile()) { cantidad += 1; bytes += info.size; }
        }
    } catch { /* la carpeta no existe todavía: cero archivos, que es la respuesta correcta */ }
    return { cantidad, bytes };
}

// Los archivos que quedaron en la raíz, del formato anterior a esta etapa. Sirve para una
// sola cosa: saber si la migración ya terminó. Mientras devuelva algo distinto de cero, la
// cuenta de archivos de cada taller está incompleta, y el panel lo dice en vez de mostrar
// un número que parece completo y no lo es.
async function listarSueltos() {
    if (hayBucket()) {
        const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
        const sueltos = [];
        let continuacion;
        do {
            // `Delimiter: '/'` hace que el bucket devuelva SOLO las claves del primer nivel
            // y agrupe el resto como prefijos: justo lo que define a un archivo suelto.
            const r = await cliente().send(new ListObjectsV2Command({
                Bucket: config.bucket, Delimiter: '/', ContinuationToken: continuacion,
            }));
            for (const o of r.Contents || []) sueltos.push({ clave: o.Key, tamano: o.Size, fecha: o.LastModified });
            continuacion = r.IsTruncated ? r.NextContinuationToken : null;
        } while (continuacion);
        return sueltos;
    }

    try {
        const sueltos = [];
        for (const nombre of await fsp.readdir(CARPETA_LOCAL)) {
            const info = await fsp.stat(path.join(CARPETA_LOCAL, nombre));
            if (info.isFile()) sueltos.push({ clave: nombre, tamano: info.size, fecha: info.mtime });
        }
        return sueltos;
    } catch {
        return [];
    }
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
    prefijoDeArchivos, candidatos, medir, listarSueltos,
    CLAVE_VALIDA, CARPETA_LOCAL, CARPETA_TALLERES, CARPETA_DEMO,
};
