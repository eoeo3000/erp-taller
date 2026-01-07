import React, { useState, useEffect } from 'react';
import axios from 'axios';

const GanttScreen = () => {
    const [ots, setOts] = useState([]);

    useEffect(() => {
        axios.get('http://localhost:5000/api/data').then(res => {
            setOts(res.data.ots);
        });
    }, []);

    // Función para obtener todos los días únicos de las tareas para el encabezado
    const obtenerDiasUnicos = () => {
        const fechas = [];
        ots.forEach(ot => {
            ot.tareas?.forEach(t => {
                if (t.fecha) fechas.push(t.fecha);
            });
        });
        // Ordenar fechas y eliminar duplicados
        return [...new Set(fechas)].sort();
    };

    const diasHeader = obtenerDiasUnicos();

    return (
        <div style={{ width: '100%', minHeight: '100vh', padding: '20px', boxSizing: 'border-box', backgroundColor: '#f4f7f6' }}>
            <h2 style={{ color: '#2c3e50', marginBottom: '20px' }}>📊 Plano Completo de Ejecución (Gantt Dinámico)</h2>

            <div style={styles.ganttContainer}>
                {/* ENCABEZADO */}
                <div style={styles.headerRow}>
                    <div style={{ ...styles.colBase, width: '50px' }}>#</div>
                    <div style={{ ...styles.colBase, width: '250px' }}>Descripción General / OT</div>
                    <div style={{ ...styles.colBase, width: '150px' }}>Personal / Puesto</div>
                    <div style={{ ...styles.colBase, width: '80px' }}>Duración</div>

                    {/* Días Dinámicos */}
                    <div style={styles.daysArea}>
                        {diasHeader.map(dia => (
                            <div key={dia} style={styles.dayHeaderCell}>
                                {new Date(dia + "T00:00:00").toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* FILAS DE DATOS */}
                {ots.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center' }}>No hay actividades programadas.</div>
                ) : (
                    ots.map((ot, otIdx) => (
                        <div key={ot.id}>
                            {ot.tareas?.map((tarea, tIdx) => (
                                <div key={`${ot.id}-${tIdx}`} style={styles.dataRow}>
                                    <div style={{ ...styles.colBase, width: '50px' }}>{otIdx + 1}.{tIdx + 1}</div>
                                    <div style={{ ...styles.colBase, width: '250px', fontSize: '13px' }}>
                                        <strong>OT {ot.id}:</strong> {tarea.descripcion}
                                    </div>
                                    <div style={{ ...styles.colBase, width: '150px' }}>
                                        <span style={styles.badgePuesto}>{tarea.puesto}</span>
                                    </div>
                                    <div style={{ ...styles.colBase, width: '80px', textAlign: 'center' }}>{tarea.duracion} hrs</div>

                                    {/* Área del Timeline (Gantt) */}
                                    <div style={styles.daysArea}>
                                        {diasHeader.map(dia => (
                                            <div key={dia} style={styles.dayCell}>
                                                {tarea.fecha === dia && (
                                                    <div style={{
                                                        ...styles.taskBar,
                                                        backgroundColor: getColorByPuesto(tarea.puesto)
                                                    }}>
                                                        {tarea.hora}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// Colores por especialidad
const getColorByPuesto = (puesto) => {
    const colores = {
        'Mecánico': '#3498db',
        'Eléctrico': '#f1c40f',
        'Soldador': '#e67e22',
        'Ayudante': '#95a5a6'
    };
    return colores[puesto] || '#34495e';
};

// 2. Objeto de estilos (ajustado para que las columnas de días sean visibles)
const styles = {
    ganttContainer: {
        background: 'white',
        borderRadius: '8px',
        overflowX: 'auto',
        boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
        border: '1px solid #eee'
    },
    headerRow: {
        display: 'flex',
        background: '#2c3e50',
        color: 'white',
        fontWeight: 'bold',
        minWidth: 'fit-content'
    },
    dataRow: {
        display: 'flex',
        borderBottom: '1px solid #eee',
        minWidth: 'fit-content',
        alignItems: 'center'
    },
    colBase: {
        padding: '12px',
        borderRight: '1px solid #ddd',
        boxSizing: 'border-box'
    },
    daysArea: {
        display: 'flex',
        flex: 1
    },
    dayHeaderCell: {
        width: '100px',
        textAlign: 'center',
        borderLeft: '1px solid #455a64',
        padding: '12px 0',
        fontSize: '13px'
    },
    dayCell: {
        width: '100px',
        borderLeft: '1px solid #f0f0f0',
        minHeight: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fafafa'
    },
    taskBar: {
        width: '90%',
        height: '30px',
        borderRadius: '4px',
        color: 'white',
        fontSize: '11px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    },
    badgePuesto: {
        padding: '4px 8px',
        borderRadius: '12px',
        background: '#ecf0f1',
        fontSize: '12px',
        color: '#2c3e50',
        fontWeight: 'bold'
    }
};

export default GanttScreen;