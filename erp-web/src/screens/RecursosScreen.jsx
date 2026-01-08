import React, { useState, useEffect } from 'react';
import axios from 'axios';

const RecursosScreen = () => {
    const [recursos, setRecursos] = useState([]);
    const [mesActual] = useState(new Date()); // Enero 2026
    const [recursoSeleccionado, setRecursoSeleccionado] = useState(null);
    const [nuevoRecurso, setNuevoRecurso] = useState({ nombre: '', tipo: 'Humano', especialidad: '' });
    const [anio] = useState(2026);
    const [mes] = useState(0); // 0 es Enero
    // Generamos los objetos de día con nombre y número

    const diasDelMes = Array.from({ length: 31 }, (_, i) => {
        const fecha = new Date(anio, mes, i + 1);
        const opciones = { weekday: 'short' }; // "lun", "mar", etc.
        return {
            numero: i + 1,
            nombreDia: new Intl.DateTimeFormat('es-ES', opciones).format(fecha),
            esFinde: fecha.getDay() === 0 || fecha.getDay() === 6 // Domingo=0, Sábado=6
        };
    });
    // Generar array de días del mes actual para la cabecera del Gantt


    useEffect(() => { fetchRecursos(); }, []);

    const fetchRecursos = async () => {
        const res = await axios.get('http://localhost:5000/api/recursos');
        setRecursos(res.data);
    };

    const guardarRecurso = async () => {
        await axios.post('http://localhost:5000/api/recursos', nuevoRecurso);
        setNuevoRecurso({ nombre: '', tipo: 'Humano', especialidad: '' });
        fetchRecursos();
    };

    const toggleAusencia = async (recurso, dia) => {
        const fechaStr = `2026-01-${dia.toString().padStart(2, '0')}`;
        const motivo = prompt("Motivo de la ausencia:", "Vacaciones/Licencia");

        if (motivo) {
            try {
                await axios.post(`http://localhost:5000/api/recursos/${recurso.id}/ausencia`, {
                    fecha: fechaStr,
                    motivo: motivo
                });
                fetchRecursos(); // Recargar para ver el cuadrito rojo
            } catch (e) { console.error(e); }
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2>⚙️ Gestión de Recursos y Matriz de Disponibilidad</h2>
                <p>Enero 2026 - Haz clic en los días para alternar disponibilidad.</p>
            </div>
            <div style={styles.layout}>
                {/* FORMULARIO DE ALTA */}
                <div style={styles.aside}>
                    <h3>Registrar Nuevo</h3>
                    <div style={styles.form}>
                        <label>Nombre / Identificador</label>
                        <input value={nuevoRecurso.nombre} onChange={e => setNuevoRecurso({ ...nuevoRecurso, nombre: e.target.value })} placeholder="Ej: Juan Pérez o Torno CNC-01" style={styles.input} />

                        <label>Tipo de Recurso</label>
                        <select value={nuevoRecurso.tipo} onChange={e => setNuevoRecurso({ ...nuevoRecurso, tipo: e.target.value })} style={styles.input}>
                            <option value="Humano">Personal (Humano)</option>
                            <option value="Maquina">Maquinaria / Equipo</option>
                        </select>

                        <label>Especialidad / Área</label>
                        <select value={nuevoRecurso.especialidad} onChange={e => setNuevoRecurso({ ...nuevoRecurso, especialidad: e.target.value })} style={styles.input}>
                            <option value="">Seleccionar...</option>
                            <option value="Mecánico">Mecánica</option>
                            <option value="Soldador">Soldadura</option>
                            <option value="Eléctrico">Electricidad</option>
                            <option value="Tornería">Tornería</option>
                        </select>

                        <button onClick={guardarRecurso} style={styles.btnPrimary}>Añadir Recurso</button>
                    </div>
                </div>

                <div style={styles.ganttContainer}>
                    <table style={styles.ganttTable}>
                        <thead>
                            <tr>
                                <th style={styles.recursoColHeader}>Recurso / Día</th>
                                {diasDelMes.map(d => (
                                    <th key={d.numero} style={{
                                        ...styles.diaCol,
                                        backgroundColor: d.esFinde ? '#dfe6e9' : '#f8f9fa',
                                        color: d.esFinde ? '#7f8c8d' : '#2c3e50',
                                        borderBottom: '2px solid #ddd'
                                    }}>
                                        {/* Aquí van los dos niveles: Nombre y Número */}
                                        <div style={{ fontSize: '10px', textTransform: 'uppercase' }}>{d.nombreDia}</div>
                                        <div style={{ fontSize: '14px' }}>{d.numero}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {recursos.map(r => (
                                <tr key={r.id}>
                                    <td style={styles.recursoName}>
                                        <strong>{r.nombre}</strong> <br />
                                        <small>{r.especialidad}</small>
                                    </td>
                                    {diasDelMes.map(d => {
                                        const fechaCelda = `2026-01-${d.toString().padStart(2, '0')}`;
                                        const esAusente = r.disponibilidad?.find(a => a.fecha === fechaCelda);

                                        return (
                                            <td
                                                key={d}
                                                onClick={() => toggleAusencia(r, d)}
                                                style={{
                                                    ...styles.celdaDia,
                                                    backgroundColor: esAusente ? '#e74c3c' : '#2ecc71',
                                                    cursor: 'pointer'
                                                }}
                                                title={esAusente ? `Motivo: ${esAusente.motivo}` : 'Disponible (Click para ausencia)'}
                                            >
                                                {esAusente ? '✖' : ''}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const styles = {
    container: { padding: '20px', backgroundColor: '#fff', minHeight: '100vh' },
    ganttContainer: { overflowX: 'auto', marginTop: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' },
    ganttTable: { width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' },
    recursoCol: { minWidth: '150px', padding: '10px', background: '#2c3e50', color: 'white', position: 'sticky', left: 0 },
    diaCol: { padding: '5px', fontSize: '12px', border: '1px solid #ddd', minWidth: '30px', background: '#f8f9fa' },
    recursoName: { padding: '10px', border: '1px solid #ddd', background: '#fff', position: 'sticky', left: 0, zIndex: 1 },
    celdaDia: { border: '1px solid #ddd', textAlign: 'center', color: 'white', transition: 'all 0.2s' }
};

export default RecursosScreen;