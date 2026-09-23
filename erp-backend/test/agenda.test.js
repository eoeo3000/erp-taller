// Qué trabajo ve cada persona cada día (B1 en docs/bugs-conocidos.md).
//
// Son las funciones puras de asignacionController que deciden el contenido de Mi día, Mi
// semana y Mi panel en la PWA Operativa. Había tres versiones distintas del mismo cálculo en
// ese archivo y no coincidían entre sí; estas pruebas fijan la única que queda.
const test = require('node:test');
const assert = require('node:assert');
const { fechasDeTrabajo, supervisionesDesdeOTs, tareasSemanaDesdeOTs } = require('../src/controllers/asignacionController');

const diasDe = (filas) => filas.map((f) => f.fechaPlanificada).sort();

test('una OT con tareas en varios días aparece en TODOS esos días', () => {
    // El síntoma original de B1: una OT repartida en la semana solo salía el día de la
    // fecha de cabecera, y el supervisor no se enteraba del resto.
    const ot = { _id: 'ot1', tareas: [{ fecha: '2026-10-05' }, { fecha: '2026-10-07' }, { fecha: '2026-10-09' }] };

    assert.deepStrictEqual(fechasDeTrabajo(ot), ['2026-10-05', '2026-10-07', '2026-10-09']);
    const semana = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
    assert.deepStrictEqual(diasDe(supervisionesDesdeOTs([ot], semana)), ['2026-10-05', '2026-10-07', '2026-10-09']);
});

test('la fecha de cabecera NO inventa un día donde no hay ninguna tarea', () => {
    // El caso que quedaba: `fechaEjecucion` se escribe a mano desde Antecedentes y ese
    // guardado no toca `tareas[]`, así que puede apuntar a un día vacío. Antes,
    // supervisionesDesdeOTs la sumaba y el supervisor veía una fila para un día en el que no
    // tenía nada que hacer.
    const ot = { _id: 'ot1', tareas: [{ fecha: '2026-10-05' }, { fecha: '2026-10-07' }], fechaEjecucion: '2026-10-01T00:00:00Z' };

    assert.deepStrictEqual(fechasDeTrabajo(ot), ['2026-10-05', '2026-10-07']);
    assert.deepStrictEqual(diasDe(supervisionesDesdeOTs([ot], ['2026-10-01', '2026-10-05'])), ['2026-10-05']);
});

test('sin ninguna tarea con fecha, la cabecera sí vale como respaldo', () => {
    // Importante: el respaldo no se pierde. Una OT recién asignada, con fecha puesta a mano y
    // todavía sin tareas armadas, tiene que seguir apareciendo.
    const ot = { _id: 'ot1', tareas: [], fechaEjecucion: '2026-10-01T00:00:00Z' };

    assert.deepStrictEqual(fechasDeTrabajo(ot), ['2026-10-01']);
    assert.deepStrictEqual(diasDe(supervisionesDesdeOTs([ot], ['2026-10-01'])), ['2026-10-01']);
});

test('tareas sin fecha no cuentan como tareas con fecha', () => {
    // Si `tareas` existe pero ninguna tiene fecha, sigue mandando el respaldo.
    const ot = { _id: 'ot1', tareas: [{ duracion: 4 }, { fecha: '' }, { fecha: null }], fechaEjecucion: '2026-10-01T00:00:00Z' };
    assert.deepStrictEqual(fechasDeTrabajo(ot), ['2026-10-01']);
});

test('una OT sin tareas y sin fecha no aparece ningún día', () => {
    assert.deepStrictEqual(fechasDeTrabajo({ _id: 'ot1', tareas: [] }), []);
    assert.deepStrictEqual(fechasDeTrabajo({ _id: 'ot1' }), []);
    assert.deepStrictEqual(supervisionesDesdeOTs([{ _id: 'ot1' }], ['2026-10-01']), []);
});

test('dos tareas el mismo día generan UNA fila, no dos', () => {
    const ot = { _id: 'ot1', tareas: [{ fecha: '2026-10-05' }, { fecha: '2026-10-05' }] };
    assert.deepStrictEqual(fechasDeTrabajo(ot), ['2026-10-05']);
    assert.strictEqual(supervisionesDesdeOTs([ot], ['2026-10-05']).length, 1);
});

test('el contador de Mi panel y el listado de Mi día usan la misma definición', () => {
    // La contradicción que había: Mi día mostraba una fila para el día de cabecera y el
    // contador de semanas con trabajo no lo consideraba, así que números y listas no
    // cuadraban. Ahora los dos salen de fechasDeTrabajo.
    const ot = { _id: 'ot1', tareas: [{ fecha: '2026-10-07' }], fechaEjecucion: '2026-10-01T00:00:00Z' };
    const trabajaHoy = (o, hoy) => fechasDeTrabajo(o).includes(hoy);

    for (const dia of ['2026-10-01', '2026-10-07']) {
        const enElListado = supervisionesDesdeOTs([ot], [dia]).length > 0;
        assert.strictEqual(trabajaHoy(ot, dia), enElListado, `se contradicen el ${dia}`);
    }
});

test('las filas de supervisión traen lo que la PWA necesita para pintarlas', () => {
    const ot = { _id: 'ot1', tareas: [{ fecha: '2026-10-05' }] };
    const [fila] = supervisionesDesdeOTs([ot], ['2026-10-05']);
    assert.strictEqual(fila.tipo, 'supervision');
    assert.strictEqual(fila.otId, 'ot1');
    assert.strictEqual(fila.fechaPlanificada, '2026-10-05');
    assert.strictEqual(fila.estado, 'pendiente');
    assert.strictEqual(fila._id, 'ot-sup-ot1-2026-10-05', 'el id tiene que ser estable por OT y día');
});

test('la vista por tarea de Mi semana sigue saliendo de tareas[].fecha', () => {
    // tareasSemanaDesdeOTs nunca miró la cabecera y no debe empezar: necesita granularidad de
    // tarea (hora y operario) para dibujar las barras del calendario.
    const ot = {
        _id: 'ot1', numeroOT: 'OT-2026-0001', descripcion: 'Mantención',
        tareas: [
            { _id: 't1', fecha: '2026-10-05', duracion: 4, horaInicio: '08:00', operarioId: ['u1'], operarioNombre: ['Juan'] },
            { _id: 't2', fecha: '2026-10-20', duracion: 2 },
        ],
        fechaEjecucion: '2026-10-01T00:00:00Z',
    };
    const filas = tareasSemanaDesdeOTs([ot], ['2026-10-05', '2026-10-06']);

    assert.strictEqual(filas.length, 1, 'solo la tarea dentro de la semana pedida');
    assert.strictEqual(filas[0].fecha, '2026-10-05');
    assert.deepStrictEqual(filas[0].operarioId, ['u1']);
    assert.strictEqual(filas[0].duracion, 4);
});
