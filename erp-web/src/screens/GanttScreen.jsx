import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const getColorByPuesto = (puesto) => {
    const colores = {
        'Mecánico': '#3498db',
        'Eléctrico': '#f1c40f',
        'Soldador': '#e67e22',
        'Ayudante': '#95a5a6'
    };
    return colores[puesto] || '#34495e';
};

// Recibimos recursos y calendarios como props para la integración
const GanttScreen = ({ recursos = [], ots = [], calendarios = [], obtenerHorasParaDia, actualizarOtGlobal, cargarDatos }) => {
    const navigate = useNavigate();

    // 1. Obtener rango de días (ahora basado en un rango fijo o dinámico de las OTs)
    const obtenerDiasUnicos = () => {
        const fechas = [];
        ots?.forEach(ot => {
            ot.tareas?.forEach(t => { if (t.fecha) fechas.push(t.fecha); });
        });

        if (fechas.length === 0) return [];

        // 1. Convertir a timestamps para encontrar extremos
        // Añadimos T00:00:00 para evitar problemas de desfase horario
        const timestamps = fechas.map(f => new Date(f + "T00:00:00").getTime());
        const minMs = Math.min(...timestamps);
        const maxMs = Math.max(...timestamps);

        const listaCompleta = [];
        let fechaActual = new Date(minMs);
        const fechaFin = new Date(maxMs);

        // 2. Rellenar el rango día por día
        while (fechaActual <= fechaFin) {
            const iso = fechaActual.toISOString().split('T')[0];
            listaCompleta.push(iso);

            // Avanzamos 1 día
            fechaActual.setDate(fechaActual.getDate() + 1);
        }

        return listaCompleta; // Ya viene ordenada cronológicamente
    };

    const diasHeader = obtenerDiasUnicos();

    const ESTADOS_ACTIVOS = ['Planificada', 'Programada', 'En Ejecución'];

    // Pre-calculamos un mapa de carga para no hacer .filter dentro de cada celda (mejora rendimiento)
    const mapaCarga = {};

    ots.filter(ot => ESTADOS_ACTIVOS.includes(ot.estado)).forEach(ot => {
        ot.tareas?.forEach(t => {
            if (t.fecha && t.operarioId) {
                const idsAsignados = Array.isArray(t.operarioId) ? t.operarioId : [t.operarioId];
                const horas = Number(t.duracion) || 0;

                idsAsignados.forEach(id => {
                    // Forzamos String(id) para evitar problemas de ObjectId vs String
                    const key = `${String(id)}-${t.fecha}`;
                    mapaCarga[key] = (mapaCarga[key] || 0) + horas;
                });
            }
        });
    });

    useEffect(() => {
        ots.forEach(ot => {
            ot.tareas?.forEach(t => {
            });
        });
    }, [ots]);

    const [idxSemana, setIdxSemana] = useState(0);

    const obtenerSemanas = () => {
        if (diasHeader.length === 0) return [];
        const vistas = new Map();
        diasHeader.forEach(d => {
            const fecha = new Date(d + 'T00:00:00');
            const diaSemana = fecha.getDay();
            const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
            const lunes = new Date(fecha);
            lunes.setDate(fecha.getDate() + diffLunes);
            const lunesISO = lunes.toISOString().split('T')[0];
            if (!vistas.has(lunesISO)) {
                // Generar los 7 días completos de la semana (Lun–Dom)
                const dias7 = [];
                for (let i = 0; i < 7; i++) {
                    const dia = new Date(lunes);
                    dia.setDate(lunes.getDate() + i);
                    dias7.push(dia.toISOString().split('T')[0]);
                }
                const domingo = new Date(lunes);
                domingo.setDate(lunes.getDate() + 6);
                // Número ISO de semana
                const primerJueves = new Date(lunes.getFullYear(), 0, 4);
                const numSem = Math.round(((lunes - primerJueves) / 86400000 + primerJueves.getDay() + 6) / 7) + 1;
                vistas.set(lunesISO, {
                    key: lunesISO,
                    num: numSem,
                    label: `${lunes.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} – ${domingo.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`,
                    dias: dias7
                });
            }
        });
        return Array.from(vistas.values()).sort((a, b) => a.key.localeCompare(b.key));
    };

    const semanas = obtenerSemanas();
    const semanaActual = semanas[idxSemana] || null;
    const diasSemana = semanaActual?.dias || [];

    const [modalConflictos, setModalConflictos] = useState(null); // { ot, conflictos: [] }

    const verificarDisponibilidad = (ot) => {
        const conflictos = [];
        (ot.tareas || []).forEach(t => {
            if (!t.fecha) return;
            const ids = Array.isArray(t.operarioId) ? t.operarioId : [t.operarioId];
            ids.forEach(id => {
                if (!id) return;
                const recurso = recursos.find(r => String(r._id) === String(id));
                if (!recurso) return;
                const cargaTotal = mapaCarga[`${String(id)}-${t.fecha}`] || 0;
                const capacidad = obtenerHorasParaDia
                    ? obtenerHorasParaDia(recurso, { fechaCompleta: new Date(t.fecha + 'T00:00:00') })
                    : 8;
                if (cargaTotal > capacidad) {
                    conflictos.push({
                        nombre: recurso.nombre,
                        fecha: t.fecha,
                        carga: cargaTotal,
                        capacidad,
                        deficit: cargaTotal - capacidad
                    });
                }
            });
        });
        // Deduplicar por nombre+fecha
        const vistos = new Set();
        return conflictos.filter(c => {
            const key = `${c.nombre}-${c.fecha}`;
            if (vistos.has(key)) return false;
            vistos.add(key);
            return true;
        });
    };

    const toggleProgramada = async (ot) => {
        // Al desprogramar no hace falta validar
        if (ot.estado === 'Programada') {
            await actualizarOtGlobal(ot._id, { estado: 'Planificada' });
            if (cargarDatos) cargarDatos();
            return;
        }
        // Al programar: verificar sobredemanda
        const conflictos = verificarDisponibilidad(ot);
        if (conflictos.length > 0) {
            setModalConflictos({ ot, conflictos });
        } else {
            await actualizarOtGlobal(ot._id, { estado: 'Programada' });
            if (cargarDatos) cargarDatos();
        }
    };

    const confirmarProgramacion = async () => {
        if (!modalConflictos) return;
        await actualizarOtGlobal(modalConflictos.ot._id, { estado: 'Programada' });
        if (cargarDatos) cargarDatos();
        setModalConflictos(null);
    };

    return (
        <>
        <div style={styles.container}>
            <h2 style={{ color: '#2c3e50' }}>📊 Plano de Ejecución e Infraestructura</h2>

            <div style={styles.ganttContainer}>
                {/* --- SECCIÓN 1: TAREAS Y OTs --- */}
                <div style={{ ...styles.sectionHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📋 ORDENES DE TRABAJO Y ASIGNACIÓN</span>
                    {semanas.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                onClick={() => setIdxSemana(i => Math.max(0, i - 1))}
                                disabled={idxSemana === 0}
                                style={{ padding: '3px 12px', borderRadius: '6px', border: 'none', cursor: idxSemana === 0 ? 'not-allowed' : 'pointer', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold', opacity: idxSemana === 0 ? 0.4 : 1 }}
                            >← Ant</button>
                            <span style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                Sem {semanaActual?.num} · {semanaActual?.label}
                            </span>
                            <button
                                onClick={() => setIdxSemana(i => Math.min(semanas.length - 1, i + 1))}
                                disabled={idxSemana === semanas.length - 1}
                                style={{ padding: '3px 12px', borderRadius: '6px', border: 'none', cursor: idxSemana === semanas.length - 1 ? 'not-allowed' : 'pointer', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold', opacity: idxSemana === semanas.length - 1 ? 0.4 : 1 }}
                            >Sig →</button>
                        </div>
                    )}
                </div>

                {/* ENCABEZADO UNIFICADO */}
                <div style={styles.headerRow}>
                    <div style={{ ...styles.colBase, width: '150px' }}>OT #</div>
                    <div style={{ ...styles.colBase, width: '220px' }}>Tarea / Descripción</div>
                    <div style={{ ...styles.colBase, width: '150px' }}>Responsable</div>
                    <div style={{ ...styles.colBase, width: '80px' }}>Duración</div>
                    <div style={{ ...styles.colBase, width: '90px', justifyContent: 'center' }}>Inicio</div>
                    <div style={{ ...styles.colBase, width: '90px', justifyContent: 'center' }}>Fin</div>

                    <div style={styles.daysArea}>
                        {diasSemana.map(dia => {
                            const f = new Date(dia + 'T00:00:00');
                            return (
                                <div key={dia} style={styles.dayHeaderCell}>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', opacity: 0.8 }}>
                                        {f.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}
                                    </div>
                                    <div style={{ fontWeight: 'bold' }}>
                                        {f.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* FILAS DE OTs */}
                {ots.map((ot) => (
                    <React.Fragment key={ot._id}>
                        {/* FILA ÚNICA PARA EL NÚMERO DE OT */}
                        {(() => {
                            const ESTADOS_EJECUTADOS = ['Trabajo Terminado', 'Con Informe', 'Pagada'];
                            const estaEjecutado = ESTADOS_EJECUTADOS.includes(ot.estado);
                            const estaEnEjecucion = ot.estado === 'En Ejecución';
                            const puedeprogramar = ['Planificada', 'Programada'].includes(ot.estado);
                            const estaProgramada = ot.estado === 'Programada';
                            const fechasTareas = (ot.tareas || []).filter(t => t.fecha).map(t => t.fecha).sort();
                            const otInicio = fechasTareas[0];
                            const otFin = fechasTareas[fechasTareas.length - 1];
                            const fmtFecha = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : '—';
                            const enSemanaActual = diasSemana.some(d => fechasTareas.includes(d));

                            const badgeEjecutado = estaEjecutado ? (
                                <span style={{
                                    padding: '3px 10px', fontSize: '11px', fontWeight: 'bold',
                                    border: 'none', borderRadius: '10px', whiteSpace: 'nowrap',
                                    backgroundColor: '#95a5a6', color: 'white'
                                }}>✓ {ot.estado}</span>
                            ) : estaEnEjecucion ? (
                                <span style={{
                                    padding: '3px 10px', fontSize: '11px', fontWeight: 'bold',
                                    border: 'none', borderRadius: '10px', whiteSpace: 'nowrap',
                                    backgroundColor: '#27ae60', color: 'white'
                                }}>⚙️ En Ejecución</span>
                            ) : null;

                            return (
                                <div style={{ ...styles.dataRow, backgroundColor: estaEjecutado ? '#f5f5f5' : (enSemanaActual ? '#f0f7ff' : '#f8f9fa'), fontWeight: 'bold', opacity: estaEjecutado ? 0.7 : 1 }}>
                                    <div style={{ ...styles.colBase, width: '150px', color: '#2980b9', fontWeight: 'bold', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                                        <span
                                            onClick={() => navigate('/tratamiento', { state: ot })}
                                            title="Abrir OT"
                                            style={{ cursor: 'pointer', textDecoration: 'underline', color: '#1a6fb3' }}
                                        >{ot.numeroOT || "S/N"}</span>
                                        {badgeEjecutado ?? (
                                            <button
                                                onClick={() => puedeprogramar && toggleProgramada(ot)}
                                                disabled={!puedeprogramar}
                                                title={!puedeprogramar ? 'La OT debe estar Planificada primero' : (estaProgramada ? 'Marcar como no programada' : 'Marcar como Programada')}
                                                style={{
                                                    padding: '3px 10px',
                                                    fontSize: '11px',
                                                    fontWeight: 'bold',
                                                    border: 'none',
                                                    borderRadius: '10px',
                                                    cursor: puedeprogramar ? 'pointer' : 'not-allowed',
                                                    backgroundColor: !puedeprogramar ? '#e0e0e0' : (estaProgramada ? '#8e44ad' : '#3498db'),
                                                    color: !puedeprogramar ? '#aaa' : 'white',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {!puedeprogramar ? '○ No disponible' : (estaProgramada ? '✓ Programada' : '+ Programar')}
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ ...styles.colBase, width: '450px' }}>PROYECTO: {ot.descripcionGeneral || ot.descripcion || 'Sin descripción'}</div>
                                    <div style={{ ...styles.colBase, width: '90px', justifyContent: 'center', flexDirection: 'column', fontSize: '12px', color: otInicio ? '#27ae60' : '#bbb', fontWeight: 'bold' }}>
                                        {fmtFecha(otInicio)}
                                    </div>
                                    <div style={{ ...styles.colBase, width: '90px', justifyContent: 'center', flexDirection: 'column', fontSize: '12px', color: otFin ? '#e74c3c' : '#bbb', fontWeight: 'bold' }}>
                                        {fmtFecha(otFin)}
                                    </div>
                                    <div style={styles.daysArea}>
                                        {diasSemana.map(dia => <div key={dia} style={{ flex: 1, borderRight: '1px solid #f0f0f0' }} />)}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* FILAS DE TAREAS */}
                        {ot.tareas?.map((tarea, tIdx) => {
                            return (
                                <div key={`${ot._id}-${tIdx}`} style={styles.dataRow}>
                                    <div style={{ ...styles.colBase, width: '150px', color: '#95a5a6', textAlign: 'center' }}>{tIdx + 1}</div>
                                    <div style={{ ...styles.colBase, width: '220px' }}>{tarea.descripcion}</div>

                                    {/* Celda de Responsables Corregida */}
                                    <div style={{ ...styles.colBase, width: '150px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {Array.isArray(tarea.operarioNombre) ? (
                                                tarea.operarioNombre.map((nombre, opIdx) => (
                                                    <span key={`${ot._id}-${tIdx}-${opIdx}`} style={{
                                                        fontSize: '11px',
                                                        backgroundColor: '#eee',
                                                        padding: '2px 5px',
                                                        borderRadius: '3px'
                                                    }}>
                                                        {nombre}{opIdx < tarea.operarioNombre.length - 1 ? ',' : ''}
                                                    </span>
                                                ))
                                            ) : (
                                                <span style={{ fontSize: '11px' }}>{tarea.operarioNombre || 'Sin asignar'}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ ...styles.colBase, width: '80px', textAlign: 'center' }}>{tarea.duracion}h</div>
                                    <div style={{ ...styles.colBase, width: '90px', justifyContent: 'center', fontSize: '11px', color: tarea.fecha ? '#27ae60' : '#bbb' }}>
                                        {tarea.fecha ? new Date(tarea.fecha + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : '—'}
                                    </div>
                                    <div style={{ ...styles.colBase, width: '90px', borderRight: '1px solid #eee' }} />

                                    {/* Área del Timeline */}
                                    <div style={styles.daysArea}>
                                        {diasSemana.map(dia => (
                                            <div key={dia} style={styles.dayCell}>
                                                {tarea.fecha === dia && (
                                                    <div style={{ ...styles.taskBar, backgroundColor: getColorByPuesto(tarea.puesto) }}>
                                                        {tarea.hora || '8:00'}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}

                {/* --- SECCIÓN 2: RECURSOS Y CAPACIDAD --- */}
                <div style={{ ...styles.sectionHeader, backgroundColor: '#27ae60', marginTop: '40px' }}>
                    👷 DISPONIBILIDAD DE PERSONAL (CAPACIDAD REAL)
                </div>


                {recursos.map(recurso => (
                    <div key={recurso._id} style={styles.dataRow}>
                        <div style={{ ...styles.colBase, width: '780px', flexShrink: 0, backgroundColor: '#f9f9f9', padding: '10px', borderRight: '1px solid #ddd' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <strong>{recurso.nombre}</strong>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    {/* Puesto del recurso */}
                                    <span style={{ fontSize: '11px', color: '#666' }}>
                                        {recurso.puesto}
                                    </span>

                                    {/* Buscamos el nombre del calendario asignado */}
                                    <span style={{
                                        fontSize: '10px',
                                        backgroundColor: '#e0e0e0',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        color: '#333',
                                        fontWeight: 'bold'
                                    }}>
                                        {calendarios.find(c => String(c._id) === String(recurso.calendarioId))?.nombre || 'Sin Turno'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div style={styles.daysArea}>
                            {diasSemana.map(dia => {
                                const carga = mapaCarga[`${String(recurso._id)}-${dia}`] || 0;
                                const capacidad = obtenerHorasParaDia
                                    ? obtenerHorasParaDia(recurso, { fechaCompleta: new Date(dia + "T00:00:00") })
                                    : 8;
                                const esSobrecarga = carga > capacidad;
                                const tieneCarga = carga > 0;
                                return (
                                    <div key={dia} style={{
                                        ...styles.dayCell,
                                        backgroundColor: esSobrecarga ? '#ffebee' : (tieneCarga ? '#e8f5e9' : '#fff'),
                                        flexDirection: 'column',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRight: '1px solid #eee'
                                    }}>
                                        <span style={{
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            color: esSobrecarga ? '#c62828' : (tieneCarga ? '#2e7d32' : '#999')
                                        }}>
                                            {carga} / {capacidad}h
                                        </span>
                                        {esSobrecarga && (
                                            <div style={{
                                                fontSize: '9px',
                                                color: 'white',
                                                backgroundColor: '#d32f2f',
                                                padding: '2px 4px',
                                                borderRadius: '4px',
                                                marginTop: '2px'
                                            }}>
                                                ⚠️ EXCESO
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* ── MODAL SOBREDEMANDA ── */}
        {modalConflictos && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ background: '#e74c3c', color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '22px' }}>⚠️</span>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>Sobredemanda de Personal</div>
                            <div style={{ fontSize: '12px', opacity: 0.85 }}>{modalConflictos.ot.numeroOT} — {modalConflictos.ot.descripcion}</div>
                        </div>
                    </div>
                    {/* Cuerpo */}
                    <div style={{ padding: '20px' }}>
                        <p style={{ margin: '0 0 14px', color: '#555', fontSize: '13px' }}>
                            Los siguientes recursos superan su capacidad disponible en las fechas asignadas:
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                            {modalConflictos.conflictos.map((c, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff5f5', border: '1px solid #fcc', borderRadius: '8px', padding: '10px 14px' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c3e50' }}>👷 {c.nombre}</div>
                                        <div style={{ fontSize: '12px', color: '#888' }}>📅 {c.fecha}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 'bold', color: '#e74c3c', fontSize: '14px' }}>{c.carga}h / {c.capacidad}h</div>
                                        <div style={{ fontSize: '11px', color: '#e74c3c' }}>+{c.deficit}h exceso</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#888' }}>
                            ¿Deseas programar de todas formas?
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={confirmarProgramacion}
                                style={{ flex: 1, padding: '11px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                            >
                                Programar de todas formas
                            </button>
                            <button
                                onClick={() => setModalConflictos(null)}
                                style={{ flex: 1, padding: '11px', background: '#ecf0f1', color: '#555', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

// ... Mantener getColorByPuesto y estilos ...
const styles = {
    container: {
        width: '100%',
        maxWidth: '1500px',
        margin: '0 auto',
        minHeight: '100vh',
        padding: 'clamp(10px, 3vw, 20px)',
        backgroundColor: '#f0f2f5',
        boxSizing: 'border-box'
    },
    sectionHeader: {
        padding: '10px 20px',
        backgroundColor: '#2980b9',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '14px',
        boxSizing: 'border-box'
    },
    ganttContainer: {
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.05)'
    },
    headerRow: {
        display: 'flex',
        background: '#34495e',
        color: 'white'
    },
    dataRow: {
        display: 'flex',
        borderBottom: '1px solid #eee',
        alignItems: 'stretch'
    },
    colBase: {
        padding: '10px',
        borderRight: '1px solid #eee',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        boxSizing: 'border-box'
    },
    daysArea: { display: 'flex', flex: 1 },
    dayHeaderCell: { flex: 1, minWidth: '60px', textAlign: 'center', padding: '10px 0', borderRight: '1px solid #5d6d7e' },
    dayCell: {
        flex: 1,
        minWidth: '60px',
        borderRight: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50px'
    },
    taskBar: { width: '80%', height: '24px', borderRadius: '4px', color: 'white', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
};

export default GanttScreen;