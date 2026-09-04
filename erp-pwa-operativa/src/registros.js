// Las observaciones de terreno de una tarea. Hoy viven en `tareas[].registros` (una entrada
// por reporte, con fecha), pero las OT grabadas antes de eso tienen una sola en el objeto
// `tareas[].registro`, sin día — solo "HH:MM" suelto. Todo lector pasa por acá para no tener
// que acordarse de las dos formas. Ver models/OT.js en el backend.
export function registrosDeTarea(tarea) {
    if (tarea?.registros?.length) return tarea.registros;
    const legado = tarea?.registro;
    if (legado?.texto || legado?.fotos?.length) {
        // Sin fecha real: se conserva la hora como venía y quien lo muestre decide qué hacer
        // con un registro del que no se sabe el día.
        return [{ texto: legado.texto || '', fotos: legado.fotos || [], fecha: null, hora: legado.hora || '', autor: legado.autor || '' }];
    }
    return [];
}

// Todas las fotos de terreno de una tarea, de todas sus observaciones.
export function fotosDeTarea(tarea) {
    return registrosDeTarea(tarea).flatMap((r) => r.fotos || []);
}

// "04-09, 19:30" — para una entrada de bitácora. Los registros legados no tienen día, así que
// se cae a la hora suelta que sí quedó guardada.
export function selloRegistro(registro) {
    if (!registro?.fecha) return registro?.hora || '';
    const d = new Date(registro.fecha);
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
