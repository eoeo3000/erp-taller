import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

const TratamientoScreen = () => {
    const { state: solicitud } = useLocation();
    const navigate = useNavigate();
    const [tabActiva, setTabActiva] = useState('tareas');

    const [tareas, setTareas] = useState([
        { id: 1, descripcion: '', puesto: '', duracion: '', fecha: '', hora: '' }
    ]);
    const [componentes, setComponentes] = useState([]);

    const agregarTarea = () => {
        setTareas([...tareas, { id: tareas.length + 1, descripcion: '', puesto: '', duracion: '', fecha: '', hora: '' }]);
    };

    const agregarComponente = () => {
        setComponentes([...componentes, { id: componentes.length + 1, codigo: '', cantidad: '', tareaVinculada: '' }]);
    };

    // Actualizar campos específicos de una tarea
    const actualizarTarea = (index, campo, valor) => {
        const nuevasTareas = [...tareas];
        nuevasTareas[index][campo] = valor;
        setTareas(nuevasTareas);
    };

    const finalizar = async () => {
        try {
            const payload = {
                solicitudId: solicitud.id,
                tareas: tareas,
                componentes: componentes
            };
            await axios.post('http://localhost:5000/api/convertir-ot', payload);
            navigate('/gantt');
        } catch (error) {
            console.error("Error al guardar:", error);
            alert("Error al conectar con el servidor");
        }
    };

    if (!solicitud) return <div style={{ padding: '50px' }}>Seleccione una solicitud en Ingreso</div>;

    return (
        <div style={styles.container}>
            <div style={styles.cardFull}>
                <div style={styles.header}>
                    <h2>Tratamiento Técnico: Solicitud #{solicitud.id}</h2>
                    <p>Cliente: <strong>{solicitud.solicitante}</strong> | Item: <strong>{solicitud.descripcion}</strong></p>
                </div>

                <div style={styles.tabBar}>
                    <button onClick={() => setTabActiva('tareas')} style={tabActiva === 'tareas' ? styles.tabBtnActive : styles.tabBtn}>1. Planificación de Tareas</button>
                    <button onClick={() => setTabActiva('componentes')} style={tabActiva === 'componentes' ? styles.tabBtnActive : styles.tabBtn}>2. Materiales / Componentes</button>
                </div>

                <div style={styles.content}>
                    {tabActiva === 'tareas' ? (
                        <div>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: '#f8f9fa' }}>
                                        <th style={{ padding: '10px' }}>Descripción de la Tarea</th>
                                        <th>Puesto de Trabajo</th>
                                        <th>Duración (Hrs)</th>
                                        <th>Fecha Inicio</th>
                                        <th>Hora Inicio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tareas.map((t, index) => (
                                        <tr key={t.id}>
                                            <td>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: Desmontaje de motor"
                                                    style={styles.inputTable}
                                                    value={t.descripcion}
                                                    onChange={(e) => actualizarTarea(index, 'descripcion', e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    style={styles.inputTable}
                                                    value={t.puesto}
                                                    onChange={(e) => actualizarTarea(index, 'puesto', e.target.value)}
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    <option value="Mecánico">Mecánico</option>
                                                    <option value="Eléctrico">Eléctrico</option>
                                                    <option value="Soldador">Soldador</option>
                                                    <option value="Ayudante">Ayudante</option>
                                                </select>
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    style={styles.inputTable}
                                                    value={t.duracion}
                                                    onChange={(e) => actualizarTarea(index, 'duracion', e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="date"
                                                    style={styles.inputTable}
                                                    value={t.fecha}
                                                    onChange={(e) => actualizarTarea(index, 'fecha', e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="time"
                                                    style={styles.inputTable}
                                                    value={t.hora}
                                                    onChange={(e) => actualizarTarea(index, 'hora', e.target.value)}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={agregarTarea} style={styles.btnAdd}>+ Añadir Nueva Tarea</button>
                        </div>
                    ) : (
                        <div>
                            {/* Pestaña de Componentes (Ya configurada correctamente) */}
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Código Componente</th>
                                        <th>Cantidad</th>
                                        <th>Vincular a Tarea</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {componentes.map((c, index) => (
                                        <tr key={c.id}>
                                            <td><input type="text" placeholder="Código" style={styles.inputTable} /></td>
                                            <td><input type="number" placeholder="0" style={styles.inputTable} /></td>
                                            <td>
                                                <select style={styles.inputTable}>
                                                    <option value="">Seleccionar tarea...</option>
                                                    {tareas.map(t => (
                                                        <option key={t.id} value={t.id}>
                                                            {t.descripcion ? `${t.puesto}: ${t.descripcion}` : `Tarea ${t.id}`}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={agregarComponente} style={styles.btnAdd}>+ Añadir Material</button>
                        </div>
                    )}
                </div>

                <button onClick={finalizar} style={styles.btnSuccess}>APROBAR Y GENERAR PLANO COMPLETO</button>
            </div>
        </div>
    );
};

const styles = {
    container: { width: '100%', minHeight: '100vh', padding: '20px', backgroundColor: '#f0f2f5', boxSizing: 'border-box' },
    cardFull: { width: '100%', background: 'white', borderRadius: '10px', padding: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
    header: { borderBottom: '2px solid #3498db', marginBottom: '20px', paddingBottom: '10px' },
    tabBar: { display: 'flex', gap: '5px' },
    tabBtn: { padding: '12px 25px', border: '1px solid #ddd', background: '#f8f9fa', cursor: 'pointer', borderRadius: '8px 8px 0 0' },
    tabBtnActive: { padding: '12px 25px', border: '1px solid #3498db', borderBottom: 'none', background: 'white', fontWeight: 'bold', color: '#3498db', borderRadius: '8px 8px 0 0' },
    content: { border: '1px solid #ddd', padding: '20px', borderRadius: '0 8px 8px 8px', minHeight: '300px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    inputTable: { width: '95%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' },
    btnAdd: { marginTop: '15px', padding: '10px 20px', background: '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' },
    btnSuccess: { width: '100%', marginTop: '30px', padding: '20px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }
};

export default TratamientoScreen;