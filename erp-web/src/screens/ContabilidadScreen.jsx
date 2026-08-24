import { useState, useEffect, useCallback } from 'react';
import { headerEntorno } from '../utils/entorno';
import { notificar, confirmar } from '../utils/notificar';

const CLP = n => (Number(n) || 0).toLocaleString('es-CL');
const hoy = () => new Date().toISOString().slice(0, 10);
const primerDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

const TIPOS_CUENTA = ['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto'];
const NATURALEZA = { Activo: 'Deudora', Pasivo: 'Acreedora', Patrimonio: 'Acreedora', Ingreso: 'Acreedora', Gasto: 'Deudora' };

const lineaVacia = () => ({ cuentaId: '', debe: '', haber: '', glosa: '' });

export default function ContabilidadScreen({ API }) {
    const [tab, setTab] = useState('cuentas');

    // ── CUENTAS ──
    const [cuentas, setCuentas] = useState([]);
    const [modalCuenta, setModalCuenta] = useState(false);
    const [editCuenta, setEditCuenta] = useState(null);
    const [formCuenta, setFormCuenta] = useState({ codigo: '', nombre: '', tipo: 'Activo', naturaleza: 'Deudora', descripcion: '' });

    // ── DIARIO ──
    const [asientos, setAsientos] = useState([]);
    const [expandido, setExpandido] = useState(null);
    const [filtroDiario, setFiltroDiario] = useState({ desde: primerDiaMes(), hasta: hoy(), tipo: '' });
    const [modalAsiento, setModalAsiento] = useState(false);
    const [formAsiento, setFormAsiento] = useState({ fecha: hoy(), descripcion: '', lineas: [lineaVacia(), lineaVacia()] });
    const [modalAnular, setModalAnular] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('');

    // ── MAYOR ──
    const [mayorCuentaId, setMayorCuentaId] = useState('');
    const [mayorDesde, setMayorDesde] = useState(primerDiaMes());
    const [mayorHasta, setMayorHasta] = useState(hoy());
    const [mayor, setMayor] = useState(null);

    // ── REPORTES ──
    const [subReporte, setSubReporte] = useState('comprobacion');
    const [rpDesde, setRpDesde] = useState(primerDiaMes());
    const [rpHasta, setRpHasta] = useState(hoy());
    const [datosReporte, setDatosReporte] = useState(null);
    const [loadingReporte, setLoadingReporte] = useState(false);

    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // ── FETCH CUENTAS ──
    const fetchCuentas = useCallback(async () => {
        try {
            const r = await fetch(`${API}/contabilidad/cuentas`, { headers: headerEntorno() });
            const d = await r.json();
            setCuentas(d);
        } catch { setError('No se pudo cargar el plan de cuentas'); }
    }, [API]);

    useEffect(() => { fetchCuentas(); }, [fetchCuentas]);

    // ── FETCH ASIENTOS ──
    const fetchAsientos = useCallback(async () => {
        const params = new URLSearchParams();
        if (filtroDiario.desde) params.set('desde', filtroDiario.desde);
        if (filtroDiario.hasta) params.set('hasta', filtroDiario.hasta);
        if (filtroDiario.tipo) params.set('tipo', filtroDiario.tipo);
        try {
            const r = await fetch(`${API}/contabilidad/asientos?${params}`, { headers: headerEntorno() });
            const d = await r.json();
            setAsientos(Array.isArray(d) ? d : []);
        } catch { setError('No se pudo cargar el libro diario'); }
    }, [API, filtroDiario]);

    useEffect(() => { if (tab === 'diario') fetchAsientos(); }, [tab, fetchAsientos]);

    // ── CUENTAS CRUD ──
    const abrirNuevaCuenta = () => {
        setEditCuenta(null);
        setFormCuenta({ codigo: '', nombre: '', tipo: 'Activo', naturaleza: 'Deudora', descripcion: '' });
        setModalCuenta(true);
    };
    const abrirEditarCuenta = (c) => {
        setEditCuenta(c);
        setFormCuenta({ codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, naturaleza: c.naturaleza, descripcion: c.descripcion || '' });
        setModalCuenta(true);
    };
    const guardarCuenta = async () => {
        if (!formCuenta.codigo || !formCuenta.nombre) return setError('Código y nombre son obligatorios');
        setSaving(true);
        try {
            const url = editCuenta ? `${API}/contabilidad/cuentas/${editCuenta._id}` : `${API}/contabilidad/cuentas`;
            const method = editCuenta ? 'PUT' : 'POST';
            const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headerEntorno() }, body: JSON.stringify(formCuenta) });
            const d = await r.json();
            if (!r.ok) return setError(d.error || 'Error al guardar');
            await fetchCuentas();
            setModalCuenta(false);
        } catch { setError('Error de conexión'); }
        finally { setSaving(false); }
    };
    const eliminarCuenta = async (id) => {
        if (!(await confirmar('¿Eliminar esta cuenta?'))) return;
        const r = await fetch(`${API}/contabilidad/cuentas/${id}`, { method: 'DELETE', headers: headerEntorno() });
        const d = await r.json();
        if (!r.ok) return notificar.error(d.error);
        fetchCuentas();
    };

    // ── ASIENTO MANUAL ──
    const abrirNuevoAsiento = () => {
        setFormAsiento({ fecha: hoy(), descripcion: '', lineas: [lineaVacia(), lineaVacia()] });
        setModalAsiento(true);
    };
    const setLinea = (i, campo, val) => {
        setFormAsiento(prev => {
            const lineas = [...prev.lineas];
            lineas[i] = { ...lineas[i], [campo]: val };
            // Si se ingresa debe, limpiar haber y viceversa para facilitar ingreso
            return { ...prev, lineas };
        });
    };
    const agregarLinea = () => setFormAsiento(prev => ({ ...prev, lineas: [...prev.lineas, lineaVacia()] }));
    const quitarLinea = (i) => setFormAsiento(prev => ({ ...prev, lineas: prev.lineas.filter((_, j) => j !== i) }));

    const totalDebe = formAsiento.lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
    const totalHaber = formAsiento.lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
    const balanceado = Math.abs(totalDebe - totalHaber) < 0.01 && totalDebe > 0;

    const guardarAsiento = async () => {
        if (!formAsiento.fecha || !formAsiento.descripcion) return setError('Fecha y descripción son obligatorios');
        if (!balanceado) return setError('El asiento no cuadra: Debe ≠ Haber');
        const lineasValidas = formAsiento.lineas.filter(l => l.cuentaId && (Number(l.debe) > 0 || Number(l.haber) > 0));
        if (lineasValidas.length < 2) return setError('Se requieren al menos 2 líneas con monto');
        setSaving(true);
        try {
            const r = await fetch(`${API}/contabilidad/asientos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headerEntorno() },
                body: JSON.stringify({ ...formAsiento, lineas: lineasValidas })
            });
            const d = await r.json();
            if (!r.ok) return setError(d.error || 'Error al guardar');
            setModalAsiento(false);
            fetchAsientos();
        } catch { setError('Error de conexión'); }
        finally { setSaving(false); }
    };

    const confirmarAnulacion = async () => {
        if (!modalAnular) return;
        const r = await fetch(`${API}/contabilidad/asientos/${modalAnular._id}/anular`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...headerEntorno() },
            body: JSON.stringify({ motivo: motivoAnulacion })
        });
        const d = await r.json();
        if (!r.ok) return notificar.error(d.error);
        setModalAnular(null);
        setMotivoAnulacion('');
        fetchAsientos();
    };

    // ── LIBRO MAYOR ──
    const fetchMayor = async () => {
        if (!mayorCuentaId) return;
        const params = new URLSearchParams();
        if (mayorDesde) params.set('desde', mayorDesde);
        if (mayorHasta) params.set('hasta', mayorHasta);
        try {
            const r = await fetch(`${API}/contabilidad/mayor/${mayorCuentaId}?${params}`, { headers: headerEntorno() });
            const d = await r.json();
            setMayor(r.ok ? d : null);
            if (!r.ok) setError(d.error);
        } catch { setError('Error al cargar libro mayor'); }
    };

    // ── REPORTES ──
    const fetchReporte = async () => {
        setLoadingReporte(true);
        setDatosReporte(null);
        try {
            const params = new URLSearchParams({ desde: rpDesde, hasta: rpHasta });
            const endpoint = subReporte === 'comprobacion' ? 'balance-comprobacion'
                : subReporte === 'resultados' ? 'estado-resultados'
                : 'balance-general';
            const url = subReporte === 'comprobacion'
                ? `${API}/contabilidad/${endpoint}?hasta=${rpHasta}`
                : `${API}/contabilidad/${endpoint}?${params}`;
            const r = await fetch(url, { headers: headerEntorno() });
            const d = await r.json();
            setDatosReporte(r.ok ? d : null);
            if (!r.ok) setError(d.error);
        } catch { setError('Error al generar reporte'); }
        finally { setLoadingReporte(false); }
    };

    // ── HELPERS UI ──
    const cuentasOperativas = cuentas.filter(c => c.nivel === 3 && c.activa !== false);
    const cuentasPorTipo = TIPOS_CUENTA.reduce((acc, t) => {
        acc[t] = cuentas.filter(c => c.tipo === t).sort((a, b) => a.codigo.localeCompare(b.codigo));
        return acc;
    }, {});

    const BADGE_TIPO = { manual: { bg: '#e8f4fd', color: '#1565c0', label: 'Manual' }, automatico: { bg: '#e8f5e9', color: '#2e7d32', label: 'Automático' } };
    const BADGE_ESTADO = { vigente: { bg: '#e8f5e9', color: '#2e7d32' }, anulado: { bg: '#fce4ec', color: '#c62828' } };

    const s = styles;

    return (
        <div style={s.page}>
            {error && (
                <div style={s.errorBar} onClick={() => setError('')}>
                    ⚠️ {error} <span style={{ marginLeft: 8, cursor: 'pointer' }}>✕</span>
                </div>
            )}

            <div style={s.header}>
                <h2 style={s.titulo}>📒 Contabilidad General</h2>
                <div style={s.tabBar}>
                    {[['cuentas', '🗂️ Plan de Cuentas'], ['diario', '📔 Libro Diario'], ['mayor', '📖 Libro Mayor'], ['reportes', '📊 Reportes']].map(([k, lbl]) => (
                        <button key={k} onClick={() => setTab(k)} style={{ ...s.tabBtn, ...(tab === k ? s.tabActivo : {}) }}>{lbl}</button>
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════ PLAN DE CUENTAS */}
            {tab === 'cuentas' && (
                <div style={s.body}>
                    <div style={s.toolbarRow}>
                        <span style={s.sectionTitle}>Plan de Cuentas</span>
                        <button style={s.btnPrimary} onClick={abrirNuevaCuenta}>+ Nueva Cuenta</button>
                    </div>

                    {TIPOS_CUENTA.map(tipo => (
                        <div key={tipo} style={{ marginBottom: 24 }}>
                            <div style={s.grupoHeader}>{tipo.toUpperCase()}</div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={s.tabla}>
                                    <thead>
                                        <tr style={s.thRow}>
                                            <th style={s.th}>Código</th>
                                            <th style={s.th}>Nombre</th>
                                            <th style={s.th}>Naturaleza</th>
                                            <th style={s.th}>Nivel</th>
                                            <th style={{ ...s.th, width: 90 }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cuentasPorTipo[tipo].map(c => (
                                            <tr key={c._id} style={{ background: c.activa === false ? '#fafafa' : 'white' }}>
                                                <td style={{ ...s.td, paddingLeft: (c.nivel - 1) * 20 + 12, fontFamily: 'monospace', fontWeight: c.nivel < 3 ? 700 : 400, color: c.nivel === 1 ? '#1a2a3a' : '#333' }}>
                                                    {c.codigo}
                                                </td>
                                                <td style={{ ...s.td, fontWeight: c.nivel < 3 ? 600 : 400 }}>{c.nombre}</td>
                                                <td style={s.td}>
                                                    <span style={{ ...s.badge, background: c.naturaleza === 'Deudora' ? '#e3f2fd' : '#fce4ec', color: c.naturaleza === 'Deudora' ? '#1565c0' : '#c62828' }}>
                                                        {c.naturaleza}
                                                    </span>
                                                </td>
                                                <td style={{ ...s.td, textAlign: 'center', color: '#888' }}>{c.nivel}</td>
                                                <td style={s.td}>
                                                    {c.nivel === 3 && (
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            <button style={s.btnSm} onClick={() => abrirEditarCuenta(c)}>✏️</button>
                                                            <button style={{ ...s.btnSm, color: '#c62828' }} onClick={() => eliminarCuenta(c._id)}>🗑️</button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {cuentasPorTipo[tipo].length === 0 && (
                                            <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>Sin cuentas</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══════════════════════════════════════ LIBRO DIARIO */}
            {tab === 'diario' && (
                <div style={s.body}>
                    <div style={s.toolbarRow}>
                        <span style={s.sectionTitle}>Libro Diario</span>
                        <button style={s.btnPrimary} onClick={abrirNuevoAsiento}>+ Asiento Manual</button>
                    </div>

                    <div style={s.filtros}>
                        <label style={s.labelFiltro}>Desde
                            <input type="date" style={s.inputFiltro} value={filtroDiario.desde} onChange={e => setFiltroDiario(p => ({ ...p, desde: e.target.value }))} />
                        </label>
                        <label style={s.labelFiltro}>Hasta
                            <input type="date" style={s.inputFiltro} value={filtroDiario.hasta} onChange={e => setFiltroDiario(p => ({ ...p, hasta: e.target.value }))} />
                        </label>
                        <label style={s.labelFiltro}>Tipo
                            <select style={s.inputFiltro} value={filtroDiario.tipo} onChange={e => setFiltroDiario(p => ({ ...p, tipo: e.target.value }))}>
                                <option value="">Todos</option>
                                <option value="manual">Manual</option>
                                <option value="automatico">Automático</option>
                            </select>
                        </label>
                        <button style={s.btnSecondary} onClick={fetchAsientos}>Buscar</button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={s.tabla}>
                            <thead>
                                <tr style={s.thRow}>
                                    <th style={s.th}>N° Asiento</th>
                                    <th style={s.th}>Fecha</th>
                                    <th style={s.th}>Descripción</th>
                                    <th style={s.th}>Tipo</th>
                                    <th style={s.th}>Origen</th>
                                    <th style={{ ...s.th, textAlign: 'right' }}>Debe</th>
                                    <th style={{ ...s.th, textAlign: 'right' }}>Haber</th>
                                    <th style={s.th}>Estado</th>
                                    <th style={s.th}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {asientos.map(a => (
                                    <>
                                        <tr key={a._id} style={{ background: a.estado === 'anulado' ? '#fff8f8' : 'white', cursor: 'pointer' }}
                                            onClick={() => setExpandido(expandido === a._id ? null : a._id)}>
                                            <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 600 }}>{a.numeroAsiento}</td>
                                            <td style={s.td}>{a.fecha}</td>
                                            <td style={{ ...s.td, maxWidth: 220 }}>{a.descripcion}</td>
                                            <td style={s.td}>
                                                <span style={{ ...s.badge, ...(BADGE_TIPO[a.tipo] || {}) }}>{BADGE_TIPO[a.tipo]?.label || a.tipo}</span>
                                            </td>
                                            <td style={{ ...s.td, fontSize: 12, color: '#888' }}>{a.origen?.referenciaNro || '—'}</td>
                                            <td style={{ ...s.td, textAlign: 'right', color: '#1565c0' }}>${CLP(a.totalDebe)}</td>
                                            <td style={{ ...s.td, textAlign: 'right', color: '#2e7d32' }}>${CLP(a.totalHaber)}</td>
                                            <td style={s.td}>
                                                <span style={{ ...s.badge, ...(BADGE_ESTADO[a.estado] || {}) }}>{a.estado}</span>
                                            </td>
                                            <td style={s.td}>
                                                {a.estado === 'vigente' && (
                                                    <button style={{ ...s.btnSm, color: '#c62828' }} onClick={e => { e.stopPropagation(); setModalAnular(a); setMotivoAnulacion(''); }}>Anular</button>
                                                )}
                                            </td>
                                        </tr>
                                        {expandido === a._id && (
                                            <tr key={`${a._id}-det`}>
                                                <td colSpan={9} style={{ padding: '0 24px 12px', background: '#f8fafc' }}>
                                                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                                        <thead>
                                                            <tr style={{ color: '#888' }}>
                                                                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Cuenta</th>
                                                                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Glosa</th>
                                                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Debe</th>
                                                                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Haber</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(a.lineas || []).map((l, i) => (
                                                                <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                                                                    <td style={{ padding: '5px 8px' }}><span style={{ fontFamily: 'monospace', color: '#555' }}>{l.cuentaCodigo}</span> {l.cuentaNombre}</td>
                                                                    <td style={{ padding: '5px 8px', color: '#777' }}>{l.glosa}</td>
                                                                    <td style={{ padding: '5px 8px', textAlign: 'right', color: '#1565c0' }}>{l.debe > 0 ? `$${CLP(l.debe)}` : ''}</td>
                                                                    <td style={{ padding: '5px 8px', textAlign: 'right', color: '#2e7d32' }}>{l.haber > 0 ? `$${CLP(l.haber)}` : ''}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                    {a.anulacion?.motivoAnulacion && (
                                                        <div style={{ marginTop: 8, color: '#c62828', fontSize: 12 }}>
                                                            🚫 Anulado el {a.anulacion.fechaAnulacion}: {a.anulacion.motivoAnulacion}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                                {asientos.length === 0 && (
                                    <tr><td colSpan={9} style={{ ...s.td, textAlign: 'center', color: '#aaa', padding: 32 }}>Sin asientos en el período seleccionado</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════ LIBRO MAYOR */}
            {tab === 'mayor' && (
                <div style={s.body}>
                    <div style={s.toolbarRow}>
                        <span style={s.sectionTitle}>Libro Mayor</span>
                    </div>
                    <div style={s.filtros}>
                        <label style={{ ...s.labelFiltro, flex: 2 }}>Cuenta
                            <select style={s.inputFiltro} value={mayorCuentaId} onChange={e => setMayorCuentaId(e.target.value)}>
                                <option value="">— Seleccionar cuenta —</option>
                                {cuentas.filter(c => c.nivel === 3).sort((a, b) => a.codigo.localeCompare(b.codigo)).map(c => (
                                    <option key={c._id} value={c._id}>{c.codigo} — {c.nombre}</option>
                                ))}
                            </select>
                        </label>
                        <label style={s.labelFiltro}>Desde
                            <input type="date" style={s.inputFiltro} value={mayorDesde} onChange={e => setMayorDesde(e.target.value)} />
                        </label>
                        <label style={s.labelFiltro}>Hasta
                            <input type="date" style={s.inputFiltro} value={mayorHasta} onChange={e => setMayorHasta(e.target.value)} />
                        </label>
                        <button style={s.btnSecondary} onClick={fetchMayor} disabled={!mayorCuentaId}>Ver</button>
                    </div>

                    {mayor && (
                        <>
                            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#e8f4fd', borderRadius: 8, display: 'flex', gap: 24 }}>
                                <span><b>{mayor.cuenta?.codigo}</b> — {mayor.cuenta?.nombre}</span>
                                <span style={{ color: '#888' }}>Naturaleza: {mayor.cuenta?.naturaleza}</span>
                                <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                                    Saldo final: ${CLP(mayor.movimientos[mayor.movimientos.length - 1]?.saldo || 0)}
                                </span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={s.tabla}>
                                    <thead>
                                        <tr style={s.thRow}>
                                            <th style={s.th}>Fecha</th>
                                            <th style={s.th}>N° Asiento</th>
                                            <th style={s.th}>Descripción</th>
                                            <th style={s.th}>Glosa</th>
                                            <th style={{ ...s.th, textAlign: 'right' }}>Debe</th>
                                            <th style={{ ...s.th, textAlign: 'right' }}>Haber</th>
                                            <th style={{ ...s.th, textAlign: 'right' }}>Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mayor.movimientos.map((m, i) => (
                                            <tr key={i}>
                                                <td style={s.td}>{m.fecha}</td>
                                                <td style={{ ...s.td, fontFamily: 'monospace' }}>{m.numeroAsiento}</td>
                                                <td style={{ ...s.td, maxWidth: 200 }}>{m.descripcion}</td>
                                                <td style={{ ...s.td, color: '#888', fontSize: 12 }}>{m.glosa}</td>
                                                <td style={{ ...s.td, textAlign: 'right', color: '#1565c0' }}>{m.debe > 0 ? `$${CLP(m.debe)}` : ''}</td>
                                                <td style={{ ...s.td, textAlign: 'right', color: '#2e7d32' }}>{m.haber > 0 ? `$${CLP(m.haber)}` : ''}</td>
                                                <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: m.saldo >= 0 ? '#1565c0' : '#c62828' }}>${CLP(m.saldo)}</td>
                                            </tr>
                                        ))}
                                        {mayor.movimientos.length === 0 && (
                                            <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#aaa', padding: 32 }}>Sin movimientos en el período</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    {!mayor && mayorCuentaId && <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>Presiona "Ver" para cargar los movimientos</p>}
                    {!mayorCuentaId && <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>Selecciona una cuenta para ver su libro mayor</p>}
                </div>
            )}

            {/* ═══════════════════════════════════════ REPORTES */}
            {tab === 'reportes' && (
                <div style={s.body}>
                    <div style={s.toolbarRow}>
                        <span style={s.sectionTitle}>Reportes Contables</span>
                    </div>
                    <div style={s.filtros}>
                        <label style={s.labelFiltro}>Reporte
                            <select style={s.inputFiltro} value={subReporte} onChange={e => { setSubReporte(e.target.value); setDatosReporte(null); }}>
                                <option value="comprobacion">Balance de Comprobación</option>
                                <option value="resultados">Estado de Resultados</option>
                                <option value="balance">Balance General</option>
                            </select>
                        </label>
                        {subReporte !== 'comprobacion' && (
                            <label style={s.labelFiltro}>Desde
                                <input type="date" style={s.inputFiltro} value={rpDesde} onChange={e => setRpDesde(e.target.value)} />
                            </label>
                        )}
                        <label style={s.labelFiltro}>Hasta
                            <input type="date" style={s.inputFiltro} value={rpHasta} onChange={e => setRpHasta(e.target.value)} />
                        </label>
                        <button style={s.btnSecondary} onClick={fetchReporte} disabled={loadingReporte}>
                            {loadingReporte ? 'Generando…' : 'Generar'}
                        </button>
                        {datosReporte && <button style={s.btnSm} onClick={() => window.print()}>🖨️ Imprimir</button>}
                    </div>

                    {datosReporte && subReporte === 'comprobacion' && <ReporteComprobacion datos={datosReporte} />}
                    {datosReporte && subReporte === 'resultados' && <ReporteResultados datos={datosReporte} />}
                    {datosReporte && subReporte === 'balance' && <ReporteBalance datos={datosReporte} />}
                    {!datosReporte && !loadingReporte && (
                        <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>Selecciona el período y presiona "Generar"</p>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════ MODAL CUENTA */}
            {modalCuenta && (
                <div style={s.overlay}>
                    <div style={s.modal}>
                        <h3 style={s.modalTitulo}>{editCuenta ? 'Editar Cuenta' : 'Nueva Cuenta'}</h3>
                        <div style={s.formGrid}>
                            <label style={s.formLabel}>Código
                                <input style={s.formInput} value={formCuenta.codigo} onChange={e => setFormCuenta(p => ({ ...p, codigo: e.target.value }))} placeholder="Ej: 5.2.9" />
                            </label>
                            <label style={s.formLabel}>Tipo
                                <select style={s.formInput} value={formCuenta.tipo} onChange={e => setFormCuenta(p => ({ ...p, tipo: e.target.value, naturaleza: NATURALEZA[e.target.value] }))}>
                                    {TIPOS_CUENTA.map(t => <option key={t}>{t}</option>)}
                                </select>
                            </label>
                            <label style={{ ...s.formLabel, gridColumn: '1/-1' }}>Nombre
                                <input style={s.formInput} value={formCuenta.nombre} onChange={e => setFormCuenta(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre de la cuenta" />
                            </label>
                            <label style={s.formLabel}>Naturaleza
                                <select style={s.formInput} value={formCuenta.naturaleza} onChange={e => setFormCuenta(p => ({ ...p, naturaleza: e.target.value }))}>
                                    <option>Deudora</option>
                                    <option>Acreedora</option>
                                </select>
                            </label>
                            <label style={s.formLabel}>Descripción
                                <input style={s.formInput} value={formCuenta.descripcion} onChange={e => setFormCuenta(p => ({ ...p, descripcion: e.target.value }))} />
                            </label>
                        </div>
                        <div style={s.modalBtns}>
                            <button style={s.btnSecondary} onClick={() => setModalCuenta(false)}>Cancelar</button>
                            <button style={s.btnPrimary} onClick={guardarCuenta} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════ MODAL ASIENTO */}
            {modalAsiento && (
                <div style={s.overlay}>
                    <div style={{ ...s.modal, maxWidth: 780, width: '95vw' }}>
                        <h3 style={s.modalTitulo}>Nuevo Asiento Contable</h3>
                        <div style={s.formGrid}>
                            <label style={s.formLabel}>Fecha
                                <input type="date" style={s.formInput} value={formAsiento.fecha} onChange={e => setFormAsiento(p => ({ ...p, fecha: e.target.value }))} />
                            </label>
                            <label style={{ ...s.formLabel, gridColumn: '1/-1' }}>Descripción / Glosa Principal
                                <input style={s.formInput} value={formAsiento.descripcion} onChange={e => setFormAsiento(p => ({ ...p, descripcion: e.target.value }))} placeholder="Concepto del asiento" />
                            </label>
                        </div>

                        <div style={{ overflowX: 'auto', marginTop: 16 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f0f2f5' }}>
                                        <th style={{ ...s.th, width: '40%' }}>Cuenta</th>
                                        <th style={s.th}>Glosa línea</th>
                                        <th style={{ ...s.th, width: 110 }}>Debe ($)</th>
                                        <th style={{ ...s.th, width: 110 }}>Haber ($)</th>
                                        <th style={{ ...s.th, width: 36 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formAsiento.lineas.map((l, i) => (
                                        <tr key={i}>
                                            <td style={s.td}>
                                                <select style={{ ...s.formInput, margin: 0, fontSize: 12 }} value={l.cuentaId} onChange={e => setLinea(i, 'cuentaId', e.target.value)}>
                                                    <option value="">— Seleccionar —</option>
                                                    {cuentasOperativas.sort((a, b) => a.codigo.localeCompare(b.codigo)).map(c => (
                                                        <option key={c._id} value={c._id}>{c.codigo} {c.nombre}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td style={s.td}>
                                                <input style={{ ...s.formInput, margin: 0, fontSize: 12 }} value={l.glosa} onChange={e => setLinea(i, 'glosa', e.target.value)} placeholder="Glosa" />
                                            </td>
                                            <td style={s.td}>
                                                <input type="number" style={{ ...s.formInput, margin: 0, fontSize: 12, textAlign: 'right' }} value={l.debe} onChange={e => setLinea(i, 'debe', e.target.value)} min={0} placeholder="0" />
                                            </td>
                                            <td style={s.td}>
                                                <input type="number" style={{ ...s.formInput, margin: 0, fontSize: 12, textAlign: 'right' }} value={l.haber} onChange={e => setLinea(i, 'haber', e.target.value)} min={0} placeholder="0" />
                                            </td>
                                            <td style={s.td}>
                                                {formAsiento.lineas.length > 2 && (
                                                    <button style={{ ...s.btnSm, color: '#c62828' }} onClick={() => quitarLinea(i)}>✕</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                                        <td colSpan={2} style={{ padding: '8px 12px' }}>TOTAL</td>
                                        <td style={{ ...s.td, textAlign: 'right', color: '#1565c0' }}>${CLP(totalDebe)}</td>
                                        <td style={{ ...s.td, textAlign: 'right', color: '#2e7d32' }}>${CLP(totalHaber)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                            <button style={s.btnSecondary} onClick={agregarLinea}>+ Agregar línea</button>
                            <span style={{ marginLeft: 'auto', fontWeight: 700, color: balanceado ? '#2e7d32' : '#c62828', fontSize: 14 }}>
                                {balanceado ? '✅ Balanceado' : `⚠️ Diferencia: $${CLP(Math.abs(totalDebe - totalHaber))}`}
                            </span>
                        </div>

                        <div style={s.modalBtns}>
                            <button style={s.btnSecondary} onClick={() => setModalAsiento(false)}>Cancelar</button>
                            <button style={s.btnPrimary} onClick={guardarAsiento} disabled={saving || !balanceado}>
                                {saving ? 'Guardando…' : 'Guardar Asiento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════ MODAL ANULAR */}
            {modalAnular && (
                <div style={s.overlay}>
                    <div style={{ ...s.modal, maxWidth: 420 }}>
                        <h3 style={s.modalTitulo}>Anular Asiento</h3>
                        <p style={{ color: '#555', marginBottom: 12 }}>
                            Se generará un asiento de reversa automático para <b>{modalAnular.numeroAsiento}</b>.<br />
                            Esta acción no se puede deshacer.
                        </p>
                        <label style={s.formLabel}>Motivo de la anulación
                            <input style={s.formInput} value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)} placeholder="Describe el motivo..." />
                        </label>
                        <div style={s.modalBtns}>
                            <button style={s.btnSecondary} onClick={() => setModalAnular(null)}>Cancelar</button>
                            <button style={{ ...s.btnPrimary, background: '#c62828' }} onClick={confirmarAnulacion}>Confirmar Anulación</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── SUB-COMPONENTES DE REPORTES ───────────────────────────────────────────────

function ReporteComprobacion({ datos }) {
    const { filas, totales } = datos;
    const CLP = n => (Number(n) || 0).toLocaleString('es-CL');
    return (
        <div>
            <h4 style={{ marginBottom: 12, color: '#1a2a3a' }}>Balance de Comprobación</h4>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#1a2a3a', color: 'white' }}>
                            <th style={{ padding: '10px 12px', textAlign: 'left' }}>Código</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left' }}>Cuenta</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Debe</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Haber</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Saldo Deudor</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Saldo Acreedor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((f, i) => (
                            <tr key={i} style={{ background: i % 2 ? '#f9f9f9' : 'white' }}>
                                <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#555' }}>{f.cuentaCodigo}</td>
                                <td style={{ padding: '7px 12px' }}>{f.cuentaNombre}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#1565c0' }}>${CLP(f.totalDebe)}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#2e7d32' }}>${CLP(f.totalHaber)}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'right' }}>{f.saldoDeudor > 0 ? `$${CLP(f.saldoDeudor)}` : ''}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'right' }}>{f.saldoAcreedor > 0 ? `$${CLP(f.saldoAcreedor)}` : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr style={{ background: '#1a2a3a', color: 'white', fontWeight: 700 }}>
                            <td colSpan={2} style={{ padding: '10px 12px' }}>TOTALES</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>${CLP(totales.totalDebe)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>${CLP(totales.totalHaber)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>${CLP(totales.totalSaldoDeudor)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>${CLP(totales.totalSaldoAcreedor)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p style={{ marginTop: 12, fontSize: 12, color: totales.totalDebe === totales.totalHaber ? '#2e7d32' : '#c62828' }}>
                {totales.totalDebe === totales.totalHaber ? '✅ Partida doble verificada — Debe = Haber' : '⚠️ Desbalance detectado'}
            </p>
        </div>
    );
}

function ReporteResultados({ datos }) {
    const { grupos, totales, totalGastos, resultado } = datos;
    const CLP = n => (Number(n) || 0).toLocaleString('es-CL');
    const Fila = ({ f }) => (
        <tr>
            <td style={{ padding: '5px 12px 5px 28px', color: '#555', fontSize: 12, fontFamily: 'monospace' }}>{f.codigo}</td>
            <td style={{ padding: '5px 12px', color: '#333' }}>{f.nombre}</td>
            <td style={{ padding: '5px 12px', textAlign: 'right', color: '#333' }}>${CLP(f.saldo)}</td>
        </tr>
    );
    const Subtotal = ({ label, monto, color = '#333' }) => (
        <tr style={{ borderTop: '2px solid #eee', fontWeight: 700 }}>
            <td colSpan={2} style={{ padding: '8px 12px', color }}>{label}</td>
            <td style={{ padding: '8px 12px', textAlign: 'right', color }}>${CLP(monto)}</td>
        </tr>
    );
    return (
        <div style={{ maxWidth: 600 }}>
            <h4 style={{ marginBottom: 12 }}>Estado de Resultados</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#1a2a3a', color: 'white' }}>
                    <th style={{ padding: '10px 12px' }}></th><th style={{ padding: '10px 12px', textAlign: 'left' }}>Concepto</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Monto ($)</th>
                </tr></thead>
                <tbody>
                    <tr><td colSpan={3} style={{ padding: '10px 12px', fontWeight: 700, background: '#e8f5e9', color: '#2e7d32' }}>INGRESOS</td></tr>
                    {grupos.ingresos.map((f, i) => <Fila key={i} f={f} />)}
                    <Subtotal label="Total Ingresos" monto={totales.ingresos} color="#2e7d32" />

                    <tr><td colSpan={3} style={{ padding: '10px 12px', fontWeight: 700, background: '#fce4ec', color: '#c62828' }}>COSTO DE SERVICIOS</td></tr>
                    {grupos.costoServicios.map((f, i) => <Fila key={i} f={f} />)}
                    <Subtotal label="Total Costo de Servicios" monto={totales.costoServicios} color="#c62828" />

                    <tr><td colSpan={3} style={{ padding: '10px 12px', fontWeight: 700, background: '#fff3e0', color: '#e65100' }}>GASTOS DE ADMINISTRACIÓN</td></tr>
                    {grupos.gastosAdmin.map((f, i) => <Fila key={i} f={f} />)}
                    <Subtotal label="Total Gastos Admin." monto={totales.gastosAdmin} color="#e65100" />

                    {grupos.gastosFinancieros.length > 0 && <>
                        <tr><td colSpan={3} style={{ padding: '10px 12px', fontWeight: 700, background: '#f3e5f5', color: '#6a1b9a' }}>GASTOS FINANCIEROS</td></tr>
                        {grupos.gastosFinancieros.map((f, i) => <Fila key={i} f={f} />)}
                        <Subtotal label="Total Gastos Financieros" monto={totales.gastosFinancieros} color="#6a1b9a" />
                    </>}

                    <tr style={{ background: resultado >= 0 ? '#e8f5e9' : '#fce4ec', fontWeight: 800, fontSize: 15 }}>
                        <td colSpan={2} style={{ padding: '14px 12px', color: resultado >= 0 ? '#2e7d32' : '#c62828' }}>
                            {resultado >= 0 ? '✅ UTILIDAD DEL EJERCICIO' : '❌ PÉRDIDA DEL EJERCICIO'}
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'right', color: resultado >= 0 ? '#2e7d32' : '#c62828' }}>${CLP(resultado)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

function ReporteBalance({ datos }) {
    const { grupos, totales, resultado, totalActivo, totalPasivo, totalPatrimonio, cuadra } = datos;
    const CLP = n => (Number(n) || 0).toLocaleString('es-CL');
    const SeccionFila = ({ f }) => (
        <tr>
            <td style={{ padding: '5px 12px 5px 28px', fontSize: 12, fontFamily: 'monospace', color: '#555' }}>{f.codigo}</td>
            <td style={{ padding: '5px 12px', color: '#333' }}>{f.nombre}</td>
            <td style={{ padding: '5px 12px', textAlign: 'right' }}>${CLP(f.saldo)}</td>
        </tr>
    );
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 900 }}>
            {/* ACTIVOS */}
            <div>
                <h4 style={{ marginBottom: 8 }}>ACTIVOS</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                        <tr style={{ background: '#e8f4fd', fontWeight: 700 }}><td colSpan={3} style={{ padding: '8px 12px', color: '#1565c0' }}>Activo Circulante</td></tr>
                        {grupos.activoCirculante.map((f, i) => <SeccionFila key={i} f={f} />)}
                        <tr style={{ borderTop: '1px solid #ddd', fontWeight: 600 }}><td colSpan={2} style={{ padding: '6px 12px' }}>Total Activo Circulante</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>${CLP(totales.activoCirculante)}</td></tr>

                        <tr style={{ background: '#e8f4fd', fontWeight: 700 }}><td colSpan={3} style={{ padding: '8px 12px', color: '#1565c0' }}>Activo Fijo</td></tr>
                        {grupos.activoFijo.map((f, i) => <SeccionFila key={i} f={f} />)}
                        <tr style={{ borderTop: '1px solid #ddd', fontWeight: 600 }}><td colSpan={2} style={{ padding: '6px 12px' }}>Total Activo Fijo</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>${CLP(totales.activoFijo)}</td></tr>

                        <tr style={{ background: '#1a2a3a', color: 'white', fontWeight: 800 }}><td colSpan={2} style={{ padding: '10px 12px' }}>TOTAL ACTIVO</td><td style={{ padding: '10px 12px', textAlign: 'right' }}>${CLP(totalActivo)}</td></tr>
                    </tbody>
                </table>
            </div>

            {/* PASIVOS + PATRIMONIO */}
            <div>
                <h4 style={{ marginBottom: 8 }}>PASIVOS + PATRIMONIO</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                        <tr style={{ background: '#fce4ec', fontWeight: 700 }}><td colSpan={3} style={{ padding: '8px 12px', color: '#c62828' }}>Pasivo Circulante</td></tr>
                        {grupos.pasivoCirculante.map((f, i) => <SeccionFila key={i} f={f} />)}
                        <tr style={{ borderTop: '1px solid #ddd', fontWeight: 600 }}><td colSpan={2} style={{ padding: '6px 12px' }}>Total Pasivo Circulante</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>${CLP(totales.pasivoCirculante)}</td></tr>

                        {grupos.pasivoNoCirculante.length > 0 && <>
                            <tr style={{ background: '#fce4ec', fontWeight: 700 }}><td colSpan={3} style={{ padding: '8px 12px', color: '#c62828' }}>Pasivo No Circulante</td></tr>
                            {grupos.pasivoNoCirculante.map((f, i) => <SeccionFila key={i} f={f} />)}
                            <tr style={{ borderTop: '1px solid #ddd', fontWeight: 600 }}><td colSpan={2} style={{ padding: '6px 12px' }}>Total Pasivo No Circ.</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>${CLP(totales.pasivoNoCirculante)}</td></tr>
                        </>}

                        <tr style={{ background: '#e8f5e9', fontWeight: 700 }}><td colSpan={3} style={{ padding: '8px 12px', color: '#2e7d32' }}>Patrimonio</td></tr>
                        {grupos.patrimonio.map((f, i) => <SeccionFila key={i} f={f} />)}
                        <tr><td style={{ padding: '5px 12px 5px 28px', fontSize: 12, fontFamily: 'monospace', color: '#555' }}>3.3</td><td style={{ padding: '5px 12px' }}>Resultado del Ejercicio</td><td style={{ padding: '5px 12px', textAlign: 'right', color: resultado >= 0 ? '#2e7d32' : '#c62828' }}>${CLP(resultado)}</td></tr>
                        <tr style={{ borderTop: '1px solid #ddd', fontWeight: 600 }}><td colSpan={2} style={{ padding: '6px 12px' }}>Total Patrimonio</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>${CLP(totalPatrimonio)}</td></tr>

                        <tr style={{ background: '#1a2a3a', color: 'white', fontWeight: 800 }}><td colSpan={2} style={{ padding: '10px 12px' }}>TOTAL PASIVO + PATRIMONIO</td><td style={{ padding: '10px 12px', textAlign: 'right' }}>${CLP(totalPasivo + totalPatrimonio)}</td></tr>
                    </tbody>
                </table>
                <p style={{ marginTop: 8, fontSize: 12, color: cuadra ? '#2e7d32' : '#c62828' }}>
                    {cuadra ? '✅ Balance cuadra (Activo = Pasivo + Patrimonio)' : '⚠️ Desbalance detectado'}
                </p>
            </div>
        </div>
    );
}

// ── ESTILOS ───────────────────────────────────────────────────────────────────
const styles = {
    page: { background: '#f0f2f5', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' },
    header: { background: '#1a2a3a', padding: '20px 24px 0' },
    titulo: { color: 'white', margin: '0 0 16px', fontSize: 20, fontWeight: 700 },
    tabBar: { display: 'flex', gap: 4 },
    tabBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', padding: '10px 18px', cursor: 'pointer', borderRadius: '6px 6px 0 0', fontWeight: 600, fontSize: 13 },
    tabActivo: { background: '#f0f2f5', color: '#1a2a3a' },
    body: { padding: 24 },
    toolbarRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontWeight: 700, fontSize: 16, color: '#1a2a3a' },
    filtros: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16, padding: 16, background: 'white', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
    labelFiltro: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#555', flex: 1, minWidth: 130 },
    inputFiltro: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, marginTop: 2 },
    grupoHeader: { background: '#1a2a3a', color: 'white', padding: '8px 12px', fontWeight: 700, fontSize: 12, letterSpacing: 1, borderRadius: '6px 6px 0 0', marginBottom: 0 },
    tabla: { width: '100%', borderCollapse: 'collapse', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,.06)', borderRadius: 8, overflow: 'hidden' },
    thRow: { background: '#f0f2f5' },
    th: { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#555', whiteSpace: 'nowrap' },
    td: { padding: '8px 12px', borderTop: '1px solid #f0f0f0', fontSize: 13 },
    badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
    btnPrimary: { background: '#1a6fb3', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 },
    btnSecondary: { background: 'white', color: '#1a2a3a', border: '1px solid #ddd', padding: '9px 18px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
    btnSm: { background: 'transparent', border: '1px solid #ddd', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
    modal: { background: 'white', borderRadius: 12, padding: 28, maxWidth: 520, width: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.25)' },
    modalTitulo: { margin: '0 0 20px', fontSize: 18, color: '#1a2a3a' },
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
    formLabel: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: '#555' },
    formInput: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, marginTop: 2 },
    modalBtns: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 },
    errorBar: { background: '#fce4ec', color: '#c62828', padding: '12px 20px', fontSize: 13, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }
};
