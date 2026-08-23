// Sincronización hallazgo -> tarea — docs/plan-formulario-adaptativo.md §3.4.1. Cada
// hallazgo mantiene una fila propia en informeEvaluacion.tareas[] (descripcion = texto
// generado/editado, duracion = valores.duracionTentativa si el tipo de trabajo la define).
// Eliminar un hallazgo elimina también su tarea vinculada.
//
// Duplicado a propósito en erp-web/src/utils/hallazgos.js — ver motorSugerencia.js para el
// motivo (sin monorepo/paquete compartido entre erp-web y las PWA).
import { generarTexto } from './motorTexto.js';

// 24 caracteres hex, mismo formato que un ObjectId de Mongo — generado en el cliente para
// poder enlazar hallazgo.tareaVinculadaId con tareas[]._id en el mismo guardado, sin una
// ronda adicional de ida y vuelta al servidor (Mongoose acepta un _id de subdocumento
// provisto por el cliente tal cual).
function generarIdCliente() {
    let hex = '';
    for (let i = 0; i < 24; i++) hex += Math.floor(Math.random() * 16).toString(16);
    return hex;
}

export function nuevoHallazgo() {
    return {
        _id: null,
        tipoTrabajoId: null,
        valores: {},
        textoGenerado: '',
        textoDescriptivo: '',
        textoEditadoManualmente: false,
        fotos: [],
        casoNoCubierto: false,
        tareaVinculadaId: '',
    };
}

// Recalcula el texto a partir de la plantilla del tipo elegido y los valores actuales —
// mientras no esté editado a mano (§5). Se llama cada vez que cambia un valor o el tipo
// elegido, no solo al guardar, para que la vista previa se actualice en vivo.
export function recalcularTexto(hallazgo, tipoTrabajo) {
    const textoGenerado = generarTexto(tipoTrabajo?.plantillaTexto || '', hallazgo.valores || {});
    return {
        ...hallazgo,
        textoGenerado,
        textoDescriptivo: hallazgo.textoEditadoManualmente ? hallazgo.textoDescriptivo : textoGenerado,
    };
}

// "Deshacer edición" (§5): descarta el texto escrito a mano y vuelve al generado por plantilla.
export function deshacerEdicionManual(hallazgo) {
    return { ...hallazgo, textoEditadoManualmente: false, textoDescriptivo: hallazgo.textoGenerado };
}

// Aplica un hallazgo (nuevo o editado) sobre informeEvaluacion, sincronizando su tarea
// vinculada en el mismo objeto. Quien llama todavía tiene que persistir el resultado
// (actualizarOT / PUT de la OT) — esto solo arma el objeto correcto.
export function guardarHallazgoEnInforme(informeEvaluacion, hallazgo) {
    const hallazgos = [...(informeEvaluacion.hallazgos || [])];
    const tareas = [...(informeEvaluacion.tareas || [])];

    const hallazgoConId = hallazgo._id ? hallazgo : { ...hallazgo, _id: generarIdCliente() };
    const casoNoCubierto = !hallazgoConId.tipoTrabajoId || hallazgoConId.textoEditadoManualmente;

    // informeEvaluacion.tareas es una lista propia y liviana (descripcion/puesto/duracion,
    // ver models/OT.js) — no la misma forma que OT.tareas (Gantt, con operarioId/fecha/hora).
    let tareaVinculadaId = hallazgoConId.tareaVinculadaId;
    const idxTarea = tareaVinculadaId ? tareas.findIndex((t) => String(t._id) === String(tareaVinculadaId)) : -1;
    const tareaBase = idxTarea >= 0
        ? tareas[idxTarea]
        : { _id: generarIdCliente(), puesto: '' };
    if (!tareaVinculadaId) tareaVinculadaId = tareaBase._id;

    const nuevaTarea = {
        ...tareaBase,
        descripcion: hallazgoConId.textoDescriptivo,
        duracion: hallazgoConId.valores?.duracionTentativa ? Number(hallazgoConId.valores.duracionTentativa) : (tareaBase.duracion || 0),
    };
    if (idxTarea >= 0) tareas[idxTarea] = nuevaTarea; else tareas.push(nuevaTarea);

    const hallazgoFinal = { ...hallazgoConId, casoNoCubierto, tareaVinculadaId };
    const idxHallazgo = hallazgos.findIndex((h) => String(h._id) === String(hallazgoFinal._id));
    if (idxHallazgo >= 0) hallazgos[idxHallazgo] = hallazgoFinal; else hallazgos.push(hallazgoFinal);

    return { ...informeEvaluacion, hallazgos, tareas };
}

export function eliminarHallazgoDeInforme(informeEvaluacion, hallazgoId) {
    const hallazgo = (informeEvaluacion.hallazgos || []).find((h) => String(h._id) === String(hallazgoId));
    const hallazgos = (informeEvaluacion.hallazgos || []).filter((h) => String(h._id) !== String(hallazgoId));
    const tareas = hallazgo?.tareaVinculadaId
        ? (informeEvaluacion.tareas || []).filter((t) => String(t._id) !== String(hallazgo.tareaVinculadaId))
        : (informeEvaluacion.tareas || []);
    return { ...informeEvaluacion, hallazgos, tareas };
}
