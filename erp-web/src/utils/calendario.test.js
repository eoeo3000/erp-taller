import { describe, it, expect } from 'vitest';
import { calcularHorasDia, obtenerHorasParaDia } from './calendario';

const dia = (iso) => ({ fechaCompleta: `${iso}T00:00:00` });

describe('calcularHorasDia', () => {
  it('suma bloques normales dentro del mismo día', () => {
    expect(calcularHorasDia([{ inicio: '08:00', fin: '17:00' }])).toBe(9);
  });

  it('suma varios bloques', () => {
    expect(calcularHorasDia([
      { inicio: '08:00', fin: '12:00' },
      { inicio: '13:00', fin: '17:30' },
    ])).toBe(8.5);
  });

  it('calcula turno que cruza medianoche sin dar horas negativas', () => {
    expect(calcularHorasDia([{ inicio: '22:00', fin: '06:00' }])).toBe(8);
  });

  it('ignora bloques incompletos', () => {
    expect(calcularHorasDia([{ inicio: '08:00' }, { fin: '17:00' }])).toBe(0);
  });

  it('devuelve 0 sin bloques', () => {
    expect(calcularHorasDia(undefined)).toBe(0);
    expect(calcularHorasDia([])).toBe(0);
  });
});

describe('obtenerHorasParaDia — ajustes manuales', () => {
  const calendarios = [];

  it('prioriza un ajuste manual en Map por sobre el calendario', () => {
    const recurso = { ajustes: new Map([['2026-03-10', 3]]) };
    expect(obtenerHorasParaDia(recurso, dia('2026-03-10'), calendarios)).toBe(3);
  });

  it('prioriza un ajuste manual en objeto plano (post-JSON) por sobre el calendario', () => {
    const recurso = { ajustes: { '2026-03-10': 5 } };
    expect(obtenerHorasParaDia(recurso, dia('2026-03-10'), calendarios)).toBe(5);
  });

  it('un ajuste de 0 horas también prevalece (no debe caer al calendario)', () => {
    const recurso = { ajustes: { '2026-03-10': 0 } };
    expect(obtenerHorasParaDia(recurso, dia('2026-03-10'), calendarios)).toBe(0);
  });
});

describe('obtenerHorasParaDia — calendario semanal', () => {
  const calendarios = [{
    _id: 'cal-semanal',
    tipo: 'semanal',
    config: [
      { dia: 'lun', activo: true, bloques: [{ inicio: '08:00', fin: '17:00' }] },
      { dia: 'mar', activo: true, bloques: [{ inicio: '08:00', fin: '17:00' }] },
      { dia: 'sáb', activo: false, bloques: [] },
    ],
  }];

  it('devuelve horas del día de la semana que corresponde (Lunes es Lunes)', () => {
    const recurso = { calendarioId: 'cal-semanal' };
    // 2026-03-09 es lunes
    expect(obtenerHorasParaDia(recurso, dia('2026-03-09'), calendarios)).toBe(9);
  });

  it('devuelve 0 si el día está marcado inactivo', () => {
    const recurso = { calendarioId: 'cal-semanal' };
    // 2026-03-14 es sábado
    expect(obtenerHorasParaDia(recurso, dia('2026-03-14'), calendarios)).toBe(0);
  });

  it('devuelve 0 si el día no está configurado (ej. domingo)', () => {
    const recurso = { calendarioId: 'cal-semanal' };
    // 2026-03-08 es domingo
    expect(obtenerHorasParaDia(recurso, dia('2026-03-08'), calendarios)).toBe(0);
  });
});

describe('obtenerHorasParaDia — calendario rotativo', () => {
  // Ciclo 4x4: 4 días de 12h activos, 4 días de descanso.
  const calendarios = [{
    _id: 'cal-4x4',
    tipo: 'rotativo',
    cicloDias: 8,
    config: [
      { activo: true, bloques: [{ inicio: '08:00', fin: '20:00' }] },
      { activo: true, bloques: [{ inicio: '08:00', fin: '20:00' }] },
      { activo: true, bloques: [{ inicio: '08:00', fin: '20:00' }] },
      { activo: true, bloques: [{ inicio: '08:00', fin: '20:00' }] },
      { activo: false, bloques: [] },
      { activo: false, bloques: [] },
      { activo: false, bloques: [] },
      { activo: false, bloques: [] },
    ],
  }];

  it('el primer día del ciclo (día de inicio) cuenta como día 0, activo', () => {
    const recurso = { calendarioId: 'cal-4x4', fechaInicioCiclo: '2026-03-01T00:00:00' };
    expect(obtenerHorasParaDia(recurso, dia('2026-03-01'), calendarios)).toBe(12);
  });

  it('el día 5 del ciclo (día 4, índice 4) cae en descanso', () => {
    const recurso = { calendarioId: 'cal-4x4', fechaInicioCiclo: '2026-03-01T00:00:00' };
    expect(obtenerHorasParaDia(recurso, dia('2026-03-05'), calendarios)).toBe(0);
  });

  it('el ciclo se repite: día 8 vuelve a ser día 0 del siguiente ciclo (activo)', () => {
    const recurso = { calendarioId: 'cal-4x4', fechaInicioCiclo: '2026-03-01T00:00:00' };
    expect(obtenerHorasParaDia(recurso, dia('2026-03-09'), calendarios)).toBe(12);
  });

  it('devuelve 0 para fechas anteriores al inicio del ciclo (no ha empezado a trabajar)', () => {
    const recurso = { calendarioId: 'cal-4x4', fechaInicioCiclo: '2026-03-01T00:00:00' };
    expect(obtenerHorasParaDia(recurso, dia('2026-02-28'), calendarios)).toBe(0);
  });
});

describe('obtenerHorasParaDia — casos borde', () => {
  it('devuelve 0 si el recurso no tiene calendarioId', () => {
    expect(obtenerHorasParaDia({}, dia('2026-03-09'), [])).toBe(0);
  });

  it('devuelve 0 si el calendarioId no matchea ningún calendario existente', () => {
    const recurso = { calendarioId: 'no-existe' };
    expect(obtenerHorasParaDia(recurso, dia('2026-03-09'), [{ _id: 'otro', config: [] }])).toBe(0);
  });
});
