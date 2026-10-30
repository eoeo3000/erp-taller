// ¿En qué taller está esta cuenta?
//
//   node scripts/buscarCuenta.js correo@ejemplo.cl
//   node scripts/buscarCuenta.js correo@ejemplo.cl --entorno=demo
//
// Para cuando el log de la recuperación dice «ninguna cuenta con ese correo en este taller» y
// hay que decidir entre las dos explicaciones posibles: la cuenta no existe, o existe en otro
// taller y el navegador de esa persona apunta al equivocado. Ver src/servicios/buscarCuenta.js.
//
// Se corre desde la Shell de Render, donde el `.env` ya está puesto. No expone nada por HTTP
// y no muestra ninguna credencial: ni la clave, ni el token de la PWA, ni la mongoUri.
require('dotenv').config();
const { conexionDeTaller, listarTalleres } = require('./_conexion');
const getUsuario = require('../src/models/Usuario');
const { buscarCuenta, queHacer } = require('../src/servicios/buscarCuenta');
const { TALLER_PRINCIPAL } = require('../src/config/talleres');

const argumento = (nombre, porDefecto) => {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split('=')[1] : porDefecto;
};

(async () => {
    const email = process.argv.slice(2).find((a) => !a.startsWith('--'));
    if (!email) {
        console.error('Uso: node scripts/buscarCuenta.js correo@ejemplo.cl [--entorno=demo]');
        process.exit(1);
    }
    const entorno = argumento('entorno', 'produccion') === 'demo' ? 'demo' : 'produccion';

    const slugs = await listarTalleres();
    const talleres = [];
    for (const slug of slugs) {
        try {
            talleres.push({ slug, conexion: await conexionDeTaller(entorno, slug) });
        } catch (error) {
            console.warn(`⚠️  ${slug}: no se pudo abrir su base — ${error.message}`);
        }
    }

    const resultado = await buscarCuenta(email, talleres, getUsuario);

    console.log(`\nCorreo buscado: ${resultado.email}`);
    console.log(`Talleres revisados: ${talleres.map((t) => t.slug).join(', ') || '(ninguno)'}\n`);

    if (!resultado.hallazgos.length) console.log('  Sin cuenta en ninguno.');
    for (const h of resultado.hallazgos) {
        const estado = h.invitacionSinActivar ? 'invitación sin activar'
            : (h.puedeEntrar ? 'puede entrar' : `estado: ${h.estado}`);
        console.log(`  ${h.taller.padEnd(20)} ${h.nombre.padEnd(28)} ${estado}`);
    }
    for (const f of resultado.fallidos) console.log(`  ${f.taller.padEnd(20)} ⚠️  ${f.error}`);

    console.log(`\n→ ${queHacer(resultado, TALLER_PRINCIPAL)}\n`);
    process.exit(0);
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
