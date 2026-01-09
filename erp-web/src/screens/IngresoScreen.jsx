import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API = "http://localhost:5000/api";

const IngresoScreen = () => {
    const [solicitudes, setSolicitudes] = useState([]);
    const [form, setForm] = useState({ solicitante: '', descripcion: '', autor: '', origen: 'WhatsApp' });
    const navigate = useNavigate();

    useEffect(() => {
        axios.get(`${API}/data`).then(res => setSolicitudes(res.data.solicitudes));
    }, []);

    const handleCrear = async () => {
        await axios.post(`${API}/solicitudes`, form);
        setForm({ solicitante: '', descripcion: '', autor: '', origen: 'WhatsApp' });
        // Recargar tabla
        const res = await axios.get(`${API}/data`);
        setSolicitudes(res.data.solicitudes);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px' }}>
            {/* RECTÁNGULO SUPERIOR: CREACIÓN */}
            <div style={styles.card}>
                <h2>Crear Nueva Solicitud</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <input placeholder="Solicitante" value={form.solicitante} onChange={e => setForm({ ...form, solicitante: e.target.value })} />
                    <input placeholder="Descripción" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
                    <select value={form.origen} onChange={e => setForm({ ...form, origen: e.target.value })}>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Correo">Correo</option>
                    </select>
                    <button onClick={handleCrear} style={styles.btnPrimario}>Generar</button>
                </div>
            </div>

            {/* RECTÁNGULO INFERIOR: TABLA */}
            <div style={styles.card}>
                <h2>Solicitudes Ingresadas</h2>
                <table width="100%" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th>N°</th><th>Estado</th><th>Solicitante</th><th>Origen</th>
                            <th>Presupuesto + Gantt</th><th>Duracion</th><th>Enviar</th><th>Acción</th><th>Informe/Enviar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {solicitudes.map(s => (
                            <tr key={s.id}>
                                <td>{s.id}</td>
                                <td style={{ fontWeight: 'bold', color: s.estado === 'Tratada' ? '#27ae60' : '#f39c12' }}>
                                    {s.estado}
                                </td>
                                <td>{s.solicitante}</td>
                                <td>{s.origen}</td>
                                <td>
                                    {/* Aquí unificamos todo: 
                  1. Usamos 's' que es la variable del map.
                  2. El texto cambia según el estado.
                */}
                                    <button
                                        onClick={() => navigate('/tratamiento', { state: s })}
                                        style={s.estado === 'Tratada' ? styles.btnEdit : styles.btnTratar}
                                    >
                                        {s.estado === 'Tratada' ? '📝 Editar OT' : '⚙️ Tratar'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const styles = {
    card: { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' },
    btnPrimario: { background: '#007bff', color: 'white', border: 'none', padding: '10px' }
};

export default IngresoScreen;