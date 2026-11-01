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
// 3. **Va al mismo bucket R2 de las fotos**, bajo `respaldos/<entorno>/<taller>/`. Sin
//    credenciales cae al disco igual que todo lo demás — útil para probar en local, inútil
//    en Render, donde el disco se borra en cada deploy (por eso mismo existe el bucket).
// 4. **Un respaldo por taller** (etapa 5). Cada cliente tiene su base, así que tiene su
//    respaldo y su propia retención: treinta del taller A no pueden empujar fuera los del
//    taller B, que es exactamente lo que pasaría con una sola lista compartida. La demo
//    queda sin dividir porque es una sola para todos (§9.2).
const zlib = require('zlib');
const { promisify } = require('util');
const { EJSON } = require('bson');
const almacenamiento = require('../config/almacenamiento');
const { TALLER_PRINCIPAL, esSlugValido } = require('../config/talleres');

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

// Los respaldos de antes de la etapa 5 están en `respaldos/produccion/<fecha>.json.gz`, sin
// taller. Eran del único taller que existía, el principal.
function prefijoHeredado(entorno) {
    return `respaldos/${entorno === 'demo' ? 'demo' : 'produccion'}`;
}

function prefijoDe(entorno, taller = TALLER_PRINCIPAL) {
    // La demo no se divide por taller: es una sola para todos los clientes (§9.2), así que
    // dividir su respaldo sería guardar la misma base varias veces.
    if (entorno === 'demo') return 'respaldos/demo';
    const limpio = String(taller || '').trim().toLowerCase();
    if (!esSlugValido(limpio)) throw new Error(`Taller inválido para el respaldo: ${taller}`);
    return `respaldos/produccion/${limpio}`;
}

// 2026-09-23T14:05:09.123Z → 2026-09-23T14-05-09. La clave se ordena alfabéticamente igual
// que cronológicamente, que es lo que hace que listar y podar sean triviales.
function claveDeRespaldo(entorno, taller = TALLER_PRINCIPAL, fecha = new Date()) {
    const marca = fecha.toISOString().replace(/:/g, '-').replace(/\..+$/, '');
    return `${prefijoDe(entorno, taller)}/${marca}.json.gz`;
}

// Arma el contenido del respaldo leyendo todas las colecciones de la conexión.
async function armarContenido(conexion, entorno, taller = TALLER_PRINCIPAL) {
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
            // De quién es. Un respaldo que no dice de qué taller salió se puede restaurar
            // sobre la base equivocada sin que nada avise, y eso es pisarle los datos a un
            // cliente con los de otro. Los respaldos anteriores a la etapa 5 no traen este
            // campo y se entienden del taller principal, que era el único que había.
            taller,
            base: db.databaseName,
            fecha: new Date().toISOString(),
            colecciones: datos,
        },
        resumen,
    };
}

// Crea un respaldo y lo sube. Devuelve qué se guardó, para que tanto el script como el
// endpoint puedan informarlo sin repetir lógica.
async function crearRespaldo(conexion, entorno, taller = TALLER_PRINCIPAL) {
    const { contenido, resumen } = await armarContenido(conexion, entorno, taller);
    const crudo = Buffer.from(EJSON.stringify(contenido, { relaxed: false }), 'utf8');
    const comprimido = await comprimir(crudo, { level: zlib.constants.Z_BEST_COMPRESSION });

    const clave = claveDeRespaldo(entorno, taller);
    await almacenamiento.guardarEn(clave, comprimido, 'application/gzip');

    const podados = await podarAntiguos(entorno, taller);

    return {
        clave,
        taller,
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
async function podarAntiguos(entorno, taller = TALLER_PRINCIPAL) {
    const existentes = await listarRespaldos(entorno, taller);
    const sobrantes = existentes.slice(MAXIMO_RESPALDOS);
    for (const r of sobrantes) await almacenamiento.borrar(r.clave);
    return sobrantes.map((r) => r.clave);
}

// Los respaldos de un taller, del más nuevo al más viejo.
//
// Al principal se le suman los HEREDADOS: los que se hicieron antes de la etapa 5, cuando
// las claves no llevaban taller. Si no se contaran, quedarían fuera de la retención y se
// envejecerían en el bucket para siempre — nadie los borraría nunca. Contándolos, la poda
// se los lleva sola: son los más viejos de la lista, así que salen primero.
async function listarRespaldos(entorno, taller = TALLER_PRINCIPAL) {
    const propios = await almacenamiento.listar(prefijoDe(entorno, taller));
    if (entorno === 'demo' || taller !== TALLER_PRINCIPAL) return propios;

    const raiz = prefijoHeredado(entorno);
    // Del listado de la carpeta padre solo sirven las claves de PRIMER nivel: las que
    // tienen otra barra después son las de los talleres, incluidas las de este mismo, y
    // contarlas dos veces haría que la poda borrara el doble de lo que debe.
    const heredados = (await almacenamiento.listar(raiz))
        .filter((r) => !String(r.clave).slice(raiz.length + 1).includes('/'));

    return [...propios, ...heredados].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

// Lee un respaldo y devuelve su contenido ya descomprimido y con los tipos de Mongo
// reconstruidos. Se valida la versión: un archivo de un formato futuro se rechaza en vez de
// restaurarse a medias.
// Qué talleres tienen respaldos guardados, mirando SOLO el almacén.
//
// No pregunta por el registro ni abre ninguna base a propósito: listar lo que hay guardado
// no tiene por qué necesitar que Mongo esté arriba. Es justamente el momento en que suele
// no estarlo —algo se rompió y se está buscando desde cuándo hay copia—, y además así
// aparecen los respaldos de un taller que ya se dio de baja, que es cuando más importa
// saber que todavía están.
async function talleresConRespaldo(entorno = 'produccion') {
    if (entorno === 'demo') return ['demo'];
    const raiz = prefijoHeredado('produccion');
    const todos = await almacenamiento.listar(raiz);
    const talleres = new Set();
    for (const r of todos) {
        const resto = String(r.clave).slice(raiz.length + 1);
        const barra = resto.indexOf('/');
        // Sin barra es un respaldo heredado, de antes de que las claves llevaran taller:
        // era del principal, el único que existía.
        talleres.add(barra === -1 ? TALLER_PRINCIPAL : resto.slice(0, barra));
    }
    return [...talleres].sort();
}

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
// Restaura el contenido de un respaldo sobre una base.
//
// `soloColecciones` restaura ESAS y deja el resto de la base como está. Nace de un caso real:
// se borraron todos los `usuarios` de un taller (y con ellos, en cascada, sus `asignacions`)
// y el único camino de vuelta era restaurar el archivo entero — que habría devuelto la
// gente, sí, pero retrocediendo las OT y solicitudes del día a las de anoche. Recuperar una
// colección no puede costar el trabajo de toda la jornada.
//
// **Un nombre que no está en el archivo es un error, no un cero.** Las colecciones se llaman
// como las pluraliza Mongoose, y esa pluralización es ingenua: `Asignacion` queda
// `asignacions`, sin la «e». Escribir `asignaciones` —que es lo que cualquiera escribiría—
// no coincide con nada, y sin este corte el script diría «restauración completa: 0
// documentos» y quien lo corrió se iría convencido de que recuperó su trabajo.
async function restaurar(conexion, contenido, { soloColecciones = null } = {}) {
    const db = conexion.db;
    const resultado = {};

    const todas = Object.keys(contenido.colecciones || {});
    if (soloColecciones) {
        const faltantes = soloColecciones.filter((n) => !todas.includes(n));
        if (faltantes.length) {
            throw new Error(`El respaldo no tiene la(s) colección(es): ${faltantes.join(', ')}.`
                + ` Las que trae son: ${todas.join(', ')}`);
        }
    }

    for (const [nombre, documentos] of Object.entries(contenido.colecciones || {})) {
        if (soloColecciones && !soloColecciones.includes(nombre)) continue;
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
    claveDeRespaldo, prefijoDe, prefijoHeredado, armarContenido, talleresConRespaldo,
    VERSION_FORMATO, MAXIMO_RESPALDOS, COLECCIONES_OMITIDAS,
};
