// Respaldo y restauración de la base de datos.
//
// Por qué existe: Mongo Atlas en plan gratis (M0) no trae respaldo automático, y en
// scripts/peligrosos/ hay borrado masivo. Hoy un error —o un `.env` apuntando al ambiente
// equivocado— no tiene vuelta atrás. Esto es la otra mitad del problema que resolvió
// config/almacenamiento.js con las fotos: ahí se perdían archivos, acá se perderían datos.
//
// Tres decisiones que vale la pena dejar escritas:
//
// 1. **EJSON, no JSON.** `JSON.stringify` de un documento de Mongo convierte un ObjectId en
//    `{}` y una fecha en un string. El respaldo se vería perfecto y la restauración metería
//    basura: referencias rotas entre OT y Solicitud, fechas que dejan de ser fechas. EJSON
//    (de `bson`, que ya viene con mongoose) conserva los tipos y vuelve a leerlos iguales.
//    Es el punto donde un respaldo falla en silencio, así que está cubierto por pruebas.
// 2. **Un archivo por respaldo, comprimido.** Se lee cada colección completa y se guarda
//    todo junto. A la escala de un taller son unos pocos MB; cuando deje de serlo habrá que
//    cambiar a exportar por colección y en streaming, y este comentario será el aviso.
// 3. **Va al mismo bucket R2 de las fotos**, bajo `respaldos/<entorno>/`. Sin credenciales
//    cae al disco igual que todo lo demás — útil para probar en local, inútil en Render,
//    donde el disco se borra en cada deploy (por eso mismo existe el bucket).
const zlib = require('zlib');
const { promisify } = require('util');
const { EJSON } = require('bson');
const almacenamiento = require('../config/almacenamiento');

const comprimir = promisify(zlib.gzip);
const descomprimir = promisify(zlib.gunzip);

const VERSION_FORMATO = 1;
// Cuántos respaldos se conservan por entorno. Con uno diario, un mes de historia: alcanza
// para notar un borrado que pasó desapercibido durante semanas sin que el bucket crezca
// sin control.
const MAXIMO_RESPALDOS = 30;

// Colecciones que no tiene sentido respaldar: se regeneran solas y solo agregan peso.
// Las sesiones abiertas no sobreviven a una restauración de todos modos.
const COLECCIONES_OMITIDAS = new Set(['sesionstaffs', 'sesionportals']);

function prefijoDe(entorno) {
    return `respaldos/${entorno === 'demo' ? 'demo' : 'produccion'}`;
}

// 2026-09-23T14:05:09.123Z → 2026-09-23T14-05-09. La clave se ordena alfabéticamente igual
// que cronológicamente, que es lo que hace que listar y podar sean triviales.
function claveDeRespaldo(entorno, fecha = new Date()) {
    const marca = fecha.toISOString().replace(/:/g, '-').replace(/\..+$/, '');
    return `${prefijoDe(entorno)}/${marca}.json.gz`;
}

// Arma el contenido del respaldo leyendo todas las colecciones de la conexión.
async function armarContenido(conexion, entorno) {
    const db = conexion.db;
    const colecciones = (await db.listCollections().toArray())
        .filter((c) => c.type !== 'view' && !COLECCIONES_OMITIDAS.has(c.name.toLowerCase()))
        .map((c) => c.name)
        .sort();

    const datos = {};
    const resumen = {};
    for (const nombre of colecciones) {
        const documentos = await db.collection(nombre).find({}).toArray();
        datos[nombre] = documentos;
        resumen[nombre] = documentos.length;
    }

    return {
        contenido: {
            version: VERSION_FORMATO,
            entorno,
            base: db.databaseName,
            fecha: new Date().toISOString(),
            colecciones: datos,
        },
        resumen,
    };
}

// Crea un respaldo y lo sube. Devuelve qué se guardó, para que tanto el script como el
// endpoint puedan informarlo sin repetir lógica.
async function crearRespaldo(conexion, entorno) {
    const { contenido, resumen } = await armarContenido(conexion, entorno);
    const crudo = Buffer.from(EJSON.stringify(contenido, { relaxed: false }), 'utf8');
    const comprimido = await comprimir(crudo, { level: zlib.constants.Z_BEST_COMPRESSION });

    const clave = claveDeRespaldo(entorno);
    await almacenamiento.guardarEn(clave, comprimido, 'application/gzip');

    const podados = await podarAntiguos(entorno);

    return {
        clave,
        base: contenido.base,
        fecha: contenido.fecha,
        documentos: Object.values(resumen).reduce((a, b) => a + b, 0),
        colecciones: resumen,
        tamano: comprimido.length,
        tamanoSinComprimir: crudo.length,
        podados,
    };
}

// Borra los respaldos que exceden MAXIMO_RESPALDOS, del más viejo hacia atrás.
async function podarAntiguos(entorno) {
    const existentes = await almacenamiento.listar(prefijoDe(entorno));
    const sobrantes = existentes.slice(MAXIMO_RESPALDOS);
    for (const r of sobrantes) await almacenamiento.borrar(r.clave);
    return sobrantes.map((r) => r.clave);
}

async function listarRespaldos(entorno) {
    return almacenamiento.listar(prefijoDe(entorno));
}

// Lee un respaldo y devuelve su contenido ya descomprimido y con los tipos de Mongo
// reconstruidos. Se valida la versión: un archivo de un formato futuro se rechaza en vez de
// restaurarse a medias.
async function leerRespaldo(clave) {
    const comprimido = await almacenamiento.leer(clave);
    if (!comprimido) return null;

    const crudo = await descomprimir(comprimido);
    const contenido = EJSON.parse(crudo.toString('utf8'), { relaxed: false });

    // `Number(...)` y no comparación directa: en modo canónico EJSON guarda los enteros
    // como {"$numberInt":"1"} y al leerlos devuelve un Int32 de BSON, no un número de
    // JavaScript — así que `version !== 1` daba verdadero comparando 1 con 1, y todo
    // respaldo válido se rechazaba. Es el mismo fenómeno que estas pruebas vigilan para los
    // datos (ObjectId, fechas, Decimal128); acá mordió en los metadatos.
    if (Number(contenido?.version) !== VERSION_FORMATO) {
        throw new Error(`Respaldo en formato versión ${contenido?.version}, este código entiende la ${VERSION_FORMATO}`);
    }
    return contenido;
}

// Restaura un respaldo sobre una conexión. DESTRUCTIVO: reemplaza el contenido de cada
// colección que venga en el archivo.
//
// Se vacía e inserta colección por colección en vez de borrar la base entera: una colección
// que exista hoy y no esté en el respaldo se deja intacta. Restaurar no debería borrar algo
// que el respaldo nunca supo que existía — quien restaura quiere recuperar lo que perdió, no
// volver el mundo entero atrás.
async function restaurar(conexion, contenido) {
    const db = conexion.db;
    const resultado = {};

    for (const [nombre, documentos] of Object.entries(contenido.colecciones || {})) {
        await db.collection(nombre).deleteMany({});
        if (documentos.length) {
            // ordered: false — un documento con problema no debe abortar los 3.000 que
            // vienen detrás; al final se informa cuántos entraron de verdad.
            await db.collection(nombre).insertMany(documentos, { ordered: false });
        }
        resultado[nombre] = await db.collection(nombre).countDocuments();
    }
    return resultado;
}

module.exports = {
    crearRespaldo, listarRespaldos, leerRespaldo, restaurar, podarAntiguos,
    claveDeRespaldo, prefijoDe, armarContenido,
    VERSION_FORMATO, MAXIMO_RESPALDOS, COLECCIONES_OMITIDAS,
};
