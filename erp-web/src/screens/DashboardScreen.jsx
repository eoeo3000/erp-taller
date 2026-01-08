import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom'; // 1. IMPORTAR

const DashboardScreen = (props) => { // Recibe props para usar eliminarOT
    const navigate = useNavigate(); // 2. IMPORTANTE: Declarar navigate
    const [data, setData] = useState({ solicitudes: [], ots: [] });
    const [ots, setOts] = useState([]);
    const [otSeleccionada, setOtSeleccionada] = useState(null);
    const [tabActiva, setTabActiva] = useState('resumen');

    useEffect(() => {
        axios.get('http://localhost:5000/api/data').then(res => setData(res.data));
    }, []);

    useEffect(() => {
        // Aquí cargarías tus OTs del servidor
        // setOts(res.data);
    }, []);

    // 1. FUNCIÓN MACRO: Calcular horas totales por puesto
    const calcularCargaHoraria = () => {
        const carga = {};
        data.ots.forEach(ot => {
            ot.tareas?.forEach(t => {
                carga[t.puesto] = (carga[t.puesto] || 0) + Number(t.duracion || 0);
            });
        });
        return carga;
    };

    const cargaPuestos = calcularCargaHoraria();

    return (
        <div style={styles.container}>
            <h2 style={styles.title}>🚀 Panel de Control Macro</h2>

            {/* BLOQUE DE INDICADORES (KPIs) */}
            <div style={styles.kpiGrid}>
                <div style={{ ...styles.kpiCard, borderLeft: '5px solid #3498db' }}>
                    <span>Solicitudes Nuevas</span>
                    <h3>{data.solicitudes.filter(s => s.estado === 'Pendiente').length}</h3>
                </div>
                <div style={{ ...styles.kpiCard, borderLeft: '5px solid #27ae60' }}>
                    <span>OTs en Ejecución</span>
                    <h3>{data.ots.length}</h3>
                </div>
                <div style={{ ...styles.kpiCard, borderLeft: '5px solid #f1c40f' }}>
                    <span>Total Horas Planificadas</span>
                    <h3>{Object.values(cargaPuestos).reduce((a, b) => a + b, 0)} hrs</h3>
                </div>
            </div>

            {/* VISTA AGRUPADA: OT -> MÚLTIPLES TAREAS */}
            <div style={styles.tableContainer}>
                <h3 style={{ padding: '15px' }}>Desglose de Operaciones Activas</h3>
                <div style={styles.tableHeader}>
                    <div style={{ width: '250px' }}>OT / Cliente</div>
                    <div style={{ flex: 1 }}>Tareas y Recursos Asignados</div>
                </div>

                {data.ots.map(ot => (
                    <div key={ot.id} style={styles.macroRow}>
                        {/* CELDA MACRO (1 sola por OT) */}
                        <div style={styles.macroCell}>
                            <strong>OT #{ot.id}</strong>
                            <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                                Planificado: {ot.tareas?.length} tareas
                            </div>
                        </div>

                        {/* CELDA MICRO (Crece según las tareas) */}
                        <div style={styles.microContainer}>
                            {ot.tareas?.map((t, idx) => (
                                <div key={idx} style={styles.microRow}>
                                    <div style={{ width: '300px' }}>{t.descripcion}</div>
                                    <div style={styles.badge}>{t.puesto}</div>
                                    <div style={{ width: '80px', textAlign: 'right' }}>{t.duracion}h</div>
                                    <div style={{ width: '120px', textAlign: 'center', color: '#34495e' }}>{t.fecha}</div>
                                </div>
                            ))}
                        </div>
                        <div style={styles.macroCell}>
                            <strong>OT #{ot.id}</strong>
                            <div style={styles.btnGroup}>
                                {/* BOTÓN EDITAR: Envía los datos actuales de la OT a la pantalla de tratamiento */}
                                <button
                                    onClick={() => navigate('/tratamiento', { state: ot })}
                                    style={styles.btnEdit}
                                >
                                    ✏️ Editar Plan
                                </button>

                                <button
                                    onClick={() => props.eliminarOT(ot.id, () => window.location.reload())}
                                    style={styles.btnDelete}
                                >
                                    🗑️ Eliminar
                                </button>
                                <button
                                    onClick={() => props.eliminarOT(ot.id, () => window.location.reload())}
                                    style={styles.btnDelete}
                                >
                                    Generar cotizacion                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ESTILOS PARA VISTA MACRO
const styles = {
    container: { padding: '30px', backgroundColor: '#f4f7f6', minHeight: '100vh' },
    title: { color: '#2c3e50', marginBottom: '25px' },
    kpiGrid: { display: 'flex', gap: '20px', marginBottom: '30px' },
    kpiCard: { flex: 1, background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    tableContainer: { background: 'white', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden' },
    tableHeader: { display: 'flex', background: '#2c3e50', color: 'white', padding: '15px', fontWeight: 'bold' },
    macroRow: { display: 'flex', borderBottom: '1px solid #eee' },
    macroCell: {
        width: '250px',
        padding: '20px',
        backgroundColor: '#fdfdfd',
        borderRight: '1px solid #eee',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
    },
    microContainer: { flex: 1, display: 'flex', flexDirection: 'column' },
    microRow: {
        display: 'flex',
        padding: '12px 15px',
        borderBottom: '1px solid #f9f9f9',
        alignItems: 'center',
        fontSize: '14px'
    },
    badge: {
        padding: '3px 10px',
        borderRadius: '12px',
        background: '#ecf0f1',
        fontSize: '11px',
        fontWeight: 'bold',
        width: '100px',
        textAlign: 'center'
    }
};

export default DashboardScreen;