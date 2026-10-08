// Dejar lista la base de un taller nuevo.
//
// En Mongo una base no se "crea": aparece cuando se escribe algo en ella. Lo que sí hay que
// crear son los ÍNDICES, y ese es el motivo real de que este archivo exista.
//
// Mongoose los construye solo la primera vez que usa un modelo sobre una conexión, pero eso
// es perezoso y silencioso: si nadie toca `Solicitud` en la base nueva, su índice único no
// existe, y el día que dos solicitudes choquen no va a haber ningún error — van a entrar las
// dos. Hay once índices únicos en el proyecto (números de OT, correos, slugs), y todos
// protegen contra duplicados que después no se pueden separar a mano.
//
// Por eso el alta de un taller los construye de una vez y de forma explícita, y por eso
// devuelve el detalle: para que quede escrito en el log qué se creó y en qué base.
const fs = require('fs');
const path = require('path');

const CARPETA_MODELOS = path.join(__dirname, '..', 'models');
// `Taller` vive en la base de CONTROL, no en la de ningún taller: construir su índice acá
// crearía una colección de talleres dentro de los datos de un cliente.
const FUERA_DE_LA_BASE_DE_TALLER = new Set(['Taller.js']);

function archivosDeModelos() {
    return fs.readdirSync(CARPETA_MODELOS)
        .filter((f) => f.endsWith('.js') && !FUERA_DE_LA_BASE_DE_TALLER.has(f))
        .sort();
}

// Construye todos los modelos sobre `conn` y sincroniza sus índices. Idempotente: correrlo
// de nuevo sobre una base ya aprovisionada no rompe nada ni duplica nada, que es lo que
// permite usarlo también para reparar una base a la que le faltó algo.
async function aprovisionarTaller(conn) {
    const creados = [];
    const fallidos = [];

    for (const archivo of archivosDeModelos()) {
        const fabrica = require(path.join(CARPETA_MODELOS, archivo));
        if (typeof fabrica !== 'function') continue;
        const modelo = fabrica(conn);
        try {
            // syncIndexes y no createIndexes: además de crear los que faltan, borra los que
            // ya no están en el esquema. En una base recién nacida da lo mismo; en una que se
            // repara, es la diferencia entre dejarla igual al esquema y dejarla parecida.
            await modelo.syncIndexes();
            creados.push(modelo.modelName);
        } catch (error) {
            // Un índice que no se puede construir —típicamente porque la base ya traía datos
            // duplicados— no debe abortar el resto. Se junta y se devuelve: el alta tiene que
            // poder decir exactamente qué quedó a medias.
            fallidos.push({ modelo: modelo.modelName, error: error.message });
        }
    }

    return { base: conn.name, modelos: creados, fallidos };
}

module.exports = { aprovisionarTaller, archivosDeModelos };
