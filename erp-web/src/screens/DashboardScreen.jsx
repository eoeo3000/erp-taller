import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { confirmar } from '../utils/notificar';

// Paso 7 del rediseño (ver docs/rediseno/design_handoff_panel_control/README.md §3-4):
// catálogo de campos configurable (13 del handoff original + N° de Solicitud, agregado
// después), redimensionado de columnas por drag, densidad de fila
// (32/40/52) y variantes guardadas en localStorage. El panel de detalle (paso 2) sigue igual.

// ---- Tokens del handoff (colores/tipografía definitivos, ver README §2) ----
const t = {
    fondoMain: '#f6f5f2',
    superficie: '#ffffff',
    textoPrincipal: '#1a1a18',
    textoSecundario1: '#3a3a35',
    textoSecundario2: '#4a4a44',
    textoSecundario3: '#57564f',
    textoAtenuado1: '#6b6a63',
    textoAtenuado2: '#75746e',
    textoAtenuado3: '#8a8981',
    textoDeshabilitado: '#a3a29a',
    barraDisposicion: '#e9e7e2',
    encabezadoTabla: '#e4e2dc',
    barraFiltrosPie: '#f0efeb',
    hoverFila: '#f4f3ef',
    hairlineFila: 'rgba(0,0,0,.06)',
    hairlineBloque: 'rgba(0,0,0,.10)',
    bordeZona: 'rgba(0,0,0,.12)',
    acento: 'oklch(0.48 0.10 250)',
    acentoHover: 'oklch(0.40 0.10 250)',
    pagoPagado: 'oklch(0.48 0.10 155)',
    pagoParcial: 'oklch(0.55 0.11 65)',
    pagoPendiente: 'oklch(0.52 0.13 25)',
    sinOtTexto: '#a3a29a',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontMono: 'ui-monospace, Menlo, monospace',
};

const CLP = n => '$ ' + Math.round(n || 0).toLocaleString('es-CL');
const fmtFecha = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d.getTime()) ? d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
};

// Las 8 etapas visuales del handoff. 'Aprobada'/'Rechazada' ya no son valores de OT.estado
// (ver models/OT.js, subdocumento cotizacion) — la respuesta del cliente a la cotización es
// un sub-proceso aparte del pipeline principal. Un rechazo se detecta por
// cotizacion.respuestaCliente sin sacar a la OT de 'Planificada'.
const ETAPAS_VISUAL = ['Solicitud', 'Tratamiento', 'Planificada', 'Programada', 'Ejecución', 'Terminado', 'Con informe', 'Pagada'];
const MAPA_ETAPA = {
    Tratada: 1, Planificada: 2, Programada: 3,
    'En Ejecución': 4, 'Trabajo Terminado': 5, 'Con Informe': 6, Pagada: 7,
};

// 'Reprogramar' (el supervisor la marcó desde S3, PWA Operativa) no está en MAPA_ETAPA a
// propósito — sin este caso especial, MAPA_ETAPA[estado] daba undefined y el ?? 0 hacía caer
// la etapa a "Solicitud", como si la OT hubiera retrocedido al principio del todo en vez de
// necesitar solo una fecha nueva. Se deja en el mismo casillero que 'Programada' (idx 3,
// mismo criterio que erp-pwa-cliente/C3_EstadoTrabajo.jsx).
const etapaInfo = (ot) => {
    if (!ot) return { idx: 0, label: ETAPAS_VISUAL[0], rechazada: false };
    if (ot.estado === 'Planificada' && ot.cotizacion?.respuestaCliente === 'Rechazada') {
        return { idx: 2, label: 'Rechazada', rechazada: true };
    }
    if (ot.estado === 'Reprogramar') {
        return { idx: 3, label: 'Reprogramar', rechazada: true };
    }
    const idx = MAPA_ETAPA[ot.estado] ?? 0;
    return { idx, label: ETAPAS_VISUAL[idx], rechazada: false };
};

// Detalle de "a quién le toca actuar" dentro de las etapas donde el macro-estado por sí solo
// no lo dice (ver plan de reordenamiento de estados). Una Solicitud sin OT todavía NO es
// "Esperando informe" — ese sub-estado es solo para OT ya creadas (Tratada) sin informe, que
// es exactamente lo que la PWA Operativa le ofrece tomar a un Supervisor (ver
// asignacionController.solicitudesSinInformeDocs: a propósito, solo cuenta OT en Tratada, no
// solicitudes crudas). Una Solicitud sin OT está esperando que el Planificador la revise
// (Aprobar/Rechazar) — el Supervisor ni siquiera puede verla todavía.
// Tratada mezcla "esperando al Supervisor" y "esperando al Planificador" bajo el mismo valor
// de OT.estado; Planificada mezcla "esperando verificar capacidad", "esperando al Cliente" y
// "rechazada, esperando corrección". El resto de las etapas son de un solo actor.
const subEstadoDe = (ot, s) => {
    if (!ot) return s?.estado === 'Rechazada' ? '—' : 'Esperando revisión (Planificador)';
    if (ot.estado === 'Tratada') {
        if (ot.informeEvaluacion?.revision?.estado === 'ConObservaciones') return 'Con observaciones (Supervisor)';
        if (!ot.informeEvaluacion?.completo) return 'Esperando informe (Supervisor)';
        return 'En tratamiento (Planificador)';
    }
    if (ot.estado === 'Planificada') {
        if (ot.cotizacion?.respuestaCliente === 'Rechazada') return 'Rechazada, esperando corrección (Planificador)';
        if (!ot.cotizacion?.capacidadVerificada) return 'Esperando verificar capacidad (Planificador)';
        if (!ot.cotizacion?.enviada) return 'Lista para enviar cotización (Planificador)';
        return 'Esperando aprobación (Cliente)';
    }
    // El supervisor la marcó 'Reprogramar' desde S3 (PWA Operativa) — necesita fecha nueva;
    // se resuelve reconfirmando capacidad en el Gantt (GanttScreen.confirmarCapacidad). Sin
    // este caso, caía al '—' genérico de abajo, igual que una etapa sin nada pendiente.
    if (ot.estado === 'Reprogramar') return 'Necesita fecha nueva (Planificador)';
    return '—';
};

const colorEtapa = ({ idx, rechazada }, tieneOt) => {
    if (rechazada) return t.pagoPendiente;
    if (!tieneOt) return t.textoDeshabilitado;
    if (idx >= 6) return t.pagoPagado;
    return t.acento;
};

const horasDe = (ot) => (ot?.tareas || []).reduce((s, ta) => s + Number(ta.duracion || 0), 0);

const estaPendientePago = (ot) => !ot.pago || ot.pago.estado !== 'Pagado' || ot.pago.anulado;

const etiquetaPago = (ot) => {
    if (!ot) return 'Sin OT';
    if (ot.pago?.anulado) return 'Anulado';
    return ot.pago?.estado || 'Pendiente';
};

const colorPago = (etiqueta) => {
    if (etiqueta === 'Pagado') return t.pagoPagado;
    if (etiqueta === 'Parcial') return t.pagoParcial;
    if (etiqueta === 'Sin OT') return t.sinOtTexto;
    return t.pagoPendiente; // Pendiente / Anulado
};

// Fecha real para orden "reciente": solicitud, y si no hay, la propia OT.
const fechaFila = (f) => {
    const iso = f.solicitud?.fechaHoraSolicitud || f.solicitud?.fechaCreacion || f.ot?.createdAt;
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d.getTime()) ? d.getTime() : 0;
};

// SLA de la solicitud más antigua sin OT (ver docs/funcionalidades-v2.md): mide horas desde el ingreso.
const notaSlaSinOT = (sinOT) => {
    if (!sinOT.length) return 'sin pendientes';
    const horas = sinOT.map(f => {
        const iso = f.solicitud?.fechaHoraSolicitud || f.solicitud?.fechaCreacion;
        const d = iso ? new Date(iso) : null;
        return d && !isNaN(d.getTime()) ? (Date.now() - d.getTime()) / 3600000 : 0;
    });
    const max = Math.max(...horas);
    if (max < 1) return 'la más antigua: <1 h';
    if (max < 48) return `la más antigua: ${Math.floor(max)} h`;
    return `la más antigua: ${Math.floor(max / 24)} d`;
};

// ---- Catálogo de campos (13 del README §3 + 'solicitud') ----
const CAMPOS = [
    { key: 'ot', label: 'N° de OT', corto: 'OT', origen: 'ot.numeroOT', w: 76, align: 'left', tipo: 'texto', mono: true },
    { key: 'solicitud', label: 'N° de Solicitud', corto: 'Solicitud', origen: 'solicitud.numeroSolicitud', w: 90, align: 'left', tipo: 'texto', mono: true },
    { key: 'cliente', label: 'Cliente / faena', corto: 'Cliente / faena', origen: 'solicitud', w: 0, align: 'left', tipo: 'cliente' },
    { key: 'etapa', label: 'Etapa + avance', corto: 'Etapa', origen: 'ot.estado', w: 104, align: 'left', tipo: 'etapa' },
    { key: 'subEstado', label: 'Sub-estado · a quién le toca', corto: 'Sub-estado', origen: 'ot', w: 210, align: 'left', tipo: 'texto' },
    { key: 'horas', label: 'Horas planificadas', corto: 'Horas', origen: 'ot.tareas', w: 58, align: 'right', tipo: 'texto', mono: true },
    { key: 'total', label: 'Total neto', corto: 'Total', origen: 'ot.granTotal', w: 92, align: 'right', tipo: 'texto', mono: true },
    { key: 'pago', label: 'Estado de pago', corto: 'Pago', origen: 'ot.pago', w: 80, align: 'right', tipo: 'texto' },
    { key: 'creacion', label: 'Fecha de creación', corto: 'Ingresada', origen: 'solicitud.fechaCreacion', w: 84, align: 'right', tipo: 'texto', mono: true },
    { key: 'ejecucion', label: 'Fecha de ejecución', corto: 'Ejecución', origen: 'solicitud.fechaEjecucionSolicitada', w: 84, align: 'right', tipo: 'texto', mono: true },
    { key: 'supervisor', label: 'Supervisor a cargo', corto: 'Supervisor', origen: 'ot.supervisorId', w: 96, align: 'left', tipo: 'texto' },
    { key: 'contacto', label: 'Contacto solicitante', corto: 'Contacto', origen: 'solicitante', w: 140, align: 'left', tipo: 'texto' },
    { key: 'tareas', label: 'N° de tareas', corto: 'Tareas', origen: 'ot.tareas', w: 60, align: 'right', tipo: 'texto', mono: true },
    { key: 'margen', label: 'Margen estimado', corto: 'Margen', origen: 'no disponible', w: 70, align: 'right', tipo: 'texto', mono: true },
    { key: 'oc', label: 'Orden de compra', corto: 'OC', origen: 'solicitud.oc', w: 92, align: 'left', tipo: 'texto', mono: true },
];
const campo = (key) => CAMPOS.find(c => c.key === key);
const VISIBLES_BASE = ['ot', 'cliente', 'etapa', 'horas', 'total'];
const SECCIONES_DEFAULT = { ficha: true, flujo: true, tareas: true, costos: true };
const BASE_LAYOUT = { asideW: 300, rowH: 40, secciones: { ...SECCIONES_DEFAULT }, columnas: CAMPOS.map(c => ({ key: c.key, w: c.w, visible: VISIBLES_BASE.includes(c.key) })) };
const clonarLayout = (l) => ({ ...l, secciones: { ...l.secciones }, columnas: l.columnas.map(c => ({ ...c })) });
const normalizarLayout = (l) => {
    const dadas = (l && l.columnas) || [];
    const columnas = dadas.filter(c => campo(c.key)).map(c => ({ key: c.key, w: c.w || campo(c.key).w, visible: !!c.visible }));
    CAMPOS.forEach(c => { if (!columnas.find(x => x.key === c.key)) columnas.push({ key: c.key, w: c.w, visible: false }); });
    const cli = columnas.find(c => c.key === 'cliente'); if (cli) cli.visible = true;
    const secciones = { ...SECCIONES_DEFAULT, ...(l && l.secciones) };
    return { asideW: (l && l.asideW) || BASE_LAYOUT.asideW, rowH: (l && l.rowH) || BASE_LAYOUT.rowH, secciones, columnas };
};
const LS_KEY = 'erpTaller.disposicion.v2';

// Reordena solo las columnas VISIBLES según `ordenVisibleNuevo` (arreglo de keys en el orden
// deseado), dejando las ocultas ancladas donde ya estaban dentro de `columnas` — así arrastrar
// una columna visible no reordena a ciegas las que están ocultas en el medio.
const reordenarVisibles = (columnas, ordenVisibleNuevo) => {
    const porClave = Object.fromEntries(columnas.map(c => [c.key, c]));
    let i = 0;
    return columnas.map(c => c.visible ? porClave[ordenVisibleNuevo[i++]] : c);
};

// Valor de una columna 'texto' para una fila. 'margen' y 'oc' honestamente no tienen dato real
// disponible hoy sin fabricarlo o sin un fetch por fila (ver nota en el resumen entregado al usuario).
const valorCelda = (f, key, recursos = []) => {
    const { ot, solicitud: s } = f;
    if (key === 'ot') return ot?.numeroOT || '—';
    if (key === 'solicitud') return s?.numeroSolicitud || '—';
    if (key === 'horas') { const h = horasDe(ot); return h ? `${h} h` : '—'; }
    if (key === 'total') return ot?.granTotal ? CLP(ot.granTotal) : '—';
    if (key === 'pago') return etiquetaPago(ot);
    if (key === 'subEstado') return subEstadoDe(ot, s);
    if (key === 'creacion') return fmtFecha(s?.fechaCreacion);
    if (key === 'ejecucion') return fmtFecha(s?.fechaEjecucionSolicitada);
    if (key === 'supervisor') {
        const r = recursos.find(rr => String(rr._id) === String(ot?.supervisorId));
        return r?.nombre || '—';
    }
    if (key === 'contacto') return s?.solicitante || '—';
    if (key === 'tareas') return ot?.tareas?.length ? String(ot.tareas.length) : '—';
    if (key === 'margen') return '—'; // no hay costo interno distinto del precio de venta
    if (key === 'oc') return '—'; // el detalle real de OC vive en el panel (se pide solo para la fila seleccionada)
    return '';
};

const DashboardScreen = ({ ots = [], solicitudes = [], eliminarOT, eliminarSolicitud, actualizarEstadoSolicitud, aprobarYCrearOT, recursos = [], API, cargando, errorCarga, cargarDatos, guardarDisposicionGlobal, eliminarDisposicionGlobal }) => {
    const navigate = useNavigate();
    const [filtro, setFiltro] = useState('todos');
    const [consulta, setConsulta] = useState('');
    const [orden, setOrden] = useState('reciente');
    const [sel, setSel] = useState(null);
    const [hoverId, setHoverId] = useState(null);
    const [asideOculta, setAsideOculta] = useState(false);
    const [ocsSel, setOcsSel] = useState([]);

    // ---- Disposición: layout, variantes, menú de columnas ----
    // 'layout' y 'activa' son preferencia personal del navegador (qué estás mirando ahora mismo).
    // 'variantes' es la lista compartida — vive en el backend, no en localStorage (ver App.jsx, paso 9).
    const [layout, setLayoutState] = useState(() => clonarLayout(BASE_LAYOUT));
    const [variantes, setVariantes] = useState([]);
    const [activa, setActiva] = useState('');
    const [guardandoVariante, setGuardandoVariante] = useState(false);
    const [nombreNueva, setNombreNueva] = useState('');
    const [menuColumnas, setMenuColumnas] = useState(false);
    const [errorVariantes, setErrorVariantes] = useState(null);

    const cargarVariantes = () => {
        axios.get(`${API}/disposiciones`, { params: { pantalla: 'panel-control' } })
            .then(({ data }) => { setVariantes(data.map(v => ({ id: v._id, nombre: v.nombre, layout: normalizarLayout(v.layout) }))); setErrorVariantes(null); })
            .catch(() => setErrorVariantes('No se pudieron cargar las variantes guardadas.'));
    };

    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const p = JSON.parse(raw);
                if (p.layout) setLayoutState(normalizarLayout(p.layout));
                setActiva(p.activa || '');
            }
        } catch { /* localStorage corrupto o inaccesible: se ignora, queda el layout base */ }
        cargarVariantes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        try { localStorage.setItem(LS_KEY, JSON.stringify({ layout, activa })); } catch { /* cuota llena o modo privado: no persiste, no rompe la UI */ }
    }, [layout, activa]);

    const setColumnas = (columnas) => { setLayoutState(prev => ({ ...prev, columnas })); setActiva(''); };
    const toggleCol = (key) => {
        if (key === 'cliente') return;
        const actual = layout.columnas.find(c => c.key === key);
        setColumnas(layout.columnas.map(c => c.key === key ? { ...c, visible: !actual.visible } : c));
    };
    const moverCol = (key, delta) => {
        const cols = layout.columnas.slice();
        const i = cols.findIndex(c => c.key === key);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= cols.length) return;
        [cols[i], cols[j]] = [cols[j], cols[i]];
        setColumnas(cols);
    };
    const arrastrarColumna = (key) => (e) => {
        e.preventDefault(); e.stopPropagation();
        const x0 = e.clientX;
        const w0 = layout.columnas.find(c => c.key === key).w;
        const mover = (ev) => {
            const w = Math.min(240, Math.max(44, Math.round(w0 + (ev.clientX - x0))));
            setLayoutState(prev => ({ ...prev, columnas: prev.columnas.map(c => c.key === key ? { ...c, w } : c) }));
            setActiva('');
        };
        const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
    };

    // Arrastrar el encabezado completo (no la manija de ancho, ver arrastrarColumna) reordena
    // la columna en vivo: se compara la posición del puntero contra el centro de cada
    // encabezado visible y se reordena en cuanto el puntero cruza al de al lado — mismo
    // patrón de "arrastrar para reordenar" de cualquier tabla, antes solo existía la flecha
    // "‹" del menú de columnas (mueve de a una, siempre a la izquierda).
    const headerRefs = useRef({});
    const [colArrastrada, setColArrastrada] = useState(null);
    const arrastrarOrdenColumna = (key) => (e) => {
        if (key === 'cliente') return; // columna fija, no se reordena
        e.preventDefault();
        setColArrastrada(key);
        const mover = (ev) => {
            const claves = columnasVisibles.map(c => c.key);
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
                setColumnas(reordenarVisibles(layout.columnas, nuevasClaves));
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
    const setRowH = (h) => { setLayoutState(prev => ({ ...prev, rowH: h })); setActiva(''); };
    const toggleSeccion = (key) => {
        setLayoutState(prev => ({ ...prev, secciones: { ...prev.secciones, [key]: !prev.secciones[key] } }));
        setActiva('');
    };
    const todasAbiertas = Object.values(layout.secciones).every(Boolean);
    const alternarTodasSecciones = () => {
        const abierta = !todasAbiertas;
        setLayoutState(prev => ({ ...prev, secciones: { ficha: abierta, flujo: abierta, tareas: abierta, costos: abierta } }));
        setActiva('');
    };
    const guardarVariante = async () => {
        const nombre = (nombreNueva || '').trim() || `Variante ${variantes.length + 1}`;
        const resultado = await guardarDisposicionGlobal?.({ nombre, pantalla: 'panel-control', layout: clonarLayout(layout) });
        if (!resultado?.exito) { setErrorVariantes('No se pudo guardar la variante.'); return; }
        cargarVariantes();
        setActiva(nombre);
        setGuardandoVariante(false);
        setNombreNueva('');
    };
    const aplicarVariante = (v) => { setLayoutState(normalizarLayout(v.layout)); setActiva(v.nombre); };
    const eliminarVariante = async (v) => {
        const ok = await eliminarDisposicionGlobal?.(v.id);
        if (!ok) { setErrorVariantes('No se pudo eliminar la variante.'); return; }
        setVariantes(prev => prev.filter(x => x.nombre !== v.nombre));
        if (activa === v.nombre) setActiva('');
    };
    const restablecer = () => { setLayoutState(clonarLayout(BASE_LAYOUT)); setActiva(''); };

    const dragAside = (e) => {
        e.preventDefault();
        const x0 = e.clientX;
        const w0 = layout.asideW;
        const mover = (ev) => setLayoutState(prev => ({ ...prev, asideW: Math.min(560, Math.max(220, Math.round(w0 - (ev.clientX - x0)))) }));
        const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
    };

    const columnasVisibles = layout.columnas.filter(c => c.visible).map(c => ({ ...campo(c.key), ...c }));
    const GRID = '3px ' + columnasVisibles.map(c => c.key === 'cliente' ? 'minmax(170px,1fr)' : `${c.w}px`).join(' ');
    const TABLA_MIN_W = 3 + 170 + columnasVisibles.filter(c => c.key !== 'cliente').reduce((s, c) => s + c.w, 0) + 10 * columnasVisibles.length + 29;

    // Filas unificadas: una por solicitud (con su OT si ya existe) + las OT creadas sin solicitud.
    const filasConSolicitud = solicitudes.map(s => ({
        id: s._id,
        solicitud: s,
        ot: ots.find(o => String(o.solicitudId) === String(s._id)) || null,
    }));
    const otsSinSolicitud = ots.filter(o =>
        !o.solicitudId || !solicitudes.find(s => String(s._id) === String(o.solicitudId))
    );
    const filas = [
        ...filasConSolicitud,
        ...otsSinSolicitud.map(o => ({ id: o._id, solicitud: null, ot: o })),
    ];

    const conOT = filas.filter(f => f.ot);
    const sinOT = filas.filter(f => !f.ot);
    const porCobrarFilas = conOT.filter(f => estaPendientePago(f.ot));
    const activasOts = ots.filter(o => o.estado !== 'Pagada' && o.estado !== 'Rechazada');
    const totalHoras = ots.reduce((s, o) => s + horasDe(o), 0);
    const montoPorCobrar = porCobrarFilas.reduce((s, f) => s + (f.ot.granTotal || 0), 0);

    const kpis = [
        { label: 'Solicitudes sin OT', valor: String(sinOT.length), nota: notaSlaSinOT(sinOT) },
        { label: 'OTs activas', valor: String(activasOts.length), nota: `${ots.length} en total` },
        { label: 'Horas planificadas', valor: `${totalHoras} h`, nota: 'todas las OT' },
        { label: 'Por cobrar', valor: CLP(montoPorCobrar), nota: `${porCobrarFilas.length} OT` },
    ];

    const filtros = [
        { key: 'todos', label: `Todos (${filas.length})` },
        { key: 'ots', label: `Con OT (${conOT.length})` },
        { key: 'sinOT', label: `Sin OT (${sinOT.length})` },
        { key: 'porCobrar', label: `Por cobrar (${porCobrarFilas.length})` },
    ];

    const filasFiltro = filtro === 'todos' ? filas
        : filtro === 'ots' ? conOT
        : filtro === 'sinOT' ? sinOT
        : porCobrarFilas;

    const q = consulta.trim().toLowerCase();
    const filasBuscadas = !q ? filasFiltro : filasFiltro.filter(f => {
        const texto = [
            f.solicitud?.empresaSolicitante, f.ot?.numeroOT, f.solicitud?.solicitante,
            f.ot?.solicitante, f.solicitud?.direccion,
        ].filter(Boolean).join(' ').toLowerCase();
        return texto.includes(q);
    });

    const visibles = [...filasBuscadas].sort((a, b) =>
        orden === 'monto' ? (b.ot?.granTotal || 0) - (a.ot?.granTotal || 0) : fechaFila(b) - fechaFila(a)
    );

    const pieTotales = `Total visible ${CLP(visibles.reduce((s, f) => s + (f.ot?.granTotal || 0), 0))} · ${visibles.reduce((s, f) => s + (f.ot?.tareas?.length || 0), 0)} tareas`;

    // Si la selección desaparece por el filtro/búsqueda, cae a la primera fila visible.
    useEffect(() => {
        if (visibles.length === 0) return;
        if (!visibles.find(f => f.id === sel)) setSel(visibles[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibles.map(f => f.id).join(','), sel]);

    const filaSel = visibles.find(f => f.id === sel) || filas.find(f => f.id === sel) || null;

    // Órdenes de compra de la OT seleccionada — no viajan en /api/data (ver Parte V, funcionalidades-v2.md), se piden aparte.
    useEffect(() => {
        const otId = filaSel?.ot?._id;
        if (!otId) { setOcsSel([]); return; }
        let vivo = true;
        axios.get(`${API}/ordenes-compra`, { params: { otId } })
            .then(({ data }) => { if (vivo) setOcsSel(data || []); })
            .catch(() => { if (vivo) setOcsSel([]); });
        return () => { vivo = false; };
    }, [filaSel?.ot?._id, API]);

    // ---- Contenido del panel de detalle, derivado de la fila seleccionada ----
    const detalle = (() => {
        if (!filaSel) return null;
        const { ot, solicitud: s } = filaSel;
        const info = etapaInfo(ot);
        const supervisor = recursos.find(r => String(r._id) === String(ot?.supervisorId))?.nombre || '';
        const totalComponentes = (ot?.componentes || []).reduce((sum, c) => sum + Number(c.cantidad || 0) * Number(c.precio || 0), 0);
        const totalLogistica = (ot?.logistica || []).reduce((sum, l) => sum + Number(l.cantidad || 0) * Number(l.precio || 0), 0);
        const totalManoObra = Math.max(0, (ot?.granTotal || 0) - totalComponentes - totalLogistica);
        const horas = horasDe(ot);

        return {
            numero: ot?.numeroOT || (s ? 'SOL · sin OT' : '—'),
            fecha: `Ingresada ${fmtFecha(s?.fechaHoraSolicitud || s?.fechaCreacion || ot?.createdAt)}`,
            empresa: s?.empresaSolicitante || ot?.solicitante || '—',
            contacto: [s?.solicitante, s?.direccion].filter(Boolean).join(' · '),
            descripcion: s?.descripcion || ot?.descripcion || '',
            ficha: [
                { label: 'Fecha de creación', valor: fmtFecha(s?.fechaCreacion) },
                { label: 'Ejecución solicitada', valor: fmtFecha(s?.fechaEjecucionSolicitada) },
                { label: 'Supervisor', valor: supervisor || '—' },
                { label: 'Orden de compra', valor: ocsSel.length ? (ocsSel.length === 1 ? ocsSel[0].numeroOC : `${ocsSel.length} OC`) : '—' },
            ],
            // El casillero actual (i === info.idx) usa info.label si viene distinto del fijo
            // del array — "Rechazada"/"Reprogramar" ocupan el casillero de otra etapa
            // (Planificada/Programada) pero necesitan texto propio. Antes esto siempre
            // mostraba el texto fijo (ETAPAS_VISUAL[i]): el marcador y el color sí cambiaban
            // (usan info.idx/info.rechazada), pero "Reprogramar" nunca llegaba a verse.
            etapas: ETAPAS_VISUAL.map((label, i) => ({
                label: i === info.idx ? info.label : label,
                marca: info.rechazada && i === info.idx ? '×' : i < info.idx ? '×' : i === info.idx ? '▪' : '·',
                tono: i < info.idx ? t.textoAtenuado1 : i === info.idx ? (info.rechazada ? t.pagoPendiente : t.textoPrincipal) : '#b5b3ab',
                peso: i === info.idx ? '700' : '400',
            })),
            resumenTareas: (ot?.tareas || []).length ? `${ot.tareas.length} · ${horas} h` : 'sin planificar',
            tareas: (ot?.tareas || []).length ? ot.tareas.map(ta => ({
                descripcion: ta.descripcion,
                asignados: (ta.operarioNombre || []).join(', ') || 'sin asignar',
                puesto: ta.puesto || '',
                duracion: ta.duracion ? `${ta.duracion} h` : '—',
            })) : [{ descripcion: 'Sin tareas planificadas', asignados: 'Se definen en Tratamiento', puesto: '', duracion: '' }],
            costos: ot ? [
                { label: 'Mano de obra', valor: CLP(totalManoObra) },
                { label: 'Materiales y equipos', valor: CLP(totalComponentes) },
                { label: 'Logística', valor: CLP(totalLogistica) },
            ] : [],
            granTotal: ot?.granTotal ? CLP(ot.granTotal) : '—',
            ot, s, info,
        };
    })();

    const accionesDetalle = () => {
        if (!detalle) return [];
        const { ot, s } = detalle;
        if (!ot) {
            const eliminar = { label: 'Eliminar solicitud', onClick: async () => { if (await confirmar('¿Eliminar esta solicitud?')) eliminarSolicitud?.(s._id); } };
            if (s.estado === 'Rechazada') return [{ label: 'Reabrir', onClick: () => actualizarEstadoSolicitud?.(s._id, 'Pendiente') }, eliminar];
            return [{ label: 'Rechazar', onClick: async () => { if (await confirmar('¿Rechazar esta solicitud?')) actualizarEstadoSolicitud?.(s._id, 'Rechazada'); } }, eliminar];
        }
        return [{ label: 'Eliminar OT', onClick: async () => { if (await confirmar('¿Eliminar esta OT? La solicitud vuelve a Pendiente.')) eliminarOT?.(ot._id); } }];
    };

    // "Abrir OT" se eliminó de acá: el número de OT de la fila (columna 'ot' y encabezado del
    // panel de detalle) ya navega directo a Tratamiento al hacer clic — un botón aparte para
    // lo mismo era redundante. "Aprobar" se mantiene: no tiene equivalente de un clic en la
    // tabla, porque todavía no existe una OT que abrir.
    const primario = (() => {
        if (!detalle) return null;
        const { ot, s } = detalle;
        if (!ot) return { label: 'Aprobar', onClick: () => aprobarYCrearOT?.(s), nota: 'Aprobar crea la OT de inmediato — queda visible para el supervisor en su app.' };
        return null;
    })();

    const encabezadoSeccion = (titulo, key, resumen) => (
        <div onClick={() => toggleSeccion(key)} style={styles.asideTituloClicable}>
            <span>{titulo}</span>
            <span style={styles.asideTituloDerecha}>
                {resumen && <span style={{ fontFamily: t.fontMono, textTransform: 'none', letterSpacing: 0 }}>{resumen}</span>}
                <span style={styles.glifoSeccion}>{layout.secciones[key] ? '−' : '+'}</span>
            </span>
        </div>
    );

    return (
        <div style={styles.raiz}>
            {/* Header */}
            <header style={styles.header}>
                <h1 style={styles.h1}>Panel de control</h1>
                <span style={styles.subtitulo}>Solicitudes y órdenes de trabajo activas</span>
                <div style={styles.headerAcciones}>
                    <input
                        value={consulta}
                        onChange={e => setConsulta(e.target.value)}
                        placeholder="Buscar cliente, OT o solicitante"
                        style={styles.buscador}
                    />
                    <button onClick={() => navigate('/')} style={styles.btnPrimario}>Nueva solicitud</button>
                </div>
            </header>

            {errorCarga && (
                <div style={styles.franjaError}>
                    <span>{errorCarga}</span>
                    <button onClick={() => cargarDatos?.()} style={styles.btnReintentar}>Reintentar</button>
                </div>
            )}

            {/* Barra de Disposición */}
            <div style={styles.dispBarra}>
                <span style={styles.dispEtiqueta}>Disposición</span>
                <button onClick={() => setMenuColumnas(v => !v)} style={styles.btnDisp}>Columnas ({columnasVisibles.length}/{CAMPOS.length})</button>
                <div style={{ display: 'flex', gap: 2 }}>
                    {[{ h: 32, label: 'Compacta' }, { h: 40, label: 'Normal' }, { h: 52, label: 'Cómoda' }].map(d => (
                        <button key={d.h} onClick={() => setRowH(d.h)} style={styles.btnDisp}>{layout.rowH === d.h ? '▪ ' : ''}{d.label}</button>
                    ))}
                </div>
                <span style={styles.dispDivisor} />
                <div style={{ display: 'flex', gap: 3, minWidth: 0, flexWrap: 'wrap' }}>
                    {errorVariantes && <span style={{ fontSize: 11, color: t.pagoPendiente, whiteSpace: 'nowrap' }}>{errorVariantes}</span>}
                    {!errorVariantes && variantes.length === 0 && <span style={{ fontSize: 11, color: t.textoAtenuado3, whiteSpace: 'nowrap' }}>Sin variantes guardadas</span>}
                    {variantes.map(v => (
                        <span key={v.nombre} onClick={() => aplicarVariante(v)} style={styles.chipVariante}>
                            <span>{activa === v.nombre ? '▪ ' : ''}{v.nombre}</span>
                            <span onClick={(e) => { e.stopPropagation(); eliminarVariante(v); }} title="Eliminar variante" style={styles.xChip}>×</span>
                        </span>
                    ))}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                    <span style={styles.dispMedidas}>{columnasVisibles.length} col · fila {layout.rowH}px</span>
                    {guardandoVariante && (
                        <input value={nombreNueva} onChange={e => setNombreNueva(e.target.value)} placeholder="Nombre de la variante" style={styles.inputVariante} />
                    )}
                    {guardandoVariante && <button onClick={guardarVariante} style={styles.btnConfirmarVariante}>Confirmar</button>}
                    <button onClick={() => setGuardandoVariante(v => !v)} style={styles.btnDisp}>Guardar variante</button>
                    <button onClick={restablecer} style={styles.btnRestablecer}>Restablecer</button>
                </div>

                {menuColumnas && (
                    <div style={styles.menuColumnas}>
                        <div style={styles.menuColumnasHeader}>
                            <span style={{ fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 }}>Campos de la tabla</span>
                            <span onClick={() => setMenuColumnas(false)} style={styles.xModal}>×</span>
                        </div>
                        {layout.columnas.map(c => {
                            const meta = campo(c.key);
                            return (
                                <div key={c.key} onClick={() => toggleCol(c.key)} style={styles.filaMenuColumnas}>
                                    <span style={{ fontFamily: t.fontMono, fontSize: 11, color: c.visible ? t.textoPrincipal : t.textoDeshabilitado }}>{c.visible ? '×' : '·'}</span>
                                    <span style={{ fontSize: 11.5, color: c.visible ? t.textoPrincipal : t.textoDeshabilitado, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label}{c.key === 'cliente' ? ' (fija)' : ''}</span>
                                    <span style={{ fontSize: 10, color: t.textoDeshabilitado, fontFamily: t.fontMono }}>{meta.origen}</span>
                                    <span onClick={(e) => { e.stopPropagation(); moverCol(c.key, -1); }} title="Mover a la izquierda" style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textoDeshabilitado, padding: '0 4px' }}>‹</span>
                                </div>
                            );
                        })}
                        <div style={{ padding: '8px 11px', fontSize: 10.5, color: t.textoAtenuado3, lineHeight: 1.5 }}>Se guarda dentro de la variante junto con anchos y densidad.</div>
                    </div>
                )}
            </div>

            {/* Franja KPI */}
            <div style={styles.kpiFranja}>
                {kpis.map(k => (
                    <div key={k.label} style={styles.kpiCelda}>
                        <div style={styles.kpiLabel}>{k.label}</div>
                        <div style={styles.kpiFila}>
                            <span style={styles.kpiValor}>{k.valor}</span>
                            <span style={styles.kpiNota}>{k.nota}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div style={styles.cuerpo}>
                <section style={styles.seccionTabla}>

                    {/* Barra de filtros */}
                    <div style={styles.barraFiltros}>
                        {filtros.map(f => (
                            <button
                                key={f.key}
                                onClick={() => setFiltro(f.key)}
                                style={styles.btnFiltro}
                            >
                                {filtro === f.key ? '▪ ' : ''}{f.label}
                            </button>
                        ))}
                        <div style={styles.filtrosDerecha}>
                            <span>{visibles.length} de {filas.length} filas</span>
                            <button
                                onClick={() => setOrden(orden === 'monto' ? 'reciente' : 'monto')}
                                style={styles.btnOrden}
                            >
                                {orden === 'monto' ? 'Orden: monto' : 'Orden: reciente'}
                            </button>
                        </div>
                    </div>

                    {/* Tabla */}
                    <div style={styles.scrollTabla}>
                        <div style={{ minWidth: TABLA_MIN_W }}>
                            <div style={{ ...styles.encabezadoFila, gridTemplateColumns: GRID }}>
                                <span />
                                {columnasVisibles.map(c => (
                                    <span
                                        key={c.key}
                                        ref={(el) => { headerRefs.current[c.key] = el; }}
                                        onPointerDown={arrastrarOrdenColumna(c.key)}
                                        title={c.key === 'cliente' ? undefined : 'Arrastra para reordenar'}
                                        style={{
                                            position: 'relative', minWidth: 0, textAlign: c.align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            cursor: c.key === 'cliente' ? 'default' : 'grab', opacity: colArrastrada === c.key ? 0.4 : 1,
                                        }}
                                    >
                                        {c.corto}
                                        {c.key !== 'cliente' && (
                                            <span onPointerDown={arrastrarColumna(c.key)} title="Arrastra para ajustar el ancho" style={styles.resizeHandle} />
                                        )}
                                    </span>
                                ))}
                            </div>

                            {cargando && Array.from({ length: 6 }).map((_, i) => (
                                <div key={`esqueleto-${i}`} style={{ ...styles.fila, gridTemplateColumns: GRID, height: layout.rowH }}>
                                    <span />
                                    {columnasVisibles.map(c => (
                                        <span key={c.key} style={{ padding: '6px 0' }}>
                                            <span style={{ display: 'block', height: 10, borderRadius: 2, background: t.hoverFila, width: c.key === 'cliente' ? '70%' : '100%' }} />
                                        </span>
                                    ))}
                                </div>
                            ))}

                            {!cargando && visibles.map(f => {
                                const { ot, solicitud: s } = f;
                                const info = etapaInfo(ot);
                                const pago = etiquetaPago(ot);
                                const empresa = s?.empresaSolicitante || ot?.solicitante || '—';
                                const secundario = s?.direccion || ot?.descripcion || '';
                                return (
                                    <div
                                        key={f.id}
                                        onClick={() => setSel(f.id)}
                                        onMouseEnter={() => setHoverId(f.id)}
                                        onMouseLeave={() => setHoverId(id => id === f.id ? null : id)}
                                        style={{ ...styles.fila, gridTemplateColumns: GRID, height: layout.rowH, background: hoverId === f.id ? t.hoverFila : t.superficie }}
                                    >
                                        <span style={{ width: 3, alignSelf: 'stretch', background: sel === f.id ? t.textoPrincipal : 'transparent' }} />
                                        {columnasVisibles.map(c => {
                                            // El número de OT navega directo a Tratamiento — reemplaza al botón
                                            // "Abrir OT" que antes vivía solo en el panel de detalle (mismo destino,
                                            // un clic menos). stopPropagation: si no, el clic también dispara
                                            // setSel(f.id) de la fila, cambiando la selección justo antes de navegar.
                                            if (c.key === 'ot') return (
                                                <span
                                                    key={c.key}
                                                    onClick={(e) => { if (ot) { e.stopPropagation(); navigate('/tratamiento', { state: ot }); } }}
                                                    style={{
                                                        ...styles.celdaTexto(c.align === 'right'),
                                                        fontFamily: t.fontMono, color: ot ? t.acento : t.textoSecundario1,
                                                        cursor: ot ? 'pointer' : 'default', textDecoration: ot ? 'underline' : 'none',
                                                    }}
                                                >{valorCelda(f, c.key, recursos)}</span>
                                            );
                                            if (c.key === 'cliente') return (
                                                <span key={c.key} style={{ minWidth: 0, overflow: 'hidden' }}>
                                                    <span style={styles.clientePrincipal}>{empresa}</span>
                                                    <span style={styles.clienteSecundarioFila}>
                                                        <span style={{ color: colorPago(pago), fontWeight: 600, flex: 'none' }}>{pago}</span>
                                                        <span style={styles.clienteSecundario}>{secundario}</span>
                                                    </span>
                                                </span>
                                            );
                                            if (c.key === 'etapa') return (
                                                <span key={c.key} style={{ minWidth: 0 }}>
                                                    <span style={styles.etapaLabel}>{info.label}</span>
                                                    <span style={styles.etapaRiel}>
                                                        <span style={{ display: 'block', height: 3, width: `${((info.idx + 1) / 8) * 100}%`, background: colorEtapa(info, !!ot) }} />
                                                    </span>
                                                </span>
                                            );
                                            const val = valorCelda(f, c.key, recursos);
                                            return (
                                                <span
                                                    key={c.key}
                                                    style={{
                                                        ...styles.celdaTexto(c.align === 'right'),
                                                        fontFamily: c.mono ? t.fontMono : t.fontUi,
                                                        color: c.key === 'pago' ? colorPago(val) : t.textoSecundario1,
                                                        fontWeight: c.key === 'pago' ? 600 : 400,
                                                    }}
                                                >{val}</span>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {!cargando && visibles.length === 0 && (
                                <div style={styles.sinResultados}>Sin operaciones que coincidan.</div>
                            )}
                        </div>
                    </div>

                    {/* Pie */}
                    <div style={styles.pie}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pieTotales}</span>
                        <span style={{ marginLeft: 'auto', flex: 'none' }}>Actualiza cada 30 s</span>
                    </div>
                </section>

                {/* Tira de colapso + separador + panel de detalle */}
                <div
                    onClick={() => setAsideOculta(v => !v)}
                    title={asideOculta ? 'Mostrar panel de detalle' : 'Ocultar panel de detalle'}
                    style={styles.asideTira}
                >
                    {asideOculta ? '‹' : '›'}
                </div>

                {!asideOculta && (
                    <>
                        <div onPointerDown={dragAside} title="Arrastra para ajustar el ancho del panel de detalle" style={styles.asideSeparador} />
                        <aside style={{ ...styles.aside, width: layout.asideW }}>
                            {!detalle ? (
                                <div style={styles.sinResultados}>Seleccioná una fila para ver el detalle.</div>
                            ) : (
                                <>
                                    <div style={styles.asideHeader}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                            <span style={styles.asideNumero}>{detalle.numero}</span>
                                            <span style={styles.asideFecha}>{detalle.fecha}</span>
                                        </div>
                                        <div style={styles.asideEmpresa}>{detalle.empresa}</div>
                                        <div style={styles.asideContacto}>{detalle.contacto}</div>
                                        <p style={styles.asideDescripcion}>{detalle.descripcion}</p>
                                    </div>

                                    <div style={styles.asideScroll}>
                                        <div style={styles.asideBloque}>
                                            {encabezadoSeccion('Ficha', 'ficha')}
                                            {layout.secciones.ficha && detalle.ficha.map(f => (
                                                <div key={f.label} style={styles.fichaFila}>
                                                    <span style={styles.fichaLabel}>{f.label}</span>
                                                    <span style={styles.fichaValor}>{f.valor}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={styles.asideBloque}>
                                            {encabezadoSeccion('Flujo', 'flujo')}
                                            {layout.secciones.flujo && detalle.etapas.map((e, i) => (
                                                <div key={i} style={styles.flujoFila}>
                                                    <span style={{ fontFamily: t.fontMono, fontSize: '10px', color: e.tono }}>{e.marca}</span>
                                                    <span style={{ fontSize: '11.5px', color: e.tono, fontWeight: e.peso }}>{e.label}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={styles.asideBloque}>
                                            {encabezadoSeccion('Tareas', 'tareas', detalle.resumenTareas)}
                                            {layout.secciones.tareas && detalle.tareas.map((ta, i) => (
                                                <div key={i} style={styles.tareaFila}>
                                                    <span style={{ minWidth: 0 }}>
                                                        <span style={styles.tareaDesc}>{ta.descripcion}</span>
                                                        <span style={styles.tareaAsignados}>{ta.asignados}</span>
                                                    </span>
                                                    <span style={styles.tareaPuesto}>{ta.puesto}</span>
                                                    <span style={styles.tareaDuracion}>{ta.duracion}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={styles.asideBloque}>
                                            {encabezadoSeccion('Costos', 'costos', detalle.granTotal)}
                                            {layout.secciones.costos && (
                                                <>
                                                    {detalle.costos.map(c => (
                                                        <div key={c.label} style={styles.fichaFila}>
                                                            <span style={styles.fichaLabel}>{c.label}</span>
                                                            <span style={styles.fichaValor}>{c.valor}</span>
                                                        </div>
                                                    ))}
                                                    <div style={styles.granTotalFila}>
                                                        <span style={{ fontSize: '11.5px', fontWeight: 700 }}>Gran total</span>
                                                        <span style={{ fontFamily: t.fontMono, fontSize: '14px', fontWeight: 600 }}>{detalle.granTotal}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div style={styles.accionesPie}>
                                        <div style={styles.accionesPieHeader}>
                                            <span style={{ ...styles.asideTitulo, marginBottom: 0 }}>Acciones</span>
                                            <span onClick={alternarTodasSecciones} style={styles.toggleTodas}>
                                                {todasAbiertas ? 'Contraer todo' : 'Expandir todo'}
                                            </span>
                                        </div>
                                        <div style={styles.accionesGrid}>
                                            {accionesDetalle().map(a => (
                                                <button key={a.label} onClick={a.onClick} style={styles.btnAccion}>{a.label}</button>
                                            ))}
                                        </div>
                                        {primario && (
                                            <>
                                                <button onClick={primario.onClick} style={styles.btnPrimarioAside}>{primario.label}</button>
                                                <div style={styles.notaAside}>{primario.nota}</div>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </aside>
                    </>
                )}
            </div>
        </div>
    );
};

const styles = {
    raiz: {
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
        background: t.fondoMain, color: t.textoPrincipal, fontFamily: t.fontUi, fontSize: '13px',
    },
    header: {
        flex: 'none', height: '46px', display: 'flex', alignItems: 'center', gap: '16px',
        padding: '0 16px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}`,
    },
    h1: { margin: 0, fontSize: '14px', fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap' },
    subtitulo: { fontSize: '11.5px', color: t.textoAtenuado2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    headerAcciones: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' },
    buscador: {
        width: '240px', height: '27px', padding: '0 9px', border: `1px solid ${t.bordeZona}`,
        background: t.superficie, fontSize: '12px', color: t.textoPrincipal, outline: 'none',
        borderRadius: '2px', fontFamily: t.fontUi,
    },
    btnPrimario: {
        height: '27px', padding: '0 12px', background: t.textoPrincipal, color: '#fff',
        border: `1px solid ${t.textoPrincipal}`, fontSize: '12px', fontWeight: 600,
        borderRadius: '2px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: t.fontUi,
    },

    franjaError: {
        flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
        background: t.pagoPendiente, color: '#fff', fontSize: 12,
    },
    btnReintentar: {
        marginLeft: 'auto', height: 22, padding: '0 10px', background: 'rgba(255,255,255,.18)',
        border: '1px solid rgba(255,255,255,.4)', color: '#fff', fontSize: 11, fontWeight: 600,
        cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi, flex: 'none',
    },

    dispBarra: {
        flex: 'none', position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px',
        padding: '5px 16px', background: t.barraDisposicion, borderBottom: `1px solid ${t.hairlineBloque}`,
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

    kpiFranja: { flex: 'none', display: 'flex', flexWrap: 'wrap', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    kpiCelda: { flex: '1 1 170px', minWidth: '150px', padding: '9px 16px', borderRight: `1px solid ${t.hairlineBloque}` },
    kpiLabel: { fontSize: '9.5px', letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    kpiFila: { display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '3px' },
    kpiValor: { fontFamily: t.fontMono, fontSize: '18px', fontWeight: 600, letterSpacing: '-.02em', whiteSpace: 'nowrap' },
    kpiNota: { fontSize: '10.5px', color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    cuerpo: { flex: 1, minHeight: 0, display: 'flex' },
    seccionTabla: { flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    barraFiltros: {
        flex: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 2px',
        padding: '7px 16px', background: t.barraFiltrosPie, borderBottom: `1px solid ${t.hairlineBloque}`,
    },
    btnFiltro: {
        height: '23px', padding: '0 10px', background: 'transparent', border: '1px solid transparent',
        fontSize: '11.5px', color: t.textoSecundario3, cursor: 'pointer', borderRadius: '2px',
        whiteSpace: 'nowrap', fontFamily: t.fontUi,
    },
    filtrosDerecha: {
        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', flex: 'none',
        whiteSpace: 'nowrap', fontSize: '11px', color: t.textoAtenuado3, fontFamily: t.fontMono,
    },
    btnOrden: {
        height: '23px', padding: '0 9px', background: t.superficie, border: `1px solid ${t.bordeZona}`,
        fontSize: '11px', color: t.textoSecundario1, cursor: 'pointer', borderRadius: '2px', fontFamily: 'inherit',
    },
    scrollTabla: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', background: t.superficie },
    encabezadoFila: {
        position: 'sticky', top: 0, zIndex: 2, display: 'grid',
        gap: '10px', alignItems: 'center', height: '26px', padding: '0 16px 0 13px',
        background: t.encabezadoTabla, borderBottom: `1px solid ${t.bordeZona}`,
        fontSize: '9.5px', letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700,
    },
    fila: {
        display: 'grid', gap: '10px', alignItems: 'center',
        padding: '0 16px 0 13px', borderBottom: `1px solid ${t.hairlineFila}`, cursor: 'pointer',
    },
    celdaTexto: (derecha) => ({
        minWidth: 0, overflow: 'hidden', textAlign: derecha ? 'right' : 'left',
        fontSize: '11.5px',
        whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    }),
    clientePrincipal: { display: 'block', fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    clienteSecundarioFila: { display: 'flex', gap: '6px', fontSize: '10.5px', color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden' },
    clienteSecundario: { overflow: 'hidden', textOverflow: 'ellipsis' },
    etapaLabel: { display: 'block', fontSize: '11.5px', color: t.textoSecundario1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    etapaRiel: { display: 'block', height: '3px', marginTop: '4px', background: 'rgba(0,0,0,.09)' },
    sinResultados: { padding: '40px 16px', textAlign: 'center', fontSize: '14px', color: t.textoAtenuado3 },
    pie: {
        flex: 'none', display: 'flex', alignItems: 'center', gap: '18px', height: '28px', padding: '0 16px',
        background: t.barraFiltrosPie, borderTop: `1px solid ${t.hairlineBloque}`, fontSize: '11px',
        color: t.textoAtenuado1, fontFamily: t.fontMono, overflow: 'hidden',
    },
    asideTira: {
        width: '13px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: t.encabezadoTabla, color: t.textoAtenuado3, fontFamily: t.fontMono, fontSize: '12px',
        cursor: 'pointer', borderLeft: `1px solid ${t.hairlineBloque}`,
    },
    asideSeparador: { width: '5px', flex: 'none', cursor: 'col-resize', background: t.encabezadoTabla, borderLeft: `1px solid ${t.hairlineBloque}`, borderRight: `1px solid ${t.hairlineBloque}` },
    aside: { flex: 'none', display: 'flex', flexDirection: 'column', background: t.fondoMain, minHeight: 0, overflow: 'hidden' },
    asideHeader: { flex: 'none', padding: '12px 16px 11px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    asideNumero: { fontFamily: t.fontMono, fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap' },
    asideFecha: { fontSize: '10.5px', color: t.textoAtenuado3, fontFamily: t.fontMono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    asideEmpresa: { fontSize: '14.5px', fontWeight: 700, marginTop: '5px', letterSpacing: '-.01em' },
    asideContacto: { fontSize: '11.5px', color: t.textoAtenuado1, marginTop: '2px' },
    asideDescripcion: { margin: '9px 0 0', fontSize: '11.5px', lineHeight: 1.5, color: t.textoSecundario2 },
    asideScroll: { flex: 1, minHeight: 0, overflow: 'auto' },
    asideBloque: { padding: '11px 16px 12px', borderBottom: `1px solid ${t.hairlineBloque}` },
    asideTitulo: { fontSize: '9.5px', letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3, marginBottom: '7px' },
    asideTituloClicable: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
        fontSize: '9.5px', letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3,
        marginBottom: '7px', cursor: 'pointer',
    },
    asideTituloDerecha: { display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' },
    glifoSeccion: { fontFamily: t.fontMono, fontSize: '12px', color: '#a3a29a' },
    fichaFila: { display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '3px 0', fontSize: '11.5px' },
    fichaLabel: { color: t.textoAtenuado2, flex: 'none' },
    fichaValor: { fontFamily: t.fontMono, color: '#262622', minWidth: 0, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    flujoFila: { display: 'grid', gridTemplateColumns: '14px 1fr', alignItems: 'center', gap: '8px', height: '21px' },
    tareaFila: { display: 'grid', gridTemplateColumns: '1fr 46px 34px', gap: '8px', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid rgba(0,0,0,.05)' },
    tareaDesc: { display: 'block', fontSize: '11.5px', color: '#262622', lineHeight: 1.35 },
    tareaAsignados: { display: 'block', fontSize: '10.5px', color: t.textoAtenuado3 },
    tareaPuesto: { fontSize: '10.5px', color: t.textoAtenuado1, textAlign: 'right' },
    tareaDuracion: { fontFamily: t.fontMono, fontSize: '11px', textAlign: 'right', color: t.textoSecundario1 },
    granTotalFila: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '7px', paddingTop: '7px', borderTop: '1px solid rgba(0,0,0,.16)' },
    accionesPie: { flex: 'none', borderTop: '1px solid rgba(0,0,0,.12)', background: '#fff', padding: '10px 16px 12px' },
    accionesPieHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '7px' },
    toggleTodas: { fontSize: '9.5px', color: '#a3a29a', cursor: 'pointer' },
    accionesGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
    btnAccion: {
        height: '28px', padding: '0 8px', background: t.superficie, border: `1px solid ${t.bordeZona}`,
        fontSize: '11.5px', fontWeight: 600, color: '#262622', cursor: 'pointer', borderRadius: '2px',
        textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: t.fontUi,
    },
    btnPrimarioAside: {
        width: '100%', height: '30px', marginTop: '6px', background: t.acento, border: `1px solid ${t.acento}`,
        color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', borderRadius: '2px', fontFamily: t.fontUi,
    },
    notaAside: { fontSize: '10.5px', color: t.textoAtenuado3, marginTop: '6px', lineHeight: 1.5 },
};

export default DashboardScreen;
