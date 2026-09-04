// Observaciones de terreno de una tarea. Hoy viven en `tareas[].registros` (una entrada por
// reporte, con fecha), pero las OT grabadas antes de eso tienen una sola en `tareas[].registro`
// sin día — solo "HH:MM" suelto. Todo lector pasa por acá para no tener que acordarse de las
// dos formas. Ver models/OT.js y otController.registrosDeTarea en el backend (no hay forma de
// compartir código entre backend y frontend, así que está duplicado a propósito).
export function registrosDeTarea(tarea) {
    if (tarea?.registros?.length) return tarea.registros;
    const legado = tarea?.registro;
    if (legado?.texto || legado?.fotos?.length) {
        return [{ texto: legado.texto || '', fotos: legado.fotos || [], fecha: null, hora: legado.hora || '', autor: legado.autor || '' }];
    }
    return [];
}

export function tieneAvanceEnTerreno(tarea) {
    return registrosDeTarea(tarea).some((r) => r.texto || r.fotos?.length);
}

// "04-09-2026 19:30". Los registros legados no tienen día, así que se cae a la hora suelta
// que sí quedó guardada — decir solo "19:30" es preferible a inventarle una fecha.
export function selloRegistro(registro) {
    if (!registro?.fecha) return registro?.hora || '';
    return new Date(registro.fecha).toLocaleString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

// Día (sin hora) de una entrada, para agrupar la bitácora por jornada en el informe final.
// Las legadas, sin fecha, caen en un grupo aparte al final.
export function diaDeRegistro(registro) {
    if (!registro?.fecha) return '';
    const d = new Date(registro.fecha);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
