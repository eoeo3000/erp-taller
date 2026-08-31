// "Hoy" en fecha LOCAL, no UTC — bug real encontrado en producción: `new Date().toISOString()`
// convierte primero a UTC, y Chile va atrás de UTC, así que de noche (pasada cierta hora,
// según la época del año) la app ya mostraba el día siguiente como "hoy" (ej. domingo de
// noche marcado como lunes). Compartido por las pantallas que necesitan saber qué día es hoy
// para resaltar la fecha actual en una semana/día (S2, S3, S4, S7, O6 — antes cada una tenía
// su propia copia de la versión con el bug).
export function hoyISO() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
}
