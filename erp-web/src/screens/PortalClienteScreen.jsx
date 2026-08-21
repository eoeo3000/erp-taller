import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/* ────────────────────────────────── CONSTANTES ──────────────────────────── */

const TABS = [
    { id: 'solicitud', icono: '📋', label: 'Solicitar' },
    { id: 'estado',    icono: '🔍', label: 'Mis Pedidos' },
    { id: 'docs',      icono: '📄', label: 'Documentos' },
    { id: 'contacto',  icono: '📞', label: 'Contacto' },
];

const INFO_OT = {
    'Tratada':           { color: '#3498db', icono: '📝', texto: 'En Planificación' },
    'Planificada':       { color: '#3498db', icono: '📝', texto: 'En Planificación' },
    'Programada':        { color: '#8e44ad', icono: '📅', texto: 'Programada' },
    'En Ejecución':      { color: '#27ae60', icono: '🔧', texto: 'En Ejecución' },
    'Trabajo Terminado': { color: '#16a085', icono: '✅', texto: 'Terminado' },
    'Con Informe':       { color: '#2980b9', icono: '📋', texto: 'Con Informe' },
    'Pagada':            { color: '#27ae60', icono: '💵', texto: 'Pagada' },
};

// Celular chileno: 9 dígitos que empiezan con 9, con o sin +56 adelante — sin ambigüedad
// entre "912345678" y "56912345678"/"+56912345678". Opcional: vacío no bloquea (el acceso
// al Portal Cliente también puede ser por correo, ver docs/estrategia-movil.md §5.2).
const validarTelefono = (valor) => {
    if (!valor) return true;
    const limpio = valor.replace(/[\s()-]/g, '');
    return /^(\+?56)?9\d{8}$/.test(limpio);
};

const CLP = (n) => Number(n || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 });
const fmtDate = (iso) => iso ? new Date((iso + '').split('T')[0] + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/* ────────────────────────────── FORMULARIO ──────────────────────────────── */

function TabSolicitud({ API, onExito }) {
    const empty = { empresaSolicitante: '', solicitante: '', correo: '', numero: '', direccion: '', descripcion: '', fechaEjecucionSolicitada: '', plazoEjecucionSugerido: '', origen: 'Portal Web' };
    const [form, setForm] = useState(empty);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const enviar = async (e) => {
        e.preventDefault();
        if (!form.empresaSolicitante || !form.solicitante || !form.descripcion) { setError('Los campos marcados con * son obligatorios.'); return; }
        if (!validarTelefono(form.numero)) { setError('El teléfono debe ser un celular chileno: 9 dígitos empezando con 9 (ej: 912345678), con o sin +56 adelante.'); return; }
        setEnviando(true); setError('');
        try {
            const r = await fetch(`${API}/portal/solicitud`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
            const d = await r.json();
            if (!r.ok) { setError(d.error || 'Error al enviar'); return; }
            onExito(d);
            setForm(empty);
        } catch (ex) { setError(ex.message); }
        finally { setEnviando(false); }
    };

    return (
        <div style={s.scroll}>
            <p style={s.intro}>Complete el formulario y nos contactaremos a la brevedad para confirmar su solicitud.</p>
            <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Campo label="Empresa *"><input style={s.input} value={form.empresaSolicitante} onChange={e => set('empresaSolicitante', e.target.value)} placeholder="Razón social o nombre" /></Campo>
                <Campo label="Nombre *"><input style={s.input} value={form.solicitante} onChange={e => set('solicitante', e.target.value)} placeholder="Nombre y apellido" /></Campo>
                <div style={s.grid2}>
                    <Campo label="Correo"><input style={s.input} type="email" value={form.correo} onChange={e => set('correo', e.target.value)} placeholder="correo@empresa.cl" /></Campo>
                    <Campo label="Teléfono"><input style={s.input} value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="+56 9 ..." /></Campo>
                </div>
                <Campo label="Dirección del trabajo"><input style={s.input} value={form.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Calle, número, ciudad" /></Campo>
                <div style={s.grid2}>
                    <Campo label="Fecha requerida"><input style={s.input} type="date" value={form.fechaEjecucionSolicitada} onChange={e => set('fechaEjecucionSolicitada', e.target.value)} /></Campo>
                    <Campo label="Plazo sugerido"><input style={s.input} value={form.plazoEjecucionSugerido} onChange={e => set('plazoEjecucionSugerido', e.target.value)} placeholder="Ej: 5 días hábiles" /></Campo>
                </div>
                <Campo label="Descripción del trabajo *">
                    <textarea style={{ ...s.input, minHeight: 100, resize: 'vertical' }} value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Describa detalladamente lo que necesita..." />
                </Campo>
                {error && <div style={s.alerta}>❌ {error}</div>}
                <button type="submit" disabled={enviando} style={s.btnPrimario}>{enviando ? '⏳ Enviando...' : '📤 Enviar Solicitud'}</button>
            </form>
        </div>
    );
}

/* ───────────────────────────────── ESTADO ───────────────────────────────── */

function TabEstado({ API, qInicial }) {
    const [q, setQ] = useState(qInicial || '');
    const [buscando, setBuscando] = useState(false);
    const [resultados, setResultados] = useState(null);
    const [error, setError] = useState('');
    const [detalle, setDetalle] = useState(null);

    const buscar = async (e) => {
        e?.preventDefault();
        if (!q.trim()) return;
        setBuscando(true); setError(''); setDetalle(null);
        try {
            const r = await fetch(`${API}/portal/buscar?q=${encodeURIComponent(q)}`);
            const d = await r.json();
            if (!r.ok) { setError(d.error); return; }
            setResultados(d);
        } catch (ex) { setError(ex.message); }
        finally { setBuscando(false); }
    };

    // Si llegamos con un código precargado desde el link enviado al cliente, buscamos de inmediato
    useEffect(() => {
        if (qInicial) buscar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (detalle) return <DetalleSolicitud sol={detalle} onVolver={() => setDetalle(null)} />;

    return (
        <div style={s.scroll}>
            <p style={s.intro}>Ingrese su número de solicitud (<b>SOL-2026-…</b>), número de OT (<b>OT-2026-…</b>) o su nombre para consultar el estado.</p>
            <form onSubmit={buscar} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <input style={{ ...s.input, flex: 1 }} value={q} onChange={e => setQ(e.target.value)} placeholder="SOL-2026-0001 / OT-2026-0001 / nombre..." />
                <button type="submit" disabled={buscando} style={{ ...s.btnPrimario, margin: 0, padding: '10px 16px', minWidth: 54 }}>{buscando ? '⏳' : '🔍'}</button>
            </form>
            {error && <div style={s.alerta}>❌ {error}</div>}
            {resultados !== null && resultados.length === 0 && <div style={s.vacio}>No se encontraron resultados para "{q}"</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(resultados || []).map(sol => (
                    <button key={sol._id} onClick={() => setDetalle(sol)} style={s.card}>
                        <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2a3a' }}>{sol.numeroSolicitud || sol._id}</div>
                            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{sol.empresaSolicitante} · {sol.solicitante}</div>
                            <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{sol.descripcion?.slice(0, 70)}{sol.descripcion?.length > 70 ? '…' : ''}</div>
                        </div>
                        <BadgeEstado ot={sol.ot} />
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ─────────────────────────────── DOCUMENTOS ─────────────────────────────── */

function TabDocs({ API }) {
    const [q, setQ] = useState('');
    const [buscando, setBuscando] = useState(false);
    const [resultados, setResultados] = useState(null);
    const [docActivo, setDocActivo] = useState(null);
    const printRef = useRef();

    const buscar = async (e) => {
        e?.preventDefault();
        if (!q.trim()) return;
        setBuscando(true);
        try {
            const r = await fetch(`${API}/portal/buscar?q=${encodeURIComponent(q)}`);
            const d = await r.json();
            if (!r.ok) return;
            setResultados(d.filter(sol => sol.ot && sol.ot.granTotal > 0));
        } catch { /* noop */ }
        finally { setBuscando(false); }
    };

    const imprimir = () => window.print();

    if (docActivo) return (
        <div style={s.scroll}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <button onClick={() => setDocActivo(null)} style={s.btnSecundario}>← Volver</button>
                <button onClick={imprimir} style={s.btnPrimario}>🖨️ Imprimir / Guardar PDF</button>
            </div>
            <div ref={printRef} id="print-area">
                <CotizacionView sol={docActivo} ot={docActivo.ot} />
            </div>
        </div>
    );

    return (
        <div style={s.scroll}>
            <p style={s.intro}>Busque su solicitud para ver y descargar la cotización de su orden de trabajo.</p>
            <form onSubmit={buscar} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <input style={{ ...s.input, flex: 1 }} value={q} onChange={e => setQ(e.target.value)} placeholder="SOL-2026-… / OT-2026-… / nombre…" />
                <button type="submit" disabled={buscando} style={{ ...s.btnPrimario, margin: 0, padding: '10px 16px', minWidth: 54 }}>{buscando ? '⏳' : '🔍'}</button>
            </form>
            {resultados !== null && resultados.length === 0 && <div style={s.vacio}>No se encontraron cotizaciones para "{q}"</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(resultados || []).map(sol => (
                    <button key={sol._id} onClick={() => setDocActivo(sol)} style={s.card}>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>📄 Cotización {sol.ot?.numeroOT}</div>
                            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{sol.empresaSolicitante}</div>
                            <div style={{ fontSize: 13, color: '#1565c0', fontWeight: 700, marginTop: 4 }}>{CLP((sol.ot?.granTotal || 0) * 1.19)} (IVA incl.)</div>
                        </div>
                        <BadgeEstado ot={sol.ot} />
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ─────────────────────────────── CONTACTO ───────────────────────────────── */

function TabContacto() {
    return (
        <div style={s.scroll}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={s.contactoCard}>
                    <span style={{ fontSize: 32 }}>🏢</span>
                    <div>
                        <div style={s.contactoTitulo}>Empresa</div>
                        <div style={s.contactoVal}>Taller de Servicios Industriales</div>
                    </div>
                </div>
                <div style={s.contactoCard}>
                    <span style={{ fontSize: 32 }}>📍</span>
                    <div>
                        <div style={s.contactoTitulo}>Dirección</div>
                        <div style={s.contactoVal}>Av. Principal 1234, Santiago, Chile</div>
                    </div>
                </div>
                <div style={s.contactoCard}>
                    <span style={{ fontSize: 32 }}>📱</span>
                    <div>
                        <div style={s.contactoTitulo}>WhatsApp / Teléfono</div>
                        <a href="https://wa.me/56912345678" style={{ ...s.contactoVal, color: '#25d366', textDecoration: 'none', fontWeight: 700 }}>+56 9 1234 5678</a>
                    </div>
                </div>
                <div style={s.contactoCard}>
                    <span style={{ fontSize: 32 }}>✉️</span>
                    <div>
                        <div style={s.contactoTitulo}>Correo</div>
                        <div style={s.contactoVal}>contacto@empresa.cl</div>
                    </div>
                </div>
                <div style={s.contactoCard}>
                    <span style={{ fontSize: 32 }}>🕐</span>
                    <div>
                        <div style={s.contactoTitulo}>Horario de Atención</div>
                        <div style={s.contactoVal}>Lunes a Viernes · 8:00 – 18:00</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Sábado 9:00 – 13:00</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────── DETALLE SOLICITUD ─────────────────────────── */

function DetalleSolicitud({ sol, onVolver }) {
    const ot = sol.ot;
    const info = ot ? (INFO_OT[ot.estado] || null) : null;
    const tareasOk = (ot?.tareas || []).filter(t => t.completada).length;
    const total = (ot?.tareas || []).length;
    const pct = total > 0 ? Math.round((tareasOk / total) * 100) : 0;
    const mostrarCot = ot && ['Tratada','Planificada','Programada','En Ejecución','Trabajo Terminado','Con Informe','Pagada'].includes(ot.estado);
    const mostrarCron = ot && ['Programada','En Ejecución','Trabajo Terminado','Con Informe','Pagada'].includes(ot.estado);

    return (
        <div style={s.scroll}>
            <button onClick={onVolver} style={{ ...s.btnSecundario, marginBottom: 16 }}>← Volver</button>

            {/* Header */}
            <div style={{ ...s.seccion, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: 12, color: '#888' }}>Solicitud</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#1a2a3a' }}>{sol.numeroSolicitud || sol._id}</div>
                    <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>{sol.empresaSolicitante} · {sol.solicitante}</div>
                </div>
                <BadgeEstado ot={ot} grande />
            </div>

            <div style={s.seccion}>
                <p style={{ margin: 0, color: '#444', lineHeight: 1.7 }}>{sol.descripcion}</p>
                {sol.fechaEjecucionSolicitada && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#888' }}>📅 Requerido para: <b>{fmtDate(sol.fechaEjecucionSolicitada)}</b></p>}
            </div>

            {!ot && <div style={{ ...s.seccion, background: '#f0f7ff', color: '#1565c0', fontSize: 14 }}>📬 Su solicitud está siendo evaluada. Le contactaremos a la brevedad.</div>}
            {info && <div style={{ ...s.seccion, background: '#f0fff4', color: '#2e7d32', fontSize: 14 }}>{info.icono} {info.texto}{ot?.numeroOT ? ` · OT: ${ot.numeroOT}` : ''}</div>}

            {/* Progreso */}
            {mostrarCron && total > 0 && (
                <div style={s.seccion}>
                    <div style={s.secTitulo}>📊 Progreso</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', marginBottom: 6 }}>
                        <span>{tareasOk} de {total} tareas</span><span style={{ fontWeight: 700 }}>{pct}%</span>
                    </div>
                    <div style={{ background: '#e0e0e0', borderRadius: 8, height: 10 }}>
                        <div style={{ background: '#27ae60', height: 10, borderRadius: 8, width: `${pct}%`, transition: 'width .4s' }} />
                    </div>
                </div>
            )}

            {/* Cotización resumida */}
            {mostrarCot && <CotizacionView sol={sol} ot={ot} compacta />}

            {/* Cronograma */}
            {mostrarCron && ot.tareas?.length > 0 && (
                <div style={s.seccion}>
                    <div style={s.secTitulo}>📅 Cronograma</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {ot.tareas.map((t, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: t.completada ? '#e8f5e9' : '#fafafa', borderRadius: 8, border: `1px solid ${t.completada ? '#a5d6a7' : '#e0e0e0'}` }}>
                                <span style={{ fontSize: 20 }}>{t.completada ? '✅' : '⬜'}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.descripcion}</div>
                                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{t.puesto} · {t.duracion}h</div>
                                </div>
                                {t.fecha && <div style={{ textAlign: 'right', fontSize: 12, color: '#555' }}><b>{fmtDate(t.fecha)}</b>{t.hora && <><br />{t.hora}</>}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────── VISTA COTIZACIÓN ───────────────────────────── */

function CotizacionView({ sol, ot, compacta }) {
    const totalNeto = ot?.granTotal || 0;
    const iva = Math.round(totalNeto * 0.19);
    const totalBruto = totalNeto + iva;

    return (
        <div style={s.seccion}>
            <div style={s.secTitulo}>💰 {compacta ? 'Propuesta Económica' : `Cotización – ${ot?.numeroOT || ''}`}</div>
            {!compacta && <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>{sol?.empresaSolicitante} · {sol?.solicitante}</div>}

            {ot?.componentes?.length > 0 && <>
                <div style={s.subTit}>Materiales y Equipos</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={s.tabla}><thead><tr style={s.thFila}><th style={s.th}>Ítem</th><th style={s.thN}>Cant.</th><th style={s.thN}>P.Unit.</th><th style={s.thN}>Subtotal</th></tr></thead>
                        <tbody>{ot.componentes.map((c, i) => <tr key={i} style={i%2===0?{}:{background:'#fafafa'}}><td style={s.td}>{c.nombre}</td><td style={s.tdN}>{c.cantidad}</td><td style={s.tdN}>{CLP(c.precioUnitario)}</td><td style={s.tdN}>{CLP(c.subtotal)}</td></tr>)}</tbody>
                    </table>
                </div>
            </>}

            {ot?.tareas?.length > 0 && <>
                <div style={s.subTit}>Mano de Obra</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={s.tabla}><thead><tr style={s.thFila}><th style={s.th}>Tarea</th><th style={s.th}>Especialidad</th><th style={s.thN}>Horas</th></tr></thead>
                        <tbody>{ot.tareas.map((t, i) => <tr key={i} style={i%2===0?{}:{background:'#fafafa'}}><td style={s.td}>{t.descripcion}</td><td style={s.td}>{t.puesto||'—'}</td><td style={s.tdN}>{t.duracion}h</td></tr>)}</tbody>
                    </table>
                </div>
            </>}

            {ot?.logistica?.length > 0 && <>
                <div style={s.subTit}>Logística</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={s.tabla}><thead><tr style={s.thFila}><th style={s.th}>Descripción</th><th style={s.thN}>Subtotal</th></tr></thead>
                        <tbody>{ot.logistica.map((l, i) => <tr key={i} style={i%2===0?{}:{background:'#fafafa'}}><td style={s.td}>{l.descripcion}</td><td style={s.tdN}>{CLP(l.subtotal)}</td></tr>)}</tbody>
                    </table>
                </div>
            </>}

            <div style={{ marginTop: 16, borderTop: '1px solid #e0e0e0', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#555' }}><span>Total Neto</span><span>{CLP(totalNeto)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#555' }}><span>IVA (19%)</span><span>{CLP(iva)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 900, color: '#1a2a3a', borderTop: '2px solid #1a2a3a', paddingTop: 8 }}><span>TOTAL BRUTO</span><span>{CLP(totalBruto)}</span></div>
                {ot?.pago?.estado && <div style={{ textAlign: 'right', fontSize: 13, color: ot.pago.estado === 'Pagado' ? '#27ae60' : '#e67e22', fontWeight: 700, marginTop: 4 }}>Estado de pago: {ot.pago.estado}</div>}
            </div>
        </div>
    );
}

/* ───────────────────── BADGE DE ESTADO REUTILIZABLE ─────────────────────── */

function BadgeEstado({ ot, grande }) {
    const info = ot ? (INFO_OT[ot.estado] || null) : null;
    const base = { padding: grande ? '8px 16px' : '5px 12px', borderRadius: 20, fontWeight: 700, fontSize: grande ? 14 : 12, whiteSpace: 'nowrap' };
    if (!ot)   return <span style={{ ...base, background: '#e0e0e0', color: '#555' }}>📥 En Revisión</span>;
    if (!info) return <span style={{ ...base, background: '#e0e0e0', color: '#555' }}>⬤ {ot.estado}</span>;
    return <span style={{ ...base, background: info.color, color: 'white' }}>{info.icono} {info.texto}</span>;
}

/* ─────────────────────────── HELPER CAMPO ───────────────────────────────── */

function Campo({ label, children }) {
    return <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: '#444' }}>{label}{children}</label>;
}

/* ─────────────────────────── TOAST ÉXITO ────────────────────────────────── */

function ToastExito({ data, onClose }) {
    return (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 200, background: 'white', borderRadius: 14, padding: '20px 24px', boxShadow: '0 8px 32px rgba(0,0,0,.18)', width: 'calc(100% - 40px)', maxWidth: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#2e7d32', marginBottom: 6 }}>¡Solicitud Enviada!</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 14 }}>Guarde este número para consultar el estado:</div>
            <div style={{ background: '#f0f7ff', border: '2px solid #90caf9', borderRadius: 10, padding: '12px 20px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#888' }}>Número de solicitud</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#1565c0', letterSpacing: 2 }}>{data.numeroSolicitud}</div>
            </div>
            <button onClick={onClose} style={s.btnPrimario}>Entendido</button>
        </div>
    );
}

/* ──────────────────────────── COMPONENTE RAÍZ ───────────────────────────── */

export default function PortalClienteScreen({ API }) {
    const [searchParams] = useSearchParams();
    const tabInicial = searchParams.get('tab');
    const qInicial = searchParams.get('q') || '';
    const [tab, setTab] = useState(TABS.some(t => t.id === tabInicial) ? tabInicial : 'solicitud');
    const [toast, setToast] = useState(null);

    return (
        <div style={r.page}>
            {/* CSS de impresión: oculta todo salvo #print-area */}
            <style>{`@media print { body > * { display:none!important; } #print-area, #print-area * { display:revert!important; } }`}</style>

            {/* Header propio del portal */}
            <header style={r.header}>
                <span style={{ fontSize: 22 }}>🔧</span>
                <span style={r.headerTitulo}>Portal del Cliente</span>
            </header>

            {/* Título de la sección activa */}
            <div style={r.seccionTitulo}>
                {TABS.find(t => t.id === tab)?.icono} {TABS.find(t => t.id === tab)?.label}
            </div>

            {/* Contenido */}
            <div style={r.contenido}>
                {tab === 'solicitud' && <TabSolicitud API={API} onExito={d => setToast(d)} />}
                {tab === 'estado'    && <TabEstado    API={API} qInicial={qInicial} />}
                {tab === 'docs'      && <TabDocs      API={API} />}
                {tab === 'contacto'  && <TabContacto />}
            </div>

            {/* Toast de éxito */}
            {toast && <ToastExito data={toast} onClose={() => setToast(null)} />}
            {toast && <div onClick={() => setToast(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 199 }} />}

            {/* Barra de tabs inferior (fija) */}
            <nav style={r.tabBar}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{ ...r.tabBtn, color: tab === t.id ? '#1565c0' : '#888' }}>
                        <span style={{ fontSize: 22 }}>{t.icono}</span>
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</span>
                        {tab === t.id && <span style={r.tabIndicador} />}
                    </button>
                ))}
            </nav>
        </div>
    );
}

/* ─────────────────────────────── ESTILOS ────────────────────────────────── */

// Raíz / layout
const r = {
    page:         { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f4f6f9', fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative' },
    header:       { background: '#1a2a3a', color: 'white', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', position: 'sticky', top: 0, zIndex: 10 },
    headerTitulo: { fontWeight: 800, fontSize: 18 },
    seccionTitulo:{ background: 'white', padding: '12px 20px', fontSize: 15, fontWeight: 700, color: '#1a2a3a', borderBottom: '2px solid #e8edf2' },
    contenido:    { flex: 1, overflowY: 'auto', paddingBottom: 80 /* espacio para tabbar */ },
    tabBar:       { position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #e0e0e0', display: 'flex', zIndex: 50, boxShadow: '0 -2px 12px rgba(0,0,0,.08)', paddingBottom: 'env(safe-area-inset-bottom)' },
    tabBtn:       { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', border: 'none', background: 'transparent', cursor: 'pointer', position: 'relative', minHeight: 56 },
    tabIndicador: { position: 'absolute', top: 0, left: '20%', right: '20%', height: 3, background: '#1565c0', borderRadius: '0 0 3px 3px' },
};

// Compartidos
const s = {
    scroll:     { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 },
    intro:      { margin: 0, color: '#666', fontSize: 14, lineHeight: 1.6 },
    grid2:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
    input:      { padding: '10px 12px', border: '1.5px solid #d8dde5', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'white', WebkitAppearance: 'none' },
    btnPrimario:{ background: '#1a2a3a', color: 'white', border: 'none', padding: '13px 20px', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer', width: '100%' },
    btnSecundario:{ background: 'white', color: '#444', border: '1.5px solid #ddd', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    alerta:     { background: '#fce4ec', color: '#c62828', padding: '10px 14px', borderRadius: 8, fontSize: 13 },
    vacio:      { textAlign: 'center', color: '#888', padding: 32, fontSize: 14 },
    card:       { display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px', background: 'white', border: '1px solid #e8ecf0', borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%', boxShadow: '0 1px 4px rgba(0,0,0,.05)' },
    seccion:    { background: 'white', borderRadius: 12, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' },
    secTitulo:  { fontWeight: 800, fontSize: 15, color: '#1a2a3a', marginBottom: 12 },
    subTit:     { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, margin: '14px 0 6px' },
    tabla:      { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 300 },
    thFila:     { background: '#f0f2f5' },
    th:         { padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#333' },
    thN:        { padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#333' },
    td:         { padding: '7px 10px', borderBottom: '1px solid #f0f0f0', color: '#444' },
    tdN:        { padding: '7px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'right', color: '#444' },
    contactoCard:  { display: 'flex', gap: 16, alignItems: 'flex-start', background: 'white', borderRadius: 12, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' },
    contactoTitulo:{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    contactoVal:   { fontSize: 15, color: '#1a2a3a', fontWeight: 500 },
};
