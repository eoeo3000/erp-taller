// Guard compartido para los scripts de esta carpeta — todos conectan directo a MONGO_URI y
// borran datos sin pasar por la API. Ver plan de robustecimiento, punto 2: un typo o un .env
// apuntando al ambiente equivocado no debería poder borrar datos reales sin un paso explícito.
// No requiere conexión a Mongo para funcionar — se llama ANTES de mongoose.connect(), así
// que si se cancela, el script nunca llegó a tocar la base de datos.
const readline = require('readline');

// Devuelve null si no se pudo extraer (URI sin nombre de base en el path, formato raro,
// etc.) — nunca un string descriptivo, para no arriesgarnos a que ese mismo mensaje de
// error termine siendo la "palabra clave" que alguien copia y pega sin pensar en el prompt.
function extraerNombreDB(uri) {
    if (!uri) return null;
    try {
        // Evitamos new URL(): las contraseñas de Atlas suelen traer caracteres especiales
        // (@, #, etc.) sin escapar en el .env, y eso rompe el parseo de la porción de
        // credenciales. Solo nos interesa el segmento de host+path, así que cortamos por
        // string en vez de validar la URI completa.
        const sinProtocolo = uri.replace(/^mongodb(\+srv)?:\/\//, '');
        const despuesDeCredenciales = sinProtocolo.includes('@')
            ? sinProtocolo.slice(sinProtocolo.lastIndexOf('@') + 1)
            : sinProtocolo;
        const barraIdx = despuesDeCredenciales.indexOf('/');
        if (barraIdx === -1) return null;
        return despuesDeCredenciales.slice(barraIdx + 1).split('?')[0] || null;
    } catch {
        return null;
    }
}

function preguntar(pregunta) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(pregunta, respuesta => { rl.close(); resolve(respuesta); }));
}

// Pide escribir el nombre exacto de la base de datos a la que MONGO_URI apunta. `--confirm`
// salta el prompt para quien ya confirmó a mano y quiere repetir el comando (ej. reintentos).
async function confirmarDestructivo(descripcionAccion) {
    const nombreDB = extraerNombreDB(process.env.MONGO_URI);
    // Si no se pudo determinar el nombre real, se pide una palabra clave fija en vez de
    // repetir el mensaje de error como si fuera la respuesta esperada.
    const palabraClave = nombreDB || 'CONFIRMAR';

    console.log('\n⚠️  SCRIPT DESTRUCTIVO — esto no se puede deshacer ⚠️');
    console.log(nombreDB
        ? `Base de datos objetivo: ${nombreDB}`
        : 'Base de datos objetivo: no se pudo determinar desde MONGO_URI (revisa el formato en .env)');
    console.log(`Acción: ${descripcionAccion}\n`);

    if (process.argv.includes('--confirm')) {
        console.log('(confirmado con --confirm, sin prompt interactivo)\n');
        return;
    }

    const respuesta = await preguntar(`Escribe "${palabraClave}" para continuar, cualquier otra cosa cancela: `);
    if (respuesta.trim() !== palabraClave) {
        console.log('\n❌ Cancelado — no se tocó la base de datos.');
        process.exit(1);
    }
    console.log('✅ Confirmado.\n');
}

module.exports = { confirmarDestructivo };
