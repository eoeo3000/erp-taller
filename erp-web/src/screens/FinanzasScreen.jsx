import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { notificar, confirmar } from '../utils/notificar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtFecha = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const mesActual = () => new Date().toISOString().slice(0, 7);

const BADGE_PAGO = {
    Pendiente: { bg: '#fff3cd', color: '#856404' },
    Parcial: { bg: '#cce5ff', color: '#004085' },
    Pagado: { bg: '#d4edda', color: '#155724' }
};

export default function FinanzasScreen({ recursos = [] }) {
    const [tab, setTab] = useState('cobrar');
    const [cuentas, setCuentas] = useState([]);
    const [registros, setRegistros] = useState([]);
    const [resumen, setResumen] = useState([]);
    const [mes, setMes] = useState(mesActual());
    const [cargando, setCargando] = useState(false);

    // ── PAGO PERSONAL: formulario ─────────────────────────────
    const [formPago, setFormPago] = useState({ recursoId: '', fecha: new Date().toISOString().slice(0, 10), horasTrabajadas: 8, notas: '' });
    const [seleccionados, setSeleccionados] = useState(new Set());
    const [modalPagar, setModalPagar] = useState(false);
    const [datosPago, setDatosPago] = useState({ fechaPago: new Date().toISOString().slice(0, 10), metodoPago: 'Transferencia' });

    // ── FILTROS CUENTAS ───────────────────────────────────────
    const [filtroCobrar, setFiltroCobrar] = useState('todos');

    const cargarCuentas = useCallback(async () => {
        const { data } = await axios.get(`${API}/finanzas/cuentas-cobrar`);
        setCuentas(data);
    }, []);

    const cargarRegistros = useCallback(async () => {
        const { data } = await axios.get(`${API}/finanzas/registros-pago?mes=${mes}`);
        setRegistros(data);
    }, [mes]);

    const cargarResumen = useCallback(async () => {
        const { data } = await axios.get(`${API}/finanzas/resumen-mensual`);
        setResumen(data);
    }, []);

    useEffect(() => { if (tab === 'cobrar') cargarCuentas(); }, [tab, cargarCuentas]);
    useEffect(() => { if (tab === 'personal') cargarRegistros(); }, [tab, mes, cargarRegistros]);
    useEffect(() => { if (tab === 'resumen') cargarResumen(); }, [tab, cargarResumen]);

    // ── REGISTRO ASISTENCIA ───────────────────────────────────
    const registrarAsistencia = async () => {
        if (!formPago.recursoId || !formPago.fecha) return notificar.advertencia('Selecciona recurso y fecha');
        try {
            await axios.post(`${API}/finanzas/registros-pago`, formPago);
            setFormPago(f => ({ ...f, recursoId: '', notas: '' }));
            cargarRegistros();
        } catch (err) {
            notificar.error(err.response?.data?.error || 'Error al registrar');
        }
    };

    const eliminarRegistro = async (id) => {
        if (!(await confirmar('¿Eliminar este registro?'))) return;
        await axios.delete(`${API}/finanzas/registros-pago/${id}`);
        cargarRegistros();
    };

    const toggleSeleccion = (id) => {
        setSeleccionados(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    };

    const seleccionarNoPagados = () => {
        const ids = registros.filter(r => !r.pagado).map(r => r._id);
        setSeleccionados(new Set(ids));
    };

    const marcarPagado = async () => {
        if (seleccionados.size === 0) return;
        await axios.post(`${API}/finanzas/registros-pago/marcar-pagado`, {
            ids: [...seleccionados],
            ...datosPago
        });
        setSeleccionados(new Set());
        setModalPagar(false);
        cargarRegistros();
    };

    // ── CÁLCULOS RESUMEN ──────────────────────────────────────
    const totalPorCobrar = cuentas.reduce((a, c) => a + c.saldo, 0);
    const totalCobrado = cuentas.reduce((a, c) => a + c.pagado, 0);

    const totalPendientePersonal = registros.filter(r => !r.pagado).reduce((a, r) => a + r.totalDia, 0);
    const totalPagadoPersonal = registros.filter(r => r.pagado).reduce((a, r) => a + r.totalDia, 0);

    const cuentasFiltradas = filtroCobrar === 'todos' ? cuentas
        : cuentas.filter(c => c.estadoPago === filtroCobrar);

    // ── AGRUPACIÓN POR RECURSO ────────────────────────────────
    const porRecurso = registros.reduce((acc, r) => {
        if (!acc[r.recursoNombre]) acc[r.recursoNombre] = { total: 0, pendiente: 0, registros: [] };
        acc[r.recursoNombre].total += r.totalDia;
        if (!r.pagado) acc[r.recursoNombre].pendiente += r.totalDia;
        acc[r.recursoNombre].registros.push(r);
        return acc;
    }, {});

    const s = {
        container: { padding: '20px', maxWidth: '1200px', margin: '0 auto' },
        tabs: { display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #dee2e6', paddingBottom: '0' },
        tab: (activo) => ({
            padding: '10px 20px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
            background: activo ? '#2c3e50' : '#ecf0f1', color: activo ? 'white' : '#555',
            marginBottom: activo ? '-2px' : '0', borderBottom: activo ? '2px solid #2c3e50' : 'none'
        }),
        card: { background: 'white', borderRadius: '10px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '12px' },
        kpi: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' },
        kpiCard: (color) => ({ background: color, borderRadius: '10px', padding: '16px 20px', color: 'white' }),
        tabla: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
        th: { background: '#2c3e50', color: 'white', padding: '10px 12px', textAlign: 'left', fontWeight: '600' },
        td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' },
        badge: (bg, color) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', background: bg, color }),
        input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
        btn: (bg) => ({ padding: '8px 16px', background: bg, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }),
    };

    return (
        <div style={s.container}>
            <h2 style={{ color: '#2c3e50', margin: '0 0 20px' }}>💰 Módulo Financiero</h2>

            {/* TABS */}
            <div style={s.tabs}>
                {[['cobrar', '📋 Cuentas por Cobrar'], ['personal', '👷 Pago de Personal'], ['resumen', '📊 Resumen Mensual']].map(([k, label]) => (
                    <button key={k} style={s.tab(tab === k)} onClick={() => setTab(k)}>{label}</button>
                ))}
            </div>

            {/* ══════════════════════════════════════════════════════
                TAB 1: CUENTAS POR COBRAR
            ══════════════════════════════════════════════════════ */}
            {tab === 'cobrar' && (
                <div>
                    {/* KPIs */}
                    <div style={s.kpi}>
                        <div style={s.kpiCard('#27ae60')}>
                            <div style={{ fontSize: '12px', opacity: 0.85 }}>Total Cobrado</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{fmt(totalCobrado)}</div>
                        </div>
                        <div style={s.kpiCard('#e74c3c')}>
                            <div style={{ fontSize: '12px', opacity: 0.85 }}>Saldo por Cobrar</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{fmt(totalPorCobrar)}</div>
                        </div>
                        <div style={s.kpiCard('#2980b9')}>
                            <div style={{ fontSize: '12px', opacity: 0.85 }}>Total OTs</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{cuentas.length}</div>
                        </div>
                    </div>

                    {/* Filtro */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                        {['todos', 'Pendiente', 'Parcial', 'Pagado'].map(f => (
                            <button key={f} onClick={() => setFiltroCobrar(f)}
                                style={{ ...s.btn(filtroCobrar === f ? '#2c3e50' : '#ecf0f1'), color: filtroCobrar === f ? 'white' : '#555' }}>
                                {f === 'todos' ? 'Todos' : f}
                            </button>
                        ))}
                    </div>

                    {/* Tabla */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={s.tabla}>
                            <thead>
                                <tr>
                                    {['N° OT', 'Solicitante', 'Descripción', 'Estado OT', 'Total', 'Cobrado', 'Saldo', 'Estado Pago', 'Fecha Pago'].map(h => (
                                        <th key={h} style={s.th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {cuentasFiltradas.length === 0 && (
                                    <tr><td colSpan="9" style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>Sin registros</td></tr>
                                )}
                                {cuentasFiltradas.map(c => {
                                    const bp = BADGE_PAGO[c.estadoPago] || BADGE_PAGO.Pendiente;
                                    const anulado = c.pagoAnulado;
                                    return (
                                        <tr key={c._id} style={{ opacity: anulado ? 0.65 : 1, background: anulado ? '#fff8f8' : 'white' }}>
                                            <td style={{ ...s.td, fontWeight: 'bold', color: '#2980b9' }}>{c.numeroOT}</td>
                                            <td style={s.td}>{c.solicitante}</td>
                                            <td style={{ ...s.td, maxWidth: '200px' }}>{c.descripcion}</td>
                                            <td style={s.td}><span style={s.badge('#eaf2ff', '#2471a3')}>{c.estado}</span></td>
                                            <td style={{ ...s.td, fontWeight: 'bold' }}>{fmt(c.total)}</td>
                                            <td style={{ ...s.td, color: anulado ? '#aaa' : '#27ae60', fontWeight: 'bold', textDecoration: anulado ? 'line-through' : 'none' }}>{fmt(c.pagado)}</td>
                                            <td style={{ ...s.td, color: c.saldo > 0 ? '#e74c3c' : '#27ae60', fontWeight: 'bold' }}>{fmt(c.saldo)}</td>
                                            <td style={s.td}>
                                                {anulado
                                                    ? <span style={s.badge('#fde8e8', '#c0392b')}>🚫 Anulado</span>
                                                    : <span style={s.badge(bp.bg, bp.color)}>{c.estadoPago}</span>
                                                }
                                            </td>
                                            <td style={s.td}>{fmtFecha(c.fechaPago)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 2: PAGO DE PERSONAL
            ══════════════════════════════════════════════════════ */}
            {tab === 'personal' && (
                <div>
                    {/* KPIs */}
                    <div style={s.kpi}>
                        <div style={s.kpiCard('#e74c3c')}>
                            <div style={{ fontSize: '12px', opacity: 0.85 }}>Por Pagar ({mes})</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{fmt(totalPendientePersonal)}</div>
                        </div>
                        <div style={s.kpiCard('#27ae60')}>
                            <div style={{ fontSize: '12px', opacity: 0.85 }}>Pagado ({mes})</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{fmt(totalPagadoPersonal)}</div>
                        </div>
                    </div>

                    {/* Formulario registro */}
                    <div style={s.card}>
                        <div style={{ fontWeight: 'bold', marginBottom: '12px', color: '#2c3e50' }}>➕ Registrar Día Asistido</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'end' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Recurso</label>
                                <select style={s.input} value={formPago.recursoId} onChange={e => setFormPago(f => ({ ...f, recursoId: e.target.value }))}>
                                    <option value="">Seleccionar...</option>
                                    {recursos.filter(r => r.tipo === 'Humano').map(r => (
                                        <option key={r._id} value={r._id}>{r.nombre} — {fmt(r.tarifaHora || 0)}/hr</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Fecha</label>
                                <input type="date" style={s.input} value={formPago.fecha} onChange={e => setFormPago(f => ({ ...f, fecha: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Horas trabajadas</label>
                                <input type="number" style={s.input} value={formPago.horasTrabajadas} min="1" max="24"
                                    onChange={e => setFormPago(f => ({ ...f, horasTrabajadas: Number(e.target.value) }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Notas</label>
                                <input style={s.input} placeholder="Opcional..." value={formPago.notas} onChange={e => setFormPago(f => ({ ...f, notas: e.target.value }))} />
                            </div>
                            <div>
                                <button style={s.btn('#27ae60')} onClick={registrarAsistencia}>Registrar</button>
                            </div>
                        </div>
                    </div>

                    {/* Filtro mes */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Mes:</label>
                        <input type="month" style={{ ...s.input, width: 'auto' }} value={mes} onChange={e => setMes(e.target.value)} />
                        {seleccionados.size > 0 && (
                            <button style={s.btn('#e67e22')} onClick={() => setModalPagar(true)}>
                                💳 Pagar seleccionados ({seleccionados.size})
                            </button>
                        )}
                        <button style={{ ...s.btn('#ecf0f1'), color: '#555' }} onClick={seleccionarNoPagados}>
                            Seleccionar pendientes
                        </button>
                    </div>

                    {/* Agrupado por recurso */}
                    {Object.entries(porRecurso).map(([nombre, datos]) => (
                        <div key={nombre} style={{ ...s.card, marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>👷 {nombre}</div>
                                <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                                    <span>Total: <strong>{fmt(datos.total)}</strong></span>
                                    {datos.pendiente > 0 && <span style={{ color: '#e74c3c' }}>Por pagar: <strong>{fmt(datos.pendiente)}</strong></span>}
                                </div>
                            </div>
                            <table style={s.tabla}>
                                <thead>
                                    <tr>
                                        <th style={s.th}></th>
                                        <th style={s.th}>Fecha</th>
                                        <th style={s.th}>Horas</th>
                                        <th style={s.th}>Tarifa/hr</th>
                                        <th style={s.th}>Total día</th>
                                        <th style={s.th}>Estado</th>
                                        <th style={s.th}>Fecha Pago</th>
                                        <th style={s.th}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {datos.registros.map(r => (
                                        <tr key={r._id} style={{ background: r.pagado ? '#f9fff9' : 'white' }}>
                                            <td style={s.td}>
                                                {!r.pagado && (
                                                    <input type="checkbox" checked={seleccionados.has(r._id)}
                                                        onChange={() => toggleSeleccion(r._id)} />
                                                )}
                                            </td>
                                            <td style={s.td}>{fmtFecha(r.fecha)}</td>
                                            <td style={s.td}>{r.horasTrabajadas}h</td>
                                            <td style={s.td}>{fmt(r.tarifaHora)}</td>
                                            <td style={{ ...s.td, fontWeight: 'bold' }}>{fmt(r.totalDia)}</td>
                                            <td style={s.td}>
                                                <span style={s.badge(r.pagado ? '#d4edda' : '#fff3cd', r.pagado ? '#155724' : '#856404')}>
                                                    {r.pagado ? '✓ Pagado' : '⏳ Pendiente'}
                                                </span>
                                            </td>
                                            <td style={s.td}>{r.pagado ? fmtFecha(r.fechaPago) : '—'}</td>
                                            <td style={s.td}>
                                                {!r.pagado && (
                                                    <button onClick={() => eliminarRegistro(r._id)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: '16px' }}>🗑️</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}

                    {registros.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#aaa', padding: '40px' }}>Sin registros para {mes}</div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                TAB 3: RESUMEN MENSUAL
            ══════════════════════════════════════════════════════ */}
            {tab === 'resumen' && (
                <div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={s.tabla}>
                            <thead>
                                <tr>
                                    {['Mes', 'Ingresos Cobrados', 'Gasto Personal', 'Gasto Materiales', 'Total Gastos', 'Resultado'].map(h => (
                                        <th key={h} style={s.th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {resumen.length === 0 && (
                                    <tr><td colSpan="6" style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>Sin datos</td></tr>
                                )}
                                {resumen.map(r => (
                                    <tr key={r.mes}>
                                        <td style={{ ...s.td, fontWeight: 'bold' }}>{r.mes}</td>
                                        <td style={{ ...s.td, color: '#27ae60', fontWeight: 'bold' }}>{fmt(r.ingresos)}</td>
                                        <td style={{ ...s.td, color: '#e74c3c' }}>{fmt(r.personal)}</td>
                                        <td style={{ ...s.td, color: '#e67e22' }}>{fmt(r.materiales)}</td>
                                        <td style={{ ...s.td, fontWeight: 'bold', color: '#c0392b' }}>{fmt(r.totalGastos)}</td>
                                        <td style={{ ...s.td, fontWeight: 'bold', color: r.resultado >= 0 ? '#27ae60' : '#e74c3c', fontSize: '15px' }}>
                                            {r.resultado >= 0 ? '▲' : '▼'} {fmt(Math.abs(r.resultado))}
                                        </td>
                                    </tr>
                                ))}
                                {resumen.length > 1 && (() => {
                                    const totales = resumen.reduce((a, r) => ({
                                        ingresos: a.ingresos + r.ingresos,
                                        personal: a.personal + r.personal,
                                        materiales: a.materiales + r.materiales,
                                        totalGastos: a.totalGastos + r.totalGastos,
                                        resultado: a.resultado + r.resultado
                                    }), { ingresos: 0, personal: 0, materiales: 0, totalGastos: 0, resultado: 0 });
                                    return (
                                        <tr style={{ background: '#2c3e50', color: 'white' }}>
                                            <td style={{ ...s.td, color: 'white', fontWeight: 'bold' }}>TOTAL</td>
                                            <td style={{ ...s.td, color: '#82e0aa', fontWeight: 'bold' }}>{fmt(totales.ingresos)}</td>
                                            <td style={{ ...s.td, color: '#f1948a' }}>{fmt(totales.personal)}</td>
                                            <td style={{ ...s.td, color: '#f0b27a' }}>{fmt(totales.materiales)}</td>
                                            <td style={{ ...s.td, color: '#f1948a', fontWeight: 'bold' }}>{fmt(totales.totalGastos)}</td>
                                            <td style={{ ...s.td, fontWeight: 'bold', color: totales.resultado >= 0 ? '#82e0aa' : '#f1948a', fontSize: '15px' }}>
                                                {totales.resultado >= 0 ? '▲' : '▼'} {fmt(Math.abs(totales.resultado))}
                                            </td>
                                        </tr>
                                    );
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* MODAL MARCAR PAGADO */}
            {modalPagar && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '16px', color: '#2c3e50' }}>
                            💳 Registrar Pago — {seleccionados.size} registros
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Fecha de Pago</label>
                                <input type="date" style={s.input} value={datosPago.fechaPago}
                                    onChange={e => setDatosPago(d => ({ ...d, fechaPago: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Método</label>
                                <select style={s.input} value={datosPago.metodoPago}
                                    onChange={e => setDatosPago(d => ({ ...d, metodoPago: e.target.value }))}>
                                    <option>Transferencia</option>
                                    <option>Efectivo</option>
                                    <option>Cheque</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button style={{ ...s.btn('#27ae60'), flex: 1 }} onClick={marcarPagado}>Confirmar Pago</button>
                            <button style={{ ...s.btn('#ecf0f1'), color: '#555', flex: 1 }} onClick={() => setModalPagar(false)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
