import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
const DashboardScreen = ({ ots = [], eliminarOT = [], solicitudes = [], actualizarEstadoSolicitud }) => {
    const navigate = useNavigate();
    const [filtro, setFiltro] = useState('todos');

    const totalHoras = ots.reduce((sum, ot) =>
        sum + (ot.tareas || []).reduce((s, t) => s + Number(t.duracion || 0), 0), 0);

    // Pipeline de etapas en orden
    const ETAPAS = [
        { key: 'Solicitud',    label: 'Solicitud',   color: '#95a5a6' },
        { key: 'Tratada',      label: 'Tratamiento', color: '#e67e22' },
        { key: 'Planificada',  label: 'Planificada', color: '#3498db' },
        { key: 'Programada',   label: 'Programada',  color: '#8e44ad' },
        { key: 'En Ejecución', label: 'Ejecución',   color: '#f39c12' },
        { key: 'Trabajo Terminado', label: 'Terminado', color: '#16a085' },
        { key: 'Con Informe',  label: 'Con Informe', color: '#27ae60' },
        { key: 'Pagada',       label: 'Pagada',      color: '#2ecc71' },
    ];

    const etapaIndex = (estadoOT) => ETAPAS.findIndex(e => e.key === estadoOT);
    const colorEstadoOT = (e) => ETAPAS.find(et => et.key === e)?.color || '#95a5a6';
    const colorEstadoSol = (e) => ({ Pendiente: '#f39c12', Aprobada: '#27ae60', Rechazada: '#e74c3c', 'En Proceso': '#3498db' }[e] || '#95a5a6');

    // Combinar: cada solicitud con su OT asociada (si existe)
    const filas = solicitudes.map(s => ({
        solicitud: s,
        ot: ots.find(o => String(o.solicitudId) === String(s._id)) || null
    }));

    // OTs sin solicitud (creadas manualmente)
    const otsSinSolicitud = ots.filter(o =>
        !o.solicitudId || !solicitudes.find(s => String(s._id) === String(o.solicitudId))
    );

    const filasFiltradas = filtro === 'todos'
        ? filas
        : filtro === 'ots'
            ? filas.filter(f => f.ot)
            : filas.filter(f => !f.ot); // solo solicitudes sin OT

    const totalItems = filasFiltradas.length + (filtro !== 'solicitudes' ? otsSinSolicitud.length : 0);

    return (
        <div style={styles.container}>
            <h2 style={styles.title}>🚀 Panel de Control Macro</h2>

            {/* KPIs */}
            <div style={styles.kpiGrid}>
                <div style={{ ...styles.kpiCard, borderLeft: '5px solid #f39c12' }}>
                    <span style={styles.kpiLabel}>Solicitudes Pendientes</span>
                    <h3 style={styles.kpiValue}>{solicitudes.filter(s => s.estado === 'Pendiente').length}</h3>
                </div>
                <div style={{ ...styles.kpiCard, borderLeft: '5px solid #27ae60' }}>
                    <span style={styles.kpiLabel}>OTs Activas</span>
                    <h3 style={styles.kpiValue}>{ots.length}</h3>
                </div>
                <div style={{ ...styles.kpiCard, borderLeft: '5px solid #3498db' }}>
                    <span style={styles.kpiLabel}>Horas Planificadas</span>
                    <h3 style={styles.kpiValue}>{totalHoras} hrs</h3>
                </div>
                <div style={{ ...styles.kpiCard, borderLeft: '5px solid #e74c3c' }}>
                    <span style={styles.kpiLabel}>OTs Pendientes de Pago</span>
                    <h3 style={styles.kpiValue}>{ots.filter(o => !o.pago || o.pago.estado !== 'Pagado' || o.pago.anulado).length}</h3>
                </div>
            </div>

            {/* Tabla unificada */}
            <div style={styles.responsiveWrapper}>
                <div style={styles.tableContainer}>

                    {/* Encabezado con filtros */}
                    <div style={styles.tableTitle}>
                        <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '16px' }}>
                            Desglose de Operaciones Activas
                        </h3>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {[
                                { key: 'todos', label: `Todos (${filas.length + otsSinSolicitud.length})` },
                                { key: 'ots', label: `Con OT (${filas.filter(f => f.ot).length + otsSinSolicitud.length})` },
                                { key: 'solicitudes', label: `Sin OT (${filas.filter(f => !f.ot).length})` },
                            ].map(f => (
                                <button key={f.key} onClick={() => setFiltro(f.key)} style={{
                                    padding: '5px 13px', borderRadius: '15px', border: 'none', cursor: 'pointer',
                                    fontSize: '12px', fontWeight: filtro === f.key ? 'bold' : 'normal',
                                    backgroundColor: filtro === f.key ? '#2c3e50' : '#ecf0f1',
                                    color: filtro === f.key ? 'white' : '#666',
                                    transition: '0.15s'
                                }}>{f.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* Columnas */}
                    <div style={styles.colHeader}>
                        <div style={{ width: '320px' }}>Cliente / Pipeline</div>
                        <div style={{ flex: 1 }}>Detalle</div>
                        <div style={{ width: '200px', textAlign: 'center' }}>Acciones</div>
                    </div>

                    {/* FILAS UNIFICADAS: una fila por solicitud con su OT asociada */}
                    {filasFiltradas.map(({ solicitud: s, ot }) => {
                        const tieneOT = !!ot;
                        const colorBorde = tieneOT ? '#3498db' : colorEstadoSol(s.estado) === '#e74c3c' ? '#e74c3c' : '#f39c12';
                        return (
                            <div key={s._id} style={{ ...styles.fila, borderLeft: `4px solid ${colorBorde}` }}>

                                {/* Columna izquierda: datos de la solicitud + pipeline */}
                                <div style={styles.celdaIzq}>
                                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a2b3c', marginBottom: '1px' }}>
                                        {s.empresaSolicitante}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                                        {s.solicitante} · {s.fechaCreacion ? new Date(s.fechaCreacion).toLocaleDateString('es-CL') : ''}
                                    </div>

                                    {/* Pipeline de etapas */}
                                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                        {ETAPAS.map((etapa, idx) => {
                                            const idxActual = tieneOT ? etapaIndex(ot.estado) : 0;
                                            const esPasada = idx < idxActual;
                                            const esActual = tieneOT ? ot.estado === etapa.key : (etapa.key === 'Solicitud');
                                            return (
                                                <span key={etapa.key} style={{
                                                    fontSize: '9px', padding: '2px 5px', borderRadius: '3px',
                                                    fontWeight: esActual ? 'bold' : 'normal',
                                                    backgroundColor: esActual ? etapa.color : esPasada ? etapa.color + '55' : '#f0f0f0',
                                                    color: esActual ? 'white' : esPasada ? etapa.color : '#ccc',
                                                    border: esActual ? `1px solid ${etapa.color}` : '1px solid transparent',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {idx < idxActual ? '✓' : ''} {etapa.label}
                                                </span>
                                            );
                                        })}
                                    </div>

                                    {tieneOT && ot.pago?.estado && (
                                        <span style={{
                                            ...styles.estadoBadge, marginTop: '6px', display: 'inline-block',
                                            background: ot.pago.anulado ? '#fde8e8' : ot.pago.estado === 'Pagado' ? '#d4edda' : ot.pago.estado === 'Parcial' ? '#fff3cd' : '#f8d7da',
                                            color: ot.pago.anulado ? '#c0392b' : ot.pago.estado === 'Pagado' ? '#155724' : ot.pago.estado === 'Parcial' ? '#856404' : '#721c24'
                                        }}>
                                            {ot.pago.anulado ? '🚫 Pago Anulado' : `💵 ${ot.pago.estado}`}
                                        </span>
                                    )}
                                </div>

                                {/* Columna centro */}
                                <div style={styles.celdaCentro}>
                                    {tieneOT ? (
                                        // Con OT: mostrar tareas
                                        ot.tareas?.length > 0 ? ot.tareas.map((t, idx) => (
                                            <div key={idx} style={styles.filaDetalle}>
                                                <div style={{ flex: 2, color: '#2c3e50' }}>{t.descripcion}</div>
                                                <span style={styles.puestoBadge}>{t.puesto}</span>
                                                <div style={{ width: '48px', textAlign: 'right', color: '#7f8c8d', fontSize: '12px' }}>{t.duracion}h</div>
                                                <div style={{ width: '100px', textAlign: 'right', color: '#bbb', fontSize: '11px' }}>{t.fecha}</div>
                                            </div>
                                        )) : (
                                            <div style={{ padding: '16px 15px', color: '#bbb', fontSize: '13px', fontStyle: 'italic' }}>
                                                OT creada · sin tareas planificadas aún
                                            </div>
                                        )
                                    ) : (
                                        // Sin OT: mostrar descripción de la solicitud
                                        <div style={{ padding: '14px 15px' }}>
                                            <p style={{ margin: '0 0 5px', fontSize: '13px', color: '#2c3e50', lineHeight: '1.5' }}>
                                                {s.descripcion?.length > 160 ? s.descripcion.slice(0, 160) + '…' : s.descripcion}
                                            </p>
                                            {s.fechaEjecucionSolicitada && (
                                                <span style={{ fontSize: '11px', color: '#bbb' }}>
                                                    Para: {new Date(s.fechaEjecucionSolicitada).toLocaleDateString('es-CL')}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Columna acciones */}
                                <div style={styles.celdaAcciones}>
                                    <div style={styles.btnGroup}>
                                        {tieneOT ? (
                                            /* La solicitud ya tiene OT → gestionar la OT */
                                            <>
                                                <button onClick={() => navigate('/tratamiento', { state: ot })}
                                                    style={{ ...styles.btn, background: '#3498db' }}>✏️ Editar OT</button>
                                                <button onClick={() => { if (window.confirm('¿Eliminar esta OT?')) eliminarOT(ot._id, ot.solicitudId); }}
                                                    style={{ ...styles.btn, background: '#e74c3c' }}>🗑️ Eliminar OT</button>
                                            </>
                                        ) : s.estado === 'Pendiente' ? (
                                            /* Solicitud pendiente → aprobar o rechazar */
                                            <>
                                                <button onClick={() => actualizarEstadoSolicitud?.(s._id, 'Aprobada')}
                                                    style={{ ...styles.btn, background: '#27ae60' }}>✅ Aprobar</button>
                                                <button onClick={() => { if (window.confirm('¿Rechazar?')) actualizarEstadoSolicitud?.(s._id, 'Rechazada'); }}
                                                    style={{ ...styles.btn, background: '#e74c3c' }}>✕ Rechazar</button>
                                            </>
                                        ) : s.estado === 'Aprobada' ? (
                                            /* Solicitud aprobada sin OT → crear OT */
                                            <>
                                                <button onClick={() => navigate('/tratamiento', { state: s })}
                                                    style={{ ...styles.btn, background: '#8e44ad' }}>📋 Crear OT</button>
                                                <button onClick={() => { if (window.confirm('¿Rechazar?')) actualizarEstadoSolicitud?.(s._id, 'Rechazada'); }}
                                                    style={{ ...styles.btn, background: '#e74c3c' }}>✕ Rechazar</button>
                                            </>
                                        ) : (
                                            /* Rechazada → solo reabrir */
                                            <button onClick={() => actualizarEstadoSolicitud?.(s._id, 'Pendiente')}
                                                style={{ ...styles.btn, background: '#7f8c8d' }}>↩ Reabrir</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* OTs sin solicitud (creadas manualmente) */}
                    {filtro !== 'solicitudes' && otsSinSolicitud.map(ot => (
                        <div key={ot._id} style={{ ...styles.fila, borderLeft: '4px solid #95a5a6' }}>
                            <div style={styles.celdaIzq}>
                                <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '3px' }}>Sin solicitud</div>
                                <strong style={{ fontSize: '15px', color: '#1a2b3c' }}>OT #{ot.numeroOT || 'S/N'}</strong>
                                <div style={{ fontSize: '12px', color: '#888', margin: '4px 0' }}>{ot.solicitante}</div>
                                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                    <span style={{ ...styles.estadoBadge, background: colorEstadoOT(ot.estado) }}>{ot.estado}</span>
                                    {ot.pago?.estado && (
                                        <span style={{
                                            ...styles.estadoBadge,
                                            background: ot.pago.anulado ? '#fde8e8' : ot.pago.estado === 'Pagado' ? '#d4edda' : ot.pago.estado === 'Parcial' ? '#fff3cd' : '#f8d7da',
                                            color: ot.pago.anulado ? '#c0392b' : ot.pago.estado === 'Pagado' ? '#155724' : ot.pago.estado === 'Parcial' ? '#856404' : '#721c24'
                                        }}>{ot.pago.anulado ? '🚫 Pago Anulado' : `💵 ${ot.pago.estado}`}</span>
                                    )}
                                </div>
                            </div>
                            <div style={styles.celdaCentro}>
                                {ot.tareas?.length > 0 ? ot.tareas.map((t, idx) => (
                                    <div key={idx} style={styles.filaDetalle}>
                                        <div style={{ flex: 2, color: '#2c3e50' }}>{t.descripcion}</div>
                                        <span style={styles.puestoBadge}>{t.puesto}</span>
                                        <div style={{ width: '48px', textAlign: 'right', color: '#7f8c8d', fontSize: '12px' }}>{t.duracion}h</div>
                                        <div style={{ width: '100px', textAlign: 'right', color: '#bbb', fontSize: '11px' }}>{t.fecha}</div>
                                    </div>
                                )) : (
                                    <div style={{ padding: '16px 15px', color: '#bbb', fontSize: '13px', fontStyle: 'italic' }}>Sin tareas planificadas</div>
                                )}
                            </div>
                            <div style={styles.celdaAcciones}>
                                <div style={styles.btnGroup}>
                                    {ot.estado === 'Aprobada' && (
                                        <button onClick={() => navigate('/gantt', { state: { otId: ot._id, programar: true } })}
                                            style={{ ...styles.btn, background: '#8e44ad' }}>🗓️ Programar</button>
                                    )}
                                    <button onClick={() => navigate('/tratamiento', { state: ot })}
                                        style={{ ...styles.btn, background: '#3498db' }}>✏️ Editar Plan</button>
                                    <button onClick={() => eliminarOT(ot._id, ot.solicitudId)}
                                        style={{ ...styles.btn, background: '#e74c3c' }}>🗑️ Eliminar</button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {totalItems === 0 && (
                        <div style={{ padding: '50px', textAlign: 'center', color: '#bbb', fontSize: '14px' }}>
                            Sin operaciones registradas.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const styles = {
    container: {
        width: '100%', maxWidth: '1500px', margin: '0 auto',
        minHeight: '100vh', padding: 'clamp(10px, 3vw, 20px)',
        backgroundColor: '#f0f2f5', boxSizing: 'border-box'
    },
    title: { color: '#2c3e50', marginBottom: '20px' },
    kpiGrid: { display: 'flex', gap: '15px', marginBottom: '25px', flexWrap: 'wrap' },
    kpiCard: {
        flex: '1 1 180px', minWidth: '0', background: 'white',
        padding: '18px 20px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
    },
    kpiLabel: { fontSize: '11px', color: '#999', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' },
    kpiValue: { fontSize: '28px', fontWeight: 'bold', color: '#2c3e50', margin: '6px 0 0' },
    responsiveWrapper: { width: '100%', overflowX: 'auto', paddingBottom: '40px' },
    tableContainer: {
        background: 'white', borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.07)', minWidth: '1150px'
    },
    tableTitle: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '15px 20px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '10px'
    },
    colHeader: {
        display: 'flex', background: '#2c3e50', color: 'white',
        padding: '10px 20px', fontWeight: 'bold', fontSize: '12px',
        textTransform: 'uppercase', letterSpacing: '0.5px'
    },
    fila: {
        display: 'flex', borderBottom: '1px solid #f1f5f9',
        minHeight: '80px', alignItems: 'stretch', transition: '0.1s',
    },
    celdaIzq: {
        width: '320px', padding: '14px 15px', backgroundColor: '#fafbfc',
        borderRight: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center'
    },
    celdaCentro: { flex: 1, display: 'flex', flexDirection: 'column' },
    celdaAcciones: {
        width: '200px', padding: '12px 15px', borderLeft: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    },
    filaDetalle: {
        display: 'flex', padding: '9px 15px', borderBottom: '1px solid #f9f9f9',
        alignItems: 'center', fontSize: '13px', gap: '8px'
    },
    tipoBadge: {
        fontSize: '9px', color: 'white', padding: '2px 6px',
        borderRadius: '4px', fontWeight: 'bold', letterSpacing: '0.5px'
    },
    estadoBadge: {
        display: 'inline-block', fontSize: '10px', color: 'white',
        padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold'
    },
    puestoBadge: {
        padding: '2px 8px', borderRadius: '8px', background: '#eef2f7',
        fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', color: '#555'
    },
    btnGroup: { display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' },
    btn: {
        width: '100%', padding: '7px 10px', color: 'white',
        border: 'none', borderRadius: '5px', cursor: 'pointer',
        fontSize: '12px', fontWeight: 'bold', textAlign: 'center'
    },
};

export default DashboardScreen;
