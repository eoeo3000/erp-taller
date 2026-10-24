// Abrir la base de UN taller desde un script, por el mismo camino que la usa el servidor.
//
// Existe desde la etapa 5, cuando los respaldos pasaron a ser uno por taller. Antes los
// scripts leían `MONGO_URI` del `.env` y listo, porque había una sola base. Con varias, esa
// forma tiene un problema que no avisa: si el script arma la clave del respaldo con el
// taller que le pasaron por argumento pero se conecta a la base del `.env`, un
// `--taller=rivas` escribe los datos del principal bajo el nombre de Rivas. El archivo se
// ve bien, se restaura sin un solo error, y le mete a un cliente los datos de otro.
//
// Acá la conexión y el nombre salen del MISMO lugar —el registro de talleres, que es el que
// sabe en qué base vive cada uno—, así que no pueden contradecirse.
//
// Sin `MONGO_URI_CONTROL` el registro se arma del entorno y tiene un solo taller, el de
// `MONGO_URI`: exactamente lo de antes, sin configurar nada nuevo.
const { inicializarConexiones, obtenerConexion, talleresActivos } = require('../src/config/conexiones');
const { TALLER_PRINCIPAL } = require('../src/config/talleres');

let iniciado = false;

async function prepararRegistro() {
    if (!iniciado) {
        await inicializarConexiones();
        iniciado = true;
    }
}

// La conexión del taller pedido, ya lista para usar. Lanza con un mensaje entendible si ese
// taller no existe o está suspendido, en vez del error del driver.
async function conexionDeTaller(entorno, taller = TALLER_PRINCIPAL) {
    await prepararRegistro();
    return obtenerConexion(entorno, taller);
}

// Para los scripts que recorren todos: la misma lista que usa el respaldo diario.
async function listarTalleres() {
    await prepararRegistro();
    const activos = talleresActivos();
    return activos.length ? activos : [TALLER_PRINCIPAL];
}

module.exports = { conexionDeTaller, listarTalleres, prepararRegistro };
