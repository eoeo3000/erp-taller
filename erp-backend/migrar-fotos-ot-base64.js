// Migración puntual: convierte las fotos que hayan quedado guardadas como data-URI base64
// dentro del documento de la OT (tareas[].registro.fotos, reportes[].foto,
// informeEvaluacion.fotos — el mismo problema que ya se corrigió para Solicitud.adjuntos en
// migrar-adjuntos-base64.js, ver ese archivo) a un archivo real en uploads/, dejando en el
// campo solo la ruta liviana. Una sola foto de 256KB en base64 hacía que cualquier consulta
// que trajera esa OT completa tardara varios segundos (diagnosticado directo contra Mongo:
// 3.2s con la foto en base64, 138ms con la misma OT ya migrada a URL).
//
// IMPORTANTE — dónde correr esto: los archivos quedan en ./uploads relativo a donde corre
// ESTE script. Si erp-backend en Render tiene un Persistent Disk, ese disco vive en el
// servidor de Render, no en esta máquina — correr el script desde un computador local
// actualizaría la base de datos apuntando a archivos que NO existen en el disco de Render
// (fotos rotas, peor que no tocar nada). Correr esto desde la pestaña "Shell" del servicio
// erp-backend en Render (o el mecanismo que sea, con tal de que sea la MISMA máquina/disco
// que sirve /uploads en producción).
//
// Idempotente: los documentos que ya tienen una ruta (no empiezan con "data:") se saltan.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const getOT = require('./src/models/OT');

function esBase64(valor) {
    return typeof valor === 'string' && valor.startsWith('data:');
}

function guardarFoto(valor) {
    const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(valor || '');
    if (!match) return valor;
    const [, mime, contenido] = match;
    // .split('+')[0]: mimes como "image/svg+xml" darían la extensión ".svg+xml" sin esto
    // (visto al probar contra la demo — sus fotos de ejemplo son SVG, no JPEG).
    const ext = (mime.split('/')[1] || 'jpg').split('+')[0].replace('jpeg', 'jpg');
    const nombre = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const destino = path.join(__dirname, 'uploads', nombre);
    fs.writeFileSync(destino, Buffer.from(contenido, 'base64'));
    return `/uploads/${nombre}`;
}

async function migrar(uri, nombre) {
    if (!uri) { console.log(`(${nombre}) sin URI configurada, se omite`); return; }
    const conn = await mongoose.createConnection(uri).asPromise();
    const OT = getOT(conn);
    const candidatas = await OT.find({
        $or: [
            { 'tareas.registro.fotos': { $regex: /^data:/ } },
            { 'reportes.foto': { $regex: /^data:/ } },
            { 'informeEvaluacion.fotos': { $regex: /^data:/ } },
        ],
    });

    let totalFotos = 0;
    for (const ot of candidatas) {
        let cambios = 0;
        for (const t of ot.tareas || []) {
            if (!t.registro?.fotos?.length) continue;
            t.registro.fotos = t.registro.fotos.map((f) => {
                if (!esBase64(f)) return f;
                cambios++; totalFotos++;
                return guardarFoto(f);
            });
        }
        for (const r of ot.reportes || []) {
            if (esBase64(r.foto)) { r.foto = guardarFoto(r.foto); cambios++; totalFotos++; }
        }
        if (ot.informeEvaluacion?.fotos?.length) {
            ot.informeEvaluacion.fotos = ot.informeEvaluacion.fotos.map((f) => {
                if (!esBase64(f)) return f;
                cambios++; totalFotos++;
                return guardarFoto(f);
            });
        }
        if (cambios > 0) {
            await ot.save();
            console.log(`(${nombre}) ${ot.numeroOT}: ${cambios} foto(s) migrada(s)`);
        }
    }
    console.log(`(${nombre}) OT revisadas: ${candidatas.length}, fotos migradas: ${totalFotos}`);
    await conn.close();
}

(async () => {
    await migrar(process.env.MONGO_URI, 'producción');
    await migrar(process.env.MONGO_URI_DEMO, 'demo');
    process.exit(0);
})().catch((err) => { console.error('Error en la migración:', err.message); process.exit(1); });
