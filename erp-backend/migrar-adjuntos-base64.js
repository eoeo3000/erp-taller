// Migración puntual: convierte cualquier Solicitud.adjuntos que haya quedado guardado
// como data-URI base64 (antes de que crearSolicitud del portal empezara a convertirlo
// solo, ver portalController.js) a un archivo real en uploads/, dejando en el campo solo
// la ruta liviana — igual que ya hace el formulario de escritorio. Idempotente: los
// documentos que ya tienen una ruta (no empiezan con "data:") se saltan sin tocarlos.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const getSolicitud = require('./src/models/Solicitud');

function guardarAdjunto(valor) {
    const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(valor || '');
    if (!match) return null;
    const [, mime, contenido] = match;
    const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const nombre = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const destino = path.join(__dirname, 'uploads', nombre);
    fs.writeFileSync(destino, Buffer.from(contenido, 'base64'));
    return `/uploads/${nombre}`;
}

async function migrar(uri, nombre) {
    if (!uri) { console.log(`(${nombre}) sin URI configurada, se omite`); return; }
    const conn = await mongoose.createConnection(uri).asPromise();
    const Solicitud = getSolicitud(conn);
    const candidatas = await Solicitud.find({ adjuntos: { $regex: /^data:/ } });
    for (const sol of candidatas) {
        const antes = sol.adjuntos.length;
        const nuevaRuta = guardarAdjunto(sol.adjuntos);
        sol.adjuntos = nuevaRuta;
        await sol.save();
        console.log(`(${nombre}) ${sol.numeroSolicitud}: ${antes} chars -> ${nuevaRuta}`);
    }
    console.log(`(${nombre}) migradas: ${candidatas.length}`);
    await conn.close();
}

(async () => {
    await migrar(process.env.MONGO_URI, 'producción');
    await migrar(process.env.MONGO_URI_DEMO, 'demo');
    process.exit(0);
})().catch((err) => { console.error('Error en la migración:', err.message); process.exit(1); });
