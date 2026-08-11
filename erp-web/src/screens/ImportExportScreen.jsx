import { useState, useRef } from 'react';

const EXPORTABLES = [
    { id: 'recursos',    label: 'Personal (Recursos)',       icono: '👷', desc: 'nombre, puesto, tipo, teléfono, email, tarifaHora' },
    { id: 'suministros', label: 'Suministros',               icono: '🔩', desc: 'codigo, descripcion, precio, categoria' },
    { id: 'equipos',     label: 'Equipos y Herramientas',    icono: '🔧', desc: 'nombre, codigo, tipo, estado, precio' },
    { id: 'puestos',     label: 'Puestos / Especialidades',  icono: '🏷️', desc: 'nombre, costoHora, categoria' },
    { id: 'ots',         label: 'Órdenes de Trabajo',        icono: '📋', desc: 'numeroOT, solicitante, estado, granTotal, pago…' },
    { id: 'solicitudes', label: 'Solicitudes',               icono: '📥', desc: 'solicitante, empresa, descripcion, estado, fecha' },
];

const IMPORTABLES = [
    { id: 'recursos',    label: 'Personal (Recursos)',      icono: '👷', columnas: ['nombre *', 'puesto', 'tipo', 'telefono', 'email', 'tarifaHora'] },
    { id: 'suministros', label: 'Suministros',              icono: '🔩', columnas: ['codigo *', 'descripcion *', 'precio', 'categoria'] },
    { id: 'equipos',     label: 'Equipos y Herramientas',   icono: '🔧', columnas: ['nombre *', 'codigo', 'tipo', 'estado', 'precio'] },
    { id: 'puestos',     label: 'Puestos / Especialidades', icono: '🏷️', columnas: ['nombre *', 'costoHora', 'categoria'] },
];

const ESTADOS_OT = ['Pendiente','Tratada','Planificada','Programada','En Ejecución','Trabajo Terminado','Con Informe','Pagada'];

export default function ImportExportScreen({ API, cargarDatos }) {
    // ── EXPORTAR ──
    const [seleccionados, setSeleccionados] = useState(new Set());
    const [filtroOTs, setFiltroOTs] = useState({ desde: '', hasta: '', estado: '' });
    const [exportando, setExportando] = useState(false);

    // ── IMPORTAR ──
    const [resultado, setResultado] = useState(null);
    const [cargando, setCargando] = useState(null);
    const inputRefs = useRef({});

    // ── LÓGICA EXPORTAR ──
    const toggleSeleccion = (id) => {
        setSeleccionados(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleTodos = () => {
        if (seleccionados.size === EXPORTABLES.length) {
            setSeleccionados(new Set());
        } else {
            setSeleccionados(new Set(EXPORTABLES.map(e => e.id)));
        }
    };

    const exportar = () => {
        if (!seleccionados.size) return;
        setExportando(true);
        const params = new URLSearchParams({ modulos: [...seleccionados].join(',') });
        if (seleccionados.has('ots')) {
            if (filtroOTs.desde) params.set('otDesde', filtroOTs.desde);
            if (filtroOTs.hasta) params.set('otHasta', filtroOTs.hasta);
            if (filtroOTs.estado) params.set('otEstado', filtroOTs.estado);
        }
        const url = `${API}/import/exportar/batch?${params}`;

        // Descarga via <a> temporal para poder detectar cuando termina
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => setExportando(false), 2000);
    };

    // ── LÓGICA IMPORTAR ──
    const importar = async (mod, archivo) => {
        if (!archivo) return;
        setCargando(mod.id);
        setResultado(null);
        const form = new FormData();
        form.append('archivo', archivo);
        try {
            const r = await fetch(`${API}/import/${mod.id}`, { method: 'POST', body: form });
            const d = await r.json();
            if (!r.ok) { setResultado({ error: d.error, modulo: mod.label }); return; }
            setResultado({ ...d, modulo: mod.label });
            if (cargarDatos) cargarDatos();
        } catch (e) {
            setResultado({ error: e.message, modulo: mod.label });
        } finally {
            setCargando(null);
            if (inputRefs.current[mod.id]) inputRefs.current[mod.id].value = '';
        }
    };

    const descargarPlantilla = (id) => {
        window.open(`${API}/import/plantilla/${id}`, '_blank');
    };

    const s = styles;
    const todosSeleccionados = seleccionados.size === EXPORTABLES.length;
    const algunoSeleccionado = seleccionados.size > 0;

    return (
        <div style={s.page}>
            <div style={s.header}>
                <h2 style={s.titulo}>📊 Importar / Exportar Excel</h2>
                <p style={s.subtitulo}>Carga y descarga información del ERP en formato .xlsx</p>
            </div>

            <div style={s.body}>

                {/* ═══ RESULTADO IMPORTACIÓN ═══ */}
                {resultado && (
                    <div style={{ ...s.alerta, background: resultado.error ? '#fce4ec' : '#e8f5e9', borderColor: resultado.error ? '#e57373' : '#66bb6a' }}>
                        <div style={{ flex: 1 }}>
                            <b>{resultado.modulo}</b>
                            {resultado.error ? (
                                <p style={{ margin: '4px 0 0', color: '#c62828' }}>❌ {resultado.error}</p>
                            ) : (
                                <>
                                    <p style={{ margin: '4px 0 0', color: '#2e7d32' }}>
                                        ✅ {resultado.insertados} registros importados de {resultado.total} filas
                                    </p>
                                    {resultado.errores?.length > 0 && (
                                        <details style={{ marginTop: 6 }}>
                                            <summary style={{ cursor: 'pointer', color: '#e65100', fontSize: 13 }}>
                                                ⚠️ {resultado.errores.length} filas con error (ver detalle)
                                            </summary>
                                            <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12, color: '#555' }}>
                                                {resultado.errores.map((e, i) => <li key={i}>Fila {e.fila}: {e.motivo}</li>)}
                                            </ul>
                                        </details>
                                    )}
                                </>
                            )}
                        </div>
                        <button style={s.btnCerrar} onClick={() => setResultado(null)}>✕</button>
                    </div>
                )}

                <div style={s.doColumnas}>

                    {/* ════════════════════════════════════════ EXPORTAR */}
                    <div style={s.panel}>
                        <div style={s.panelHeader}>
                            <span style={s.panelTitulo}>📤 Exportar a Excel</span>
                            <span style={{ fontSize: 12, color: '#888' }}>Un archivo con una hoja por módulo seleccionado</span>
                        </div>

                        {/* Seleccionar todos */}
                        <label style={s.checkTodos}>
                            <input
                                type="checkbox"
                                checked={todosSeleccionados}
                                ref={el => el && (el.indeterminate = algunoSeleccionado && !todosSeleccionados)}
                                onChange={toggleTodos}
                                style={{ width: 16, height: 16 }}
                            />
                            <span style={{ fontWeight: 700, fontSize: 14 }}>Seleccionar todos</span>
                        </label>

                        <div style={s.listaExport}>
                            {EXPORTABLES.map(mod => (
                                <label key={mod.id} style={{ ...s.checkItem, background: seleccionados.has(mod.id) ? '#f0f7ff' : 'white', borderColor: seleccionados.has(mod.id) ? '#90caf9' : '#e0e0e0' }}>
                                    <input
                                        type="checkbox"
                                        checked={seleccionados.has(mod.id)}
                                        onChange={() => toggleSeleccion(mod.id)}
                                        style={{ width: 16, height: 16, flexShrink: 0 }}
                                    />
                                    <span style={{ fontSize: 18 }}>{mod.icono}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{mod.label}</div>
                                        <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.desc}</div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* Filtros OT — solo si está seleccionado */}
                        {seleccionados.has('ots') && (
                            <div style={s.filtroOT}>
                                <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 8 }}>📋 Filtros para OTs (opcional)</div>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <label style={s.labelFiltro}>Desde
                                        <input type="date" style={s.inputFiltro} value={filtroOTs.desde} onChange={e => setFiltroOTs(p => ({ ...p, desde: e.target.value }))} />
                                    </label>
                                    <label style={s.labelFiltro}>Hasta
                                        <input type="date" style={s.inputFiltro} value={filtroOTs.hasta} onChange={e => setFiltroOTs(p => ({ ...p, hasta: e.target.value }))} />
                                    </label>
                                    <label style={s.labelFiltro}>Estado
                                        <select style={s.inputFiltro} value={filtroOTs.estado} onChange={e => setFiltroOTs(p => ({ ...p, estado: e.target.value }))}>
                                            <option value="">Todos</option>
                                            {ESTADOS_OT.map(e => <option key={e}>{e}</option>)}
                                        </select>
                                    </label>
                                </div>
                            </div>
                        )}

                        <button
                            style={{ ...s.btnExportar, opacity: algunoSeleccionado ? 1 : 0.4, cursor: algunoSeleccionado ? 'pointer' : 'not-allowed' }}
                            onClick={exportar}
                            disabled={!algunoSeleccionado || exportando}
                        >
                            {exportando ? '⏳ Generando…' : `📤 Exportar${algunoSeleccionado ? ` (${seleccionados.size} módulo${seleccionados.size > 1 ? 's' : ''})` : ''}`}
                        </button>
                    </div>

                    {/* ════════════════════════════════════════ IMPORTAR */}
                    <div style={s.panel}>
                        <div style={s.panelHeader}>
                            <span style={s.panelTitulo}>📥 Importar desde Excel</span>
                            <span style={{ fontSize: 12, color: '#888' }}>Descarga la plantilla, complétala y sube el archivo</span>
                        </div>

                        <div style={s.listaImport}>
                            {IMPORTABLES.map(mod => (
                                <div key={mod.id} style={s.importCard}>
                                    <div style={s.importCardHeader}>
                                        <span style={{ fontSize: 20 }}>{mod.icono}</span>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 14 }}>{mod.label}</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                                {mod.columnas.map(c => (
                                                    <span key={c} style={{ ...s.colBadge, background: c.includes('*') ? '#fff3e0' : '#f0f2f5', color: c.includes('*') ? '#e65100' : '#555' }}>
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                        <button style={s.btnPlantilla} onClick={() => descargarPlantilla(mod.id)}>
                                            📋 Plantilla
                                        </button>
                                        <label style={{ ...s.btnImportar, opacity: cargando === mod.id ? 0.6 : 1, cursor: cargando === mod.id ? 'wait' : 'pointer' }}>
                                            {cargando === mod.id ? '⏳ Cargando…' : '📥 Importar'}
                                            <input
                                                type="file"
                                                accept=".xlsx,.xls,.csv"
                                                style={{ display: 'none' }}
                                                ref={el => { inputRefs.current[mod.id] = el; }}
                                                onChange={e => importar(mod, e.target.files[0])}
                                                disabled={!!cargando}
                                            />
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={s.notaImport}>
                            <b>* campo obligatorio</b><br />
                            Suministros y Puestos: si el código/nombre ya existe, se actualiza.<br />
                            Personal y Equipos: siempre crean registros nuevos.<br />
                            Filas con error se omiten sin afectar las demás.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const styles = {
    page:        { background: '#f0f2f5', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' },
    header:      { background: '#1a2a3a', padding: '24px 28px' },
    titulo:      { color: 'white', margin: 0, fontSize: 22, fontWeight: 700 },
    subtitulo:   { color: 'rgba(255,255,255,0.6)', margin: '6px 0 0', fontSize: 14 },
    body:        { padding: 24 },

    alerta:      { display: 'flex', gap: 12, border: '1px solid', borderRadius: 10, padding: '14px 18px', marginBottom: 20, alignItems: 'flex-start' },
    btnCerrar:   { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888', padding: 0, lineHeight: 1 },

    doColumnas:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 },

    panel:       { background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,.07)', display: 'flex', flexDirection: 'column', gap: 16 },
    panelHeader: { display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px solid #f0f0f0', paddingBottom: 14 },
    panelTitulo: { fontWeight: 800, fontSize: 16, color: '#1a2a3a' },

    checkTodos:  { display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e0e0e0' },
    listaExport: { display: 'flex', flexDirection: 'column', gap: 8 },
    checkItem:   { display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', padding: '10px 14px', borderRadius: 8, border: '1px solid', transition: 'all .15s' },

    filtroOT:    { background: '#fffbf0', border: '1px solid #ffe082', borderRadius: 8, padding: '12px 16px' },
    labelFiltro: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#555' },
    inputFiltro: { padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 },

    btnExportar: { background: '#1565c0', color: 'white', border: 'none', padding: '13px 20px', borderRadius: 8, fontWeight: 800, fontSize: 15, width: '100%', marginTop: 4 },

    listaImport: { display: 'flex', flexDirection: 'column', gap: 12 },
    importCard:  { border: '1px solid #e8e8e8', borderRadius: 10, padding: '14px 16px' },
    importCardHeader: { display: 'flex', gap: 12, alignItems: 'flex-start' },
    colBadge:    { padding: '2px 7px', borderRadius: 10, fontSize: 11, fontFamily: 'monospace' },

    btnPlantilla: { background: 'white', color: '#555', border: '1px solid #ddd', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' },
    btnImportar:  { background: '#2e7d32', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, display: 'inline-block', textAlign: 'center', flex: 1 },

    notaImport:  { background: '#f8fafc', border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#555', lineHeight: 1.7 },
};
