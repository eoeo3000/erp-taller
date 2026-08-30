import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { notificar, confirmar } from '../utils/notificar';
import { cotizacionVencida, otBloqueaCapacidad, construirMapaCarga } from '../utils/capacidad';

// Paso 6 del rediseño (ver docs/rediseno/design_handoff_panel_control/README.md §8):
// una sola grilla continua OT → tareas → capacidad (mismo grid-template-columns en las tres),
// vista semanal, panel derecho con el detalle de sobredemanda de la OT seleccionada en vez de
// un modal bloqueante. Se mantiene toda la lógica real (verificarDisponibilidad, toggleProgramada,
// confirmarProgramacion, mapaCarga). Sin emoji, un solo color de acento para las barras de tarea.

const t = {
    fondoMain: '#f6f5f2',
    superficie: '#ffffff',
    textoPrincipal: '#1a1a18',
    textoSecundario1: '#3a3a35',
    textoSecundario2: '#4a4a44',
    textoAtenuado1: '#6b6a63',
    textoAtenuado2: '#75746e',
    textoAtenuado3: '#8a8981',
    textoDeshabilitado: '#a3a29a',
    encabezadoTabla: '#e4e2dc',
    barraContexto: '#e9e7e2',
    bordeZona: 'rgba(0,0,0,.12)',
    hairlineFila: 'rgba(0,0,0,.06)',
    hairlineBloque: 'rgba(0,0,0,.10)',
    acento: 'oklch(0.48 0.10 250)',
    acentoHover: 'oklch(0.40 0.10 250)',
    verde: 'oklch(0.48 0.10 155)',
    rojo: 'oklch(0.52 0.13 25)',
    cargaOk: '#eef4ef',
    cargaExceso: '#fbeceb',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontMono: 'ui-monospace, Menlo, monospace',
};

const DIAS_L = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const GRID = '118px minmax(180px,1fr) 132px 104px 52px 62px 62px repeat(7, minmax(0,1fr))';
const ESTADOS_EJECUTADOS = ['Trabajo Terminado', 'Con Informe', 'Pagada'];

// cotizacionVencida/otBloqueaCapacidad viven en utils/capacidad.js — compartidas con
// TabTareas (Tratamiento), que ahora avisa de conflictos de disponibilidad al elegir
// responsables con el mismo criterio, en vez de que solo se note acá en Programación.

const colorEstadoOT = (estado) => {
    if (ESTADOS_EJECUTADOS.includes(estado)) return t.textoAtenuado1;
    if (estado === 'Reprogramar') return t.rojo;
    if (estado === 'En Ejecución') return t.verde;
    if (estado === 'Programada') return t.acento;
    return t.textoSecundario2;
};

const GanttScreen = ({ recursos = [], ots = [], calendarios = [], obtenerHorasParaDia, actualizarOtGlobal, cargarDatos }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // Días con al menos una tarea asignada, para poder navegar semanas hacia atrás/adelante.
    const diasConTareas = [];
    ots.forEach(ot => ot.tareas?.forEach(tt => { if (tt.fecha) diasConTareas.push(tt.fecha); }));

    const mapaCarga = construirMapaCarga(ots);

    // Semanas disponibles: las que tienen tareas + la semana actual (siempre visible, aunque esté vacía).
    const obtenerSemanas = () => {
        const hoyISO = new Date().toISOString().split('T')[0];
        const vistas = new Map();
        [...diasConTareas, hoyISO].forEach(d => {
            const fecha = new Date(d + 'T00:00:00');
            const diaSemana = fecha.getDay();
            const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
            const lunes = new Date(fecha);
            lunes.setDate(fecha.getDate() + diffLunes);
            const lunesISO = lunes.toISOString().split('T')[0];
            if (vistas.has(lunesISO)) return;
            const dias7 = Array.from({ length: 7 }, (_, i) => {
                const dia = new Date(lunes); dia.setDate(lunes.getDate() + i);
                return dia.toISOString().split('T')[0];
            });
            const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
            const primerJueves = new Date(lunes.getFullYear(), 0, 4);
            const numSem = Math.round(((lunes - primerJueves) / 86400000 + primerJueves.getDay() + 6) / 7) + 1;
            vistas.set(lunesISO, {
                key: lunesISO, num: numSem,
                label: `${lunes.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} – ${domingo.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`,
                dias: dias7,
            });
        });
        return Array.from(vistas.values()).sort((a, b) => a.key.localeCompare(b.key));
    };

    const semanas = obtenerSemanas();
    const hoyISO = new Date().toISOString().split('T')[0];
    const semanaHoyIdx = semanas.findIndex(s => s.dias.includes(hoyISO));
    // Al volver de "Ir a Programación" (bloqueoCotizacion, Tratamiento) con una OT recién
    // planificada (location.state._volverAOT), esa OT normalmente tiene tareas en una semana
    // FUTURA — abrir en la semana de hoy dejaba la fila de la OT en "0 h" (horasSemana se
    // filtra por diasSemana) hasta que alguien se acordara de tocar "Semana siguiente". Se
    // arranca directo en la semana de la primera tarea de esa OT si existe.
    const idxSemanaInicial = () => {
        const idDestino = location.state?._volverAOT;
        const otDestino = idDestino && ots.find(o => String(o._id) === String(idDestino));
        const primeraFecha = otDestino && (otDestino.tareas || []).map(tt => tt.fecha).filter(Boolean).sort()[0];
        if (primeraFecha) {
            const idx = semanas.findIndex(s => s.dias.includes(primeraFecha));
            if (idx >= 0) return idx;
        }
        return Math.max(0, semanaHoyIdx);
    };
    const [idxSemana, setIdxSemana] = useState(idxSemanaInicial);
    const semanaActual = semanas[idxSemana] || null;
    const diasSemana = semanaActual?.dias || [];

    const [otSel, setOtSel] = useState(null);
    // Overlay de carga mientras se confirma capacidad y se vuelve a Tratamiento — el guardado
    // (actualizarOtGlobal) más la navegación tardan lo suficiente en producción como para que,
    // sin ningún indicador, el clic pareciera no haber hecho nada.
    const [confirmandoCapacidad, setConfirmandoCapacidad] = useState(false);
    const [asideOculta, setAsideOculta] = useState(false);
    // Mejora v3 #3 — "Por operario" es exactamente lo que ya existía (sin cambios); "Por OT"
    // y "Por supervisor" son vistas nuevas, agregadas por OT/persona en vez de por tarea.
    const [modoVista, setModoVista] = useState('ot');
    const esSupervisor = (r) => /supervisor/i.test(r.puesto || ''); // mismo criterio que otController.antecedentes
    const LIMITE_ASIGNACIONES = (r) => (r.senior ? 6 : 5); // confirmado con el usuario

    // Preselecciona la OT recibida por navegación (ej. desde el aviso "Requiere programar
    // la OT" de la pestaña Cotización de Tratamiento, ver location.state._volverAOT) — si no
    // vino ninguna, cae en la primera OT visible para que el panel no arranque vacío.
    useEffect(() => {
        if (otSel) return;
        const idDestino = location.state?._volverAOT;
        const preseleccion = idDestino && ots.find(o => String(o._id) === String(idDestino));
        setOtSel(preseleccion || ots[0] || null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ots]);

    const capacidadDia = (recurso, dia) => obtenerHorasParaDia ? obtenerHorasParaDia(recurso, { fechaCompleta: new Date(dia + 'T00:00:00') }) : 8;

    // Mejora v3 #3 — datos agregados para "Por OT" / "Por supervisor". Se apoyan en
    // OT.supervisorId (Recurso), no en Asignacion: es simplificación deliberada — cuenta
    // supervisión de OT ya creadas, no evaluaciones que todavía son solo Solicitud.
    // "Asignaciones" es por semana (pedido explícito del usuario) — antes contaba TODAS las OT
    // activas del supervisor sin importar la semana que se estuviera mirando, lo que se veía
    // contradictorio: "1 de 5 asignaciones" en una semana donde ninguna tarea suya caía (0h,
    // sin celdas marcadas). Ahora solo cuenta si la OT tiene al menos una tarea en diasSemana.
    const supervisoresRecursos = recursos.filter(esSupervisor);
    const otsActivasDe = (recursoId) => ots.filter(ot =>
        String(ot.supervisorId) === String(recursoId) && otBloqueaCapacidad(ot)
        && (ot.tareas || []).some(tt => diasSemana.includes(tt.fecha))
    );
    const diasOcupadosPorSupervisor = (recursoId) => {
        const mapa = {};
        otsActivasDe(recursoId).forEach(ot => {
            (ot.tareas || []).forEach(tt => { if (tt.fecha && diasSemana.includes(tt.fecha)) mapa[tt.fecha] = (mapa[tt.fecha] || 0) + 1; });
        });
        return mapa;
    };

    const verificarDisponibilidad = (ot) => {
        const conflictos = [];
        (ot.tareas || []).forEach(tt => {
            if (!tt.fecha) return;
            const ids = Array.isArray(tt.operarioId) ? tt.operarioId : [tt.operarioId];
            ids.forEach(id => {
                if (!id) return;
                const recurso = recursos.find(r => String(r._id) === String(id));
                if (!recurso) return;
                const cargaTotal = mapaCarga[`${String(id)}-${tt.fecha}`] || 0;
                const capacidad = capacidadDia(recurso, tt.fecha);
                if (cargaTotal > capacidad) conflictos.push({ nombre: recurso.nombre, fecha: tt.fecha, carga: cargaTotal, capacidad, deficit: cargaTotal - capacidad });
            });
        });
        const vistos = new Set();
        return conflictos.filter(c => {
            const key = `${c.nombre}-${c.fecha}`;
            if (vistos.has(key)) return false;
            vistos.add(key); return true;
        });
    };

    // Fechas que se le van a proponer al cliente en la cotización: derivadas de las tareas ya
    // cargadas en Tratamiento (no hay UI de edición de fechas acá, no hace falta — Gantt es
    // solo el punto donde se verifica que esas fechas son viables antes de cotizar).
    const fechasPropuestasDe = (ot) => {
        const fechas = (ot.tareas || []).map(tt => tt.fecha).filter(Boolean).sort();
        return fechas.length ? { inicio: fechas[0], fin: fechas[fechas.length - 1] } : null;
    };

    // Este botón dejó de fijar 'Programada' directamente (eso ahora lo hace el cliente al
    // aprobar la cotización, ver otController.responderCotizacionCliente) — acá solo se
    // verifica capacidad y se registran las fechas propuestas, gate obligatorio antes de
    // poder enviar la cotización desde Tratamiento (cotizacion.capacidadVerificada).
    // El aviso de sobredemanda usa el modal global de confirmar() (no un panel dentro del
    // aside): un panel lateral se puede quedar colapsado o fuera de foco y el clic parecía
    // "no hacer nada" — el modal siempre es visible sin importar el estado del aside.
    const confirmarCapacidad = async (ot) => {
        setOtSel(ot);
        if (!(ot.tareas || []).some(tt => tt.fecha && Number(tt.duracion) > 0)) {
            notificar.advertencia('Esta OT no tiene tareas con fecha y horas asignadas — complétalas en Tratamiento antes de verificar capacidad.');
            return;
        }
        // Antes esto solo pedía confirmación cuando ya había sobrecarga detectada — el pedido
        // fue que "aceptar programación" siempre deje explícito revisar capacidad del personal,
        // no solo avisar cuando el sistema ya encontró un problema.
        const conflictos = verificarDisponibilidad(ot);
        if (conflictos.length > 0) {
            const detalle = conflictos.map(c => `${c.nombre} el ${c.fecha} (+${c.deficit}h sobre su capacidad)`).join('; ');
            const continuar = await confirmar(`Esto deja responsables sobre su capacidad: ${detalle}. ¿Confirmar igual?`);
            if (!continuar) return;
        } else {
            const continuar = await confirmar(
                'Vas a aceptar la programación de esta OT. Revisa que el personal asignado tenga capacidad disponible en las fechas indicadas. ¿Confirmar?',
                { danger: false, textoConfirmar: 'Aceptar programación' },
            );
            if (!continuar) return;
        }

        setConfirmandoCapacidad(true);
        const fechasPropuestas = fechasPropuestasDe(ot);
        const resultado = await actualizarOtGlobal(ot._id, {
            'cotizacion.capacidadVerificada': true,
            'cotizacion.fechaVerificacion': new Date().toISOString(),
            ...(fechasPropuestas ? {
                'cotizacion.fechasPropuestas.inicio': fechasPropuestas.inicio,
                'cotizacion.fechasPropuestas.fin': fechasPropuestas.fin,
            } : {}),
            // Reprogramar (S3, PWA Operativa) SÍ vuelve a pasar por aprobación del cliente: la
            // fecha cambió, así que hay que ofrecérsela de nuevo antes de comprometerla. En vez
            // de inventar un circuito aparte, se reusa el mismo que ya existe para la cotización
            // inicial — volver a 'Planificada' habilita "Enviar cotización" en Tratamiento (que
            // resetea cotizacion.respuestaCliente a 'Pendiente'), el cliente la ve en "Por
            // aprobar" en la app, y al aprobarla el propio aplicarRespuestaCotizacion la manda a
            // 'Programada' — nada de esto hay que reimplementarlo acá.
            ...(ot.estado === 'Reprogramar' ? { estado: 'Planificada' } : {}),
        });
        if (!resultado?.exito) {
            setConfirmandoCapacidad(false);
            notificar.error(resultado?.error || 'No se pudo confirmar la capacidad.');
            return;
        }
        if (cargarDatos) cargarDatos();

        // Siempre vuelve a la pestaña Cotización con la OT ya actualizada — antes solo lo
        // hacía si se había llegado acá desde el aviso "Requiere programar la OT" de
        // Tratamiento (location.state._volverATab), así que entrando a Programación por
        // cualquier otro camino (el menú, por ejemplo) "Aceptar programación" se quedaba en
        // el Gantt sin ninguna forma obvia de continuar a enviar la cotización.
        // No hace falta apagar confirmandoCapacidad acá: navigate() desmonta esta pantalla.
        navigate('/tratamiento', { state: { ...resultado.otActualizada, _tabDestino: 'cotizacion' } });
    };

    // Escape hatch operativo: no hay forma en la UI de volver una OT de 'Programada' a
    // 'Planificada' ahora que ese paso lo dispara la aprobación del cliente — por si el
    // cliente cancela verbalmente después de haber aprobado.
    const revertirAPlanificada = async (ot) => {
        if (!(await confirmar('¿Revertir esta OT a Planificada? Se perderá el estado Programada.'))) return;
        const resultado = await actualizarOtGlobal(ot._id, { estado: 'Planificada' });
        if (!resultado?.exito) { notificar.error(resultado?.error || 'No se pudo revertir la OT.'); return; }
        if (cargarDatos) cargarDatos();
    };

    const conflictosSel = otSel ? verificarDisponibilidad(otSel) : [];

    return (
        <div style={styles.raiz}>
            {confirmandoCapacidad && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(246,245,242,.85)' }}>
                    <style>{'@keyframes girarSpinner { to { transform: rotate(360deg); } }'}</style>
                    <span style={{ width: 34, height: 34, borderRadius: '50%', border: `3px solid ${t.hairlineBloque}`, borderTopColor: t.acento, animation: 'girarSpinner .7s linear infinite' }} />
                    <span style={{ fontSize: 12, color: t.textoSecundario1 }}>Confirmando programación…</span>
                </div>
            )}
            <header style={styles.header}>
                <h1 style={styles.h1}>Programación</h1>
                <span style={styles.subtitulo}>Plano de ejecución y capacidad real del taller</span>
            </header>

            <div style={styles.barraContexto}>
                <button onClick={() => setIdxSemana(i => Math.max(0, i - 1))} disabled={idxSemana === 0} style={{ ...styles.btnSecundario, opacity: idxSemana === 0 ? .5 : 1 }}>Semana anterior</button>
                <span style={{ fontFamily: t.fontMono, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{semanaActual ? `Semana ${semanaActual.num} · ${semanaActual.label}` : '—'}</span>
                <button onClick={() => setIdxSemana(i => Math.min(semanas.length - 1, i + 1))} disabled={idxSemana >= semanas.length - 1} style={{ ...styles.btnSecundario, opacity: idxSemana >= semanas.length - 1 ? .5 : 1 }}>Semana siguiente</button>
                <div style={{ display: 'flex', gap: 4, marginLeft: 14 }}>
                    {[['todo', 'Ver todo'], ['ot', 'Por OT'], ['supervisor', 'Por supervisor']].map(([m, label]) => (
                        <button key={m} onClick={() => setModoVista(m)} style={modoVista === m ? styles.segActivo : styles.segInactivo}>{label}</button>
                    ))}
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: t.textoAtenuado3 }}>La barra roja marca tarea o día sobre capacidad</span>
            </div>

            <div style={styles.cuerpo}>
                <section style={styles.scrollTabla}>
                    <div style={{ minWidth: 1228 }}>
                        <div style={styles.filaHeader}>
                            <span style={styles.thCol}>{modoVista === 'supervisor' ? 'Supervisor' : 'OT · N°'}</span>
                            <span style={styles.thCol}>{modoVista === 'todo' ? 'Tarea / descripción' : 'Detalle'}</span>
                            <span style={styles.thCol}>{modoVista === 'ot' ? 'Supervisor' : modoVista === 'supervisor' ? 'Carga' : 'Responsable'}</span>
                            <span style={styles.thCol}>Estado</span>
                            <span style={{ ...styles.thCol, textAlign: 'right' }}>Hrs</span>
                            <span style={{ ...styles.thCol, textAlign: 'right' }}>Inicio</span>
                            <span style={{ ...styles.thCol, textAlign: 'right' }}>Fin</span>
                            {diasSemana.map(dia => {
                                const f = new Date(dia + 'T00:00:00');
                                const esFinde = f.getDay() === 0 || f.getDay() === 6;
                                return (
                                    <span key={dia} style={{ height: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: esFinde ? '#dedcd5' : t.encabezadoTabla, borderLeft: `1px solid ${t.hairlineFila}` }}>
                                        <span style={{ fontSize: 8.5, color: t.textoAtenuado3, letterSpacing: '.06em' }}>{DIAS_L[f.getDay() === 0 ? 6 : f.getDay() - 1]}</span>
                                        <span style={{ fontFamily: t.fontMono, fontSize: 10, fontWeight: 600 }}>{f.getDate()}</span>
                                    </span>
                                );
                            })}
                        </div>

                        {/* "Ver todo" queda con solo esto (OT + tareas + disponibilidad de personal,
                            antes era la vista "Por operario") — se sacan "Por OT" y "Por supervisor"
                            de acá abajo, pedido explícito del usuario; "Por operario" deja de ser una
                            vista aparte porque su contenido es exactamente este. */}
                        {modoVista === 'todo' && <>
                        {/* marginTop:0 acá — es la primera fila justo debajo del encabezado
                            sticky; el marginTop normal de filaSeccion (para separarla de las
                            filas de la sección anterior) dejaba un hueco en blanco sin nada que
                            separar todavía. */}
                        <div style={{ ...styles.filaSeccion, marginTop: 0 }}>OT y tareas</div>
                        {ots.map(ot => {
                            const estaEjecutado = ESTADOS_EJECUTADOS.includes(ot.estado);
                            // 'Reprogramar' entra acá también: sus tareas se editaron con fecha
                            // nueva en Tratamiento y necesita el mismo gate de capacidad que una
                            // OT que nunca se envió — confirmarCapacidad la devuelve a 'Programada'.
                            const estadoValido = ['Planificada', 'Programada', 'Reprogramar'].includes(ot.estado);
                            // Sin tareas con fecha Y horas (duracion > 0) no hay nada real que
                            // verificar: verificarDisponibilidad/fechasPropuestasDe suman duracion
                            // por tarea, así que una tarea con fecha pero 0 HH "confirmaría"
                            // trivialmente sin comprometer ninguna capacidad real.
                            const tieneTareasConFecha = (ot.tareas || []).some(tt => tt.fecha && Number(tt.duracion) > 0);
                            // Cancelada por el cliente: nunca programable, aunque ot.estado siga
                            // siendo uno de los "válidos" de arriba (ver otBloqueaCapacidad).
                            const puedeProgramar = estadoValido && tieneTareasConFecha && !ot.cancelada?.activa;
                            const capacidadVerificada = !!ot.cotizacion?.capacidadVerificada;
                            const fechasTareas = (ot.tareas || []).filter(tt => tt.fecha).map(tt => tt.fecha).sort();
                            const fmtFecha = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : '—';
                            const enSemana = diasSemana.some(d => fechasTareas.includes(d));
                            const accionLabel = ot.cancelada?.activa ? 'Cancelada' : !puedeProgramar ? 'No disponible' : ot.estado === 'Reprogramar' ? 'Confirmar fecha nueva' : capacidadVerificada ? 'Reconfirmar programación' : 'Aceptar programación';
                            const tituloAccion = ot.cancelada?.activa
                                ? 'Esta OT fue cancelada por el cliente.'
                                : !estadoValido
                                ? 'La OT debe estar Planificada, Programada o Reprogramar'
                                : !tieneTareasConFecha
                                    ? 'Agrega tareas con fecha y horas asignadas en Tratamiento antes de verificar capacidad'
                                    : '';
                            const horasSemana = (ot.tareas || []).filter(tt => diasSemana.includes(tt.fecha)).reduce((a, tt) => a + (Number(tt.duracion) || 0), 0);
                            return (
                                <React.Fragment key={ot._id}>
                                    <div style={{ ...styles.filaOT, background: otSel?._id === ot._id ? '#f0efeb' : enSemana ? t.fondoMain : t.superficie }} onClick={() => setOtSel(ot)}>
                                        <span style={{ ...styles.celda, borderLeft: `2px solid ${otSel?._id === ot._id ? '#1c1d1b' : 'transparent'}` }}>
                                            <span onClick={(e) => { e.stopPropagation(); navigate('/tratamiento', { state: ot }); }} style={{ fontFamily: t.fontMono, fontSize: 11, fontWeight: 600, color: t.acento, cursor: 'pointer' }}>{ot.numeroOT || 'S/N'}</span>
                                        </span>
                                        <span style={{ ...styles.celda, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{ot.solicitante || 'Cliente'}</span>
                                            <span style={{ fontSize: 10.5, color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{ot.descripcion || ''}</span>
                                        </span>
                                        <span style={{ ...styles.celda, fontSize: 10.5, fontWeight: 600, color: colorEstadoOT(ot.estado) }}>
                                            {ot.estado === 'Reprogramar' ? (
                                                <span
                                                    onClick={(e) => { e.stopPropagation(); navigate('/tratamiento', { state: { ...ot, _tabDestino: 'tareas' } }); }}
                                                    title="Ir a Tareas para asignar una fecha nueva"
                                                    style={{ textDecoration: 'underline', cursor: 'pointer' }}
                                                >{ot.estado}</span>
                                            ) : ot.estado}
                                            {ot.subEstado === 'Replanificar' && (
                                                <span title="Replanificar: necesita revisión de alcance/recursos" style={{ marginLeft: 4, color: t.rojo }}>●</span>
                                            )}
                                            {cotizacionVencida(ot) && (
                                                <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: t.rojo, letterSpacing: '.04em' }}>VENCIDA</span>
                                            )}
                                        </span>
                                        <span style={styles.celda}>
                                            {estaEjecutado ? null : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (puedeProgramar) confirmarCapacidad(ot); }}
                                                    disabled={!puedeProgramar}
                                                    title={tituloAccion}
                                                    style={{ ...styles.btnAccionFila, ...(puedeProgramar ? {} : { opacity: .5, cursor: 'not-allowed' }) }}
                                                >{accionLabel}</button>
                                            )}
                                        </span>
                                        <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 11 }}>{`${horasSemana} h`}</span>
                                        <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 10.5, color: t.textoSecundario1 }}>{fmtFecha(fechasTareas[0])}</span>
                                        <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 10.5, color: t.textoSecundario1, borderRight: `1px solid ${t.hairlineBloque}` }}>{fmtFecha(fechasTareas[fechasTareas.length - 1])}</span>
                                        {diasSemana.map(dia => {
                                            const f = new Date(dia + 'T00:00:00');
                                            const esFinde = f.getDay() === 0 || f.getDay() === 6;
                                            return <span key={dia} style={{ minWidth: 0, overflow: 'hidden', borderLeft: `1px solid ${t.hairlineFila}`, background: esFinde ? '#f4f3ef' : 'transparent' }} />;
                                        })}
                                    </div>

                                    {/* Todas las tareas de la OT, no solo las de esta semana (antes el
                                        filtro por diasSemana dejaba la OT sin ninguna tarea visible
                                        debajo cuando sus fechas caían fuera de la semana mostrada,
                                        pedido explícito del usuario). La barra de días más abajo sigue
                                        marcando solo si tarea.fecha cae en la semana visible. */}
                                    {(ot.tareas || []).slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map((tarea, tIdx) => (
                                        <div key={`${ot._id}-${tIdx}`} style={styles.filaTarea}>
                                            <span style={{ ...styles.celda, paddingLeft: 24, fontFamily: t.fontMono, fontSize: 10.5, color: t.textoDeshabilitado }}>{tIdx + 1}</span>
                                            <span style={{ ...styles.celda, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tarea.descripcion}</span>
                                            <span style={{ ...styles.celda, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
                                                <span style={{ fontSize: 11, color: t.textoSecundario1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{(tarea.operarioNombre || []).join(', ') || 'Sin asignar'}</span>
                                                <span style={{ fontSize: 10, color: t.textoDeshabilitado, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{tarea.puesto}</span>
                                            </span>
                                            <span style={styles.celda} />
                                            <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 11 }}>{tarea.duracion}h</span>
                                            <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 10.5, color: t.textoSecundario1 }}>{tarea.fecha ? new Date(tarea.fecha + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : ''}</span>
                                            <span style={{ ...styles.celda, borderRight: `1px solid ${t.hairlineBloque}` }} />
                                            {diasSemana.map(dia => {
                                                const hay = tarea.fecha === dia;
                                                const f = new Date(dia + 'T00:00:00');
                                                const esFinde = f.getDay() === 0 || f.getDay() === 6;
                                                let hayExceso = false;
                                                if (hay) {
                                                    const ids = Array.isArray(tarea.operarioId) ? tarea.operarioId : [tarea.operarioId];
                                                    hayExceso = ids.some(id => {
                                                        if (!id) return false;
                                                        const rec = recursos.find(r => String(r._id) === String(id));
                                                        if (!rec) return false;
                                                        return (mapaCarga[`${String(id)}-${dia}`] || 0) > capacidadDia(rec, dia);
                                                    });
                                                }
                                                return (
                                                    <span key={dia} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden', padding: 4, borderLeft: `1px solid ${t.hairlineFila}`, background: esFinde ? '#f4f3ef' : 'transparent' }}>
                                                        {hay && (
                                                            <span style={{ width: '100%', height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap', background: hayExceso ? t.rojo : t.acento, color: '#fff', fontFamily: t.fontMono, fontSize: 10, fontWeight: 600, borderRadius: 2 }}>
                                                                {tarea.hora || ''} · {tarea.duracion}h
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </React.Fragment>
                            );
                        })}

                        <div style={styles.filaSeccion}>Disponibilidad de personal · carga / capacidad</div>

                        {recursos.map(recurso => {
                            const cal = calendarios.find(c => String(c._id) === String(recurso.calendarioId));
                            const sumaCarga = diasSemana.reduce((acc, dia) => acc + (mapaCarga[`${String(recurso._id)}-${dia}`] || 0), 0);
                            const sumaCapacidad = diasSemana.reduce((acc, dia) => acc + capacidadDia(recurso, dia), 0);
                            const pct = sumaCapacidad > 0 ? Math.min(100, Math.round((sumaCarga / sumaCapacidad) * 100)) : 0;
                            const colorBarra = sumaCarga > sumaCapacidad ? t.rojo : sumaCarga > 0 ? t.verde : t.textoDeshabilitado;
                            const colorResumen = sumaCarga > sumaCapacidad ? t.rojo : t.textoPrincipal;
                            return (
                                <div key={recurso._id} style={styles.filaCapacidad}>
                                    <span style={{ ...styles.celda, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{recurso.nombre}</span>
                                    <span style={{ ...styles.celda, flexDirection: 'column', justifyContent: 'center', gap: 3, overflow: 'hidden' }}>
                                        <span style={{ display: 'flex', gap: 8, width: '100%', fontSize: 10.5, color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                            <span style={{ flex: 'none' }}>{recurso.puesto}</span>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cal?.nombre || 'Sin turno'}</span>
                                        </span>
                                        <span style={{ display: 'block', height: 3, width: '100%', background: 'rgba(0,0,0,.09)' }}>
                                            <span style={{ display: 'block', height: 3, background: colorBarra, width: `${pct}%` }} />
                                        </span>
                                    </span>
                                    <span style={{ ...styles.celda, fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 600, color: colorResumen }}>{sumaCarga} / {sumaCapacidad} h · {pct} %</span>
                                    <span style={styles.celda} /><span style={styles.celda} /><span style={styles.celda} />
                                    <span style={{ ...styles.celda, borderRight: `1px solid ${t.hairlineBloque}` }} />
                                    {diasSemana.map(dia => {
                                        const carga = mapaCarga[`${String(recurso._id)}-${dia}`] || 0;
                                        const capacidad = capacidadDia(recurso, dia);
                                        const exceso = carga > capacidad;
                                        const sinDato = capacidad === 0 && carga === 0;
                                        const f = new Date(dia + 'T00:00:00');
                                        const esFinde = f.getDay() === 0 || f.getDay() === 6;
                                        return (
                                            <span key={dia} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 32, minWidth: 0, overflow: 'hidden', background: exceso ? t.cargaExceso : carga > 0 ? t.cargaOk : (esFinde ? '#f4f3ef' : 'transparent'), borderLeft: `1px solid ${t.hairlineFila}`, fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 600, color: exceso ? t.rojo : carga > 0 ? t.textoPrincipal : t.textoDeshabilitado }}>
                                                {sinDato ? '·' : `${carga} / ${capacidad}`}
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        })}

                        {/* Faltaba en "Ver todo" — pedido explícito del usuario, la capacidad de
                            los supervisores no se veía usada acá aunque sí en "Por OT"/"Por
                            supervisor". Mismo componente que las otras dos vistas. */}
                        <div style={styles.filaSeccion}>Carga de supervisores · asignaciones / capacidad</div>
                        {supervisoresRecursos.map(r => <FilaCargaSupervisor key={r._id} recurso={r} diasSemana={diasSemana} otsActivasDe={otsActivasDe} diasOcupadosPorSupervisor={diasOcupadosPorSupervisor} limite={LIMITE_ASIGNACIONES(r)} />)}
                        </>}

                        {modoVista === 'ot' && <>
                        {ots.map(ot => {
                            const supervisor = recursos.find(r => String(r._id) === String(ot.supervisorId));
                            const fechasTareas = (ot.tareas || []).filter(tt => tt.fecha).map(tt => tt.fecha).sort();
                            const enSemana = diasSemana.some(d => fechasTareas.includes(d));
                            const horasSemana = (ot.tareas || []).filter(tt => diasSemana.includes(tt.fecha)).reduce((a, tt) => a + (Number(tt.duracion) || 0), 0);
                            const fmtFecha = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : '—';
                            return (
                                <div key={ot._id} style={{ ...styles.filaOT, background: otSel?._id === ot._id ? '#f0efeb' : enSemana ? t.fondoMain : t.superficie }} onClick={() => setOtSel(ot)}>
                                    <span style={{ ...styles.celda, borderLeft: `2px solid ${otSel?._id === ot._id ? '#1c1d1b' : 'transparent'}` }}>
                                        <span onClick={(e) => { e.stopPropagation(); navigate('/tratamiento', { state: ot }); }} style={{ fontFamily: t.fontMono, fontSize: 11, fontWeight: 600, color: t.acento, cursor: 'pointer' }}>{ot.numeroOT || 'S/N'}</span>
                                    </span>
                                    <span style={{ ...styles.celda, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{ot.solicitante || 'Cliente'}</span>
                                        <span style={{ fontSize: 10.5, color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{ot.descripcion || ''}</span>
                                    </span>
                                    <span style={{ ...styles.celda, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
                                        <span style={{ fontSize: 11, color: t.textoSecundario1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{supervisor?.nombre || <span style={{ color: t.textoDeshabilitado }}>Sin supervisor</span>}</span>
                                        <span style={{ fontSize: 10, color: t.textoDeshabilitado, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{supervisor?.puesto || ''}</span>
                                    </span>
                                    <span style={{ ...styles.celda, fontSize: 10.5, fontWeight: 600, color: colorEstadoOT(ot.estado) }}>
                                        {ot.estado === 'Reprogramar' ? (
                                            <span
                                                onClick={(e) => { e.stopPropagation(); navigate('/tratamiento', { state: { ...ot, _tabDestino: 'tareas' } }); }}
                                                title="Ir a Tareas para asignar una fecha nueva"
                                                style={{ textDecoration: 'underline', cursor: 'pointer' }}
                                            >{ot.estado}</span>
                                        ) : ot.estado}
                                        {ot.subEstado === 'Replanificar' && (
                                            <span title="Replanificar: necesita revisión de alcance/recursos" style={{ marginLeft: 4, color: t.rojo }}>●</span>
                                        )}
                                        {cotizacionVencida(ot) && (
                                            <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: t.rojo, letterSpacing: '.04em' }}>VENCIDA</span>
                                        )}
                                    </span>
                                    <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 11 }}>{`${horasSemana} h`}</span>
                                    <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 10.5, color: t.textoSecundario1 }}>{fmtFecha(fechasTareas[0])}</span>
                                    <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 10.5, color: t.textoSecundario1, borderRight: `1px solid ${t.hairlineBloque}` }}>{fmtFecha(fechasTareas[fechasTareas.length - 1])}</span>
                                    {diasSemana.map(dia => {
                                        const hay = fechasTareas.includes(dia);
                                        const f = new Date(dia + 'T00:00:00');
                                        const esFinde = f.getDay() === 0 || f.getDay() === 6;
                                        return (
                                            <span key={dia} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden', padding: 4, borderLeft: `1px solid ${t.hairlineFila}`, background: esFinde ? '#f4f3ef' : 'transparent' }}>
                                                {hay && (
                                                    <span style={{ width: '100%', height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: t.acento, color: '#fff', fontFamily: t.fontMono, fontSize: 10, fontWeight: 600, borderRadius: 2 }} />
                                                )}
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        {modoVista === 'ot' && <>
                        <div style={styles.filaSeccion}>Carga de supervisores · asignaciones / capacidad</div>
                        {supervisoresRecursos.map(r => <FilaCargaSupervisor key={r._id} recurso={r} diasSemana={diasSemana} otsActivasDe={otsActivasDe} diasOcupadosPorSupervisor={diasOcupadosPorSupervisor} limite={LIMITE_ASIGNACIONES(r)} />)}
                        </>}
                        </>}

                        {modoVista === 'supervisor' && <>
                        {supervisoresRecursos.map(r => {
                            const activas = otsActivasDe(r._id);
                            const ocupados = diasOcupadosPorSupervisor(r._id);
                            const horasSemana = activas.reduce((acc, ot) => acc + (ot.tareas || []).filter(tt => diasSemana.includes(tt.fecha)).reduce((a, tt) => a + (Number(tt.duracion) || 0), 0), 0);
                            const fechas = activas.flatMap(ot => (ot.tareas || []).filter(tt => tt.fecha).map(tt => tt.fecha)).sort();
                            const fmtFecha = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : '—';
                            return (
                                <div key={r._id} style={{ ...styles.filaOT, cursor: 'default' }}>
                                    <span style={styles.celda}><span style={{ fontSize: 12, fontWeight: 700 }}>{r.nombre}</span></span>
                                    <span style={{ ...styles.celda, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
                                        <span style={{ fontSize: 11, color: t.textoSecundario1 }}>{r.puesto}{r.senior ? ' · senior' : ''}</span>
                                        <span style={{ fontSize: 10, color: t.textoDeshabilitado }}>{activas.length} de {LIMITE_ASIGNACIONES(r)} asignaciones</span>
                                    </span>
                                    <span style={{ ...styles.celda, fontFamily: t.fontMono, fontSize: 11, fontWeight: 600, color: activas.length > LIMITE_ASIGNACIONES(r) ? t.rojo : t.acento }}>{Math.round((activas.length / LIMITE_ASIGNACIONES(r)) * 100)}%</span>
                                    <span style={{ ...styles.celda, fontSize: 10.5, fontWeight: 600, color: activas.length > LIMITE_ASIGNACIONES(r) ? t.rojo : t.textoSecundario1 }}>{activas.length > LIMITE_ASIGNACIONES(r) ? 'Sobrecarga' : activas.length > 0 ? 'Al día' : 'Disponible'}</span>
                                    <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 11 }}>{`${horasSemana} h`}</span>
                                    <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 10.5, color: t.textoSecundario1 }}>{fmtFecha(fechas[0])}</span>
                                    <span style={{ ...styles.celda, justifyContent: 'flex-end', fontFamily: t.fontMono, fontSize: 10.5, color: t.textoSecundario1, borderRight: `1px solid ${t.hairlineBloque}` }}>{fmtFecha(fechas[fechas.length - 1])}</span>
                                    {diasSemana.map(dia => {
                                        const n = ocupados[dia] || 0;
                                        const f = new Date(dia + 'T00:00:00');
                                        const esFinde = f.getDay() === 0 || f.getDay() === 6;
                                        const sobre = n > LIMITE_ASIGNACIONES(r);
                                        return (
                                            <span key={dia} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 34, minWidth: 0, overflow: 'hidden', padding: 4, borderLeft: `1px solid ${t.hairlineFila}`, background: sobre ? t.cargaExceso : esFinde ? '#f4f3ef' : 'transparent' }}>
                                                {n > 0 && <span style={{ fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 600, color: sobre ? t.rojo : t.textoPrincipal }}>{n}</span>}
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        <div style={styles.filaSeccion}>Carga de supervisores · asignaciones / capacidad</div>
                        {supervisoresRecursos.map(r => <FilaCargaSupervisor key={r._id} recurso={r} diasSemana={diasSemana} otsActivasDe={otsActivasDe} diasOcupadosPorSupervisor={diasOcupadosPorSupervisor} limite={LIMITE_ASIGNACIONES(r)} />)}
                        </>}
                    </div>
                </section>

                <div
                    onClick={() => setAsideOculta(v => !v)}
                    title={asideOculta ? 'Mostrar panel de detalle' : 'Ocultar panel de detalle'}
                    style={styles.asideTira}
                >
                    {asideOculta ? '‹' : '›'}
                </div>

                {!asideOculta && (
                    <aside style={styles.aside}>
                        {!otSel ? (
                            <div style={{ padding: 16, color: t.textoAtenuado3, fontSize: 12.5, textAlign: 'center' }}>Selecciona una OT para ver el detalle.</div>
                        ) : (
                            <>
                                <div style={styles.asideHeader}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                        <span style={{ fontFamily: t.fontMono, fontSize: 12, fontWeight: 600 }}>{otSel.numeroOT || 'S/N'}</span>
                                        <span style={{ fontSize: 10.5, fontWeight: 600, color: t.textoAtenuado2 }}>{otSel.estado}</span>
                                    </div>
                                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{otSel.solicitante || 'Cliente'}</div>
                                    <p style={{ margin: '6px 0 0', fontSize: 11.5, lineHeight: 1.5, color: t.textoSecundario2 }}>{otSel.descripcion}</p>
                                </div>

                                <div style={styles.asideBloque}>
                                    <div style={styles.tituloSub}>Sobredemanda</div>
                                    {conflictosSel.length === 0 ? (
                                        <div style={{ fontSize: 11.5, color: t.textoAtenuado1, lineHeight: 1.5 }}>Sin conflictos de capacidad en esta semana.</div>
                                    ) : conflictosSel.map((c, i) => (
                                        <div key={i} style={{ padding: '6px 0', borderBottom: `1px solid ${t.hairlineFila}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                <span style={{ fontSize: 11.5, fontWeight: 600 }}>{c.nombre}</span>
                                                <span style={{ fontFamily: t.fontMono, fontSize: 11, fontWeight: 600, color: t.rojo }}>+{c.deficit}h</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5, color: t.textoAtenuado3 }}>
                                                <span>{c.fecha}</span><span style={{ fontFamily: t.fontMono }}>{c.carga}h sobre {c.capacidad}h</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ padding: '11px 16px 14px' }}>
                                    <div style={styles.tituloSub}>Acciones</div>
                                    {(() => {
                                        const estadoValidoSel = ['Planificada', 'Programada', 'Reprogramar'].includes(otSel.estado);
                                        const tieneTareasConFechaSel = (otSel.tareas || []).some(tt => tt.fecha && Number(tt.duracion) > 0);
                                        const puedeSel = estadoValidoSel && tieneTareasConFechaSel;
                                        const tituloSel = !estadoValidoSel
                                            ? 'La OT debe estar Planificada, Programada o Reprogramar'
                                            : !tieneTareasConFechaSel
                                                ? 'Agrega tareas con fecha y horas asignadas en Tratamiento antes de verificar capacidad'
                                                : '';
                                        return (
                                            <button
                                                onClick={() => puedeSel && confirmarCapacidad(otSel)}
                                                disabled={!puedeSel}
                                                title={tituloSel}
                                                style={{ ...styles.btnSecundario, width: '100%', marginBottom: 6, opacity: puedeSel ? 1 : .5 }}
                                            >{otSel.estado === 'Reprogramar' ? 'Confirmar fecha nueva' : otSel.cotizacion?.capacidadVerificada ? 'Reconfirmar programación' : 'Aceptar programación'}</button>
                                        );
                                    })()}
                                    {otSel.estado === 'Programada' && (
                                        <button onClick={() => revertirAPlanificada(otSel)} style={{ ...styles.btnSecundario, width: '100%', marginBottom: 6, color: t.rojo }}>Revertir a Planificada</button>
                                    )}
                                    <button onClick={() => navigate('/tratamiento', { state: otSel })} style={{ ...styles.btnSecundario, width: '100%' }}>Abrir tratamiento</button>
                                    <div style={{ fontSize: 10.5, color: t.textoAtenuado3, marginTop: 8, lineHeight: 1.5 }}>La capacidad se puede confirmar en OT Planificada o Programada con al menos una tarea con fecha; el cliente es quien deja la OT en Programada al aprobar la cotización.</div>
                                </div>
                            </>
                        )}
                    </aside>
                )}
            </div>
        </div>
    );
};

// Bloque "Carga de supervisores · asignaciones / capacidad" — mismo patrón visual que
// "Disponibilidad de personal" (barra + resumen + celdas por día), pero contando OT
// activas por supervisor en vez de horas por operario (ver otsActivasDe/diasOcupadosPorSupervisor).
function FilaCargaSupervisor({ recurso, diasSemana, otsActivasDe, diasOcupadosPorSupervisor, limite }) {
    const activas = otsActivasDe(recurso._id).length;
    const ocupados = diasOcupadosPorSupervisor(recurso._id);
    const pct = limite > 0 ? Math.min(100, Math.round((activas / limite) * 100)) : 0;
    const colorBarra = activas > limite ? t.rojo : activas > 0 ? t.verde : t.textoDeshabilitado;
    const colorResumen = activas > limite ? t.rojo : t.textoPrincipal;
    return (
        <div style={styles.filaCapacidad}>
            <span style={{ ...styles.celda, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{recurso.nombre}</span>
            <span style={{ ...styles.celda, flexDirection: 'column', justifyContent: 'center', gap: 3, overflow: 'hidden' }}>
                <span style={{ display: 'flex', gap: 8, width: '100%', fontSize: 10.5, color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ flex: 'none' }}>{recurso.puesto}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{activas} de {limite} asignaciones</span>
                </span>
                <span style={{ display: 'block', height: 3, width: '100%', background: 'rgba(0,0,0,.09)' }}>
                    <span style={{ display: 'block', height: 3, background: colorBarra, width: `${pct}%` }} />
                </span>
            </span>
            <span style={{ ...styles.celda, fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 600, color: colorResumen }}>{activas} / {limite} · {pct} %</span>
            <span style={styles.celda} /><span style={styles.celda} /><span style={styles.celda} />
            <span style={{ ...styles.celda, borderRight: `1px solid ${t.hairlineBloque}` }} />
            {diasSemana.map(dia => {
                const n = ocupados[dia] || 0;
                const exceso = n > limite;
                const f = new Date(dia + 'T00:00:00');
                const esFinde = f.getDay() === 0 || f.getDay() === 6;
                return (
                    <span key={dia} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 32, minWidth: 0, overflow: 'hidden', background: exceso ? t.cargaExceso : n > 0 ? t.cargaOk : (esFinde ? '#f4f3ef' : 'transparent'), borderLeft: `1px solid ${t.hairlineFila}`, fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 600, color: exceso ? t.rojo : n > 0 ? t.textoPrincipal : t.textoDeshabilitado }}>
                        {n === 0 ? '·' : n}
                    </span>
                );
            })}
        </div>
    );
}

const styles = {
    raiz: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: t.fondoMain, color: t.textoPrincipal, fontFamily: t.fontUi, fontSize: '13px' },
    header: { flex: 'none', height: 46, display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    h1: { margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap' },
    subtitulo: { fontSize: 11.5, color: t.textoAtenuado2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

    barraContexto: { flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: t.barraContexto, borderBottom: `1px solid ${t.hairlineBloque}` },
    btnSecundario: { height: 20, padding: '0 9px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11, color: t.textoSecundario1, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi, whiteSpace: 'nowrap' },
    segActivo: { height: 22, padding: '0 10px', background: '#1c1d1b', border: '1px solid #1c1d1b', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    segInactivo: { height: 22, padding: '0 10px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11, fontWeight: 400, color: t.textoSecundario1, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },

    cuerpo: { flex: 1, minHeight: 0, display: 'flex' },
    scrollTabla: { flex: 1, minWidth: 0, overflow: 'auto', background: t.superficie },

    filaHeader: { position: 'sticky', top: 0, zIndex: 3, display: 'grid', gridTemplateColumns: GRID, gap: 0, alignItems: 'stretch', background: t.encabezadoTabla, borderBottom: `1px solid ${t.bordeZona}` },
    thCol: { padding: '0 10px', height: 32, display: 'flex', alignItems: 'center', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700 },

    filaOT: { display: 'grid', gridTemplateColumns: GRID, alignItems: 'stretch', borderBottom: `1px solid ${t.hairlineFila}`, cursor: 'pointer' },
    filaTarea: { display: 'grid', gridTemplateColumns: GRID, alignItems: 'stretch', borderBottom: `1px solid ${t.hairlineFila}` },
    filaCapacidad: { display: 'grid', gridTemplateColumns: GRID, alignItems: 'stretch', borderBottom: `1px solid ${t.hairlineFila}` },
    filaSeccion: { display: 'flex', alignItems: 'center', height: 30, padding: '0 16px', marginTop: 14, position: 'sticky', left: 0, background: t.encabezadoTabla, borderTop: `1px solid ${t.bordeZona}`, borderBottom: `1px solid ${t.hairlineBloque}`, fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700 },
    celda: { display: 'flex', alignItems: 'center', padding: '5px 10px', minWidth: 0 },
    // overflow/textOverflow: con nowrap solo, un label largo como "Confirmar y volver a
    // Programada" desbordaba visualmente la celda de 104px y se metía sobre las columnas de
    // fecha de al lado (mismo problema de "ink overflow" ya visto en la tabla de Tareas) —
    // acá se trunca con "…" en vez de agrandar la fila.
    btnAccionFila: { width: '100%', height: 21, padding: '0 6px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 10.5, fontWeight: 600, color: '#262622', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: t.fontUi },

    asideTira: {
        width: '13px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: t.encabezadoTabla, color: t.textoAtenuado3, fontFamily: t.fontMono, fontSize: '12px',
        cursor: 'pointer', borderLeft: `1px solid ${t.hairlineBloque}`,
    },
    aside: { width: 284, flex: 'none', display: 'flex', flexDirection: 'column', background: t.fondoMain, overflow: 'auto' },
    asideHeader: { padding: '12px 16px 11px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    asideBloque: { padding: '11px 16px 12px', borderBottom: `1px solid ${t.hairlineBloque}` },
    tituloSub: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3, marginBottom: 7 },
};

export default GanttScreen;
