import React, { useState, useEffect } from 'react';
import axios from 'axios';

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
const GanttScreen = ({ recursos = [], ots = [], calendarios = [], obtenerHorasParaDia }) => {

    // 1. Obtener rango de días (ahora basado en un rango fijo o dinámico de las OTs)
    const obtenerDiasUnicos = () => {
        const fechas = [];
        // Si "ots" es undefined por error, el ?. evita que la app explote
        ots?.forEach(ot => {
            ot.tareas?.forEach(t => { if (t.fecha) fechas.push(t.fecha); });
        });
        return [...new Set(fechas)].sort();
    };

    const diasHeader = obtenerDiasUnicos();

    // Pre-calculamos un mapa de carga para no hacer .filter dentro de cada celda (mejora rendimiento)
    const mapaCarga = {};

    ots.forEach(ot => {
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
        console.log("--- INSPECCIÓN DE DATOS EN GANTT ---");
        ots.forEach(ot => {
            ot.tareas?.forEach(t => {
                console.log(`OT: ${ot.numero} | Tarea: ${t.descripcion}`);
                console.log("IDs:", t.operarioId);
                console.log("Nombres:", t.operarioNombre);
            });
        });
    }, [ots]);

    // AÑADE ESTO PARA DEPURAR: Mira en la consola si las llaves tienen el ID que esperas
    return (
        <div style={styles.container}>
            <h2 style={{ color: '#2c3e50' }}>📊 Plano de Ejecución e Infraestructura</h2>

            <div style={styles.ganttContainer}>
                {/* --- SECCIÓN 1: TAREAS Y OTs --- */}
                <div style={styles.sectionHeader}>📋 ORDENES DE TRABAJO Y ASIGNACIÓN</div>

                {/* ENCABEZADO UNIFICADO */}
                <div style={styles.headerRow}>
                    <div style={{ ...styles.colBase, width: '80px' }}>OT #</div>
                    <div style={{ ...styles.colBase, width: '220px' }}>Tarea / Descripción</div>
                    <div style={{ ...styles.colBase, width: '150px' }}>Responsable</div>
                    <div style={{ ...styles.colBase, width: '80px' }}>Duración</div>

                    <div style={styles.daysArea}>
                        {diasHeader.map(dia => {
                            const fechaObj = new Date(dia + "T00:00:00");
                            return (
                                <div key={dia} style={styles.dayHeaderCell}>
                                    {/* Nombre del día: Lun, Mar... */}
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', opacity: 0.8 }}>
                                        {fechaObj.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}
                                    </div>
                                    {/* Fecha: 17 ene */}
                                    <div style={{ fontWeight: 'bold' }}>
                                        {fechaObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* FILAS DE OTs */}
                {/* FILAS DE OTs */}
                {ots.map((ot) => (
                    <React.Fragment key={ot._id}>
                        {/* FILA ÚNICA PARA EL NÚMERO DE OT */}
                        <div style={{ ...styles.dataRow, backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
                            <div style={{ ...styles.colBase, width: '80px', color: '#2980b9' }}>{ot._id.slice(-5).toUpperCase()}</div>
                            <div style={{ ...styles.colBase, width: '450px' }}>PROYECTO: {ot.descripcionGeneral || 'Sin descripción'}</div>
                            <div style={styles.daysArea}>
                                {diasHeader.map(dia => <div key={dia} style={{ width: '100px', borderRight: '1px solid #f0f0f0' }} />)}
                            </div>
                        </div>

                        {/* FILAS DE TAREAS */}
                        {ot.tareas?.map((tarea, tIdx) => {
                            return (
                                <div key={`${ot._id}-${tIdx}`} style={styles.dataRow}>
                                    <div style={{ ...styles.colBase, width: '80px', color: '#95a5a6', textAlign: 'center' }}>{tIdx + 1}</div>
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

                                    {/* Área del Timeline */}
                                    <div style={styles.daysArea}>
                                        {diasHeader.map(dia => (
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
                        {/* Sumamos 80+220+150+80 = 530px para que coincida con la tabla de arriba */}
                        <div style={{ ...styles.colBase, width: '530px', backgroundColor: '#f9f9f9', padding: '10px', borderRight: '1px solid #ddd' }}>
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
                            {diasHeader.map(dia => {
                                // 1. Cálculo robusto de carga
                                const llaveBusqueda = `${String(recurso._id)}-${dia}`;
                                const carga = mapaCarga[llaveBusqueda] || 0;
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
    );
};

// ... Mantener getColorByPuesto y estilos ...
const styles = {
    container: {
        width: '100%',
        maxWidth: '1500px', // Limita el ancho para mejor lectura
        margin: '0 auto',    // Centra el bloque en la pantalla
        minHeight: '100vh',
        padding: '20px',
        backgroundColor: '#f0f2f5',
        boxSizing: 'border-box' // Asegura que el padding no sume ancho extra
    },
    sectionHeader: {
        padding: '10px 20px',
        backgroundColor: '#2980b9',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '14px'
    },
    ganttContainer: {
        background: 'white',
        borderRadius: '8px',
        overflowX: 'auto',
        boxShadow: '0 4px 10px rgba(0,0,0,0.05)'
    },
    headerRow: {
        display: 'flex',
        background: '#34495e',
        color: 'white',
        minWidth: 'fit-content'
    },
    dataRow: {
        display: 'flex',
        borderBottom: '1px solid #eee',
        minWidth: 'fit-content',
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
    daysArea: { display: 'flex' },
    dayHeaderCell: { width: '100px', textAlign: 'center', padding: '10px 0', borderRight: '1px solid #5d6d7e' },
    dayCell: {
        width: '100px',
        borderRight: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50px'
    },
    taskBar: { width: '80%', height: '24px', borderRadius: '4px', color: 'white', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }
};

export default GanttScreen;