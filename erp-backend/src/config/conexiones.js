// Gestor de las dos conexiones de Mongo (producción / demo) del modo demostración.
// Ver Incomplete web app design/design_handoff_panel_control/README.md §9.2:
// "El servidor mantiene dos conexiones y resuelve la activa por header ... no por
// una variable global mutable" — por eso cada request se resuelve por separado
// (ver middlewares/entorno.js) en vez de reasignar una conexión "activa" compartida.
const mongoose = require('mongoose');

const conexiones = {
    produccion: null,
    demo: null,
};

async function inicializarConexiones() {
    conexiones.produccion = mongoose.createConnection(process.env.MONGO_URI);
    await conexiones.produccion.asPromise();
    console.log('✅ CONECTADO A MONGODB (producción)');

    if (process.env.MONGO_URI_DEMO) {
        conexiones.demo = mongoose.createConnection(process.env.MONGO_URI_DEMO);
        await conexiones.demo.asPromise();
        console.log('✅ CONECTADO A MONGODB (demo)');
    } else {
        console.warn('⚠️  MONGO_URI_DEMO no está definida — el modo demostración queda deshabilitado.');
    }
}

function conexionDisponible(entorno) {
    return entorno === 'demo' ? !!conexiones.demo : !!conexiones.produccion;
}

function obtenerConexion(entorno) {
    if (entorno === 'demo') {
        if (!conexiones.demo) throw new Error('El entorno demo no está disponible: falta MONGO_URI_DEMO en .env');
        return conexiones.demo;
    }
    return conexiones.produccion;
}

module.exports = { inicializarConexiones, obtenerConexion, conexionDisponible };
