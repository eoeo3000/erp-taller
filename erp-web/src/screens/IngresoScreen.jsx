import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

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
// Celular chileno: 9 dígitos que empiezan con 9, con o sin +56 adelante — sin ambigüedad
// entre "912345678" y "56912345678"/"+56912345678". Opcional: vacío no bloquea.
const validarTelefono = (valor) => {
    if (!valor) return true;
    const limpio = valor.replace(/[\s()-]/g, '');
    return /^(\+?56)?9\d{8}$/.test(limpio);
};

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

// Tabla de columnas configurable — mismo patrón y mismo backend de variantes que
// DashboardScreen.jsx (docs/rediseno/design_handoff_panel_control/README.md §4, "Paso 9":
// variantes globales guardadas en /api/disposiciones), acá con `pantalla: 'ingreso-solicitudes'`
// en vez de 'panel-control' — son dos catálogos de columnas distintos (esta tabla es una fila
// por Solicitud; Panel de control es una fila por Solicitud+OT combinadas), así que cada
// pantalla guarda sus propias variantes, pero bajo el mismo nombre si se usa el mismo en
// ambas — es la forma más simple de que "una variante" sirva para las dos tablas sin forzar
// un único esquema de columnas que no tiene sentido compartir (los campos no son los mismos).
const CAMPOS_INGRESO = [
    { key: 'numero', label: 'N° de Solicitud', corto: 'N°', origen: 'solicitud.numeroSolicitud', w: 84, align: 'left', mono: true },
    { key: 'ot', label: 'N° de OT', corto: 'OT', origen: 'ot.numeroOT', w: 84, align: 'left', mono: true },
    { key: 'empresa', label: 'Empresa', corto: 'Empresa', origen: 'solicitud.empresaSolicitante', w: 0, align: 'left' },
    { key: 'solicitante', label: 'Solicitante', corto: 'Solicitante', origen: 'solicitud.solicitante', w: 150, align: 'left' },
    { key: 'estado', label: 'Estado + SLA', corto: 'Estado', origen: 'solicitud.estado / ot.estado', w: 110, align: 'left' },
    { key: 'origen', label: 'Canal de origen', corto: 'Origen', origen: 'solicitud.origen', w: 90, align: 'left' },
    { key: 'ingresada', label: 'Fecha de ingreso', corto: 'Ingresada', origen: 'solicitud.fechaCreacion', w: 84, align: 'right', mono: true },
    { key: 'ejecucion', label: 'Fecha de ejecución', corto: 'Ejecución', origen: 'solicitud.fechaEjecucionSolicitada', w: 84, align: 'right', mono: true },
    { key: 'plazo', label: 'Plazo sugerido', corto: 'Plazo', origen: 'solicitud.plazoEjecucionSugerido', w: 120, align: 'left' },
    { key: 'direccion', label: 'Dirección', corto: 'Dirección', origen: 'solicitud.direccion', w: 170, align: 'left' },
    { key: 'correo', label: 'Correo', corto: 'Correo', origen: 'solicitud.correo', w: 160, align: 'left' },
    { key: 'telefono', label: 'Teléfono', corto: 'Teléfono', origen: 'solicitud.numero', w: 106, align: 'left', mono: true },
    { key: 'adjunto', label: 'Adjunto', corto: 'Adjunto', origen: 'solicitud.adjuntos', w: 90, align: 'left' },
];
const campoIngreso = (key) => CAMPOS_INGRESO.find(c => c.key === key);
const VISIBLES_BASE_INGRESO = ['numero', 'empresa', 'solicitante', 'estado', 'origen', 'ingresada', 'adjunto'];
const ANCHO_ACCIONES = 160;
const BASE_LAYOUT_INGRESO = { rowH: 36, columnas: CAMPOS_INGRESO.map(c => ({ key: c.key, w: c.w, visible: VISIBLES_BASE_INGRESO.includes(c.key) })) };
const clonarLayoutIngreso = (l) => ({ ...l, columnas: l.columnas.map(c => ({ ...c })) });
const normalizarLayoutIngreso = (l) => {
    const dadas = (l && l.columnas) || [];
    const columnas = dadas.filter(c => campoIngreso(c.key)).map(c => ({ key: c.key, w: c.w || campoIngreso(c.key).w, visible: !!c.visible }));
    CAMPOS_INGRESO.forEach(c => { if (!columnas.find(x => x.key === c.key)) columnas.push({ key: c.key, w: c.w, visible: false }); });
    const emp = columnas.find(c => c.key === 'empresa'); if (emp) emp.visible = true;
    return { rowH: (l && l.rowH) || BASE_LAYOUT_INGRESO.rowH, columnas };
};
const LS_KEY_INGRESO = 'erpTaller.disposicion.ingreso.v1';

// Reordena solo las columnas VISIBLES según `ordenVisibleNuevo` (arreglo de keys en el orden
// deseado), dejando las ocultas ancladas donde ya estaban dentro de `columnas`.
const reordenarVisiblesIngreso = (columnas, ordenVisibleNuevo) => {
    const porClave = Object.fromEntries(columnas.map(c => [c.key, c]));
    let i = 0;
    return columnas.map(c => c.visible ? porClave[ordenVisibleNuevo[i++]] : c);
};

// Valor de una columna 'texto' para una fila — 'empresa', 'estado' y 'adjunto' se pintan aparte
// (llevan color/subtexto/enlace, ver el render de la fila) porque no son texto plano.
const valorCeldaIngreso = (fila, key) => {
    const { s, otEncontrada } = fila;
    if (key === 'numero') return s.numeroSolicitud || '—';
    if (key === 'ot') return otEncontrada?.numeroOT || '—';
    if (key === 'solicitante') return s.solicitante || '—';
    if (key === 'origen') return s.origen || '—';
    if (key === 'ingresada') return fmtFecha(s.fechaCreacion || s.fechaHoraSolicitud);
    if (key === 'ejecucion') return fmtFecha(s.fechaEjecucionSolicitada);
    if (key === 'plazo') return s.plazoEjecucionSugerido || '—';
    if (key === 'direccion') return s.direccion || '—';
    if (key === 'correo') return s.correo || '—';
    if (key === 'telefono') return s.numero || '—';
    return '';
};

function FilaVista({ etiqueta, valor }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, padding: '5px 0', borderBottom: `1px solid ${t.hairlineFila}` }}>
            <span style={{ fontSize: '11px', color: t.textoAtenuado2 }}>{etiqueta}</span>
            <span style={{ fontSize: '12px', color: t.textoPrincipal }}>{valor || '—'}</span>
        </div>
    );
}

// Recibimos 'solicitudes' como prop desde App.jsx para actualización automática
const IngresoScreen = ({ solicitudes = [], liberarSolicitudManual, cargarDatos, API, crearSolicitudGlobal, actualizarSolicitudGlobal, ots = [], enviarPortalCliente, cargando, errorCarga, guardarDisposicionGlobal, eliminarDisposicionGlobal }) => {
    const navigate = useNavigate();
    const [form, setForm] = useState(FORM_VACIO);
    const [archivo, setArchivo] = useState(null);
    const [aviso, setAviso] = useState(null); // { texto, tono: 'error' | 'ok' }
    const [filtroEstado, setFiltroEstado] = useState('');
    const [filtroTexto, setFiltroTexto] = useState('');

    // ---- Disposición de la tabla: columnas, orden, ancho, variantes (ver CAMPOS_INGRESO) ----
    const [layoutTabla, setLayoutTablaState] = useState(() => clonarLayoutIngreso(BASE_LAYOUT_INGRESO));
    const [variantesTabla, setVariantesTabla] = useState([]);
    const [varianteActiva, setVarianteActiva] = useState('');
    const [guardandoVariante, setGuardandoVariante] = useState(false);
    const [nombreNuevaVariante, setNombreNuevaVariante] = useState('');
    const [menuColumnas, setMenuColumnas] = useState(false);
    const [errorVariantes, setErrorVariantes] = useState(null);

    // Sin filtro de pantalla: se listan los nombres de las DOS pantallas (ingreso-solicitudes
    // y panel-control) para que una variante creada en cualquiera de las dos aparezca también
    // acá — pedido explícito del usuario. Cada pantalla igual aplica solo SU propia
    // disposición de columnas (son tablas con campos distintos); layout queda null cuando el
    // nombre existe solo del lado de Panel de control todavía (aplicarVarianteTabla lo maneja
    // sin romper).
    const cargarVariantesTabla = () => {
        axios.get(`${API}/disposiciones`)
            .then(({ data }) => {
                const nombres = [...new Set(data.map(v => v.nombre))].sort();
                setVariantesTabla(nombres.map(nombre => {
                    const propia = data.find(v => v.nombre === nombre && v.pantalla === 'ingreso-solicitudes');
                    const otra = data.find(v => v.nombre === nombre && v.pantalla === 'panel-control');
                    return { nombre, layout: propia ? normalizarLayoutIngreso(propia.layout) : null, idIngreso: propia?._id, idPanel: otra?._id };
                }));
                setErrorVariantes(null);
            })
            .catch(() => setErrorVariantes('No se pudieron cargar las variantes guardadas.'));
    };

    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY_INGRESO);
            if (raw) {
                const p = JSON.parse(raw);
                if (p.layout) setLayoutTablaState(normalizarLayoutIngreso(p.layout));
                setVarianteActiva(p.activa || '');
            }
        } catch { /* localStorage corrupto o inaccesible: se ignora, queda el layout base */ }
        cargarVariantesTabla();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        try { localStorage.setItem(LS_KEY_INGRESO, JSON.stringify({ layout: layoutTabla, activa: varianteActiva })); } catch { /* cuota llena o modo privado: no persiste, no rompe la UI */ }
    }, [layoutTabla, varianteActiva]);

    const setColumnasTabla = (columnas) => { setLayoutTablaState(prev => ({ ...prev, columnas })); setVarianteActiva(''); };
    const toggleColTabla = (key) => {
        if (key === 'empresa') return;
        const actual = layoutTabla.columnas.find(c => c.key === key);
        setColumnasTabla(layoutTabla.columnas.map(c => c.key === key ? { ...c, visible: !actual.visible } : c));
    };
    const moverColTabla = (key, delta) => {
        const cols = layoutTabla.columnas.slice();
        const i = cols.findIndex(c => c.key === key);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= cols.length) return;
        [cols[i], cols[j]] = [cols[j], cols[i]];
        setColumnasTabla(cols);
    };
    const arrastrarColumnaTabla = (key) => (e) => {
        e.preventDefault(); e.stopPropagation();
        const x0 = e.clientX;
        const w0 = layoutTabla.columnas.find(c => c.key === key).w;
        const mover = (ev) => {
            const w = Math.min(260, Math.max(50, Math.round(w0 + (ev.clientX - x0))));
            setLayoutTablaState(prev => ({ ...prev, columnas: prev.columnas.map(c => c.key === key ? { ...c, w } : c) }));
            setVarianteActiva('');
        };
        const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
    };

    // Arrastrar el encabezado completo (no la manija de ancho) reordena en vivo — ver el mismo
    // patrón en DashboardScreen.jsx.
    const headerRefs = useRef({});
    const [colArrastrada, setColArrastrada] = useState(null);
    const arrastrarOrdenColumnaTabla = (key) => (e) => {
        if (key === 'empresa') return; // columna fija, no se reordena
        e.preventDefault();
        setColArrastrada(key);
        const mover = (ev) => {
            const claves = columnasVisiblesTabla.map(c => c.key);
            let nuevoIdx = 0;
            for (const k of claves) {
                const el = headerRefs.current[k];
                if (el && ev.clientX > el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2) nuevoIdx++;
            }
            nuevoIdx = Math.min(nuevoIdx, claves.length - 1);
            const idxActual = claves.indexOf(key);
            if (nuevoIdx !== idxActual) {
                const nuevasClaves = claves.slice();
                nuevasClaves.splice(idxActual, 1);
                nuevasClaves.splice(nuevoIdx, 0, key);
                setColumnasTabla(reordenarVisiblesIngreso(layoutTabla.columnas, nuevasClaves));
            }
        };
        const soltar = () => {
            setColArrastrada(null);
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
        };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
    };
    const setRowHTabla = (h) => { setLayoutTablaState(prev => ({ ...prev, rowH: h })); setVarianteActiva(''); };
    const guardarVarianteTabla = async () => {
        const nombre = (nombreNuevaVariante || '').trim() || `Variante ${variantesTabla.length + 1}`;
        const resultado = await guardarDisposicionGlobal?.({ nombre, pantalla: 'ingreso-solicitudes', layout: clonarLayoutIngreso(layoutTabla) });
        if (!resultado?.exito) { setErrorVariantes('No se pudo guardar la variante.'); return; }
        // Se guarda también la disposición de Panel de control con el mismo nombre (si este
        // navegador ya tiene una guardada — LS_KEY en DashboardScreen.jsx) para que la
        // variante quede completa en las dos pantallas, no solo en la que la creó.
        try {
            const rawPanel = localStorage.getItem('erpTaller.disposicion.v2');
            const layoutPanel = rawPanel ? JSON.parse(rawPanel)?.layout : null;
            if (layoutPanel) await guardarDisposicionGlobal?.({ nombre, pantalla: 'panel-control', layout: layoutPanel });
        } catch { /* best-effort: no bloquea el guardado de esta pantalla si esto falla */ }
        cargarVariantesTabla();
        setVarianteActiva(nombre);
        setGuardandoVariante(false);
        setNombreNuevaVariante('');
    };
    const aplicarVarianteTabla = (v) => {
        if (!v.layout) { setErrorVariantes(`"${v.nombre}" todavía no tiene columnas guardadas para Ingreso — ajustá y guardá con este mismo nombre para completarla.`); return; }
        setLayoutTablaState(v.layout); setVarianteActiva(v.nombre);
    };
    const eliminarVarianteTabla = async (v) => {
        // Se borra en las dos pantallas (si existe en ambas) para que "eliminar" saque la
        // variante común, no solo la mitad que le tocaba a Ingreso.
        const ids = [v.idIngreso, v.idPanel].filter(Boolean);
        const resultados = await Promise.all(ids.map(id => eliminarDisposicionGlobal?.(id)));
        if (resultados.some(r => !r)) { setErrorVariantes('No se pudo eliminar la variante.'); return; }
        setVariantesTabla(prev => prev.filter(x => x.nombre !== v.nombre));
        if (varianteActiva === v.nombre) setVarianteActiva('');
    };
    const restablecerTabla = () => { setLayoutTablaState(clonarLayoutIngreso(BASE_LAYOUT_INGRESO)); setVarianteActiva(''); };

    const columnasVisiblesTabla = layoutTabla.columnas.filter(c => c.visible).map(c => ({ ...campoIngreso(c.key), ...c }));
    const GRID = columnasVisiblesTabla.map(c => c.key === 'empresa' ? 'minmax(150px,1.4fr)' : `${c.w}px`).join(' ') + ` ${ANCHO_ACCIONES}px`;
    const TABLA_MIN_W = 150 + columnasVisiblesTabla.filter(c => c.key !== 'empresa').reduce((s, c) => s + c.w, 0) + ANCHO_ACCIONES + 10 * (columnasVisiblesTabla.length + 1) + 32;
    // Doble clic en una fila abre primero una vista de solo lectura (con la foto visible,
    // si tiene) — antes entraba directo a edición y no había forma de ver el adjunto sin
    // editar. "Editar" desde ahí pasa al mismo formulario de siempre.
    const [viendoId, setViendoId] = useState(null);
    const [editandoId, setEditandoId] = useState(null);

    const set = (campo) => (e) => setForm(prev => ({ ...prev, [campo]: e.target.value }));

    const verSolicitud = (s) => { setViendoId(s._id); setEditandoId(null); };
    const cerrarVista = () => setViendoId(null);

    // Una vez que la solicitud "pasó a evaluación" (se aprobó y se creó la OT, ver
    // aprobarYCrearOT en App.jsx, que marca 'Aprobada' antes de crear la OT y luego el
    // backend la deja 'Tratada') editar aquí ya no sirve: el levantamiento se hace desde
    // Tratamiento y esta copia queda desincronizada. Solo se puede seguir editando mientras
    // sigue 'Pendiente' o si fue 'Rechazada' (para corregir y volver a enviar).
    const puedeEditarSolicitud = (s) => s && (s.estado === 'Pendiente' || s.estado === 'Rechazada');

    const editarSolicitud = (s) => {
        setForm({
            solicitante: s.solicitante || '', empresaSolicitante: s.empresaSolicitante || '',
            correo: s.correo || '', numero: s.numero || '', direccion: s.direccion || '',
            descripcion: s.descripcion || '', origen: s.origen || 'WhatsApp',
            fechaEjecucionSolicitada: s.fechaEjecucionSolicitada ? s.fechaEjecucionSolicitada.slice(0, 10) : '',
            plazoEjecucionSugerido: s.plazoEjecucionSugerido || '', adjuntos: s.adjuntos || '',
        });
        setEditandoId(s._id);
        setViendoId(null);
        setArchivo(null);
        setAviso(null);
    };

    const cancelarEdicion = () => {
        setEditandoId(null);
        setForm(FORM_VACIO);
        setArchivo(null);
        setAviso(null);
    };

    const eliminarAdjunto = () => { setForm(f => ({ ...f, adjuntos: '' })); setArchivo(null); };
    const esImagen = (ruta) => /\.(jpe?g|png|gif|webp)$/i.test(ruta || '') || /^data:image/.test(ruta || '');
    const urlAdjunto = (ruta) => ruta?.startsWith('data:') ? ruta : `${API.replace('/api', '')}${ruta}`;

    const handleCrear = async () => {
        if (!form.empresaSolicitante || !form.solicitante || !form.descripcion) {
            setAviso({ texto: 'Completa los campos obligatorios: empresa, solicitante y descripción.', tono: 'error' });
            return;
        }
        if (!validarTelefono(form.numero)) {
            setAviso({ texto: 'El teléfono debe ser un celular chileno: 9 dígitos empezando con 9 (ej: 912345678), con o sin +56 adelante.', tono: 'error' });
            return;
        }
        if (editandoId) {
            const exito = await actualizarSolicitudGlobal(editandoId, form);
            if (exito) {
                setEditandoId(null);
                setForm(FORM_VACIO);
                setAviso({ texto: 'Solicitud actualizada.', tono: 'ok' });
            } else {
                setAviso({ texto: 'No se pudieron guardar los cambios. Intenta nuevamente.', tono: 'error' });
            }
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
        { key: 'empresaSolicitante', label: 'Empresa *', placeholder: 'Razón social' },
        { key: 'solicitante', label: 'Solicitante *', placeholder: 'Nombre y apellido' },
        { key: 'correo', label: 'Correo', placeholder: 'correo@empresa.cl', type: 'email' },
        { key: 'numero', label: 'Teléfono', placeholder: '+56 9…' },
        { key: 'direccion', label: 'Dirección del servicio', placeholder: 'Calle, ciudad, planta' },
        { key: 'fechaEjecucionSolicitada', label: 'Fecha de ejecución', type: 'date' },
        { key: 'plazoEjecucionSugerido', label: 'Plazo sugerido', placeholder: 'Ej: 5 días hábiles' },
    ];

    const estados = ['Pendiente', 'Aprobada', 'Rechazada', 'Tratada'];
    const chipsEstado = [
        { key: '', label: `Todos (${solicitudes.length})` },
        ...estados.map(e => ({ key: e, label: `${e} (${solicitudes.filter(s => s.estado === e).length})` })),
    ];

    const solicitudVista = viendoId ? solicitudes.find(s => s._id === viendoId) : null;

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
                    {solicitudVista && !editandoId ? (
                        <div style={{ padding: '13px 16px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                <div style={styles.tituloBloque}>Solicitud {solicitudVista.numeroSolicitud || ''}</div>
                                <span onClick={cerrarVista} style={{ fontSize: '11px', color: t.textoAtenuado2, cursor: 'pointer' }}>Cerrar ×</span>
                            </div>
                            <FilaVista etiqueta="Empresa" valor={solicitudVista.empresaSolicitante} />
                            <FilaVista etiqueta="Solicitante" valor={solicitudVista.solicitante} />
                            <FilaVista etiqueta="Correo" valor={solicitudVista.correo} />
                            <FilaVista etiqueta="Teléfono" valor={solicitudVista.numero} />
                            <FilaVista etiqueta="Dirección" valor={solicitudVista.direccion} />
                            <FilaVista etiqueta="Origen" valor={solicitudVista.origen} />
                            <FilaVista etiqueta="Fecha de ejecución" valor={fmtFecha(solicitudVista.fechaEjecucionSolicitada)} />
                            <FilaVista etiqueta="Plazo sugerido" valor={solicitudVista.plazoEjecucionSugerido} />
                            <div style={{ marginTop: 10 }}>
                                <span style={styles.etiqueta}>Descripción</span>
                                <p style={{ fontSize: '12.5px', lineHeight: 1.55, margin: '4px 0 0', color: t.textoSecundario1 }}>{solicitudVista.descripcion || '—'}</p>
                            </div>
                            <div style={{ marginTop: 12 }}>
                                <span style={styles.etiqueta}>Adjunto</span>
                                {solicitudVista.adjuntos ? (
                                    esImagen(solicitudVista.adjuntos) ? (
                                        <a href={urlAdjunto(solicitudVista.adjuntos)} target="_blank" rel="noopener noreferrer">
                                            <img src={urlAdjunto(solicitudVista.adjuntos)} alt="Adjunto" style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 3, marginTop: 6, border: `1px solid ${t.bordeZona}` }} />
                                        </a>
                                    ) : (
                                        <div style={{ marginTop: 6 }}>
                                            <a href={urlAdjunto(solicitudVista.adjuntos)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: t.acento }}>Abrir archivo adjunto</a>
                                        </div>
                                    )
                                ) : (
                                    <div style={{ fontSize: '12px', color: t.textoDeshabilitado, marginTop: 6 }}>Sin adjuntos</div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                                <button
                                    onClick={() => editarSolicitud(solicitudVista)}
                                    disabled={!puedeEditarSolicitud(solicitudVista)}
                                    title={puedeEditarSolicitud(solicitudVista) ? '' : 'Ya pasó a evaluación (se generó una OT): edita desde Tratamiento.'}
                                    style={{ ...styles.btnPrimario, opacity: puedeEditarSolicitud(solicitudVista) ? 1 : .5, cursor: puedeEditarSolicitud(solicitudVista) ? 'pointer' : 'not-allowed' }}
                                >Editar</button>
                                <button onClick={cerrarVista} style={styles.btnSecundario}>Cerrar</button>
                            </div>
                        </div>
                    ) : (
                    <div style={{ padding: '13px 16px 8px' }}>
                        <div style={styles.tituloBloque}>{editandoId ? 'Editar solicitud' : 'Nueva solicitud de servicio'}</div>
                        <div style={styles.formGrid}>
                            {campos.map(c => (
                                <label key={c.key} style={styles.campoLabel}>
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

                            <label style={styles.campoLabel}>
                                <span style={styles.etiqueta}>Canal de origen</span>
                                <select value={form.origen} onChange={set('origen')} style={styles.input}>
                                    <option value="WhatsApp">WhatsApp</option>
                                    <option value="Correo">Correo</option>
                                    <option value="Llamada">Llamada</option>
                                    <option value="Presencial">Presencial</option>
                                </select>
                            </label>

                            <label style={styles.campoLabel}>
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
                                {editandoId && form.adjuntos && !archivo && (
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                                        <a href={urlAdjunto(form.adjuntos)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: t.acento }}>
                                            {esImagen(form.adjuntos) ? 'Ver foto actual' : 'Descargar adjunto actual'}
                                        </a>
                                        <span onClick={eliminarAdjunto} style={{ fontSize: '11px', color: t.pagoPendiente, cursor: 'pointer' }}>Eliminar adjunto</span>
                                    </div>
                                )}
                            </label>

                            <label style={styles.campoLabel}>
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
                            <button onClick={handleCrear} style={styles.btnPrimario}>{editandoId ? 'Guardar cambios' : 'Generar solicitud'}</button>
                            <button onClick={editandoId ? cancelarEdicion : () => { setForm(FORM_VACIO); setArchivo(null); setAviso(null); }} style={styles.btnSecundario}>
                                {editandoId ? 'Cancelar edición' : 'Limpiar'}
                            </button>
                            <span style={{ marginLeft: 'auto', fontSize: '10.5px', color: t.textoAtenuado3 }}>* obligatorio</span>
                        </div>
                    </div>
                    )}
                </section>

                {/* Tabla */}
                <section style={styles.tablaSeccion}>
                    {/* Barra de Disposición — mismo patrón que Panel de control */}
                    <div style={styles.dispBarra}>
                        <span style={styles.dispEtiqueta}>Disposición</span>
                        <button onClick={() => setMenuColumnas(v => !v)} style={styles.btnDisp}>Columnas ({columnasVisiblesTabla.length}/{CAMPOS_INGRESO.length})</button>
                        <div style={{ display: 'flex', gap: 2 }}>
                            {[{ h: 32, label: 'Compacta' }, { h: 36, label: 'Normal' }, { h: 48, label: 'Cómoda' }].map(d => (
                                <button key={d.h} onClick={() => setRowHTabla(d.h)} style={styles.btnDisp}>{layoutTabla.rowH === d.h ? '▪ ' : ''}{d.label}</button>
                            ))}
                        </div>
                        <span style={styles.dispDivisor} />
                        <div style={{ display: 'flex', gap: 3, minWidth: 0, flexWrap: 'wrap' }}>
                            {errorVariantes && <span style={{ fontSize: 11, color: t.pagoPendiente, whiteSpace: 'nowrap' }}>{errorVariantes}</span>}
                            {!errorVariantes && variantesTabla.length === 0 && <span style={{ fontSize: 11, color: t.textoAtenuado3, whiteSpace: 'nowrap' }}>Sin variantes guardadas</span>}
                            {variantesTabla.map(v => (
                                <span key={v.nombre} onClick={() => aplicarVarianteTabla(v)} style={styles.chipVariante}>
                                    <span>{varianteActiva === v.nombre ? '▪ ' : ''}{v.nombre}</span>
                                    <span onClick={(e) => { e.stopPropagation(); eliminarVarianteTabla(v); }} title="Eliminar variante" style={styles.xChip}>×</span>
                                </span>
                            ))}
                        </div>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                            <span style={styles.dispMedidas}>{columnasVisiblesTabla.length} col · fila {layoutTabla.rowH}px</span>
                            {guardandoVariante && (
                                <input value={nombreNuevaVariante} onChange={e => setNombreNuevaVariante(e.target.value)} placeholder="Nombre de la variante" style={styles.inputVariante} />
                            )}
                            {guardandoVariante && <button onClick={guardarVarianteTabla} style={styles.btnConfirmarVariante}>Confirmar</button>}
                            <button onClick={() => setGuardandoVariante(v => !v)} style={styles.btnDisp}>Guardar variante</button>
                            <button onClick={restablecerTabla} style={styles.btnRestablecer}>Restablecer</button>
                        </div>

                        {menuColumnas && (
                            <div style={styles.menuColumnas}>
                                <div style={styles.menuColumnasHeader}>
                                    <span style={{ fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 }}>Campos de la tabla</span>
                                    <span onClick={() => setMenuColumnas(false)} style={styles.xModal}>×</span>
                                </div>
                                {layoutTabla.columnas.map(c => {
                                    const meta = campoIngreso(c.key);
                                    return (
                                        <div key={c.key} onClick={() => toggleColTabla(c.key)} style={styles.filaMenuColumnas}>
                                            <span style={{ fontFamily: t.fontMono, fontSize: 11, color: c.visible ? t.textoPrincipal : t.textoDeshabilitado }}>{c.visible ? '×' : '·'}</span>
                                            <span style={{ fontSize: 11.5, color: c.visible ? t.textoPrincipal : t.textoDeshabilitado, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label}{c.key === 'empresa' ? ' (fija)' : ''}</span>
                                            <span style={{ fontSize: 10, color: t.textoDeshabilitado, fontFamily: t.fontMono }}>{meta.origen}</span>
                                            <span onClick={(e) => { e.stopPropagation(); moverColTabla(c.key, -1); }} title="Mover a la izquierda" style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textoDeshabilitado, padding: '0 4px' }}>‹</span>
                                        </div>
                                    );
                                })}
                                <div style={{ padding: '8px 11px', fontSize: 10.5, color: t.textoAtenuado3, lineHeight: 1.5 }}>Se guarda dentro de la variante junto con anchos y densidad.</div>
                            </div>
                        )}
                    </div>

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
                            <div style={{ ...styles.encabezadoFila, gridTemplateColumns: GRID }}>
                                {columnasVisiblesTabla.map(c => (
                                    <span
                                        key={c.key}
                                        ref={(el) => { headerRefs.current[c.key] = el; }}
                                        onPointerDown={arrastrarOrdenColumnaTabla(c.key)}
                                        title={c.key === 'empresa' ? undefined : 'Arrastra para reordenar'}
                                        style={{
                                            position: 'relative', minWidth: 0, textAlign: c.align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            cursor: c.key === 'empresa' ? 'default' : 'grab', opacity: colArrastrada === c.key ? 0.4 : 1,
                                        }}
                                    >
                                        {c.corto}
                                        {c.key !== 'empresa' && (
                                            <span onPointerDown={arrastrarColumnaTabla(c.key)} title="Arrastra para ajustar el ancho" style={styles.resizeHandle} />
                                        )}
                                    </span>
                                ))}
                                <span />
                            </div>

                            {cargando && Array.from({ length: 6 }).map((_, i) => (
                                <div key={`esqueleto-${i}`} style={{ ...styles.fila, gridTemplateColumns: GRID, height: layoutTabla.rowH }}>
                                    {columnasVisiblesTabla.map(c => (
                                        <span key={c.key}><span style={{ display: 'block', height: 9, borderRadius: 2, background: t.hoverFila, width: c.key === 'empresa' ? '75%' : '90%' }} /></span>
                                    ))}
                                    <span />
                                </div>
                            ))}

                            {!cargando && solicitudesFiltradas.map((s, index) => {
                                const otEncontrada = ots.find(o => o.solicitudId === s._id || o._id === s._id);
                                const estadoFinal = otEncontrada ? otEncontrada.estado : s.estado;
                                const yaTieneOT = !!otEncontrada || ['Tratada', 'Planificada', 'Programada', 'En Ejecución', 'Trabajo Terminado', 'Con Informe', 'Pagada'].includes(estadoFinal);
                                const sla = calcularSLA(s, otEncontrada);
                                const fila = { s, otEncontrada };

                                return (
                                    <div
                                        key={s._id || index} style={{ ...styles.fila, gridTemplateColumns: GRID, height: layoutTabla.rowH, background: (editandoId === s._id || viendoId === s._id) ? t.hoverFila : undefined, cursor: 'pointer' }}
                                        onDoubleClick={() => verSolicitud(s)}
                                        title="Doble clic para ver los datos de esta solicitud"
                                    >
                                        {columnasVisiblesTabla.map(c => {
                                            if (c.key === 'empresa') return (
                                                <span key={c.key} style={styles.celdaEmpresa}>{s.empresaSolicitante || '—'}</span>
                                            );
                                            if (c.key === 'numero') return (
                                                <span key={c.key} style={styles.celdaMono} title="Número de solicitud — junto al teléfono, es lo que el cliente usa para entrar al Portal">{s.numeroSolicitud || String(index + 1).padStart(2, '0')}</span>
                                            );
                                            if (c.key === 'solicitante') return (
                                                <span key={c.key} style={{ minWidth: 0 }}>
                                                    <span style={styles.celdaTexto}>{s.solicitante || '—'}</span>
                                                    {s.numero && <span style={{ display: 'block', fontFamily: t.fontMono, fontSize: '10px', color: t.textoAtenuado2 }}>{s.numero}</span>}
                                                </span>
                                            );
                                            if (c.key === 'estado') return (
                                                <span key={c.key} style={{ minWidth: 0 }}>
                                                    <span style={{ ...styles.celdaEstado, color: colorEstado(estadoFinal, yaTieneOT) }}>{estadoFinal || 'Pendiente'}</span>
                                                    {sla && <span style={{ display: 'block', fontFamily: t.fontMono, fontSize: '10px', color: sla.color }}>SLA {sla.texto}</span>}
                                                </span>
                                            );
                                            if (c.key === 'adjunto') return (
                                                <span key={c.key} style={{ ...styles.celdaAtenuada, color: s.adjuntos ? t.acento : t.textoDeshabilitado }}>
                                                    {s.adjuntos ? (
                                                        <a href={`${API.replace('/api', '')}${s.adjuntos}`} target="_blank" rel="noopener noreferrer" style={{ color: t.acento }}>
                                                            Ver archivo
                                                        </a>
                                                    ) : '—'}
                                                </span>
                                            );
                                            const val = valorCeldaIngreso(fila, c.key);
                                            return (
                                                <span
                                                    key={c.key}
                                                    style={{
                                                        ...styles.celdaTextoAlineada(c.align === 'right'),
                                                        fontFamily: c.mono ? t.fontMono : t.fontUi,
                                                        color: t.textoSecundario1,
                                                    }}
                                                >{val}</span>
                                            );
                                        })}
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

    // order: la tabla va primero (izquierda) y el panel del formulario segundo (derecha) —
    // pedido explícito del usuario; se resuelve con flex `order` en vez de reordenar el JSX
    // para no tocar el resto de la estructura de cada sección.
    formSeccion: { width: '300px', flex: 'none', minWidth: 0, overflow: 'auto', background: t.superficie, borderLeft: `1px solid ${t.bordeZona}`, order: 2 },
    tituloBloque: { fontSize: '9.5px', letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3, marginBottom: '9px' },
    // Un solo campo por fila (antes 4 columnas) — pedido explícito del usuario para poder
    // achicar el panel y darle más ancho a la tabla. `gridColumn: span N` de cada campo (más
    // abajo) queda sin efecto real en una sola columna, no hace falta tocarlo.
    formGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '9px 10px' },
    campoLabel: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 },
    etiqueta: { fontSize: '9.5px', letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    input: {
        height: '27px', minWidth: 0, padding: '0 8px', border: `1px solid ${t.bordeInput}`, background: t.superficie,
        fontFamily: 'inherit', fontSize: '12px', color: t.textoPrincipal, outline: 'none', borderRadius: '2px',
    },
    avisoFranja: { marginTop: '10px', padding: '7px 10px', background: t.barraFiltrosPie, borderLeft: `2px solid ${t.acento}`, fontSize: '11.5px', color: t.textoSecundario1 },
    btnPrimario: { height: '30px', padding: '0 14px', background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', borderRadius: '2px', fontFamily: t.fontUi },
    btnSecundario: { height: '30px', padding: '0 12px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: '12px', color: '#262622', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontFamily: t.fontUi },

    tablaSeccion: { flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', order: 1 },
    barraFiltros: { flex: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 6px', padding: '7px 16px', background: t.barraFiltrosPie, borderBottom: `1px solid ${t.hairlineBloque}` },
    etiquetaBarra: { fontSize: '9.5px', letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2, flex: 'none' },
    filtroInput: { height: '23px', width: '210px', padding: '0 8px', border: `1px solid ${t.bordeInput}`, background: t.superficie, fontFamily: 'inherit', fontSize: '11.5px', outline: 'none', borderRadius: '2px' },
    btnFiltro: { height: '23px', padding: '0 8px', background: 'transparent', border: '1px solid transparent', fontSize: '11px', color: '#57564f', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontFamily: t.fontUi },
    resumenBarra: { marginLeft: 'auto', flex: 'none', fontFamily: t.fontMono, fontSize: '11px', color: t.textoAtenuado3, whiteSpace: 'nowrap' },

    dispBarra: {
        flex: 'none', position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px',
        padding: '5px 16px', background: t.encabezadoTabla, borderBottom: `1px solid ${t.hairlineBloque}`,
    },
    dispEtiqueta: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2, flex: 'none' },
    btnDisp: { height: 20, padding: '0 9px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11, fontWeight: 600, color: '#262622', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', flex: 'none', fontFamily: t.fontUi },
    dispDivisor: { width: 1, height: 16, background: 'rgba(0,0,0,.14)', flex: 'none' },
    chipVariante: { display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 4px 0 8px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11, color: '#262622', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap' },
    xChip: { padding: '0 3px', color: t.textoDeshabilitado, fontFamily: t.fontMono },
    dispMedidas: { fontFamily: t.fontMono, fontSize: 10.5, color: t.textoAtenuado3, whiteSpace: 'nowrap' },
    inputVariante: { width: 150, height: 20, padding: '0 7px', border: `1px solid ${t.bordeZona}`, fontSize: 11, outline: 'none', borderRadius: 2, fontFamily: t.fontUi },
    btnConfirmarVariante: { height: 20, padding: '0 9px', background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },
    btnRestablecer: { height: 20, padding: '0 9px', background: 'transparent', border: '1px solid transparent', fontSize: 11, color: t.textoAtenuado2, cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },
    menuColumnas: {
        position: 'absolute', top: 28, left: 96, zIndex: 20, width: 296, maxHeight: 340, overflow: 'auto',
        background: t.superficie, border: `1px solid ${t.bordeZona}`, boxShadow: '0 8px 24px rgba(0,0,0,.14)', borderRadius: 2,
    },
    menuColumnasHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 11px', borderBottom: `1px solid ${t.hairlineBloque}` },
    filaMenuColumnas: { display: 'grid', gridTemplateColumns: '16px 1fr auto auto', alignItems: 'center', gap: 8, padding: '5px 11px', cursor: 'pointer', borderBottom: `1px solid ${t.hairlineFila}` },
    xModal: { fontFamily: t.fontMono, fontSize: 12, color: t.textoDeshabilitado, cursor: 'pointer', padding: '0 2px' },
    resizeHandle: { position: 'absolute', top: -6, right: -8, width: 9, height: 26, cursor: 'col-resize', background: 'rgba(0,0,0,.10)' },

    scrollTabla: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', background: t.superficie },
    encabezadoFila: {
        position: 'sticky', top: 0, zIndex: 2, display: 'grid', gap: '10px', alignItems: 'center',
        height: '26px', padding: '0 16px', background: t.encabezadoTabla, borderBottom: `1px solid ${t.bordeZona}`,
        fontSize: '9.5px', letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700,
    },
    fila: { display: 'grid', gap: '10px', alignItems: 'center', padding: '0 16px', borderBottom: `1px solid ${t.hairlineFila}` },
    celdaMono: { fontFamily: t.fontMono, fontSize: '11px', color: t.textoDeshabilitado },
    celdaEmpresa: { minWidth: 0, fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    celdaTexto: { minWidth: 0, fontSize: '11.5px', color: t.textoSecundario1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    celdaEstado: { display: 'block', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    celdaAtenuada: { minWidth: 0, fontSize: '11px', color: t.textoAtenuado1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    celdaFecha: { fontFamily: t.fontMono, fontSize: '11px', color: '#57564f', textAlign: 'right' },
    celdaTextoAlineada: (derecha) => ({ minWidth: 0, overflow: 'hidden', textAlign: derecha ? 'right' : 'left', fontSize: '11px', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
    btnFilaPrincipal: { height: '23px', padding: '0 8px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: '11px', fontWeight: 600, color: '#262622', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontFamily: t.fontUi },
    btnFilaSecundario: { height: '23px', padding: '0 8px', background: 'transparent', border: `1px solid ${t.bordeZona}`, fontSize: '11px', color: '#57564f', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontFamily: t.fontUi },
    sinResultados: { padding: '40px 16px', textAlign: 'center', fontSize: '14px', color: t.textoAtenuado3 },
};

export default IngresoScreen;
