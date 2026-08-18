import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
const ESTADOS_ACTIVOS = ['Planificada', 'Programada', 'En Ejecución'];
const ESTADOS_EJECUTADOS = ['Trabajo Terminado', 'Con Informe', 'Pagada'];

const colorEstadoOT = (estado) => {
    if (ESTADOS_EJECUTADOS.includes(estado)) return t.textoAtenuado1;
    if (estado === 'En Ejecución') return t.verde;
    if (estado === 'Programada') return t.acento;
    return t.textoSecundario2;
};

const GanttScreen = ({ recursos = [], ots = [], calendarios = [], obtenerHorasParaDia, actualizarOtGlobal, cargarDatos }) => {
    const navigate = useNavigate();

    // Días con al menos una tarea asignada, para poder navegar semanas hacia atrás/adelante.
    const diasConTareas = [];
    ots.forEach(ot => ot.tareas?.forEach(tt => { if (tt.fecha) diasConTareas.push(tt.fecha); }));

    const mapaCarga = {};
    ots.filter(ot => ESTADOS_ACTIVOS.includes(ot.estado)).forEach(ot => {
        ot.tareas?.forEach(tt => {
            if (tt.fecha && tt.operarioId) {
                const ids = Array.isArray(tt.operarioId) ? tt.operarioId : [tt.operarioId];
                const horas = Number(tt.duracion) || 0;
                ids.forEach(id => {
                    const key = `${String(id)}-${tt.fecha}`;
                    mapaCarga[key] = (mapaCarga[key] || 0) + horas;
                });
            }
        });
    });

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
    const [idxSemana, setIdxSemana] = useState(Math.max(0, semanaHoyIdx));
    const semanaActual = semanas[idxSemana] || null;
    const diasSemana = semanaActual?.dias || [];

    const [otSel, setOtSel] = useState(null);
    const [confirmando, setConfirmando] = useState(false);
    const [asideOculta, setAsideOculta] = useState(false);

    // Preselecciona la primera OT visible para que el panel no arranque vacío.
    useEffect(() => {
        if (!otSel && ots.length > 0) setOtSel(ots[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ots]);

    const capacidadDia = (recurso, dia) => obtenerHorasParaDia ? obtenerHorasParaDia(recurso, { fechaCompleta: new Date(dia + 'T00:00:00') }) : 8;

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

    const toggleProgramada = async (ot) => {
        setOtSel(ot);
        if (ot.estado === 'Programada') {
            await actualizarOtGlobal(ot._id, { estado: 'Planificada' });
            if (cargarDatos) cargarDatos();
            setConfirmando(false);
            return;
        }
        const conflictos = verificarDisponibilidad(ot);
        if (conflictos.length > 0) setConfirmando(true);
        else {
            const resultado = await actualizarOtGlobal(ot._id, { estado: 'Programada' });
            if (!resultado?.exito) { alert(resultado?.error || 'No se pudo programar la OT.'); return; }
            if (cargarDatos) cargarDatos();
        }
    };

    const confirmarProgramacion = async () => {
        if (!otSel) return;
        const resultado = await actualizarOtGlobal(otSel._id, { estado: 'Programada' });
        setConfirmando(false);
        if (!resultado?.exito) { alert(resultado?.error || 'No se pudo programar la OT.'); return; }
        if (cargarDatos) cargarDatos();
    };

    const conflictosSel = otSel ? verificarDisponibilidad(otSel) : [];

    return (
        <div style={styles.raiz}>
            <header style={styles.header}>
                <h1 style={styles.h1}>Programación</h1>
                <span style={styles.subtitulo}>Plano de ejecución y capacidad real del taller</span>
            </header>

            <div style={styles.barraContexto}>
                <button onClick={() => setIdxSemana(i => Math.max(0, i - 1))} disabled={idxSemana === 0} style={{ ...styles.btnSecundario, opacity: idxSemana === 0 ? .5 : 1 }}>Semana anterior</button>
                <span style={{ fontFamily: t.fontMono, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{semanaActual ? `Semana ${semanaActual.num} · ${semanaActual.label}` : '—'}</span>
                <button onClick={() => setIdxSemana(i => Math.min(semanas.length - 1, i + 1))} disabled={idxSemana >= semanas.length - 1} style={{ ...styles.btnSecundario, opacity: idxSemana >= semanas.length - 1 ? .5 : 1 }}>Semana siguiente</button>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: t.textoAtenuado3 }}>La barra roja marca tarea sobre capacidad del responsable</span>
            </div>

            <div style={styles.cuerpo}>
                <section style={styles.scrollTabla}>
                    <div style={{ minWidth: 1228 }}>
                        <div style={styles.filaHeader}>
                            <span style={styles.thCol}>OT · N°</span>
                            <span style={styles.thCol}>Tarea / descripción</span>
                            <span style={styles.thCol}>Responsable</span>
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

                        {ots.map(ot => {
                            const estaEjecutado = ESTADOS_EJECUTADOS.includes(ot.estado);
                            const puedeProgramar = ['Planificada', 'Programada'].includes(ot.estado);
                            const estaProgramada = ot.estado === 'Programada';
                            const fechasTareas = (ot.tareas || []).filter(tt => tt.fecha).map(tt => tt.fecha).sort();
                            const fmtFecha = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : '—';
                            const enSemana = diasSemana.some(d => fechasTareas.includes(d));
                            const accionLabel = !puedeProgramar ? 'No disponible' : estaProgramada ? 'Desprogramar' : 'Programar';
                            const horasSemana = (ot.tareas || []).filter(tt => diasSemana.includes(tt.fecha)).reduce((a, tt) => a + (Number(tt.duracion) || 0), 0);
                            return (
                                <React.Fragment key={ot._id}>
                                    <div style={{ ...styles.filaOT, background: otSel?._id === ot._id ? '#f0efeb' : enSemana ? t.fondoMain : t.superficie }} onClick={() => { setOtSel(ot); setConfirmando(false); }}>
                                        <span style={{ ...styles.celda, borderLeft: `2px solid ${otSel?._id === ot._id ? '#1c1d1b' : 'transparent'}` }}>
                                            <span onClick={(e) => { e.stopPropagation(); navigate('/tratamiento', { state: ot }); }} style={{ fontFamily: t.fontMono, fontSize: 11, fontWeight: 600, color: t.acento, cursor: 'pointer' }}>{ot.numeroOT || 'S/N'}</span>
                                        </span>
                                        <span style={{ ...styles.celda, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{ot.solicitante || 'Cliente'}</span>
                                            <span style={{ fontSize: 10.5, color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{ot.descripcion || ''}</span>
                                        </span>
                                        <span style={{ ...styles.celda, fontSize: 10.5, fontWeight: 600, color: colorEstadoOT(ot.estado) }}>{ot.estado}</span>
                                        <span style={styles.celda}>
                                            {estaEjecutado ? null : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (puedeProgramar) toggleProgramada(ot); }}
                                                    disabled={!puedeProgramar}
                                                    title={puedeProgramar ? '' : 'La OT debe estar Planificada primero'}
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

                                    {(ot.tareas || []).filter(tt => diasSemana.includes(tt.fecha)).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map((tarea, tIdx) => (
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
                                    {confirmando && (
                                        <div style={{ marginTop: 10, padding: '8px 10px', background: '#fff', borderLeft: `2px solid ${t.rojo}` }}>
                                            <div style={{ fontSize: 11.5, color: t.textoSecundario1, lineHeight: 1.5, marginBottom: 8 }}>Programar dejará responsables sobre su capacidad. ¿Continuar?</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                                <button onClick={confirmarProgramacion} style={{ height: 26, background: t.rojo, border: `1px solid ${t.rojo}`, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 2 }}>Programar igual</button>
                                                <button onClick={() => setConfirmando(false)} style={styles.btnSecundario}>Cancelar</button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ padding: '11px 16px 14px' }}>
                                    <div style={styles.tituloSub}>Acciones</div>
                                    <button onClick={() => navigate('/tratamiento', { state: otSel })} style={{ ...styles.btnSecundario, width: '100%' }}>Abrir tratamiento</button>
                                    <div style={{ fontSize: 10.5, color: t.textoAtenuado3, marginTop: 8, lineHeight: 1.5 }}>Solo las OT en estado Planificada o Programada se pueden programar; las cerradas quedan en gris.</div>
                                </div>
                            </>
                        )}
                    </aside>
                )}
            </div>
        </div>
    );
};

const styles = {
    raiz: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: t.fondoMain, color: t.textoPrincipal, fontFamily: t.fontUi, fontSize: '13px' },
    header: { flex: 'none', height: 46, display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    h1: { margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap' },
    subtitulo: { fontSize: 11.5, color: t.textoAtenuado2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

    barraContexto: { flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: t.barraContexto, borderBottom: `1px solid ${t.hairlineBloque}` },
    btnSecundario: { height: 20, padding: '0 9px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11, color: t.textoSecundario1, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi, whiteSpace: 'nowrap' },

    cuerpo: { flex: 1, minHeight: 0, display: 'flex' },
    scrollTabla: { flex: 1, minWidth: 0, overflow: 'auto', background: t.superficie },

    filaHeader: { position: 'sticky', top: 0, zIndex: 3, display: 'grid', gridTemplateColumns: GRID, gap: 0, alignItems: 'stretch', background: t.encabezadoTabla, borderBottom: `1px solid ${t.bordeZona}` },
    thCol: { padding: '0 10px', height: 32, display: 'flex', alignItems: 'center', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700 },

    filaOT: { display: 'grid', gridTemplateColumns: GRID, alignItems: 'stretch', borderBottom: `1px solid ${t.hairlineFila}`, cursor: 'pointer' },
    filaTarea: { display: 'grid', gridTemplateColumns: GRID, alignItems: 'stretch', borderBottom: `1px solid ${t.hairlineFila}` },
    filaCapacidad: { display: 'grid', gridTemplateColumns: GRID, alignItems: 'stretch', borderBottom: `1px solid ${t.hairlineFila}` },
    filaSeccion: { display: 'flex', alignItems: 'center', height: 30, padding: '0 16px', marginTop: 14, position: 'sticky', left: 0, background: t.encabezadoTabla, borderTop: `1px solid ${t.bordeZona}`, borderBottom: `1px solid ${t.hairlineBloque}`, fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700 },
    celda: { display: 'flex', alignItems: 'center', padding: '5px 10px', minWidth: 0 },
    btnAccionFila: { width: '100%', height: 21, padding: '0 6px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 10.5, fontWeight: 600, color: '#262622', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },

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
