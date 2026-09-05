// Migración idempotente: pasa las observaciones de terreno del formato viejo
// (tareas[].registro, un solo objeto) al nuevo (tareas[].registros, una entrada por reporte).
//
// El formato viejo guardaba solo "HH:MM", sin día — por eso una observación de antes del
// cambio se sigue mostrando como "19:30" a secas, sin saber de cuándo es. La fecha se puede
// RECUPERAR, no inventar: las fotos se suben con multer y el nombre del archivo empieza con
// Date.now() en milisegundos (ver middlewares/upload.js), que es el momento real en que se
// subió — a segundos de haberse escrito la observación.
//
// Se exige que ese timestamp reproduzca exactamente la hora guardada (en horario de Chile)
// antes de aceptarlo. Si no coincide, o si la observación no tiene foto, se deja `fecha: null`
// y se conserva la hora suelta: mejor un dato incompleto que uno inventado.
//
//   node migrar-registros-tarea.js             → solo muestra qué haría
//   node migrar-registros-tarea.js --aplicar   → escribe
require('dotenv').config();
const mongoose = require('mongoose');
const getOT = require('./src/models/OT');

const aplicar = process.argv.includes('--aplicar');

// Tolerancia entre la subida de la foto y el guardado de la observación: la foto se sube al
// elegirla y el texto recién al apretar "Guardar lo ingresado", así que unos minutos de
// diferencia son lo normal. Más de una hora ya no permite afirmar que sea la misma sesión.
const MINUTOS_TOLERANCIA = 60;

// "2026-09-04 15:58:01" — hora de pared en Chile, en formato ordenable.
const relojChile = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'America/Santiago' });

// "https://…/uploads/1788564652446-347335254.jpg" → 1788564652446
function timestampDeFoto(url) {
    const nombre = String(url || '').split('/').pop();
    const m = /^(\d{13})-\d+\./.exec(nombre);
    return m ? Number(m[1]) : null;
}

// Lo que falta recuperar es el DÍA: la hora ya está guardada y es la que corresponde (la del
// momento en que se grabó la observación). Así que se toma el día de la foto y se le pega la
// hora guardada, en vez de reemplazar la hora por la de la subida.
function fechaDeducida(registro) {
    if (!/^\d{2}:\d{2}$/.test(registro.hora || '')) return null;
    for (const foto of registro.fotos || []) {
        const ms = timestampDeFoto(foto);
        if (!ms) continue;
        const reloj = relojChile(ms);                       // "2026-09-04 15:58:01"
        const dia = reloj.slice(0, 10);
        // Diferencia entre el instante real y su lectura como si el reloj de Chile fuera UTC:
        // sirve para reconstruir el instante exacto de "ese día a esa hora" en Chile.
        const desfase = ms - Date.parse(`${reloj.replace(' ', 'T')}Z`);
        const fecha = new Date(Date.parse(`${dia}T${registro.hora}:00Z`) + desfase);
        if (Math.abs(fecha.getTime() - ms) <= MINUTOS_TOLERANCIA * 60 * 1000) return fecha;
    }
    return null;
}

async function migrar(uri, nombre) {
    if (!uri) { console.log(`(${nombre}) sin URI configurada, se omite`); return; }
    const conn = await mongoose.createConnection(uri).asPromise();
    const OT = getOT(conn);

    const ots = await OT.find({ 'tareas.registro.texto': { $exists: true } }).select('numeroOT tareas').lean();
    const escrituras = [];
    let recuperadas = 0, sinFecha = 0;

    for (const ot of ots) {
        let toco = false;
        const tareas = (ot.tareas || []).map((t) => {
            // Ya migrada (o nunca tuvo nada): no se toca. Esto es lo que la hace idempotente.
            if (t.registros?.length) return t;
            const r = t.registro;
            if (!r?.texto && !r?.fotos?.length) return t;

            const fecha = fechaDeducida(r);
            if (fecha) recuperadas++; else sinFecha++;
            console.log(`(${nombre}) ${ot.numeroOT} · ${t.descripcion}: ${fecha ? `fecha recuperada ${fecha.toLocaleString('es-CL', { timeZone: 'America/Santiago' })}` : `sin fecha deducible, se conserva "${r.hora || '—'}"`}`);

            toco = true;
            return {
                ...t,
                registros: [{ texto: r.texto || '', fotos: r.fotos || [], fecha, hora: fecha ? '' : (r.hora || ''), autor: r.autor || '' }],
            };
        });
        if (toco) escrituras.push({ updateOne: { filter: { _id: ot._id }, update: { $set: { tareas } } } });
    }

    if (escrituras.length === 0) {
        console.log(`(${nombre}) no hay observaciones en el formato viejo — nada que hacer`);
    } else if (!aplicar) {
        console.log(`(${nombre}) SIMULACIÓN — ${recuperadas} con fecha recuperada, ${sinFecha} sin fecha, en ${escrituras.length} OT. Volver a correr con --aplicar para escribir.`);
    } else {
        const r = await OT.bulkWrite(escrituras);
        console.log(`(${nombre}) OT actualizadas: ${r.modifiedCount} (${recuperadas} con fecha recuperada, ${sinFecha} sin fecha)`);
    }

    await conn.close();
}

(async () => {
    await migrar(process.env.MONGO_URI, 'producción');
    await migrar(process.env.MONGO_URI_DEMO, 'demo');
    process.exit(0);
})().catch((err) => { console.error('Error en la migración:', err.message); process.exit(1); });
