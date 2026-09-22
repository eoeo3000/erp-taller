// Crea (o restablece) la cuenta de administrador de la app de escritorio.
//
// Existe por un problema de huevo y gallina: las cuentas se administran desde adentro de la
// app, pero para entrar a la app hay que tener una cuenta. Este script es la única forma de
// crear la primera — y el salvavidas si el único administrador pierde su clave Y el acceso
// al correo con el que la recuperaría. Por eso no se borra aunque ya no se use a diario.
//
// No es destructivo (no borra ni toca datos del taller), así que a diferencia de los de
// scripts/peligrosos/ no pide confirmar el nombre de la base. Sí se niega a pisar una
// cuenta existente salvo que se lo pidan explícitamente con --reset.
//
// Uso:
//   ADMIN_EMAIL=... ADMIN_NOMBRE=... ADMIN_PASSWORD=... node scripts/crearAdmin.js
//   ... node scripts/crearAdmin.js --entorno=demo     (la base de demostración)
//   ... node scripts/crearAdmin.js --reset            (cambia la clave de una cuenta ya creada)
//
// La clave va en variable de entorno y no como argumento a propósito: los argumentos
// quedan en el historial del shell y son visibles en la lista de procesos del servidor.
require('dotenv').config();
const mongoose = require('mongoose');
const getUsuario = require('../src/models/Usuario');
const { hashPassword } = require('../src/utils/password');

const LARGO_MINIMO_PASSWORD = 8;

function argumento(nombre) {
    const prefijo = `--${nombre}=`;
    const encontrado = process.argv.find((a) => a.startsWith(prefijo));
    return encontrado ? encontrado.slice(prefijo.length) : '';
}

async function main() {
    const entorno = argumento('entorno') === 'demo' ? 'demo' : 'produccion';
    const reset = process.argv.includes('--reset');

    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const nombre = String(process.env.ADMIN_NOMBRE || '').trim();
    const password = String(process.env.ADMIN_PASSWORD || '');

    if (!email || !password) {
        console.error('Faltan datos. Uso:\n  ADMIN_EMAIL=alguien@taller.cl ADMIN_NOMBRE="Nombre Apellido" ADMIN_PASSWORD=... node scripts/crearAdmin.js');
        process.exit(1);
    }
    if (password.length < LARGO_MINIMO_PASSWORD) {
        console.error(`La clave debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`);
        process.exit(1);
    }

    const uri = entorno === 'demo' ? process.env.MONGO_URI_DEMO : process.env.MONGO_URI;
    if (!uri) {
        console.error(`No está definida la variable de conexión para el entorno '${entorno}'.`);
        process.exit(1);
    }

    const conn = mongoose.createConnection(uri);
    await conn.asPromise();
    console.log(`Conectado a la base de ${entorno}: ${conn.name}`);

    try {
        const Usuario = getUsuario(conn);
        const existente = await Usuario.findOne({ email });

        if (existente && !reset) {
            console.error(`Ya existe una cuenta con el correo ${email}. Para cambiarle la clave, repite el comando agregando --reset.`);
            process.exitCode = 1;
            return;
        }

        const passwordHash = await hashPassword(password);

        if (existente) {
            existente.passwordHash = passwordHash;
            existente.estado = 'activo';
            existente.debeCambiarPassword = true;
            existente.intentosFallidos = 0;
            existente.bloqueadoHasta = null;
            existente.resetHash = '';
            existente.resetExpira = null;
            if (nombre) existente.nombre = nombre;
            await existente.save();
            console.log(`✅ Clave restablecida para ${email}. Tendrá que cambiarla al entrar.`);
        } else {
            await Usuario.create({
                nombre: nombre || email,
                rol: 'administrador',
                email,
                passwordHash,
                debeCambiarPassword: true,
            });
            console.log(`✅ Administrador creado: ${email}. Tendrá que cambiar la clave al entrar.`);
        }
    } finally {
        await conn.close();
    }
}

main().catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
