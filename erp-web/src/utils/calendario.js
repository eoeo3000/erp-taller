// Extraído de App.jsx (antes closures inline del componente) para poder testear la lógica de
// horas/calendario sin levantar React. `calendarios` se recibe como parámetro explícito en vez
// de leerse de un closure — misma lógica, firma pura.

export function calcularHorasDia(bloques) {
  if (!bloques || !Array.isArray(bloques)) return 0;
  return bloques.reduce((total, bloque) => {
    if (!bloque.inicio || !bloque.fin) return total;
    const [hInicio, mInicio] = bloque.inicio.split(':').map(Number);
    const [hFin, mFin] = bloque.fin.split(':').map(Number);
    // Turno que cruza medianoche (ej. 22:00–06:00): sin el módulo, hFin*60+mFin < hInicio*60+mInicio
    // da minutos negativos y las horas de S2/S3 en la PWA de supervisor salen mal.
    const minutos = (((hFin * 60 + mFin) - (hInicio * 60 + mInicio)) % 1440 + 1440) % 1440;
    return total + (minutos / 60);
  }, 0);
}

export function obtenerHorasParaDia(recurso, diaCalendario, calendarios) {
  // 1. PRIORIDAD ABSOLUTA: Ajustes manuales
  const fechaISO = new Date(diaCalendario.fechaCompleta).toISOString().split('T')[0];

  if (recurso.ajustes) {
    if (recurso.ajustes instanceof Map && recurso.ajustes.has(fechaISO)) {
      return Number(recurso.ajustes.get(fechaISO));
    }
    if (recurso.ajustes[fechaISO] !== undefined) {
      return Number(recurso.ajustes[fechaISO]);
    }
  }

  // 2. Lógica de Calendario
  if (!recurso.calendarioId || !calendarios) return 0;

  const cal = calendarios.find(c => String(c._id) === String(recurso.calendarioId));
  if (!cal || !cal.config) return 0;

  const fecha = new Date(diaCalendario.fechaCompleta);

  // DETERMINAMOS LA FECHA DE ANCLAJE
  // Si no tiene fechaInicioCiclo, usamos una por defecto, pero lo ideal es que siempre tenga.
  const fechaInicio = recurso.fechaInicioCiclo ? new Date(recurso.fechaInicioCiclo) : new Date(fecha);

  // Calculamos días transcurridos reales
  const diasTranscurridos = Math.floor((fecha - fechaInicio) / (1000 * 60 * 60 * 24));
  if (diasTranscurridos < 0) return 0; // No ha empezado a trabajar

  // LÓGICA UNIFICADA POR CICLO (Para que el 5x2 funcione desde el día de inicio)
  if (cal.tipo === 'rotativo' || cal.config.length === 7) {
    // Si es rotativo O si tiene 7 días (como un 5x2 que se comporta como ciclo)
    const largoCiclo = cal.tipo === 'rotativo' ? (cal.cicloDias || 1) : cal.config.length;
    const diaDelCiclo = diasTranscurridos % largoCiclo;

    const configDia = cal.config[diaDelCiclo];
    return (configDia && configDia.activo) ? calcularHorasDia(configDia.bloques) : 0;
  } else {
    // Lógica semanal tradicional (Lunes es Lunes) solo si no es rotativo
    const diasMapa = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const nombreDiaReal = diasMapa[fecha.getDay()];
    const configDia = cal.config.find(c =>
      String(c.dia).toLowerCase().trim() === nombreDiaReal
    );
    return (configDia && configDia.activo) ? calcularHorasDia(configDia.bloques) : 0;
  }
}
