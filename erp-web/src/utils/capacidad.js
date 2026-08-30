// Qué OTs "ocupan" capacidad real de personal, y cuánta carga tiene cada persona por día.
// Extraído de GanttScreen.jsx para que TabTareas (Tratamiento) pueda avisar de conflictos de
// disponibilidad al elegir responsables, con el mismo criterio — antes solo se enteraban en
// Programación, después de ya haber armado toda la tarea.
const HORAS_LIMITE_APROBACION_COTIZACION = 12;

export function cotizacionVencida(ot) {
    return !!(
        ot?.cotizacion?.enviada && ot?.cotizacion?.respuestaCliente === 'Pendiente' && ot?.cotizacion?.fechaEnvio
        && (Date.now() - new Date(ot.cotizacion.fechaEnvio).getTime()) > HORAS_LIMITE_APROBACION_COTIZACION * 3600 * 1000
    );
}

// Antes cualquier OT 'Planificada' ocupaba capacidad, se hubiera enviado la cotización o no;
// después se acotó a "cotización enviada y pendiente" para no reservar un cupo por un
// borrador sin tareas reales. Eso dejaba a la OT que se está planificando ahora mismo
// (todavía sin enviar, incluso todavía 'Tratada' — las tareas se cargan ahí, antes de
// "Terminar planificación") sin sus propias horas contadas, ni en la carga de personal ni en
// la de supervisores (otsActivasDe/diasOcupadosPorSupervisor en GanttScreen usan esta misma
// función). Ahora basta con tener tareas reales (fecha + horas > 0) asignadas, sin esperar el
// envío ni el paso a 'Planificada'. Se libera el slot si el cliente rechaza, la cotización
// vence, o el cliente cancela (OT.cancelada).
export function otBloqueaCapacidad(ot) {
    if (ot.cancelada?.activa) return false;
    if (['Programada', 'En Ejecución'].includes(ot.estado)) return true;
    if (['Tratada', 'Planificada'].includes(ot.estado) && ot.cotizacion?.respuestaCliente !== 'Rechazada' && !cotizacionVencida(ot)) {
        return (ot.tareas || []).some(tt => tt.fecha && Number(tt.duracion) > 0);
    }
    return false;
}

// { "recursoId-fechaISO": horasComprometidas }, sumando todas las tareas de todas las OTs que
// bloquean capacidad. `excluirOtId` saca una OT del cómputo (para superponerle en su lugar el
// borrador en memoria de esa misma OT, que puede tener cambios todavía no guardados).
export function construirMapaCarga(ots, excluirOtId) {
    const mapa = {};
    ots.filter(ot => otBloqueaCapacidad(ot) && String(ot._id) !== String(excluirOtId)).forEach(ot => {
        (ot.tareas || []).forEach(tt => {
            if (tt.fecha && tt.operarioId) {
                const ids = Array.isArray(tt.operarioId) ? tt.operarioId : [tt.operarioId];
                const horas = Number(tt.duracion) || 0;
                ids.forEach(id => {
                    const key = `${String(id)}-${tt.fecha}`;
                    mapa[key] = (mapa[key] || 0) + horas;
                });
            }
        });
    });
    return mapa;
}
