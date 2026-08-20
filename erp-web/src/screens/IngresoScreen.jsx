import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Paso 3 del rediseño (ver docs/rediseno/design_handoff_panel_control/README.md §5):
// formulario de 452px fijo + tabla de solicitudes con filtros en barra (se elimina el dropdown
// por columna). Mismos tokens que Panel de control (§2). Sin emoji.

const t = {
    fondoMain: '#f6f5f2',
    superficie: '#ffffff',
    textoPrincipal: '#1a1a18',
    textoSecundario1: '#3a3a35',
    textoSecundario2: '#4a4a44',
    textoAtenuado1: '#6b6a63',
    textoAtenuado2: '#75746e',
    textoAtenuado3: '#8a8981',
    textoDeshabilitado: '#a3a29a',
    encabezadoTabla: '#e4e2dc',
    barraFiltrosPie: '#f0efeb',
    hoverFila: '#f4f3ef',
    hairlineFila: 'rgba(0,0,0,.06)',
    hairlineBloque: 'rgba(0,0,0,.10)',
    bordeZona: 'rgba(0,0,0,.12)',
    bordeInput: 'rgba(0,0,0,.18)',
    acento: 'oklch(0.48 0.10 250)',
    acentoHover: 'oklch(0.40 0.10 250)',
    pagoPagado: 'oklch(0.48 0.10 155)',
    pagoParcial: 'oklch(0.55 0.11 65)',
    pagoPendiente: 'oklch(0.52 0.13 25)',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontMono: 'ui-monospace, Menlo, monospace',
};

// SLA: mide el tiempo que la Solicitud lleva sin tratar (fechaHoraSolicitud -> ahora).
// Se congela una vez que la OT vinculada llega a 'Tratada' o más allá (ver docs/funcionalidades-v2.md, Gap 5).
const calcularSLA = (s, otEncontrada) => {
    if (otEncontrada && otEncontrada.estado !== 'Pendiente') return null;
    const inicio = new Date(s.fechaHoraSolicitud || s.fechaCreacion || s.createdAt);
    if (isNaN(inicio.getTime())) return null;
    const horas = (Date.now() - inicio.getTime()) / 3600000;
    const color = horas < 24 ? t.pagoPagado : horas < 48 ? t.pagoParcial : t.pagoPendiente;
    const texto = horas < 1 ? '<1 h' : horas < 48 ? `${Math.floor(horas)} h` : `${Math.floor(horas / 24)} d`;
    return { color, texto };
};

const colorEstado = (estadoFinal, tieneOT) => {
    if (estadoFinal === 'Rechazada') return t.pagoPendiente;
    return tieneOT ? t.pagoPagado : t.pagoParcial;
};

const fmtFecha = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d.getTime()) ? d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
};

const FORM_VACIO = {
    solicitante: '', empresaSolicitante: '', correo: '', numero: '', direccion: '',
    descripcion: '', origen: 'WhatsApp', fechaEjecucionSolicitada: '', plazoEjecucionSugerido: '', adjuntos: '',
};

const GRID = '34px minmax(150px,1.4fr) minmax(120px,1fr) 104px 96px 84px 132px 150px';
const TABLA_MIN_W = 34 + 150 + 120 + 104 + 96 + 84 + 132 + 150 + 10 * 8 + 32;

// Recibimos 'solicitudes' como prop desde App.jsx para actualización automática
const IngresoScreen = ({ solicitudes = [], liberarSolicitudManual, cargarDatos, API, crearSolicitudGlobal, ots = [], enviarPortalCliente, cargando, errorCarga }) => {
    const navigate = useNavigate();
    const [form, setForm] = useState(FORM_VACIO);
    const [archivo, setArchivo] = useState(null);
    const [aviso, setAviso] = useState(null); // { texto, tono: 'error' | 'ok' }
    const [filtroEstado, setFiltroEstado] = useState('');
    const [filtroTexto, setFiltroTexto] = useState('');

    const set = (campo) => (e) => setForm(prev => ({ ...prev, [campo]: e.target.value }));

    const handleCrear = async () => {
        if (!form.empresaSolicitante || !form.solicitante || !form.descripcion) {
            setAviso({ texto: 'Completa los campos obligatorios: empresa, solicitante y descripción.', tono: 'error' });
            return;
        }
        const exito = await crearSolicitudGlobal(form, archivo);
        if (exito) {
            setForm(FORM_VACIO);
            setArchivo(null);
            setAviso({ texto: 'Solicitud registrada con éxito.', tono: 'ok' });
        } else {
            setAviso({ texto: 'No se pudo registrar la solicitud. Intenta nuevamente.', tono: 'error' });
        }
    };

    const campos = [
        { key: 'empresaSolicitante', label: 'Empresa *', placeholder: 'Razón social', span: 2 },
        { key: 'solicitante', label: 'Solicitante *', placeholder: 'Nombre y apellido', span: 2 },
        { key: 'correo', label: 'Correo', placeholder: 'correo@empresa.cl', span: 2, type: 'email' },
        { key: 'numero', label: 'Teléfono', placeholder: '+56 9…', span: 2 },
        { key: 'direccion', label: 'Dirección del servicio', placeholder: 'Calle, ciudad, planta', span: 4 },
        { key: 'fechaEjecucionSolicitada', label: 'Fecha de ejecución', span: 2, type: 'date' },
        { key: 'plazoEjecucionSugerido', label: 'Plazo sugerido', placeholder: 'Ej: 5 días hábiles', span: 2 },
    ];

    const estados = ['Pendiente', 'Aprobada', 'Rechazada', 'Tratada'];
    const chipsEstado = [
        { key: '', label: `Todos (${solicitudes.length})` },
        ...estados.map(e => ({ key: e, label: `${e} (${solicitudes.filter(s => s.estado === e).length})` })),
    ];

    const q = filtroTexto.trim().toLowerCase();
    const solicitudesFiltradas = solicitudes.filter(s => {
        const cumpleEstado = !filtroEstado || s.estado === filtroEstado;
        const cumpleTexto = !q || `${s.empresaSolicitante || ''} ${s.solicitante || ''}`.toLowerCase().includes(q);
        return cumpleEstado && cumpleTexto;
    });

    return (
        <div style={styles.raiz}>
            <header style={styles.header}>
                <h1 style={styles.h1}>Ingreso de solicitudes</h1>
                <span style={styles.subtitulo}>Registro de requerimientos antes de convertirlos en OT</span>
            </header>

            {errorCarga && (
                <div style={styles.franjaError}>
                    <span>{errorCarga}</span>
                    <button onClick={() => cargarDatos?.()} style={styles.btnReintentar}>Reintentar</button>
                </div>
            )}

            <div style={styles.cuerpo}>
                {/* Formulario */}
                <section style={styles.formSeccion}>
                    <div style={{ padding: '13px 16px 8px' }}>
                        <div style={styles.tituloBloque}>Nueva solicitud de servicio</div>
                        <div style={styles.formGrid}>
                            {campos.map(c => (
                                <label key={c.key} style={{ ...styles.campoLabel, gridColumn: `span ${c.span}` }}>
                                    <span style={styles.etiqueta}>{c.label}</span>
                                    <input
                                        type={c.type || 'text'}
                                        value={form[c.key]}
                                        onChange={set(c.key)}
                                        placeholder={c.placeholder}
                                        style={styles.input}
                                    />
                                </label>
                            ))}

                            <label style={{ ...styles.campoLabel, gridColumn: 'span 2' }}>
                                <span style={styles.etiqueta}>Canal de origen</span>
                                <select value={form.origen} onChange={set('origen')} style={styles.input}>
                                    <option value="WhatsApp">WhatsApp</option>
                                    <option value="Correo">Correo</option>
                                    <option value="Llamada">Llamada</option>
                                    <option value="Presencial">Presencial</option>
                                </select>
                            </label>

                            <label style={{ ...styles.campoLabel, gridColumn: 'span 2' }}>
                                <span style={styles.etiqueta}>Adjunto</span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <input
                                        value={archivo ? archivo.name : form.adjuntos}
                                        onChange={set('adjuntos')}
                                        placeholder="Plano, foto o enlace"
                                        readOnly={!!archivo}
                                        style={{ ...styles.input, flex: 1, minWidth: 0 }}
                                    />
                                    <input type="file" id="file-upload" style={{ display: 'none' }} onChange={e => setArchivo(e.target.files[0])} />
                                    <button type="button" onClick={() => document.getElementById('file-upload').click()} style={styles.btnSecundario}>
                                        {archivo ? 'Cambiar' : 'Examinar'}
                                    </button>
                                    {archivo && <button type="button" onClick={() => setArchivo(null)} style={styles.btnSecundario}>Quitar</button>}
                                </div>
                            </label>

                            <label style={{ ...styles.campoLabel, gridColumn: 'span 4' }}>
                                <span style={styles.etiqueta}>Descripción detallada *</span>
                                <textarea
                                    value={form.descripcion}
                                    onChange={set('descripcion')}
                                    placeholder="Requerimiento técnico, alcance, condiciones de la faena"
                                    rows={5}
                                    style={{ ...styles.input, minHeight: 96, lineHeight: 1.5, resize: 'vertical' }}
                                />
                            </label>
                        </div>

                        {aviso && (
                            <div style={{ ...styles.avisoFranja, borderLeftColor: aviso.tono === 'error' ? t.pagoPendiente : t.acento }}>
                                {aviso.texto}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingBottom: 14, alignItems: 'center' }}>
                            <button onClick={handleCrear} style={styles.btnPrimario}>Generar solicitud</button>
                            <button onClick={() => { setForm(FORM_VACIO); setArchivo(null); setAviso(null); }} style={styles.btnSecundario}>Limpiar</button>
                            <span style={{ marginLeft: 'auto', fontSize: '10.5px', color: t.textoAtenuado3 }}>* obligatorio</span>
                        </div>
                    </div>
                </section>

                {/* Tabla */}
                <section style={styles.tablaSeccion}>
                    <div style={styles.barraFiltros}>
                        <span style={styles.etiquetaBarra}>Solicitudes ingresadas</span>
                        <input
                            value={filtroTexto}
                            onChange={e => setFiltroTexto(e.target.value)}
                            placeholder="Filtrar empresa o solicitante"
                            style={styles.filtroInput}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, minWidth: 0 }}>
                            {chipsEstado.map(c => (
                                <button key={c.key || 'todos'} onClick={() => setFiltroEstado(c.key)} style={styles.btnFiltro}>
                                    {filtroEstado === c.key ? '▪ ' : ''}{c.label}
                                </button>
                            ))}
                        </div>
                        <span style={styles.resumenBarra}>{solicitudesFiltradas.length} de {solicitudes.length}</span>
                    </div>

                    <div style={styles.scrollTabla}>
                        <div style={{ minWidth: TABLA_MIN_W }}>
                            <div style={styles.encabezadoFila}>
                                <span>N°</span><span>Empresa</span><span>Solicitante</span><span>Estado</span>
                                <span>Origen</span><span style={{ textAlign: 'right' }}>Ingresada</span><span>Adjunto</span><span />
                            </div>

                            {cargando && Array.from({ length: 6 }).map((_, i) => (
                                <div key={`esqueleto-${i}`} style={styles.fila}>
                                    {Array.from({ length: 8 }).map((__, j) => (
                                        <span key={j}><span style={{ display: 'block', height: 9, borderRadius: 2, background: t.hoverFila, width: j === 1 ? '75%' : '90%' }} /></span>
                                    ))}
                                </div>
                            ))}

                            {!cargando && solicitudesFiltradas.map((s, index) => {
                                const otEncontrada = ots.find(o => o.solicitudId === s._id || o._id === s._id);
                                const estadoFinal = otEncontrada ? otEncontrada.estado : s.estado;
                                const yaTieneOT = !!otEncontrada || ['Tratada', 'Planificada', 'Programada', 'En Ejecución', 'Trabajo Terminado', 'Con Informe', 'Pagada'].includes(estadoFinal);
                                const sla = calcularSLA(s, otEncontrada);

                                return (
                                    <div key={s._id || index} style={styles.fila}>
                                        <span style={styles.celdaMono} title="Número de solicitud — junto al teléfono, es lo que el cliente usa para entrar al Portal">{s.numeroSolicitud || String(index + 1).padStart(2, '0')}</span>
                                        <span style={styles.celdaEmpresa}>{s.empresaSolicitante || '—'}</span>
                                        <span style={{ minWidth: 0 }}>
                                            <span style={styles.celdaTexto}>{s.solicitante || '—'}</span>
                                            {s.numero && <span style={{ display: 'block', fontFamily: t.fontMono, fontSize: '10px', color: t.textoAtenuado2 }}>{s.numero}</span>}
                                        </span>
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ ...styles.celdaEstado, color: colorEstado(estadoFinal, yaTieneOT) }}>{estadoFinal || 'Pendiente'}</span>
                                            {sla && <span style={{ display: 'block', fontFamily: t.fontMono, fontSize: '10px', color: sla.color }}>SLA {sla.texto}</span>}
                                        </span>
                                        <span style={styles.celdaAtenuada}>{s.origen || '—'}</span>
                                        <span style={styles.celdaFecha}>{fmtFecha(s.fechaCreacion || s.fechaHoraSolicitud)}</span>
                                        <span style={{ ...styles.celdaAtenuada, color: s.adjuntos ? t.acento : t.textoDeshabilitado }}>
                                            {s.adjuntos ? (
                                                <a href={`${API.replace('/api', '')}${s.adjuntos}`} target="_blank" rel="noopener noreferrer" style={{ color: t.acento }}>
                                                    Ver archivo
                                                </a>
                                            ) : '—'}
                                        </span>
                                        <span style={{ display: 'flex', gap: 4 }}>
                                            <button
                                                onClick={() => navigate('/tratamiento', { state: { ...(otEncontrada || s), solicitudId: s._id } })}
                                                style={styles.btnFilaPrincipal}
                                            >
                                                {yaTieneOT ? 'Ver OT' : 'Tratar'}
                                            </button>
                                            <button
                                                onClick={() => enviarPortalCliente?.(s)}
                                                title="Enviar link del Portal del Cliente por WhatsApp"
                                                style={styles.btnFilaSecundario}
                                            >
                                                WhatsApp
                                            </button>
                                        </span>
                                    </div>
                                );
                            })}

                            {!cargando && solicitudesFiltradas.length === 0 && (
                                <div style={styles.sinResultados}>Sin solicitudes que coincidan.</div>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

const styles = {
    raiz: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: t.fondoMain, color: t.textoPrincipal, fontFamily: t.fontUi, fontSize: '13px' },
    header: { flex: 'none', height: '46px', display: 'flex', alignItems: 'center', gap: '16px', padding: '0 16px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    h1: { margin: 0, fontSize: '14px', fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap' },
    subtitulo: { fontSize: '11.5px', color: t.textoAtenuado2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    franjaError: { flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: t.pagoPendiente, color: '#fff', fontSize: 12 },
    btnReintentar: { marginLeft: 'auto', height: 22, padding: '0 10px', background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.4)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi, flex: 'none' },
    cuerpo: { flex: 1, minHeight: 0, display: 'flex' },

    formSeccion: { width: '452px', flex: 'none', minWidth: 0, overflow: 'auto', background: t.superficie, borderRight: `1px solid ${t.bordeZona}` },
    tituloBloque: { fontSize: '9.5px', letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3, marginBottom: '9px' },
    formGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '9px 10px' },
    campoLabel: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 },
    etiqueta: { fontSize: '9.5px', letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    input: {
        height: '27px', minWidth: 0, padding: '0 8px', border: `1px solid ${t.bordeInput}`, background: t.superficie,
        fontFamily: 'inherit', fontSize: '12px', color: t.textoPrincipal, outline: 'none', borderRadius: '2px',
    },
    avisoFranja: { marginTop: '10px', padding: '7px 10px', background: t.barraFiltrosPie, borderLeft: `2px solid ${t.acento}`, fontSize: '11.5px', color: t.textoSecundario1 },
    btnPrimario: { height: '30px', padding: '0 14px', background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', borderRadius: '2px', fontFamily: t.fontUi },
    btnSecundario: { height: '30px', padding: '0 12px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: '12px', color: '#262622', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontFamily: t.fontUi },

    tablaSeccion: { flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    barraFiltros: { flex: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 6px', padding: '7px 16px', background: t.barraFiltrosPie, borderBottom: `1px solid ${t.hairlineBloque}` },
    etiquetaBarra: { fontSize: '9.5px', letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2, flex: 'none' },
    filtroInput: { height: '23px', width: '210px', padding: '0 8px', border: `1px solid ${t.bordeInput}`, background: t.superficie, fontFamily: 'inherit', fontSize: '11.5px', outline: 'none', borderRadius: '2px' },
    btnFiltro: { height: '23px', padding: '0 8px', background: 'transparent', border: '1px solid transparent', fontSize: '11px', color: '#57564f', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontFamily: t.fontUi },
    resumenBarra: { marginLeft: 'auto', flex: 'none', fontFamily: t.fontMono, fontSize: '11px', color: t.textoAtenuado3, whiteSpace: 'nowrap' },

    scrollTabla: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', background: t.superficie },
    encabezadoFila: {
        position: 'sticky', top: 0, zIndex: 2, display: 'grid', gridTemplateColumns: GRID, gap: '10px', alignItems: 'center',
        height: '26px', padding: '0 16px', background: t.encabezadoTabla, borderBottom: `1px solid ${t.bordeZona}`,
        fontSize: '9.5px', letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700,
    },
    fila: { display: 'grid', gridTemplateColumns: GRID, gap: '10px', alignItems: 'center', height: '36px', padding: '0 16px', borderBottom: `1px solid ${t.hairlineFila}` },
    celdaMono: { fontFamily: t.fontMono, fontSize: '11px', color: t.textoDeshabilitado },
    celdaEmpresa: { minWidth: 0, fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    celdaTexto: { minWidth: 0, fontSize: '11.5px', color: t.textoSecundario1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    celdaEstado: { display: 'block', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    celdaAtenuada: { minWidth: 0, fontSize: '11px', color: t.textoAtenuado1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    celdaFecha: { fontFamily: t.fontMono, fontSize: '11px', color: '#57564f', textAlign: 'right' },
    btnFilaPrincipal: { height: '23px', padding: '0 8px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: '11px', fontWeight: 600, color: '#262622', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontFamily: t.fontUi },
    btnFilaSecundario: { height: '23px', padding: '0 8px', background: 'transparent', border: `1px solid ${t.bordeZona}`, fontSize: '11px', color: '#57564f', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontFamily: t.fontUi },
    sinResultados: { padding: '40px 16px', textAlign: 'center', fontSize: '14px', color: t.textoAtenuado3 },
};

export default IngresoScreen;
