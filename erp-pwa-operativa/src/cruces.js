// Detección de cruces de horario (S2 · Mi semana del supervisor, ver
// docs/rediseno/design_handoff_pwa_supervisor/README.md §4): se calcula en el cliente sobre
// la semana ya cargada, sin endpoint nuevo. Mismo operarioId, misma fecha, rangos de hora
// que se solapan, OT distinta (la persona no puede estar en dos terrenos a la vez). El
// supervisor solo avisa — reprogramar sigue siendo de la oficina.
function minutos(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
}

// tareas: filas de tareasSupervisadas (asignacionController.tareasSemanaSupervisada).
export function detectarCruces(tareas) {
    const cruces = [];
    for (let i = 0; i < tareas.length; i++) {
        for (let j = i + 1; j < tareas.length; j++) {
            const a = tareas[i], b = tareas[j];
            if (a.fecha !== b.fecha) continue;
            if (String(a.otId) === String(b.otId)) continue;
            const compartePersona = (a.operarioId || []).some((id) => (b.operarioId || []).includes(id));
            if (!compartePersona) continue;
            const aIni = minutos(a.horaInicio), aFin = minutos(a.horaFin);
            const bIni = minutos(b.horaInicio), bFin = minutos(b.horaFin);
            if (aIni == null || aFin == null || bIni == null || bFin == null) continue;
            if (aIni < bFin && bIni < aFin) cruces.push({ fecha: a.fecha, a, b });
        }
    }
    return cruces;
}

// Agrupa tareas por OT+día en un solo bloque (una barra por trabajo, no por tarea suelta):
// si un mismo OT tiene dos tareas el mismo día, S2 las suma en una sola barra, igual que ya
// hace calcularHorasDia/GanttScreen en el resto del sistema.
export function agruparPorOtYDia(tareas) {
    const grupos = new Map();
    for (const t of tareas) {
        const clave = `${t.otId}__${t.fecha}`;
        if (!grupos.has(clave)) {
            grupos.set(clave, {
                otId: t.otId, numeroOT: t.numeroOT, descripcion: t.descripcion, estadoOT: t.estadoOT,
                fecha: t.fecha, duracion: 0, horaInicio: t.horaInicio, horaFin: t.horaFin,
            });
        }
        const g = grupos.get(clave);
        g.duracion += Number(t.duracion) || 0;
        if (t.horaInicio && (!g.horaInicio || t.horaInicio < g.horaInicio)) g.horaInicio = t.horaInicio;
        if (t.horaFin && (!g.horaFin || t.horaFin > g.horaFin)) g.horaFin = t.horaFin;
    }
    return [...grupos.values()];
}
