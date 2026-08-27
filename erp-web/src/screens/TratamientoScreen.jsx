import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import useIsMobile from '../hooks/useIsMobile';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { notificar, confirmar } from '../utils/notificar';

// Paso 4 del rediseño (ver docs/rediseno/design_handoff_panel_control/README.md §6):
// pipeline + 7 tabs (se agrega "0 · Informe Inicial", que no estaba en el mock, ver resumen
// entregado al usuario) + tablas editables + panel de resumen. Mismos tokens que el resto (§2).
// Sin emoji, sin clases de Bootstrap (había varias reales en el archivo anterior: mb-4, p-3,
// border-start, bg-light, text-primary, text-muted — se retiran todas).

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
    encabezadoTabla: '#e4e2dc',
    barraContexto: '#e9e7e2',
    barraFiltrosPie: '#f0efeb',
    hairlineFila: 'rgba(0,0,0,.06)',
    hairlineBloque: 'rgba(0,0,0,.10)',
    bordeZona: 'rgba(0,0,0,.12)',
    bordeInput: 'rgba(0,0,0,.18)',
    acento: 'oklch(0.48 0.10 250)',
    acentoHover: 'oklch(0.40 0.10 250)',
    verde: 'oklch(0.48 0.10 155)',
    ambar: 'oklch(0.55 0.11 65)',
    rojo: 'oklch(0.52 0.13 25)',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontMono: 'ui-monospace, Menlo, monospace',
};

const CLP = n => '$ ' + Math.round(n || 0).toLocaleString('es-CL');

const ETAPAS_VISUAL = ['Solicitud', 'Tratamiento', 'Planificada', 'Programada', 'Ejecución', 'Terminado', 'Con informe', 'Pagada'];
const MAPA_ETAPA = {
    Tratada: 1, Planificada: 2, Programada: 3,
    'En Ejecución': 4, 'Trabajo Terminado': 5, 'Con Informe': 6, Pagada: 7,
};
// 'Aprobada'/'Rechazada' ya no son valores de OT.estado (ver models/OT.js, cotizacion) —
// un rechazo se detecta por cotizacion.respuestaCliente sin sacar a la OT de 'Planificada'.
const etapaInfo = (ot) => {
    const estado = ot?.estado;
    if (!estado) return { idx: 0, label: ETAPAS_VISUAL[0], rechazada: false };
    if (estado === 'Planificada' && ot?.cotizacion?.respuestaCliente === 'Rechazada') {
        return { idx: 2, label: 'Rechazada', rechazada: true };
    }
    const idx = MAPA_ETAPA[estado] ?? 0;
    return { idx, label: ETAPAS_VISUAL[idx], rechazada: false };
};

const informeEvaluacionVacio = {
    fecha: '', responsable: '', condicionesSitio: '', recursosObservados: '',
    riesgos: '', metodologia: '', fotos: [], completo: false,
    tareas: [], componentes: [], logistica: [], hallazgos: [],
    revision: { estado: 'Pendiente', comentario: '', fecha: null, autor: '' },
};

// Grillas fijas de cada tabla editable (README §6). Las de materiales/suministros suman una
// columna de disponibilidad/OC que el mock no contemplaba (ver Gap 2b/2c, funcionalidades-v2.md).
const GRID_TAREAS = 'minmax(200px,1fr) 160px 118px 132px 52px 68px 62px 84px 96px 40px';
// Ancho mínimo real de una fila de GRID_TAREAS (suma de columnas fijas + mínimo de la 1ra +
// gaps + padding lateral). Un div display:grid en flujo normal no crece más allá del ancho
// disponible solo porque sus tracks lo exijan — el excedente queda como "ink overflow"
// (se puede scrollear porque el ancestro overflow-x:auto lo mide, pero el fondo de color de
// la propia fila no llega a pintarlo). Fijar minWidth explícito en header y filas es lo que
// hace que el fondo sí cubra todo el ancho scrolleable.
const GRID_TAREAS_MIN_W = 200 + 160 + 118 + 132 + 52 + 68 + 62 + 84 + 96 + 40 + 9 * 8 + 32;

// Mejora "Metodología por tarea": la fila edita solo la primera línea de desarrollo; el
// resto del texto (parágrafos siguientes, escritos desde el panel expandido) se conserva.
const primeraLinea = (texto) => (texto || '').split('\n')[0];
const conPrimeraLineaReemplazada = (texto, nuevaPrimera) => {
    const resto = (texto || '').split('\n').slice(1).join('\n');
    return resto ? `${nuevaPrimera}\n${resto}` : nuevaPrimera;
};
const GRID_MATERIALES = '104px 128px minmax(200px,1fr) 62px 96px 100px 100px 24px';
const GRID_LOGISTICA = '96px 96px minmax(200px,1fr) 62px 96px 100px 140px 24px';
// Mismo problema y mismo fix que GRID_TAREAS_MIN_W: sin minWidth explícito, el fondo de
// header/filas no cubre las columnas que quedan fuera del ancho disponible.
const GRID_MATERIALES_MIN_W = 104 + 128 + 200 + 62 + 96 + 100 + 100 + 24 + 7 * 8 + 32;
const GRID_LOGISTICA_MIN_W = 96 + 96 + 200 + 62 + 96 + 100 + 140 + 24 + 7 * 8 + 32;

const fmtFecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

// tareas[].horaFin, persistido junto a horaInicio para que la detección de cruces de horario
// de la PWA Operativa (modo supervisor) no tenga que recalcularlo — soporta turnos que cruzan
// medianoche (ver bug de calcularHorasDia en App.jsx, mismo problema de módulo 1440).
const calcularHoraFin = (horaInicio, duracionHoras) => {
    if (!horaInicio || !duracionHoras) return '';
    const [h, m] = horaInicio.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return '';
    const totalMin = h * 60 + m + Math.round(Number(duracionHoras) * 60);
    const minFin = ((totalMin % 1440) + 1440) % 1440;
    const hh = String(Math.floor(minFin / 60)).padStart(2, '0');
    const mm = String(minFin % 60).padStart(2, '0');
    return `${hh}:${mm}`;
};

const filaAnte = { display: 'grid', gridTemplateColumns: '132px 1fr', gap: 8, padding: '7px 0', borderBottom: `1px solid ${t.hairlineFila}` };
const etiquetaAnte = { fontSize: '11px', color: t.textoAtenuado2 };
const valorAnte = { fontSize: '11.5px', color: t.textoPrincipal };
const controlAnte = { height: 26, border: '1px solid rgba(0,0,0,.22)', borderRadius: 2, padding: '0 8px', fontSize: '11.5px', fontFamily: t.fontUi, width: '100%', boxSizing: 'border-box', background: '#fff' };

function FilaAntecedente({ etiqueta, valor, negrita }) {
    return (
        <div style={filaAnte}>
            <span style={etiquetaAnte}>{etiqueta}</span>
            <span style={{ ...valorAnte, fontWeight: negrita ? 600 : 400 }}>{valor ?? '—'}</span>
        </div>
    );
}

// Pestaña Antecedentes: solicitud de origen (solo lectura) + asignación de la OT (editable),
// incluida la asignación del supervisor a cargo — independiente del responsable de cada
// tarea (tareas[].operarioNombre). Ver docs/rediseno/design_handoff_panel_control.
function TabAntecedentes({ cargando, antecedentes, form, onCampo, onGuardar, guardando, aviso, soloLectura }) {
    if (cargando || !antecedentes) {
        return (
            <div style={{ padding: 16 }}>
                {[1, 2, 3].map(i => (
                    <div key={i} style={{ height: 26, background: '#eeece7', borderRadius: 2, marginBottom: 10, maxWidth: 420 }} />
                ))}
            </div>
        );
    }

    const { solicitud, ot, candidatos } = antecedentes;
    const PRIORIDADES = ['Baja', 'Normal', 'Urgente'];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px,100%), 1fr))' }}>
            {/* Columna izquierda — Solicitud de origen (solo lectura) */}
            <div style={{ padding: 16, borderRight: `1px solid rgba(0,0,0,.08)` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: t.textoPrincipal }}>Solicitud de origen</span>
                    <span style={{ fontFamily: t.fontMono, fontSize: '11px', color: t.textoAtenuado1 }}>{solicitud.numero || '—'}</span>
                </div>

                <FilaAntecedente etiqueta="Empresa solicitante" valor={solicitud.empresa} negrita />
                <FilaAntecedente etiqueta="Solicitante" valor={solicitud.solicitante} />
                <FilaAntecedente etiqueta="Teléfono" valor={solicitud.telefono} />
                <FilaAntecedente etiqueta="Fecha de solicitud" valor={fmtFecha(solicitud.fechaSolicitud)} />
                <FilaAntecedente etiqueta="Origen" valor={solicitud.origen} />
                <FilaAntecedente etiqueta="Faena / dirección" valor={solicitud.direccion} />
                <FilaAntecedente etiqueta="Ejecución solicitada" valor={fmtFecha(solicitud.fechaEjecucionSolicitada)} />
                <div style={{ ...filaAnte, borderBottom: 'none' }}>
                    <span style={etiquetaAnte}>Adjuntos</span>
                    {solicitud.adjuntos?.length ? (
                        <span style={valorAnte}>
                            {solicitud.adjuntos.map((a, i) => (
                                <a key={i} href={a} target="_blank" rel="noreferrer" style={{ color: t.acento, textDecoration: 'none' }}>
                                    {a.split('/').pop()}
                                </a>
                            ))}
                        </span>
                    ) : <span style={{ ...valorAnte, color: t.textoDeshabilitado }}>Sin adjuntos</span>}
                </div>

                <div style={{ marginTop: 12, background: '#f7f6f2', border: '1px solid rgba(0,0,0,.08)', borderRadius: 2, padding: 10 }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: t.textoAtenuado2, marginBottom: 4 }}>Descripción del cliente</div>
                    <div style={{ fontSize: '11.5px', color: t.textoPrincipal, lineHeight: 1.55 }}>{solicitud.descripcion || '—'}</div>
                </div>
            </div>

            {/* Columna derecha — Datos de la orden de trabajo (editable) */}
            <div style={{ padding: 16 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: t.textoPrincipal, marginBottom: 10 }}>Datos de la orden de trabajo</div>

                <div style={{ display: 'grid', gridTemplateColumns: '132px 1fr', gap: '10px 12px', alignItems: 'center' }}>
                    <span style={etiquetaAnte}>N° de OT</span>
                    <span style={{ ...valorAnte, fontFamily: t.fontMono }}>{ot.numero || 'Se asigna al guardar'}</span>

                    <span style={etiquetaAnte}>Fecha de creación</span>
                    <span style={{ ...valorAnte, fontFamily: t.fontMono }}>{fmtFecha(ot.fechaCreacion)}</span>

                    <span style={etiquetaAnte}>Supervisor a cargo</span>
                    <select
                        style={controlAnte} disabled={soloLectura}
                        value={form.supervisorId} onChange={e => onCampo('supervisorId', e.target.value)}
                    >
                        <option value="">Sin asignar</option>
                        {candidatos.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.puesto}</option>)}
                    </select>

                    <span style={etiquetaAnte}>Fecha de ejecución</span>
                    <input
                        style={{ ...controlAnte, fontFamily: t.fontMono }} disabled={soloLectura}
                        placeholder="dd-mm-aaaa" value={form.fechaEjecucion}
                        onChange={e => onCampo('fechaEjecucion', e.target.value)}
                    />

                    <span style={etiquetaAnte}>Orden de compra</span>
                    <input
                        style={controlAnte} disabled={soloLectura}
                        placeholder="Sin OC del cliente" value={form.ordenCompra}
                        onChange={e => onCampo('ordenCompra', e.target.value)}
                    />

                    <span style={etiquetaAnte}>Prioridad</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {PRIORIDADES.map(p => (
                            <button
                                key={p} type="button" disabled={soloLectura}
                                onClick={() => onCampo('prioridad', p)}
                                style={{
                                    flex: 1, height: 26, border: '1px solid rgba(0,0,0,.22)', borderRadius: 2,
                                    background: form.prioridad === p ? '#1c1d1b' : '#fff',
                                    color: form.prioridad === p ? '#fff' : t.textoPrincipal,
                                    fontWeight: form.prioridad === p ? 700 : 400, fontSize: '11px', cursor: soloLectura ? 'default' : 'pointer',
                                }}
                            >
                                {p}
                            </button>
                        ))}
                    </div>

                    <span style={{ ...etiquetaAnte, alignSelf: 'start', marginTop: 4 }}>Instrucciones</span>
                    <textarea
                        style={{ ...controlAnte, height: 'auto', minHeight: 58, padding: 8, resize: 'vertical' }} disabled={soloLectura}
                        placeholder="Indicaciones para el supervisor en terreno"
                        value={form.instruccionesTerreno}
                        onChange={e => onCampo('instruccionesTerreno', e.target.value)}
                    />
                </div>

                {!soloLectura && (
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            onClick={onGuardar} disabled={guardando}
                            style={{
                                height: 28, padding: '0 14px', background: t.acento, color: '#fff', fontWeight: 700,
                                fontSize: '11.5px', border: 'none', borderRadius: 2, cursor: guardando ? 'default' : 'pointer',
                                opacity: guardando ? .7 : 1,
                            }}
                        >
                            {guardando ? 'Guardando…' : 'Guardar y asignar'}
                        </button>
                        {aviso && (
                            <span style={{ fontSize: '11px', color: aviso.tipo === 'ok' ? '#4c7a4c' : t.rojo }}>{aviso.texto}</span>
                        )}
                    </div>
                )}
                {soloLectura && (
                    <div style={{ marginTop: 14, fontSize: '11px', color: t.textoAtenuado2 }}>
                        La OT está pagada — Antecedentes queda en solo lectura.
                    </div>
                )}

                <p style={{ fontSize: '10.5px', color: t.textoAtenuado3, marginTop: 14, lineHeight: 1.5 }}>
                    Al asignar, la OT aparece en la agenda del supervisor y en su aplicación de terreno.
                    Las tareas individuales mantienen su propio responsable.
                </p>
            </div>
        </div>
    );
}

// Mejora v3 #5 — Carpeta de OT: documento interno consolidado (informe de evaluación,
// tareas y metodología, recursos, cotización, informes de ejecución, OC), no se envía al
// cliente. Se regenera bajo demanda en vez de guardar el PDF en la OT (evitar blobs
// grandes en Mongo, sin storage de archivos configurado en el proyecto) — solo queda el
// registro de cuándo se generó, quién y con qué secciones (OT.carpetaOT).
function construirIndiceCarpeta({ otSeleccionada, tareas, componentes }) {
    const tareasConDesarrollo = tareas.filter(tt => (tt.desarrollo || '').trim()).length;
    const reportes = otSeleccionada.reportes || [];
    const fotosReportes = reportes.filter(r => r.foto).length;
    const ocs = otSeleccionada.ordenesCompra || [];
    return [
        { k: 'evaluacion', label: 'Informe de evaluación', activo: !!otSeleccionada.informeEvaluacion?.completo,
            detalle: otSeleccionada.informeEvaluacion?.fecha ? `Visita del ${otSeleccionada.informeEvaluacion.fecha} · ${otSeleccionada.informeEvaluacion.fotos?.length || 0} fotos` : 'Sin informe de evaluación',
            resumen: 'Diagnóstico en faena, mediciones y registro fotográfico del estado inicial.', pags: otSeleccionada.informeEvaluacion?.completo ? 2 : 0 },
        { k: 'tareas', label: 'Tareas y metodología', activo: tareas.length > 0,
            detalle: `${tareasConDesarrollo} de ${tareas.length} tareas con desarrollo definido`,
            resumen: 'Alcance comprometido y cómo se ejecutó cada tarea.', pags: Math.max(1, Math.ceil(tareas.length / 4)) },
        { k: 'recursos', label: 'Recursos asignados', activo: tareas.length > 0 || componentes.length > 0,
            detalle: 'Personal, equipos y materiales', resumen: 'Personal, horas hombre, equipos y materiales consumidos.', pags: 1 },
        { k: 'cotizacion', label: 'Cotización aprobada', activo: ['Programada', 'En Ejecución', 'Trabajo Terminado', 'Con Informe', 'Pagada'].includes(otSeleccionada.estado),
            detalle: `${otSeleccionada.numeroOT || 'Sin OT'} · ${otSeleccionada.estado}`, resumen: 'Desglose comercial y condiciones aceptadas por el cliente.', pags: 1 },
        { k: 'ejecucion', label: 'Informes de ejecución', activo: reportes.length > 0,
            detalle: `${reportes.length} informes de terreno · ${fotosReportes} fotos`, resumen: 'Avance por jornada, desviaciones y respaldo fotográfico.', pags: Math.max(1, Math.ceil(reportes.length / 2)) },
        { k: 'ocs', label: 'Órdenes de compra', activo: ocs.length > 0,
            detalle: `${ocs.length} OC a proveedores`, resumen: 'Compras asociadas a la OT con proveedor y monto.', pags: ocs.length > 0 ? 1 : 0 },
    ];
}

function TabDocumentosPdf({ otSeleccionada, tareas, componentes, antecedentes, onGenerar }) {
    const indiceCompleto = construirIndiceCarpeta({ otSeleccionada, tareas, componentes });
    const [marcados, setMarcados] = useState(() => Object.fromEntries(indiceCompleto.map(it => [it.k, it.activo])));
    const [generadoPor, setGeneradoPor] = useState('');
    const [aviso, setAviso] = useState('');

    const seleccionados = indiceCompleto.filter(it => marcados[it.k]);
    const totalPags = 1 + seleccionados.reduce((a, it) => a + it.pags, 0); // +1 portada

    const generar = () => {
        if (!generadoPor.trim()) { setAviso('Escribe quién genera la carpeta.'); return; }
        onGenerar(seleccionados, generadoPor.trim(), totalPags);
        setAviso(`Carpeta generada: OT-${otSeleccionada.numeroOT || 'nueva'}-carpeta.pdf`);
    };

    return (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', padding: 16 }}>
            <div style={{ width: 300, flex: 'none', background: t.superficie, border: `1px solid ${t.bordeZona}` }}>
                <div style={{ padding: '9px 12px', background: t.encabezadoTabla, borderBottom: `1px solid ${t.hairlineBloque}`, fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3 }}>Contenido de la carpeta</div>
                {indiceCompleto.map(it => (
                    <label key={it.k} style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 9, alignItems: 'center', padding: '9px 12px', borderBottom: `1px solid ${t.hairlineFila}`, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!marcados[it.k]} onChange={() => { setMarcados(m => ({ ...m, [it.k]: !m[it.k] })); setAviso(''); }} style={{ width: 14, height: 14 }} />
                        <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600 }}>{it.label}</span>
                            <span style={{ display: 'block', fontSize: 10.5, color: t.textoAtenuado3 }}>{it.detalle}</span>
                        </span>
                        <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.textoDeshabilitado }}>{it.pags} p</span>
                    </label>
                ))}
                <div style={{ padding: 11 }}>
                    <div style={{ fontSize: 10.5, color: t.textoAtenuado3, lineHeight: 1.5, marginBottom: 8 }}>Documento interno. No se envía al cliente.</div>
                    <input placeholder="Generado por" value={generadoPor} onChange={e => { setGeneradoPor(e.target.value); setAviso(''); }} style={{ ...styles.inputPlano, marginBottom: 8, border: `1px solid ${t.bordeInput}` }} />
                    <button onClick={generar} style={{ ...styles.btnPrimario, width: '100%' }}>Generar carpeta de OT</button>
                    <div style={{ fontSize: 10.5, color: aviso.startsWith('Carpeta') ? t.verde : t.rojo, marginTop: 7, minHeight: 14 }}>{aviso}</div>
                </div>
            </div>

            <div style={{ width: 600, maxWidth: '100%', background: '#fff', border: `1px solid ${t.bordeZona}`, padding: '28px 32px', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
                <div style={{ borderBottom: '2px solid #1c1d1b', paddingBottom: 9 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '.13em', textTransform: 'uppercase', color: t.textoAtenuado3 }}>Carpeta de orden de trabajo</div>
                    <div style={{ fontSize: 19, fontWeight: 700, marginTop: 3 }}>{otSeleccionada.numeroOT || 'Sin número'}</div>
                    <div style={{ fontSize: 11, color: t.textoAtenuado1, marginTop: 2 }}>
                        {otSeleccionada.solicitante || 'Cliente'} · {antecedentes?.solicitud?.direccion || 'Sin faena registrada'} · Supervisor {antecedentes?.ot?.supervisor?.nombre || 'sin asignar'}
                    </div>
                </div>
                {seleccionados.length === 0 && <div style={{ padding: '16px 0', fontSize: 11.5, color: t.textoAtenuado3 }}>Marca al menos una sección para ver el índice.</div>}
                {seleccionados.map((it, i) => (
                    <div key={it.k} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 46px', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: `1px solid ${t.hairlineFila}` }}>
                        <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textoDeshabilitado }}>{String(i + 1).padStart(2, '0')}</span>
                        <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{it.label}</span>
                            <span style={{ display: 'block', fontSize: 11, color: t.textoAtenuado1, lineHeight: 1.5 }}>{it.resumen}</span>
                        </span>
                        <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.textoDeshabilitado, textAlign: 'right' }}>{it.pags} p</span>
                    </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 10.5, color: t.textoAtenuado3 }}>
                    <span>{generadoPor ? `Generado el ${new Date().toLocaleDateString('es-CL')} por ${generadoPor}` : 'Sin generar todavía'}</span>
                    <span style={{ fontFamily: t.fontMono }}>{totalPags} páginas</span>
                </div>
            </div>
        </div>
    );
}

const TratamientoScreen = ({ cargarDatos, API, actualizarOtGlobal, recursos = [],
    componentes: componentesDB = [],
    suministros: suministrosDB = [],
    puestosDB: puestosDB = [],
    plantillas = [] }) => {
    const isMobile = useIsMobile();
    const { state: datosRecibidos } = useLocation();
    const navigate = useNavigate();
    const inicializado = useRef(false);
    // OT que ya traía tareas/componentes de antes de que existiera el Informe Inicial: no se le exige completarlo retroactivamente.
    const yaTeniaContenidoPrevio = (datosRecibidos?.tareas?.length > 0) || (datosRecibidos?.componentes?.length > 0) || (datosRecibidos?.logistica?.length > 0);
    // Antecedentes es el destino por defecto al abrir una OT desde cualquier entrada
    // (panel de control, ingreso de solicitudes, programación) — ver CORRECCIONES pestaña Antecedentes.
    // _tabDestino: cuando se vuelve desde Gantt tras "Confirmar capacidad y fechas" (aviso
    // "Requiere programar la OT" de la pestaña Cotización), abre directo en esa pestaña.
    const [tabActiva, setTabActiva] = useState(datosRecibidos?._tabDestino || 'antecedentes');
    const [otSeleccionada, setOtSeleccionada] = useState(datosRecibidos || {});
    const [tareas, setTareas] = useState([]);
    const [componentes, setComponentes] = useState([]);
    const [excepciones, setExcepciones] = useState([]);
    const [informeEvaluacion, setInformeEvaluacion] = useState({ ...informeEvaluacionVacio, ...(datosRecibidos?.informeEvaluacion || {}) });
    const [isModalEnvioOpen, setIsModalEnvioOpen] = useState(false);
    const [emailsEnvio, setEmailsEnvio] = useState([]);
    const [nuevoEmail, setNuevoEmail] = useState('');
    const [modalPlantilla, setModalPlantilla] = useState(false);
    const [plantillaPreview, setPlantillaPreview] = useState(null);
    const [pago, setPago] = useState(() => {
        const p = datosRecibidos?.pago;
        return p || { estado: 'Pendiente', montoPagado: 0, fechaPago: '', metodoPago: 'Transferencia', referencia: '', notas: '' };
    });
    const [logistica, setLogistica] = useState([{ id: Date.now(), descripcion: '', cantidad: 1, precio: 0 }]);
    // Mejora v3 #6 — Cotización ampliada: condiciones comerciales editables y secciones a
    // incluir en el PDF (el detalle por tarea/materiales-suministros/totales van siempre).
    const [condicionesComerciales, setCondicionesComerciales] = useState(() => ({
        validez: '30 días corridos desde la emisión', plazoPago: '30 días desde la factura',
        formaPago: 'Transferencia electrónica', garantia: '6 meses por defectos de montaje',
        plazoEjecucion: '', noIncluye: '', ...(datosRecibidos?.condicionesComerciales || {}),
    }));
    const [seccionesPdf, setSeccionesPdf] = useState({ tareas: true, materiales: true, gantt: true, condiciones: true, fotos: false });
    const [asideW, setAsideW] = useState(300);
    const [asideOculta, setAsideOculta] = useState(false);
    useEffect(() => { if (isMobile) setAsideOculta(true); }, [isMobile]);

    const dragAside = (e) => {
        e.preventDefault();
        const x0 = e.clientX, w0 = asideW;
        const mover = (ev) => setAsideW(Math.min(560, Math.max(220, Math.round(w0 - (ev.clientX - x0)))));
        const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
    };

    const actualizarTarea = (index, campo, valor) => {
        setTareas(tareas.map((tItem, i) => {
            if (i !== index) return tItem;
            const actualizado = { ...tItem, [campo]: (campo === 'duracion' || campo === 'valorHora') ? Number(valor) : valor };
            if (campo === 'hora' || campo === 'duracion') {
                actualizado.horaInicio = actualizado.hora || '';
                actualizado.horaFin = calcularHoraFin(actualizado.hora, actualizado.duracion);
            }
            return actualizado;
        }));
    };
    const agregarComponente = () => setComponentes([...componentes, { id: Date.now(), codigo: '', descripcion: '', cantidad: 1, precio: 0 }]);
    const actualizarComponente = (index, campo, valor) => {
        setComponentes(prev => prev.map((c, i) => i === index
            ? { ...c, [campo]: (campo === 'cantidad' || campo === 'precio') ? parseFloat(valor || 0) : valor }
            : c));
    };

    const calcularSubtotal = (lista) => lista.reduce((sum, i) => sum + (Number(i.cantidad || 0) * Number(i.unitario || 0)), 0);
    void calcularSubtotal;

    // Excepciones ("extensión de cotización", ver models/OT.js §7) — el supervisor las crea en
    // Borrador desde S3 (PWA Operativa, accion:'replanificar'); acá se completan con precios
    // (mismo patrón de edición que componentes/tareas arriba, pero anidado dentro de cada
    // excepción) y se envían al cliente. id sin _id (ítems recién agregados acá) llega igual al
    // $set genérico de actualizarOT — Mongoose lo descarta al castear al subschema, no hace
    // falta limpiarlo como con componentes/tareas de nivel OT.
    const excepcionesBorrador = excepciones.filter(e => e.estado === 'Borrador');
    const [enviandoExcepcion, setEnviandoExcepcion] = useState(null); // idx en curso, o null

    const agregarComponenteExtra = (idxExcepcion) => setExcepciones(prev => prev.map((e, i) => i === idxExcepcion
        ? { ...e, componentesExtra: [...(e.componentesExtra || []), { id: Date.now(), codigo: '', descripcion: '', cantidad: 1, precio: 0, tipo: 'Material' }] }
        : e));
    const actualizarComponenteExtra = (idxExcepcion, idxItem, campo, valor) => setExcepciones(prev => prev.map((e, i) => i !== idxExcepcion ? e : {
        ...e,
        componentesExtra: (e.componentesExtra || []).map((c, j) => j === idxItem
            ? { ...c, [campo]: (campo === 'cantidad' || campo === 'precio') ? parseFloat(valor || 0) : valor }
            : c),
    }));
    const eliminarComponenteExtra = (idxExcepcion, idxItem) => setExcepciones(prev => prev.map((e, i) => i !== idxExcepcion ? e : {
        ...e, componentesExtra: (e.componentesExtra || []).filter((_, j) => j !== idxItem),
    }));
    const agregarTareaExtra = (idxExcepcion) => setExcepciones(prev => prev.map((e, i) => i === idxExcepcion
        ? { ...e, tareasExtra: [...(e.tareasExtra || []), { id: Date.now(), descripcion: '', puesto: '', duracion: 1, valorHora: 0 }] }
        : e));
    const actualizarTareaExtra = (idxExcepcion, idxItem, campo, valor) => setExcepciones(prev => prev.map((e, i) => i !== idxExcepcion ? e : {
        ...e,
        tareasExtra: (e.tareasExtra || []).map((tt, j) => j === idxItem
            ? { ...tt, [campo]: (campo === 'duracion' || campo === 'valorHora') ? Number(valor) : valor }
            : tt),
    }));
    const eliminarTareaExtra = (idxExcepcion, idxItem) => setExcepciones(prev => prev.map((e, i) => i !== idxExcepcion ? e : {
        ...e, tareasExtra: (e.tareasExtra || []).filter((_, j) => j !== idxItem),
    }));

    const montoExcepcion = (e) =>
        (e.componentesExtra || []).reduce((s, c) => s + (Number(c.cantidad) || 0) * (Number(c.precio) || 0), 0)
        + (e.tareasExtra || []).reduce((s, tt) => s + (Number(tt.duracion) || 0) * (Number(tt.valorHora) || 0), 0);

    const enviarExcepcion = async (idx) => {
        const e = excepciones[idx];
        if ((e.componentesExtra || []).length === 0 && (e.tareasExtra || []).length === 0) {
            notificar.advertencia('Agrega al menos un material o una tarea extra antes de enviar.');
            return;
        }
        setEnviandoExcepcion(idx);
        try {
            await actualizarOtGlobal(otSeleccionada._id, { excepciones }); // persiste lo editado antes de enviar
            const respuesta = await axios.post(`${API}/mail/enviar-excepcion`, {
                otId: otSeleccionada._id,
                excepcionId: e._id,
                emails: [datosRecibidos?.correo].filter(Boolean),
                cliente: datosRecibidos?.solicitante || 'Cliente General',
            });
            if (respuesta.data.ok) {
                notificar.exito('Extensión de cotización enviada.');
                if (cargarDatos) await cargarDatos();
            }
        } catch (error) {
            notificar.error('No se pudo enviar la excepción: ' + (error.response?.data?.error || error.message));
        } finally {
            setEnviandoExcepcion(null);
        }
    };

    const limpiarIds = (lista) => (lista || []).map(item => {
        const { _id, id: _omitido, ...resto } = item;
        return (String(_id).length === 24) ? { _id, ...resto } : resto;
    });

    const guardarPlanificacion = async (estadoForzado) => {
        const dataCompleta = {
            ...datosRecibidos,
            solicitudId: datosRecibidos.solicitudId || datosRecibidos._id,
            numeroOT: otSeleccionada.numeroOT || datosRecibidos.numeroOT,
            // 'Reprogramar' (el supervisor la marcó desde S3, PWA Operativa) se preserva tal cual
            // al guardar acá — reasignar fechas de tareas no la resuelve por sí solo, hace falta
            // reconfirmar capacidad en el Gantt (mismo gate que antes de enviar la cotización la
            // primera vez, ver GanttScreen.confirmarCapacidad) antes de volver a 'Programada'. Sin
            // 'Reprogramar' en esta lista caía al else de abajo y la mandaba a 'Tratada', perdiendo
            // el avance.
            estado: estadoForzado || (['Pendiente', 'Tratada', 'Planificada', 'Programada', 'En Ejecución', 'Reprogramar', 'Trabajo Terminado', 'Con Informe', 'Pagada'].includes(otSeleccionada?.estado) ? otSeleccionada.estado : 'Tratada'),
            tareas,
            componentes: limpiarIds(componentes),
            logistica: (logistica || []).map(l => ({
                _id: (String(l._id).length === 24) ? l._id : undefined,
                unidad: l.codigo || l.unidad || '', patente: l.patente || '', descripcion: l.descripcion || '',
                cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0
            })),
            informeEvaluacion,
            granTotal,
            // Cualquier guardado de tareas/componentes/logística invalida una capacidad ya
            // confirmada (GanttScreen.confirmarCapacidad): el plan que se verificó pudo cambiar
            // (fechas, horas, ítems) y "Enviar cotización" solo mira este booleano, no vuelve a
            // sumar horas — sin este reset, una OT con capacidadVerificada=true de antes seguía
            // dejando enviar/programar aunque ahora sus tareas quedaran en 0 horas o sin fecha.
            cotizacion: { ...(otSeleccionada?.cotizacion || datosRecibidos?.cotizacion || {}), capacidadVerificada: false },
        };
        try {
            const respuesta = await actualizarOtGlobal(datosRecibidos._id, dataCompleta);
            if (respuesta && respuesta.exito) {
                notificar.exito("Planificación guardada.");
                if (respuesta.otActualizada) {
                    setOtSeleccionada(respuesta.otActualizada);
                    if (respuesta.otActualizada.logistica?.length > 0) setLogistica(respuesta.otActualizada.logistica);
                }
                if (cargarDatos) await cargarDatos();
            }
        } catch (error) {
            console.error("Error al guardar:", error);
        }
    };

    // Mejora v3 #6 — Cotización ampliada. `secciones` controla qué bloques opcionales entran
    // (tareas/materiales/gantt/condiciones); encabezado y totales van siempre. "fotos" queda
    // listado en el panel pero deshabilitado (sin implementar, ver TabDocumentosPdf).
    const generarPDF = async (secciones = seccionesPdf) => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.setFontSize(18); doc.setTextColor(44, 62, 80);
        doc.text("COTIZACIÓN TÉCNICA Y COMERCIAL", pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text(`OT N°: ${datosRecibidos?.numeroOT || 'N/A'}`, 14, 28);
        doc.text(`Fecha Emisión: ${new Date().toLocaleDateString()}`, pageWidth - 14, 28, { align: 'right' });
        doc.setDrawColor(200); doc.line(14, 32, pageWidth - 14, 32);
        doc.setFontSize(11); doc.setTextColor(44, 62, 80); doc.setFont(undefined, 'bold');
        doc.text("INFORMACIÓN DEL CLIENTE", 14, 38);
        doc.text("DETALLES DEL SERVICIO", pageWidth / 2 + 7, 38);
        doc.setFontSize(9); doc.setTextColor(0); doc.setFont(undefined, 'normal');
        doc.text(`Empresa: ${datosRecibidos?.empresaSolicitante || 'Particular'}`, 14, 45);
        doc.text(`Solicitante: ${datosRecibidos?.solicitante || '-'}`, 14, 50);
        doc.text(`Correo: ${datosRecibidos?.correo || '-'}`, 14, 55);
        doc.text(`Teléfono: ${datosRecibidos?.numero || '-'}`, 14, 60);
        const col2 = pageWidth / 2 + 7;
        doc.text(`Origen: ${datosRecibidos?.origen || 'WhatsApp'}`, col2, 45);
        doc.text(`Fecha Solicitada: ${datosRecibidos?.fechaEjecucionSolicitada ? new Date(datosRecibidos.fechaEjecucionSolicitada).toLocaleDateString() : 'A convenir'}`, col2, 50);
        doc.text(`Plazo Sugerido: ${datosRecibidos?.plazoEjecucionSugerido || '0'} días`, col2, 55);
        const desc = `Descripción: ${datosRecibidos?.descripcion || 'Sin detalle'}`;
        const splitDesc = doc.splitTextToSize(desc, pageWidth - 28);
        doc.text(splitDesc, 14, 68);
        let y = 68 + (splitDesc.length * 5) + 5;

        // 1. Detalle por tarea: tarea, HH, materiales, subtotal por línea (no solo el total).
        // Los materiales no están vinculados a una tarea puntual en el modelo (componentes[]
        // no tiene tareaId) — la columna queda en "—" en vez de mostrar un $0 que parecería
        // un cálculo real, y el subtotal de esta tabla es solo mano de obra de la tarea.
        if (secciones.tareas && tareas.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['1. DETALLE POR TAREA', 'HH', 'MATERIALES', 'SUBTOTAL (M.O.)']],
                body: tareas.map(tt => {
                    const hh = Number(tt.duracion) * Number(tt.valorHora) * (tt.operarioId?.length || 1);
                    return [tt.descripcion, `${tt.duracion} h`, '—', `$ ${hh.toLocaleString()}`];
                }),
                headStyles: { fillColor: [44, 62, 80] },
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // 2. Materiales y suministros directos: dos bloques separados (no uno combinado).
        if (secciones.materiales) {
            doc.setFontSize(11); doc.setTextColor(44, 62, 80); doc.setFont(undefined, 'bold');
            doc.text('2. MATERIALES Y SUMINISTROS DIRECTOS', 14, y);
            y += 4;
            const mitad = (pageWidth - 28) / 2;
            autoTable(doc, {
                startY: y, tableWidth: mitad - 4, margin: { left: 14 },
                head: [['Materiales', 'Monto']],
                body: componentes.map(c => [c.descripcion, `$ ${(Number(c.cantidad) * Number(c.precio)).toLocaleString()}`]),
                headStyles: { fillColor: [52, 73, 94] }, styles: { fontSize: 8.5 },
            });
            const yMateriales = doc.lastAutoTable.finalY;
            autoTable(doc, {
                startY: y, tableWidth: mitad - 4, margin: { left: 14 + mitad + 8 },
                head: [['Suministros directos', 'Monto']],
                body: logistica.map(l => [l.descripcion, `$ ${(Number(l.cantidad) * Number(l.precio)).toLocaleString()}`]),
                headStyles: { fillColor: [127, 140, 141] }, styles: { fontSize: 8.5 },
            });
            y = Math.max(yMateriales, doc.lastAutoTable.finalY) + 10;
        }

        // 3. Cronograma: el Gantt de la OT embebido (captura de la tabla ya renderizada en pantalla).
        if (secciones.gantt) {
            doc.setFontSize(12); doc.setTextColor(44, 62, 80); doc.setFont(undefined, 'bold');
            doc.text("3. CRONOGRAMA", 14, y);
            const ganttElement = document.getElementById('seccion-gantt-visual');
            if (ganttElement) {
                const canvas = await html2canvas(ganttElement, { scale: 2 });
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = pageWidth - 28;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                if (y + imgHeight > 270) { doc.addPage(); doc.addImage(imgData, 'PNG', 14, 20, imgWidth, imgHeight); y = 20 + imgHeight + 15; }
                else { doc.addImage(imgData, 'PNG', 14, y + 5, imgWidth, imgHeight); y = y + imgHeight + 15; }
            } else { y += 10; }
        }

        // 4. Totales: mano de obra, materiales y suministros, neto, total con IVA.
        const totalMO = tareas.reduce((a, tt) => a + Number(tt.duracion) * Number(tt.valorHora) * (tt.operarioId?.length || 1), 0);
        const totalMatSum = componentes.reduce((a, c) => a + Number(c.cantidad) * Number(c.precio), 0) + logistica.reduce((a, l) => a + Number(l.cantidad) * Number(l.precio), 0);
        doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(0);
        doc.text('4. TOTALES', 14, y); y += 7;
        doc.text(`Mano de obra: $ ${totalMO.toLocaleString()}`, pageWidth - 15, y, { align: 'right' }); y += 6;
        doc.text(`Materiales y suministros: $ ${totalMatSum.toLocaleString()}`, pageWidth - 15, y, { align: 'right' }); y += 6;
        doc.setFont(undefined, 'bold');
        doc.text(`Neto: $ ${granTotal.toLocaleString()}`, pageWidth - 15, y, { align: 'right' }); y += 7;
        doc.setFontSize(13);
        doc.text(`Total con IVA: $ ${(granTotal * 1.19).toLocaleString()}`, pageWidth - 15, y, { align: 'right' }); y += 12;

        // 5. Condiciones comerciales.
        if (secciones.condiciones) {
            doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(44, 62, 80);
            doc.text('5. CONDICIONES COMERCIALES', 14, y); y += 6;
            doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(0);
            const filas = [
                ['Validez', condicionesComerciales.validez], ['Plazo de pago', condicionesComerciales.plazoPago],
                ['Forma de pago', condicionesComerciales.formaPago], ['Garantía', condicionesComerciales.garantia],
                ['Plazo de ejecución', condicionesComerciales.plazoEjecucion || '—'], ['No incluye', condicionesComerciales.noIncluye || '—'],
            ];
            filas.forEach(([label, valor]) => {
                doc.setFont(undefined, 'bold'); doc.text(`${label}:`, 14, y);
                doc.setFont(undefined, 'normal');
                const texto = doc.splitTextToSize(valor, pageWidth - 60);
                doc.text(texto, 55, y);
                y += Math.max(6, texto.length * 5);
            });
        }

        doc.save(`Cotizacion_OT_${datosRecibidos?._id || 'nueva'}.pdf`);
        return doc;
    };

    // Mejora v3 #5 — genera el PDF consolidado de la carpeta de OT con las secciones
    // marcadas y guarda solo el registro (fecha/autor/secciones) en la OT, no el archivo.
    // Contenido real por sección (no solo el resumen de una línea), pedido explícito tras
    // probar la primera versión: tareas completas con su metodología, materiales y
    // suministros con montos, personal asignado, y un cronograma con quién hace qué día.
    const generarCarpetaOT = async (seccionesElegidas, generadoPor, totalPags) => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const marca = seccionesElegidas.map(s => s.k);
        let numSeccion = 0;

        doc.setFontSize(9); doc.setTextColor(120);
        doc.text('CARPETA DE ORDEN DE TRABAJO', 14, 16);
        doc.setFontSize(18); doc.setTextColor(20); doc.setFont(undefined, 'bold');
        doc.text(otSeleccionada?.numeroOT || 'Sin número', 14, 26);
        doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
        doc.text(`${otSeleccionada?.solicitante || 'Cliente'} · ${antecedentes?.solicitud?.direccion || 'sin faena registrada'} · Supervisor ${antecedentes?.ot?.supervisor?.nombre || 'sin asignar'}`, 14, 33);
        doc.setDrawColor(20); doc.setLineWidth(0.6); doc.line(14, 37, pageWidth - 14, 37);
        let y = 47;

        const titulo = (texto) => {
            numSeccion += 1;
            if (y > 265) { doc.addPage(); y = 20; }
            doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(20);
            doc.text(`${String(numSeccion).padStart(2, '0')}. ${texto}`, 14, y);
            y += 7;
        };

        // 1. Informe de evaluación
        if (marca.includes('evaluacion')) {
            titulo('Informe de evaluación');
            const ie = otSeleccionada.informeEvaluacion || {};
            doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(70);
            const lineas = [
                `Fecha de visita: ${ie.fecha || '—'}`, `Responsable: ${ie.responsable || '—'}`,
                `Condiciones del sitio: ${ie.condicionesSitio || '—'}`, `Riesgos observados: ${ie.riesgos || '—'}`,
                `Metodología propuesta: ${ie.metodologia || '—'}`, `Fotos de respaldo: ${ie.fotos?.length || 0}`,
            ];
            lineas.forEach(l => { doc.text(doc.splitTextToSize(l, pageWidth - 28), 14, y); y += 6; });
            y += 6;
        }

        // 2. Tareas y metodología — tabla completa, no un conteo.
        if (marca.includes('tareas') && tareas.length > 0) {
            titulo('Tareas y metodología');
            autoTable(doc, {
                startY: y,
                head: [['Tarea', 'Puesto', 'Responsable', 'Fecha', 'Hrs', 'Metodología']],
                body: tareas.map(tt => [tt.descripcion || '—', tt.puesto || '—', (tt.operarioNombre || []).join(', ') || 'Sin asignar', tt.fecha || '—', String(tt.duracion || 0), tt.desarrollo || 'Sin desarrollo definido']),
                headStyles: { fillColor: [44, 62, 80] }, styles: { fontSize: 8, cellWidth: 'wrap' },
                columnStyles: { 0: { cellWidth: 34 }, 5: { cellWidth: 55 } },
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // 3. Recursos asignados — personal real (de las tareas), equipos/materiales y suministros.
        if (marca.includes('recursos')) {
            titulo('Recursos asignados');
            const personal = [...new Map(
                tareas.flatMap(tt => (tt.operarioNombre || []).map(nombre => [nombre, { nombre, puesto: tt.puesto || '—' }]))
            ).values()];
            if (personal.length > 0) {
                autoTable(doc, { startY: y, head: [['Personal', 'Puesto']], body: personal.map(p => [p.nombre, p.puesto]), headStyles: { fillColor: [52, 73, 94] }, styles: { fontSize: 8.5 } });
                y = doc.lastAutoTable.finalY + 8;
            }
            if (componentes.length > 0) {
                autoTable(doc, { startY: y, head: [['Equipos y materiales', 'Cant.', 'Monto']], body: componentes.map(c => [c.descripcion || '—', String(c.cantidad || 0), `$ ${(Number(c.cantidad) * Number(c.precio)).toLocaleString()}`]), headStyles: { fillColor: [52, 73, 94] }, styles: { fontSize: 8.5 } });
                y = doc.lastAutoTable.finalY + 8;
            }
            if (logistica.length > 0) {
                autoTable(doc, { startY: y, head: [['Suministros directos', 'Cant.', 'Monto']], body: logistica.map(l => [l.descripcion || '—', String(l.cantidad || 0), `$ ${(Number(l.cantidad) * Number(l.precio)).toLocaleString()}`]), headStyles: { fillColor: [127, 140, 141] }, styles: { fontSize: 8.5 } });
                y = doc.lastAutoTable.finalY + 8;
            }
            // Cronograma con personal: quién hace qué tarea, qué día — el detalle que faltaba
            // en la primera versión (antes solo decía "Personal, equipos y materiales").
            const conFecha = tareas.filter(tt => tt.fecha).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
            if (conFecha.length > 0) {
                doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(20);
                doc.text('Cronograma con personal', 14, y); y += 5;
                autoTable(doc, {
                    startY: y, head: [['Fecha', 'Hora', 'Tarea', 'Responsable', 'Hrs']],
                    body: conFecha.map(tt => [tt.fecha, tt.hora || '—', tt.descripcion || '—', (tt.operarioNombre || []).join(', ') || 'Sin asignar', String(tt.duracion || 0)]),
                    headStyles: { fillColor: [44, 62, 80] }, styles: { fontSize: 8 },
                });
                y = doc.lastAutoTable.finalY + 10;
            }
        }

        // 4. Cotización aprobada
        if (marca.includes('cotizacion')) {
            titulo('Cotización aprobada');
            doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(70);
            [`Estado: ${otSeleccionada.estado}`, `Mano de obra: $ ${totalManoObra.toLocaleString()}`, `Materiales: $ ${totalMateriales.toLocaleString()}`, `Suministros: $ ${totalLogisticaFinal.toLocaleString()}`, `Total con IVA: $ ${(granTotal * 1.19).toLocaleString()}`]
                .forEach(l => { doc.text(l, 14, y); y += 6; });
            y += 6;
        }

        // 5. Informes de ejecución
        if (marca.includes('ejecucion')) {
            titulo('Informes de ejecución');
            const reportes = otSeleccionada.reportes || [];
            if (reportes.length > 0) {
                autoTable(doc, {
                    startY: y, head: [['Fecha', 'Usuario', 'Comentario', 'Foto']],
                    body: reportes.map(r => [new Date(r.fecha).toLocaleDateString('es-CL'), r.usuario || '—', r.comentario || '—', r.foto ? 'Sí' : 'No']),
                    headStyles: { fillColor: [44, 62, 80] }, styles: { fontSize: 8.5 },
                });
                y = doc.lastAutoTable.finalY + 10;
            }
        }

        // 6. Órdenes de compra (solo referencia — el detalle vive en el módulo de compras).
        if (marca.includes('ocs')) {
            titulo('Órdenes de compra');
            doc.setFontSize(9); doc.setTextColor(70);
            doc.text(`${(otSeleccionada.ordenesCompra || []).length} OC asociadas a esta OT.`, 14, y);
            y += 10;
        }

        doc.setFontSize(8.5); doc.setTextColor(140);
        doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')} por ${generadoPor} · ${totalPags} páginas`, 14, 290);
        doc.save(`OT-${otSeleccionada?.numeroOT || 'nueva'}-carpeta.pdf`);

        try {
            await actualizarOtGlobal(otSeleccionada._id, {
                carpetaOT: { generadoEn: new Date().toISOString(), generadoPor, paginas: totalPags, secciones: seccionesElegidas.map(s => s.k) },
            });
        } catch (e) { console.warn('No se pudo registrar la carpeta en la OT:', e.message); }
    };

    // Pestaña Antecedentes: al agregar una tarea en una OT que ya tiene supervisor
    // asignado, se precarga su nombre como responsable por defecto (solo valor inicial,
    // el usuario puede cambiarlo). operarioId/operarioNombre son arreglos paralelos que
    // alimentan el conteo de personas y el costo (ver GRID_TAREAS más abajo), así que solo
    // se precargan juntos — si el supervisor (Usuario) no tiene un Recurso vinculado
    // (Recurso.usuarioId), no hay operarioId real que ponerle y se deja sin precargar en
    // vez de mostrar un nombre "fantasma" sin id detrás.
    const agregarTarea = () => {
        const supervisor = antecedentes?.ot?.supervisor;
        const recursoSupervisor = supervisor && (recursos || []).find(r => String(r.usuarioId) === String(supervisor.id));
        setTareas([...tareas, {
            id: Date.now(), descripcion: '', puesto: '', duracion: 0, fecha: '', hora: '', valorHora: 0,
            operarioId: recursoSupervisor ? [recursoSupervisor._id] : [],
            operarioNombre: recursoSupervisor ? [recursoSupervisor.nombre] : [],
        }]);
    };

    useEffect(() => {
        const cargarDetalleOT = async () => {
            if (!datosRecibidos?._id) return;
            try {
                const { data } = await axios.get(`${API}/ots/solicitud/${datosRecibidos._id}`);
                if (data) {
                    setOtSeleccionada(data);
                    setTareas(data.tareas || []);
                    setComponentes(data.componentes || []);
                    setExcepciones(data.excepciones || []);
                    if (data.pago) setPago(data.pago);
                    if (data.informeEvaluacion) setInformeEvaluacion({ ...informeEvaluacionVacio, ...data.informeEvaluacion });
                    if (data.logistica?.length > 0) setLogistica(data.logistica);
                    else setLogistica([{ id: Date.now(), descripcion: '', cantidad: 1, precio: 0 }]);
                }
            } catch (error) {
                console.error("Error de red:", error.message);
            }
            inicializado.current = true;
        };
        cargarDetalleOT();
    }, [datosRecibidos?._id, API]);

    // --- Pestaña Antecedentes: solicitud de origen (solo lectura) + asignación de la OT ---
    const [antecedentes, setAntecedentes] = useState(null);
    const [cargandoAntecedentes, setCargandoAntecedentes] = useState(true);
    const [formAsignacion, setFormAsignacion] = useState({
        supervisorId: '', fechaEjecucion: '', ordenCompra: '', prioridad: 'Normal', instruccionesTerreno: '',
    });
    const [avisoAsignacion, setAvisoAsignacion] = useState(null); // { tipo: 'ok'|'error', texto }
    const [guardandoAsignacion, setGuardandoAsignacion] = useState(false);

    const dmy = (iso) => iso ? new Date(iso).toISOString().slice(0, 10).split('-').reverse().join('-') : '';
    const ymd = (dmyStr) => {
        const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmyStr || '');
        return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
    };

    useEffect(() => {
        const id = otSeleccionada?._id || datosRecibidos?._id;
        if (!id || !API) return;
        setCargandoAntecedentes(true);
        axios.get(`${API}/ots/${id}/antecedentes`)
            .then(({ data }) => {
                setAntecedentes(data);
                setFormAsignacion({
                    supervisorId: data.ot.supervisorId || '',
                    fechaEjecucion: dmy(data.ot.fechaEjecucion),
                    ordenCompra: data.ot.ordenCompra || '',
                    prioridad: data.ot.prioridad || 'Normal',
                    instruccionesTerreno: data.ot.instruccionesTerreno || '',
                });
            })
            .catch(() => {})
            .finally(() => setCargandoAntecedentes(false));
    }, [otSeleccionada?._id, datosRecibidos?._id, API]);

    const campoAsignacion = (campo, valor) => {
        setFormAsignacion(prev => ({ ...prev, [campo]: valor }));
        setAvisoAsignacion(null);
    };

    const guardarAsignacion = async () => {
        const id = otSeleccionada?._id || datosRecibidos?._id;
        if (!id) return;
        setGuardandoAsignacion(true);
        setAvisoAsignacion(null);
        try {
            const { data } = await axios.patch(`${API}/ots/${id}/asignacion`, {
                supervisorId: formAsignacion.supervisorId || null,
                fechaEjecucion: formAsignacion.fechaEjecucion ? ymd(formAsignacion.fechaEjecucion) : null,
                ordenCompra: formAsignacion.ordenCompra,
                prioridad: formAsignacion.prioridad,
                instruccionesTerreno: formAsignacion.instruccionesTerreno,
            });
            setOtSeleccionada(prev => ({ ...prev, ...data }));
            setAvisoAsignacion({ tipo: 'ok', texto: data.supervisor ? `Asignada a ${data.supervisor.nombre}` : 'Guardado' });
            setAntecedentes(prev => prev ? { ...prev, ot: { ...prev.ot, ...data, supervisor: data.supervisor } } : prev);
        } catch (error) {
            setAvisoAsignacion({ tipo: 'error', texto: error.response?.data?.error || 'No se pudo guardar.' });
        } finally {
            setGuardandoAsignacion(false);
        }
    };

    useEffect(() => {
        if (tabActiva !== 'reportes') return;
        const id = otSeleccionada?._id || datosRecibidos?._id;
        if (!id || !API) return;
        axios.get(`${API}/ots/${id}`).then(({ data }) => setOtSeleccionada(data)).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabActiva]);

    const disponibilidadEquipo = (codigo) => {
        const item = (componentesDB || []).find(db => db.codigo && codigo && db.codigo === codigo);
        return item ? item.estado : null;
    };
    const disponibilidadSuministro = (codigo) => {
        const item = (suministrosDB || []).find(db => db.codigo && codigo && db.codigo === codigo);
        if (!item) return null;
        return (item.stockActual || 0) - (item.stockReservado || 0);
    };
    const agregarLogistica = () => setLogistica([...logistica, { _id: Date.now().toString(), descripcion: '', cantidad: 1, precio: 0 }]);
    const actualizarLogistica = (index, campo, valor) => {
        setLogistica(prev => {
            const nueva = [...prev];
            const valorFinal = (campo === 'cantidad' || campo === 'precio') ? parseFloat(valor || 0) : valor;
            nueva[index] = { ...nueva[index], [campo]: valorFinal };
            return nueva;
        });
    };

    const totalMat = componentes.reduce((sum, c) => sum + (Number(c.cantidad || 0) * Number(c.precio || 0)), 0);
    const totalMateriales = totalMat;
    const totalManoObra = tareas.reduce((sum, tt) => sum + (Number(tt.duracion) * Number(tt.valorHora) || 0), 0);
    const totalLogisticaFinal = logistica.reduce((sum, l) => sum + (Number(l.cantidad) * Number(l.precio) || 0), 0);
    const granTotal = totalMateriales + totalManoObra + totalLogisticaFinal;

    const diasPlanificados = (() => {
        const tareasConFecha = tareas.filter(tt => tt.fecha);
        if (tareasConFecha.length === 0) return [];
        const fechasEnMs = tareasConFecha.map(tt => new Date(tt.fecha).getTime());
        const inicioMs = Math.min(...fechasEnMs), finMs = Math.max(...fechasEnMs);
        const lista = [];
        let fechaActual = new Date(inicioMs);
        const fechaFin = new Date(finMs);
        while (fechaActual <= fechaFin) {
            lista.push(fechaActual.toISOString().split('T')[0]);
            fechaActual.setDate(fechaActual.getDate() + 1);
        }
        return lista;
    })();
    const formatearFechaGantt = (fechaStr) => {
        if (!fechaStr) return '';
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const [, mm, dd] = fechaStr.split('-');
        return `${dd} ${meses[parseInt(mm) - 1]}`;
    };

    const eliminarTarea = (index) => setTareas(prev => prev.filter((_, i) => i !== index));
    const [tareaExpandida, setTareaExpandida] = useState(null);
    const eliminarComponente = (index) => setComponentes(prev => prev.filter((_, i) => i !== index));
    const eliminarLogistica = (index) => {
        const nuevaLog = logistica.filter((_, i) => i !== index);
        setLogistica(nuevaLog);
        if (otSeleccionada) setOtSeleccionada({ ...otSeleccionada, logistica: nuevaLog });
    };

    const aplicarPlantilla = async (plantilla) => {
        const debeAplicar = tareas.length > 0 || componentes.length > 0
            ? await confirmar(`¿Aplicar la hoja de ruta "${plantilla.nombre}"? Se agregarán sus tareas y materiales a los existentes.`, { danger: false })
            : true;
        if (!debeAplicar) return;
        const tareasNuevas = (plantilla.tareas || []).map(tt => ({ descripcion: tt.descripcion || '', puesto: tt.puesto || '', duracion: tt.duracion || 0, fecha: '', hora: '', operarioId: [], operarioNombre: [] }));
        setTareas(prev => [...prev, ...tareasNuevas]);
        setComponentes(prev => [...prev, ...(plantilla.componentes || [])]);
        setLogistica(prev => [...prev, ...(plantilla.logistica || [])]);
        setModalPlantilla(false);
        setPlantillaPreview(null);
        notificar.exito(`Hoja de ruta "${plantilla.nombre}" aplicada. Ahora asigna fechas, horarios y responsables a las tareas.`);
    };

    const aplicarInformeAOT = () => {
        const { tareas: tInforme = [], componentes: cInforme = [], logistica: lInforme = [] } = informeEvaluacion;
        if (!tInforme.length && !cInforme.length && !lInforme.length) {
            notificar.advertencia('El informe no tiene tareas, equipos ni suministros cargados para aplicar.');
            return;
        }
        const tareasNuevas = tInforme.map(tt => ({ descripcion: tt.descripcion || '', puesto: tt.puesto || '', duracion: tt.duracion || 0, fecha: '', hora: '', operarioId: [], operarioNombre: [] }));
        setTareas(prev => [...prev, ...tareasNuevas]);
        setComponentes(prev => [...prev, ...cInforme]);
        setLogistica(prev => [...prev, ...lInforme]);
        notificar.exito('Informe aplicado a la OT. Ahora asigna fechas, horarios y responsables en la pestaña Tareas.');
        setTabActiva('tareas');
    };

    const irATab = (tab) => {
        if (['tareas', 'componentes', 'Logistica', 'cotizacion'].includes(tab) && !informeEvaluacion.completo && !yaTeniaContenidoPrevio) {
            notificar.advertencia('Completa y marca como terminado el Informe Inicial antes de continuar.');
            setTabActiva('informe');
            return;
        }
        setTabActiva(tab);
    };

    const [reporteEditIdx, setReporteEditIdx] = useState(null);
    const [reporteEditData, setReporteEditData] = useState({ comentario: '', foto: '' });
    const abrirEdicionReporte = (idx) => {
        const rep = otSeleccionada.reportes[idx];
        setReporteEditData({ comentario: rep.comentario || '', foto: rep.foto || '' });
        setReporteEditIdx(idx);
    };
    const guardarEdicionReporte = async () => {
        const id = otSeleccionada._id;
        const reportesActualizados = otSeleccionada.reportes.map((r, i) => i === reporteEditIdx ? { ...r, comentario: reporteEditData.comentario, foto: reporteEditData.foto } : r);
        try {
            await axios.put(`${API}/ots/${id}`, { reportes: reportesActualizados });
            setOtSeleccionada(prev => ({ ...prev, reportes: reportesActualizados }));
            setReporteEditIdx(null);
            if (cargarDatos) cargarDatos();
        } catch (e) { notificar.error('Error al guardar: ' + e.message); }
    };
    const anularReporte = async (idx) => {
        if (!(await confirmar('¿Anular este reporte?'))) return;
        const id = otSeleccionada._id;
        const reportesActualizados = otSeleccionada.reportes.map((r, i) => i === idx ? { ...r, anulado: true } : r);
        const todosAnulados = reportesActualizados.every(r => r.anulado);
        const nuevoEstado = todosAnulados ? 'Trabajo Terminado' : otSeleccionada.estado;
        try {
            await axios.put(`${API}/ots/${id}`, { reportes: reportesActualizados, estado: nuevoEstado });
            setOtSeleccionada(prev => ({ ...prev, reportes: reportesActualizados, estado: nuevoEstado }));
            if (cargarDatos) cargarDatos();
        } catch (e) { notificar.error('Error al anular: ' + e.message); }
    };
    const restaurarReporte = async (idx) => {
        const id = otSeleccionada._id;
        const reportesActualizados = otSeleccionada.reportes.map((r, i) => i === idx ? { ...r, anulado: false } : r);
        const nuevoEstado = otSeleccionada.estado === 'Trabajo Terminado' ? 'Con Informe' : otSeleccionada.estado;
        try {
            await axios.put(`${API}/ots/${id}`, { reportes: reportesActualizados, estado: nuevoEstado });
            setOtSeleccionada(prev => ({ ...prev, reportes: reportesActualizados, estado: nuevoEstado }));
            if (cargarDatos) cargarDatos();
        } catch (e) { notificar.error('Error al restaurar: ' + e.message); }
    };

    const guardarPago = async () => {
        try {
            const id = otSeleccionada?._id || datosRecibidos?._id;
            if (!id) return notificar.advertencia('Sin OT seleccionada');
            const estadoActual = otSeleccionada?.estado || datosRecibidos?.estado || 'Con Informe';
            const nuevoEstadoOT = pago.estado === 'Pagado' ? 'Pagada' : estadoActual;
            const pagoAGuardar = { ...pago, anulado: false, fechaAnulacion: '', motivoAnulacion: '' };
            const { data } = await axios.put(`${API}/ots/${id}`, { pago: pagoAGuardar, estado: nuevoEstadoOT });
            setOtSeleccionada(prev => ({ ...prev, pago: pagoAGuardar, estado: nuevoEstadoOT }));
            setPago(data.pago || pagoAGuardar);
            if (cargarDatos) cargarDatos();
            notificar.exito('Información de pago guardada');
        } catch (e) { notificar.error('Error al guardar pago: ' + e.message); }
    };
    const anularPago = async () => {
        const motivo = window.prompt('Motivo de anulación (opcional):') ?? '';
        if (motivo === null) return;
        try {
            const id = otSeleccionada?._id || datosRecibidos?._id;
            if (!id) return;
            const pagoAnulado = { ...pago, anulado: true, fechaAnulacion: new Date().toISOString().slice(0, 10), motivoAnulacion: motivo };
            const nuevoEstadoOT = otSeleccionada.estado === 'Pagada' ? 'Con Informe' : otSeleccionada.estado;
            await axios.put(`${API}/ots/${id}`, { pago: pagoAnulado, estado: nuevoEstadoOT });
            setOtSeleccionada(prev => ({ ...prev, pago: pagoAnulado, estado: nuevoEstadoOT }));
            setPago(pagoAnulado);
            if (cargarDatos) cargarDatos();
        } catch (e) { notificar.error('Error al anular pago: ' + e.message); }
    };
    const restaurarPago = async () => {
        if (!(await confirmar('¿Restaurar el pago y volver al estado "Pagada"?', { danger: false }))) return;
        try {
            const id = otSeleccionada?._id || datosRecibidos?._id;
            if (!id) return;
            const pagoRestaurado = { ...pago, anulado: false, fechaAnulacion: '', motivoAnulacion: '' };
            const nuevoEstadoOT = pagoRestaurado.estado === 'Pagado' ? 'Pagada' : otSeleccionada.estado;
            await axios.put(`${API}/ots/${id}`, { pago: pagoRestaurado, estado: nuevoEstadoOT });
            setOtSeleccionada(prev => ({ ...prev, pago: pagoRestaurado, estado: nuevoEstadoOT }));
            setPago(pagoRestaurado);
            if (cargarDatos) cargarDatos();
        } catch (e) { notificar.error('Error al restaurar pago: ' + e.message); }
    };
    const recargarOT = async () => {
        try {
            const id = otSeleccionada?._id || datosRecibidos?._id;
            if (!id) return;
            const { data } = await axios.get(`${API}/ots/${id}`);
            setOtSeleccionada(data);
            if (data.informeEvaluacion) setInformeEvaluacion({ ...informeEvaluacionVacio, ...data.informeEvaluacion });
            if (cargarDatos) await cargarDatos();
        } catch (e) { notificar.error('Error al actualizar: ' + e.message); }
    };

    // Revisión del Planificador sobre el informe del Supervisor: informativa, no bloquea
    // tareas/equipos/suministros (siguen editables aunque quede "Con observaciones") — solo
    // bloquea el botón "Terminar planificación" (ver puedeTerminarPlanificacion). No hay
    // sistema de login para el staff interno (ver CLAUDE.md, mismo gap que asignadaPor en
    // OT.js), así que 'autor' queda sin poblar en vez de inventar un nombre.
    const guardarRevisionInforme = async () => {
        const estado = informeEvaluacion.revision?.estado;
        if (estado !== 'Aceptado' && estado !== 'ConObservaciones') return;
        const resultado = await actualizarOtGlobal(otSeleccionada._id, {
            'informeEvaluacion.revision.estado': estado,
            'informeEvaluacion.revision.comentario': informeEvaluacion.revision?.comentario || '',
            'informeEvaluacion.revision.fecha': new Date().toISOString(),
        });
        if (!resultado?.exito) notificar.error(resultado?.error || 'No se pudo guardar la revisión del informe.');
    };

    if (!datosRecibidos) return <div style={{ padding: '50px', fontFamily: t.fontUi }}>No hay datos.</div>;

    const info = etapaInfo(otSeleccionada);
    const puedeEjecucion = ['Programada', 'En Ejecución', 'Trabajo Terminado', 'Con Informe', 'Pagada'].includes(otSeleccionada.estado);
    const habilitadoTabs14 = informeEvaluacion.completo || yaTeniaContenidoPrevio;
    // Campos que hacen a una tarea "cotizable": descripción, puesto, al menos un responsable,
    // horas, fecha, hora de inicio y $/hora — todo lo que la fila de Tareas deja editar, salvo
    // "desarrollo" (ese queda como advertencia suave aparte, con su propio punto rojo en la
    // fila — decisión ya tomada, no se vuelve obligatorio acá).
    const tareaCompleta = (tt) => !!(
        (tt.descripcion || '').trim() && (tt.puesto || '').trim() && (tt.operarioId || []).length > 0
        && Number(tt.duracion) > 0 && (tt.fecha || '').trim() && (tt.hora || '').trim() && Number(tt.valorHora) > 0
    );
    // Todas, no solo alguna: una tarea a medio llenar da un total y una fecha de Gantt
    // equivocados, aunque otra tarea de la misma OT sí esté completa.
    const todasTareasCompletas = tareas.length > 0 && tareas.every(tareaCompleta);
    // Equipos y herramientas con costo $0 cotizarían gratis un ítem que sí tiene costo real —
    // acotado a esos dos tipos (no a 'Material') porque el pedido fue puntual sobre equipos/
    // herramientas; no hay ningún componentes.length>0 exigido, una OT puede no necesitar ninguno.
    const equiposHerramientasConCosto = componentes.every(c => (c.tipo !== 'Equipo' && c.tipo !== 'Herramienta') || Number(c.precio) > 0);
    // "Terminar planificación" (no las pestañas 1-3, que quedan libres para ir armando) es lo
    // que bloquea una observación abierta sobre el informe inicial, las tareas incompletas y
    // los equipos/herramientas sin costo.
    const puedeTerminarPlanificacion = informeEvaluacion.revision?.estado !== 'ConObservaciones' && todasTareasCompletas && equiposHerramientasConCosto;
    // Que las tareas ESTÉN completas no basta para entrar a Cotización: hace falta además que
    // se haya presionado "Terminar planificación" (guardarPlanificacion('Planificada')) — sin
    // esto, se podía completar todo en memoria y saltar directo a la pestaña 4 sin haber
    // confirmado el paso, dejando la OT igual en 'Tratada'.
    const planificacionTerminada = !['Pendiente', 'Tratada'].includes(otSeleccionada?.estado);

    return (
        <div style={styles.raiz}>
            <style>{`
                .campo-ed { border:1px solid transparent; background:transparent; }
                .campo-ed:hover { border-color: rgba(0,0,0,.14); }
                .campo-ed:focus { border-color: ${t.acento}; background:#fff; outline:none; }
            `}</style>

            <header style={styles.header}>
                <h1 style={styles.h1}>{otSeleccionada?.numeroOT || 'Nueva planificación'}</h1>
                <span style={styles.empresa}>{otSeleccionada.solicitante || otSeleccionada.cliente || ''}</span>
                <span style={styles.subtitulo}>Ref. {datosRecibidos?.numeroOT || datosRecibidos?._id?.slice(-8)}</span>
                <button onClick={() => navigate('/dashboard')} style={styles.btnVolver}>Volver al panel</button>
            </header>

            <div style={styles.pipeline}>
                {ETAPAS_VISUAL.map((label, i) => {
                    const marca = info.rechazada && i === info.idx ? '×' : i < info.idx ? '×' : i === info.idx ? '▪' : '·';
                    const tono = i < info.idx ? t.textoAtenuado1 : i === info.idx ? (info.rechazada ? t.rojo : t.textoPrincipal) : '#b5b3ab';
                    return (
                        <span key={label} style={styles.pipelineItem}>
                            <span style={{ fontFamily: t.fontMono, fontSize: '10px', color: tono }}>{marca}</span>
                            <span style={{ fontSize: '11px', color: tono, fontWeight: i === info.idx ? 700 : 400 }}>{label}</span>
                        </span>
                    );
                })}
            </div>

            <div style={styles.tabsFila}>
                <div style={styles.tabs}>
                    <button onClick={() => setTabActiva('antecedentes')} style={tabActiva === 'antecedentes' ? styles.tabActivo : styles.tab}>
                        Antecedentes
                    </button>
                    <button onClick={() => setTabActiva('informe')} style={tabActiva === 'informe' ? styles.tabActivo : styles.tab}>
                        0 · Informe Inicial{!informeEvaluacion.completo && !yaTeniaContenidoPrevio ? ' *' : ''}
                    </button>
                    <button onClick={() => irATab('tareas')} disabled={!habilitadoTabs14} title={habilitadoTabs14 ? '' : 'Completa el Informe Inicial primero'} style={{ ...(tabActiva === 'tareas' ? styles.tabActivo : styles.tab), opacity: habilitadoTabs14 ? 1 : .5 }}>1 · Tareas</button>
                    <button onClick={() => irATab('componentes')} disabled={!habilitadoTabs14} title={habilitadoTabs14 ? '' : 'Completa el Informe Inicial primero'} style={{ ...(tabActiva === 'componentes' ? styles.tabActivo : styles.tab), opacity: habilitadoTabs14 ? 1 : .5 }}>2 · Equipos y materiales</button>
                    <button onClick={() => irATab('Logistica')} disabled={!habilitadoTabs14} title={habilitadoTabs14 ? '' : 'Completa el Informe Inicial primero'} style={{ ...(tabActiva === 'Logistica' ? styles.tabActivo : styles.tab), opacity: habilitadoTabs14 ? 1 : .5 }}>3 · Suministros directos</button>
                    <button
                        onClick={() => irATab('cotizacion')}
                        disabled={!habilitadoTabs14 || !todasTareasCompletas || !equiposHerramientasConCosto || !planificacionTerminada}
                        title={
                            !habilitadoTabs14 ? 'Completa el Informe Inicial primero'
                                : !todasTareasCompletas ? 'Completa descripción, puesto, responsable, horas, fecha, hora y $/hora de todas las tareas'
                                    : !equiposHerramientasConCosto ? 'Todo equipo o herramienta debe tener un costo mayor a $0'
                                        : !planificacionTerminada ? 'Presiona "Terminar planificación" primero'
                                            : ''
                        }
                        style={{ ...(tabActiva === 'cotizacion' ? styles.tabActivo : styles.tab), opacity: (habilitadoTabs14 && todasTareasCompletas && equiposHerramientasConCosto && planificacionTerminada) ? 1 : .5 }}
                    >4 · Cotización</button>
                    <button onClick={() => puedeEjecucion && setTabActiva('reportes')} disabled={!puedeEjecucion} title={puedeEjecucion ? '' : 'Disponible una vez que la OT esté Programada'} style={{ ...(tabActiva === 'reportes' ? styles.tabActivo : styles.tab), opacity: puedeEjecucion ? 1 : .5 }}>
                        Ejecución {otSeleccionada.reportes?.length ? `(${otSeleccionada.reportes.length})` : ''}
                    </button>
                    {excepciones.length > 0 && (
                        <button onClick={() => setTabActiva('excepciones')} style={tabActiva === 'excepciones' ? styles.tabActivo : styles.tab}>
                            Excepciones{excepcionesBorrador.length ? ` (${excepcionesBorrador.length})` : ''}
                        </button>
                    )}
                    <button onClick={() => setTabActiva('pago')} style={tabActiva === 'pago' ? styles.tabActivo : styles.tab}>Pago</button>
                    <button onClick={() => setTabActiva('documentos')} style={tabActiva === 'documentos' ? styles.tabActivo : styles.tab}>Documentos de terreno</button>
                </div>
                <button onClick={() => setModalPlantilla(true)} style={styles.btnSecundario}>Cargar hoja de ruta</button>
            </div>

            <div style={styles.cuerpo}>
                <section style={styles.contenido}>

                    {/* ANTECEDENTES */}
                    {tabActiva === 'antecedentes' && (
                        <TabAntecedentes
                            cargando={cargandoAntecedentes}
                            antecedentes={antecedentes}
                            form={formAsignacion}
                            onCampo={campoAsignacion}
                            onGuardar={guardarAsignacion}
                            guardando={guardandoAsignacion}
                            aviso={avisoAsignacion}
                            soloLectura={otSeleccionada?.estado === 'Pagada'}
                        />
                    )}

                    {/* 0 · INFORME INICIAL */}
                    {tabActiva === 'informe' && (
                        <div style={{ padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <div style={styles.tituloSub}>Informe inicial</div>
                                <button onClick={recargarOT} title="Actualizar estado desde el servidor" style={styles.btnSecundario}>Actualizar</button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 10, marginBottom: 16 }}>
                                <div style={styles.campoLabel}>
                                    <span style={styles.etiqueta}>Estado</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: informeEvaluacion.completo ? t.verde : t.ambar }}>
                                        {informeEvaluacion.completo ? `Completo${informeEvaluacion.fecha ? ` · ${informeEvaluacion.fecha}` : ''}` : 'Pendiente — a la espera de la visita del supervisor'}
                                    </span>
                                </div>
                                <div style={styles.campoLabel}>
                                    <span style={styles.etiqueta}>Hallazgos registrados</span>
                                    <span style={{ fontSize: 13 }}>
                                        {(informeEvaluacion.hallazgos || []).length}
                                        {(informeEvaluacion.hallazgos || []).some(h => h.casoNoCubierto)
                                            ? ` · ${(informeEvaluacion.hallazgos || []).filter(h => h.casoNoCubierto).length} para revisar`
                                            : ''}
                                    </span>
                                </div>
                            </div>

                            <div style={{ ...styles.campoLabel, marginBottom: 16 }}>
                                <span style={styles.etiqueta}>Revisión del Planificador</span>
                                {!informeEvaluacion.completo ? (
                                    <span style={{ fontSize: 11.5, color: t.textoAtenuado3 }}>Disponible cuando el supervisor entregue el informe.</span>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                            <button
                                                onClick={() => setInformeEvaluacion(prev => ({ ...prev, revision: { ...prev.revision, estado: 'Aceptado' } }))}
                                                style={informeEvaluacion.revision?.estado === 'Aceptado' ? styles.btnAccion : styles.btnSecundario}
                                            >Aceptado</button>
                                            <button
                                                onClick={() => setInformeEvaluacion(prev => ({ ...prev, revision: { ...prev.revision, estado: 'ConObservaciones' } }))}
                                                style={informeEvaluacion.revision?.estado === 'ConObservaciones' ? { ...styles.btnAccion, background: t.rojo, borderColor: t.rojo } : styles.btnSecundario}
                                            >Con observaciones</button>
                                        </div>
                                        {informeEvaluacion.revision?.estado === 'ConObservaciones' && (
                                            <textarea
                                                value={informeEvaluacion.revision?.comentario || ''}
                                                onChange={e => setInformeEvaluacion(prev => ({ ...prev, revision: { ...prev.revision, comentario: e.target.value } }))}
                                                placeholder="Qué le falta o hay que corregir…"
                                                style={{ ...styles.inputPlano, width: '100%', minHeight: 60, marginTop: 8, resize: 'vertical' }}
                                            />
                                        )}
                                        <button onClick={guardarRevisionInforme} style={{ ...styles.btnAccion, marginTop: 8 }}>Guardar revisión</button>
                                        {informeEvaluacion.revision?.fecha && (
                                            <div style={{ fontSize: 10.5, color: t.textoAtenuado3, marginTop: 6 }}>
                                                Última revisión: {new Date(informeEvaluacion.revision.fecha).toLocaleDateString('es-CL')}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div style={{ ...styles.campoLabel, marginBottom: 16 }}>
                                <span style={styles.etiqueta}>Supervisor asignado</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <select style={styles.inputPlano} value={formAsignacion.supervisorId} onChange={e => campoAsignacion('supervisorId', e.target.value)} disabled={cargandoAntecedentes}>
                                        <option value="">Sin asignar</option>
                                        {(antecedentes?.candidatos || []).map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.puesto}</option>)}
                                    </select>
                                    <button onClick={guardarAsignacion} disabled={guardandoAsignacion} style={styles.btnAccion}>
                                        {guardandoAsignacion ? 'Guardando…' : (antecedentes?.ot?.supervisor ? 'Cambiar' : 'Asignar')}
                                    </button>
                                    {avisoAsignacion && <span style={{ fontSize: 11, color: avisoAsignacion.tipo === 'ok' ? t.verde : t.rojo }}>{avisoAsignacion.texto}</span>}
                                </div>
                            </div>

                            <p style={{ fontSize: 11, color: t.textoAtenuado3, marginBottom: 16 }}>
                                El detalle del informe (condiciones del sitio, riesgos, hallazgos y fotos) se completa desde la aplicación del supervisor en terreno.
                            </p>

                            {informeEvaluacion.completo && (
                                <>
                                    {informeEvaluacion.tareas.length > 0 && (
                                        <>
                                            <div style={styles.tituloSub}>Tareas identificadas</div>
                                            <ul style={{ margin: '4px 0 14px', paddingLeft: 18, fontSize: 12 }}>
                                                {informeEvaluacion.tareas.map((it, idx) => (
                                                    <li key={idx}>{it.descripcion}{it.puesto ? ` · ${it.puesto}` : ''}{it.duracion ? ` · ${it.duracion} h` : ''}</li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                    {informeEvaluacion.componentes.length > 0 && (
                                        <>
                                            <div style={styles.tituloSub}>Equipos y materiales identificados</div>
                                            <ul style={{ margin: '4px 0 14px', paddingLeft: 18, fontSize: 12 }}>
                                                {informeEvaluacion.componentes.map((c, idx) => (
                                                    <li key={idx}>{c.descripcion}{c.codigo ? ` (${c.codigo})` : ''} · {c.cantidad}</li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                    {informeEvaluacion.logistica.length > 0 && (
                                        <>
                                            <div style={styles.tituloSub}>Logística identificada</div>
                                            <ul style={{ margin: '4px 0 14px', paddingLeft: 18, fontSize: 12 }}>
                                                {informeEvaluacion.logistica.map((l, idx) => (
                                                    <li key={idx}>{l.descripcion} · {l.cantidad} {l.unidad}</li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                        <button onClick={aplicarInformeAOT} style={styles.btnPrimario}>Aplicar a la OT →</button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* 1 · TAREAS */}
                    {tabActiva === 'tareas' && (
                        <div style={{ padding: '0 0 16px' }}>
                            {/* En pantallas angostas GRID_TAREAS (min ~1100px) no cabe: sin minWidth el
                                div display:grid no crece más allá del ancho disponible aunque sus columnas
                                lo exijan (el excedente queda como "ink overflow", scrolleable vía .contenido
                                pero sin fondo pintado detrás) — ver docs/bugs-conocidos.md B3 y
                                GRID_TAREAS_MIN_W más arriba. El scroll horizontal lo sigue manejando
                                .contenido (mismo panel que el vertical), no un contenedor propio. */}
                            <div style={{ ...styles.tablaHeader(GRID_TAREAS), minWidth: GRID_TAREAS_MIN_W }}>
                                <span>Descripción</span><span>Desarrollo / metodología</span><span>Puesto</span><span>Responsable</span>
                                <span style={{ textAlign: 'right' }}>Hrs</span><span style={{ textAlign: 'right' }}>Fecha</span>
                                <span style={{ textAlign: 'right' }}>Hora</span><span style={{ textAlign: 'right' }}>$/hora</span>
                                <span style={{ textAlign: 'right' }}>Subtotal</span><span />
                            </div>
                            {tareas.map((tt, idx) => {
                                const horas = Number(tt.duracion) || 0;
                                const precioHora = Number(tt.valorHora) || 0;
                                const personas = Array.isArray(tt.operarioId) ? tt.operarioId.length : 0;
                                const sub = horas * precioHora * (personas > 0 ? personas : 1);
                                const idKey = tt._id || tt.id || `tarea-${idx}`;
                                const tieneDesarrollo = !!(tt.desarrollo || '').trim();
                                return (
                                    <div key={idKey}>
                                    <div style={{ ...styles.tablaFila(GRID_TAREAS), minWidth: GRID_TAREAS_MIN_W }}>
                                        <input className="campo-ed" style={styles.inputCelda} value={tt.descripcion} onChange={e => actualizarTarea(idx, 'descripcion', e.target.value)} />
                                        <input
                                            className="campo-ed" style={styles.inputCelda}
                                            value={primeraLinea(tt.desarrollo)}
                                            placeholder="Sin desarrollo"
                                            onFocus={() => setTareaExpandida(idKey)}
                                            onChange={e => actualizarTarea(idx, 'desarrollo', conPrimeraLineaReemplazada(tt.desarrollo, e.target.value))}
                                        />
                                        <select className="campo-ed" style={styles.inputCelda} value={tt.puesto} onChange={(e) => {
                                            const nombreSeleccionado = e.target.value;
                                            const puestoEncontrado = puestosDB.find(p => p.nombre === nombreSeleccionado);
                                            setTareas(prev => prev.map((tarea, i) => i === idx ? { ...tarea, puesto: nombreSeleccionado, ...(puestoEncontrado ? { valorHora: puestoEncontrado.costoHora } : {}) } : tarea));
                                        }}>
                                            <option value="">—</option>
                                            {puestosDB.map(p => <option key={p._id} value={p.nombre}>{p.nombre}</option>)}
                                        </select>
                                        <div
                                            style={styles.celdaResponsable}
                                            tabIndex="0"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Backspace' && (tt.operarioId || []).length > 0) {
                                                    const nuevosIds = tt.operarioId.slice(0, -1);
                                                    const nuevosNombres = (tt.operarioNombre || []).slice(0, -1);
                                                    setTareas(prev => prev.map((tarea, i) => i === idx ? { ...tarea, operarioId: nuevosIds, operarioNombre: nuevosNombres } : tarea));
                                                }
                                            }}
                                        >
                                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {Array.isArray(tt.operarioNombre) && tt.operarioNombre.length > 0 ? tt.operarioNombre.join(', ') : <span style={{ color: t.textoDeshabilitado }}>Sin asignar</span>}
                                            </span>
                                            <select
                                                style={styles.selectInvisible}
                                                value=""
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (!val) return;
                                                    const recurso = recursos.find(r => String(r._id) === String(val));
                                                    if (!recurso) return;
                                                    const idsActuales = (tt.operarioId || []).filter(Boolean);
                                                    const nombresActuales = (tt.operarioNombre || []).filter(n => n && n !== 'Sin asignar');
                                                    if (idsActuales.includes(val)) return;
                                                    setTareas(prev => prev.map((tarea, i) => i === idx ? { ...tarea, operarioId: [...idsActuales, val], operarioNombre: [...nombresActuales, recurso.nombre] } : tarea));
                                                }}
                                            >
                                                <option value="">+</option>
                                                {recursos.map(r => <option key={r._id} value={r._id}>{r.nombre}</option>)}
                                            </select>
                                        </div>
                                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={tt.duracion} onChange={e => actualizarTarea(idx, 'duracion', e.target.value)} />
                                        <input type="date" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={tt.fecha} onChange={e => actualizarTarea(idx, 'fecha', e.target.value)} />
                                        <input type="time" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={tt.hora} onChange={e => actualizarTarea(idx, 'hora', e.target.value)} />
                                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={tt.valorHora || ''} onChange={e => actualizarTarea(idx, 'valorHora', e.target.value)} />
                                        <span style={styles.celdaSubtotal}>{CLP(sub)}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                                            {!tieneDesarrollo && <span title="Sin desarrollo definido" style={{ width: 6, height: 6, borderRadius: '50%', background: t.rojo, flex: 'none' }} />}
                                            <span onClick={() => eliminarTarea(idx)} style={styles.xFila}>×</span>
                                        </span>
                                    </div>
                                    {tareaExpandida === idKey && (
                                        <div style={{ background: '#f7f6f2', padding: '10px 16px 14px', borderBottom: `1px solid ${t.hairlineFila}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: t.textoSecundario1 }}>
                                                    Desarrollo extendido · {tt.descripcion || 'Tarea sin nombre'}
                                                </span>
                                                <span onClick={() => setTareaExpandida(null)} style={{ fontSize: 11, color: t.acento, cursor: 'pointer' }}>Contraer</span>
                                            </div>
                                            <textarea
                                                className="campo-ed"
                                                style={{ width: '100%', minHeight: 90, boxSizing: 'border-box', padding: 8, fontFamily: 'inherit', fontSize: 12, color: t.textoPrincipal, borderRadius: 2, resize: 'vertical' }}
                                                value={tt.desarrollo || ''}
                                                onChange={e => actualizarTarea(idx, 'desarrollo', e.target.value)}
                                                autoFocus
                                            />
                                        </div>
                                    )}
                                    </div>
                                );
                            })}
                            <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <button onClick={agregarTarea} style={styles.btnAgregar}>Agregar tarea</button>
                                {tareas.length > 0 && (
                                    <span style={{ fontSize: 11, color: t.textoAtenuado2 }}>
                                        {tareas.filter(tt => (tt.desarrollo || '').trim()).length} de {tareas.length} tareas con desarrollo definido
                                    </span>
                                )}
                            </div>
                            <div style={styles.continuarWrap}><button onClick={() => setTabActiva('componentes')} style={styles.btnSecundario}>Continuar: Equipos y materiales →</button></div>
                        </div>
                    )}

                    {/* 2 · EQUIPOS Y MATERIALES */}
                    {tabActiva === 'componentes' && (
                        <div style={{ padding: '0 0 16px' }}>
                            <div style={{ ...styles.tablaHeader(GRID_MATERIALES), minWidth: GRID_MATERIALES_MIN_W }}>
                                <span>Tipo</span><span>Código</span><span>Descripción</span>
                                <span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>Unitario</span>
                                <span style={{ textAlign: 'right' }}>Subtotal</span><span>Disponibilidad</span><span />
                            </div>
                            {componentes.map((c, idx) => {
                                const estado = disponibilidadEquipo(c.codigo);
                                const ok = estado === 'Disponible';
                                return (
                                    <div key={c.id || idx} style={{ ...styles.tablaFila(GRID_MATERIALES), minWidth: GRID_MATERIALES_MIN_W }}>
                                        <input className="campo-ed" style={styles.inputCelda} placeholder="Tipo" value={c.tipo || ''} onChange={e => actualizarComponente(idx, 'tipo', e.target.value)} />
                                        <input className="campo-ed" style={styles.inputCelda} value={c.codigo || ''} onChange={e => actualizarComponente(idx, 'codigo', e.target.value)} />
                                        <input
                                            list="lista-componentes-recursos" className="campo-ed" style={styles.inputCelda}
                                            placeholder="Escribe para buscar…" value={c.descripcion || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                actualizarComponente(idx, 'descripcion', val);
                                                if (val.length < 2) return;
                                                const match = (componentesDB || []).find(db => {
                                                    const nombreLimpio = db.nombre ? db.nombre.trim() : '';
                                                    const formatoCompleto = db.tipo ? `${nombreLimpio} (${db.tipo})` : nombreLimpio;
                                                    return val === nombreLimpio || val === formatoCompleto;
                                                });
                                                if (match) setTimeout(() => {
                                                    actualizarComponente(idx, 'descripcion', match.nombre);
                                                    actualizarComponente(idx, 'tipo', match.tipo || 'Equipo');
                                                    actualizarComponente(idx, 'codigo', match.codigo || 'REF');
                                                    actualizarComponente(idx, 'precio', match.precio || 0);
                                                }, 50);
                                            }}
                                        />
                                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={c.cantidad} onChange={e => actualizarComponente(idx, 'cantidad', e.target.value)} />
                                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={c.precio} onChange={e => actualizarComponente(idx, 'precio', e.target.value)} />
                                        <span style={styles.celdaSubtotal}>{CLP((Number(c.cantidad) || 0) * (Number(c.precio) || 0))}</span>
                                        <span>{!estado ? <span style={{ color: t.textoDeshabilitado, fontSize: 11 }}>—</span> : <span style={{ fontSize: 11, fontWeight: 600, color: ok ? t.verde : t.rojo }}>{estado}</span>}</span>
                                        <span onClick={() => eliminarComponente(idx)} style={styles.xFila}>×</span>
                                    </div>
                                );
                            })}
                            <div style={{ padding: '8px 16px' }}>
                                <button onClick={agregarComponente} style={styles.btnAgregar}>Agregar componente</button>
                            </div>
                            <div style={styles.continuarWrap}><button onClick={() => setTabActiva('Logistica')} style={styles.btnSecundario}>Continuar: Suministros directos →</button></div>
                        </div>
                    )}

                    {/* 3 · SUMINISTROS DIRECTOS */}
                    {tabActiva === 'Logistica' && (
                        <div style={{ padding: '0 0 16px' }}>
                            <div style={{ ...styles.tablaHeader(GRID_LOGISTICA), minWidth: GRID_LOGISTICA_MIN_W }}>
                                <span>Código</span><span>Patente</span><span>Descripción</span>
                                <span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>Unitario</span>
                                <span style={{ textAlign: 'right' }}>Subtotal</span><span>Stock</span><span />
                            </div>
                            {(logistica || []).map((l, idx) => {
                                const codigo = l.codigo || l.unidad;
                                const disponible = disponibilidadSuministro(codigo);
                                const falta = disponible !== null && Number(l.cantidad) > disponible;
                                return (
                                    <div key={l._id || idx} style={{ ...styles.tablaFila(GRID_LOGISTICA), minWidth: GRID_LOGISTICA_MIN_W }}>
                                        <input
                                            list="lista-suministros-recursos" className="campo-ed" style={styles.inputCelda}
                                            placeholder="Buscar código…" value={codigo || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                actualizarLogistica(idx, 'codigo', val);
                                                actualizarLogistica(idx, 'unidad', val);
                                                const match = (suministrosDB || []).find(s => s.codigo?.toLowerCase() === val.toLowerCase() || s.descripcion?.toLowerCase() === val.toLowerCase());
                                                if (match) {
                                                    actualizarLogistica(idx, 'codigo', match.codigo);
                                                    actualizarLogistica(idx, 'descripcion', match.descripcion);
                                                    actualizarLogistica(idx, 'precio', Number(match.precio) || 0);
                                                }
                                            }}
                                        />
                                        <input className="campo-ed" style={styles.inputCelda} value={l.patente || ''} onChange={e => actualizarLogistica(idx, 'patente', e.target.value)} />
                                        <input className="campo-ed" style={styles.inputCelda} value={l.descripcion || ''} placeholder="Descripción del suministro" onChange={e => actualizarLogistica(idx, 'descripcion', e.target.value)} />
                                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={l.cantidad || 1} onChange={e => actualizarLogistica(idx, 'cantidad', e.target.value)} />
                                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={l.precio || 0} onChange={e => actualizarLogistica(idx, 'precio', e.target.value)} />
                                        <span style={styles.celdaSubtotal}>{CLP((Number(l.cantidad) || 0) * (Number(l.precio) || 0))}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {disponible === null ? <span style={{ color: t.textoDeshabilitado, fontSize: 11 }}>—</span> : (
                                                <span style={{ fontSize: 11, fontWeight: 600, color: falta ? t.rojo : t.verde }}>{falta ? `falta ${Number(l.cantidad) - disponible}` : disponible}</span>
                                            )}
                                            {falta && (
                                                <button
                                                    title="Generar Orden de Compra para cubrir el faltante"
                                                    onClick={() => navigate('/compras', { state: { otId: otSeleccionada._id || datosRecibidos?._id, suministroId: (suministrosDB || []).find(s => s.codigo === codigo)?._id || '', descripcion: l.descripcion, cantidad: Number(l.cantidad) - disponible, precioUnitario: Number(l.precio) || 0 } })}
                                                    style={styles.btnOC}
                                                >Generar OC</button>
                                            )}
                                        </span>
                                        <span onClick={() => eliminarLogistica(idx)} style={styles.xFila}>×</span>
                                    </div>
                                );
                            })}
                            <div style={{ padding: '8px 16px' }}>
                                <button onClick={agregarLogistica} style={styles.btnAgregar}>Agregar suministro</button>
                            </div>
                            <div style={{ ...styles.continuarWrap, justifyContent: 'space-between' }}>
                                {puedeTerminarPlanificacion
                                    ? <span style={{ fontSize: 11.5, color: t.verde, fontWeight: 600 }}>Tareas, equipos y suministros definidos</span>
                                    : <span style={{ fontSize: 11.5, color: t.rojo, fontWeight: 600 }}>
                                        {!todasTareasCompletas ? 'Completa descripción, puesto, responsable, horas, fecha, hora y $/hora de todas las tareas'
                                            : !equiposHerramientasConCosto ? 'Todo equipo o herramienta debe tener un costo mayor a $0'
                                                : 'El informe inicial tiene observaciones sin resolver'}
                                    </span>}
                                <button
                                    onClick={() => guardarPlanificacion('Planificada')}
                                    disabled={!puedeTerminarPlanificacion}
                                    title={
                                        !todasTareasCompletas ? 'Completa descripción, puesto, responsable, horas, fecha, hora y $/hora de todas las tareas'
                                            : !equiposHerramientasConCosto ? 'Todo equipo o herramienta debe tener un costo mayor a $0'
                                                : informeEvaluacion.revision?.estado === 'ConObservaciones' ? 'El informe inicial tiene observaciones sin resolver'
                                                    : ''
                                    }
                                    style={{ ...styles.btnPrimario, opacity: puedeTerminarPlanificacion ? 1 : .5 }}
                                >Terminar planificación</button>
                            </div>
                        </div>
                    )}

                    {/* 4 · COTIZACIÓN */}
                    {tabActiva === 'cotizacion' && (
                        <div style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {!otSeleccionada.cotizacion?.capacidadVerificada && (
                            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fbeceb', border: `1px solid ${t.rojo}`, borderRadius: 2 }}>
                                <span style={{ fontSize: 12, color: t.textoPrincipal }}>Requiere programar la OT: falta verificar capacidad y fijar las fechas antes de poder enviar la cotización.</span>
                                <button
                                    onClick={() => navigate('/gantt', { state: { _volverAOT: otSeleccionada._id, _volverATab: 'cotizacion' } })}
                                    style={{ ...styles.btnPrimario, flex: 'none' }}
                                >Ir a Programación</button>
                            </div>
                        )}
                        <div style={{ maxWidth: 620, flex: '1 1 480px' }}>
                            <div style={styles.tituloSub}>Cotización técnica y comercial</div>
                            {[
                                { label: 'Mano de obra', detalle: `${tareas.length} tarea(s)`, valor: totalManoObra },
                                { label: 'Equipos y materiales', detalle: `${componentes.length} ítem(s)`, valor: totalMateriales },
                                { label: 'Suministros directos', detalle: `${logistica.length} ítem(s)`, valor: totalLogisticaFinal },
                            ].map(c => (
                                <div key={c.label} style={styles.filaCosto}>
                                    <span style={{ minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 12, color: t.textoPrincipal }}>{c.label}</span>
                                        <span style={{ display: 'block', fontSize: 10.5, color: t.textoAtenuado3 }}>{c.detalle}</span>
                                    </span>
                                    <span style={{ fontFamily: t.fontMono, fontSize: 12.5 }}>{CLP(c.valor)}</span>
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 3px', marginTop: 6, borderTop: `1px solid ${t.hairlineBloque}` }}>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>Total neto</span>
                                <span style={{ fontFamily: t.fontMono, fontSize: 15, fontWeight: 600 }}>{CLP(granTotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11.5, color: t.textoAtenuado1 }}>
                                <span>IVA 19 %</span><span style={{ fontFamily: t.fontMono }}>{CLP(granTotal * 0.19)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', marginTop: 6, borderTop: `1px solid ${t.hairlineBloque}` }}>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>Total bruto</span>
                                <span style={{ fontFamily: t.fontMono, fontSize: 15, fontWeight: 600 }}>{CLP(granTotal * 1.19)}</span>
                            </div>

                            {diasPlanificados.length > 0 && (
                                <div id="seccion-gantt-visual" style={{ marginTop: 20, overflowX: 'auto', background: '#fff' }}>
                                    <div style={styles.tituloSub}>Cronograma</div>
                                    <table style={{ borderCollapse: 'collapse', fontSize: 10.5, width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th style={styles.thGantt}>Tarea</th><th style={styles.thGantt}>Responsables</th>
                                                {diasPlanificados.map(dia => <th key={dia} style={{ ...styles.thGantt, minWidth: 56 }}>{formatearFechaGantt(dia)}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tareas.map((tt, idx) => (
                                                <tr key={tt._id || tt.id || idx}>
                                                    <td style={styles.tdGantt}>{tt.descripcion}</td>
                                                    <td style={styles.tdGantt}>{(tt.operarioNombre || []).join(', ') || '—'}</td>
                                                    {diasPlanificados.map(dia => (
                                                        <td key={dia} style={{ ...styles.tdGantt, textAlign: 'center' }}>
                                                            {tt.fecha === dia && <span style={{ background: t.acento, color: '#fff', borderRadius: 2, padding: '2px 4px', fontFamily: t.fontMono, fontSize: 10 }}>{tt.hora}</span>}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <div style={styles.tituloSub}>Condiciones comerciales</div>
                            {[
                                ['validez', 'Validez'], ['plazoPago', 'Plazo de pago'], ['formaPago', 'Forma de pago'],
                                ['garantia', 'Garantía'], ['plazoEjecucion', 'Plazo de ejecución'], ['noIncluye', 'No incluye'],
                            ].map(([campo, label]) => (
                                <div key={campo} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                                    <span style={{ fontSize: 10.5, color: t.textoAtenuado2 }}>{label}</span>
                                    <input className="campo-ed" style={styles.inputPlano} value={condicionesComerciales[campo]} onChange={e => setCondicionesComerciales(c => ({ ...c, [campo]: e.target.value }))} />
                                </div>
                            ))}
                            <div style={{ fontSize: 10.5, color: t.textoAtenuado3, marginTop: 12, lineHeight: 1.5 }}>El PDF se genera con encabezado de cliente, plan de trabajo, cronograma y traslados, y queda adjunto al envío al solicitante.</div>
                        </div>

                        <div style={{ width: 264, flex: 'none', background: t.superficie, border: `1px solid ${t.bordeZona}`, padding: 12 }}>
                            <div style={styles.tituloSub}>Secciones del PDF</div>
                            {[
                                ['tareas', 'Detalle por tarea', 'Nuevo'], ['materiales', 'Materiales vs. suministros', 'Nuevo'],
                                ['gantt', 'Cronograma', 'Nuevo'], ['condiciones', 'Condiciones comerciales', 'Nuevo'],
                                ['fotos', 'Fotografías de referencia', 'Por definir'],
                            ].map(([k, label, estado]) => (
                                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${t.hairlineFila}`, cursor: k === 'fotos' ? 'default' : 'pointer', fontSize: 11.5 }}>
                                    <input type="checkbox" checked={seccionesPdf[k]} disabled={k === 'fotos'} onChange={() => setSeccionesPdf(s => ({ ...s, [k]: !s[k] }))} style={{ width: 14, height: 14 }} />
                                    <span style={{ minWidth: 0 }}>{label}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: 9.5, letterSpacing: '.07em', textTransform: 'uppercase', color: estado === 'Nuevo' ? t.verde : t.textoAtenuado3 }}>{estado}</span>
                                </label>
                            ))}
                            <button onClick={() => generarPDF(seccionesPdf)} style={{ ...styles.btnPrimario, width: '100%', marginTop: 11 }}>Descargar PDF</button>
                            <button
                                onClick={() => { setEmailsEnvio([datosRecibidos?.correo || '']); setIsModalEnvioOpen(true); }}
                                disabled={!otSeleccionada.cotizacion?.capacidadVerificada}
                                title={otSeleccionada.cotizacion?.capacidadVerificada ? '' : 'Verifica la capacidad en Programación antes de enviar'}
                                style={{ ...styles.btnSecundario, width: '100%', marginTop: 6, opacity: otSeleccionada.cotizacion?.capacidadVerificada ? 1 : .5 }}
                            >Enviar cotización por correo</button>
                            <div style={{ fontSize: 10.5, color: t.textoAtenuado3, marginTop: 9, lineHeight: 1.5 }}>Las cotizaciones ya emitidas se siguen viendo con su formato original.</div>
                        </div>
                        </div>
                    )}

                    {/* EJECUCIÓN */}
                    {tabActiva === 'reportes' && (
                        <div style={{ padding: 16 }}>
                            <div style={{ marginBottom: 20, border: `1px solid ${t.bordeZona}`, borderRadius: 2 }}>
                                <div style={{ padding: '10px 14px', background: t.encabezadoTabla, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11.5, fontWeight: 700 }}>Estado en terreno</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: t.textoSecundario1 }}>{otSeleccionada?.estado || 'Sin estado'}</span>
                                        <button onClick={recargarOT} title="Actualizar estado desde el servidor" style={styles.btnSecundario}>Actualizar</button>
                                    </div>
                                </div>
                                <div style={{ padding: 14 }}>
                                    <div style={{ fontSize: 11.5, color: t.textoSecundario2, marginBottom: 10 }}>
                                        <div><span style={{ color: t.textoAtenuado3 }}>OT: </span><strong>{otSeleccionada?.numeroOT || '—'}</strong> · <span style={{ color: t.textoAtenuado3 }}>Cliente: </span><strong>{otSeleccionada?.solicitante || '—'}</strong></div>
                                    </div>
                                    <p style={{ color: t.textoAtenuado3, fontSize: 11.5, margin: 0 }}>
                                        El supervisor asignado ve esta OT en su aplicación de terreno — ya no hace falta despacharla manualmente desde acá.
                                    </p>
                                </div>
                            </div>

                            {/* Metodología por tarea: el plan queda visible junto a los reportes de terreno,
                                para comparar plan contra lo ejecutado. Los reportes no se vinculan a una
                                tarea puntual hoy (aplicarAccionOT no guarda tareaId al crearlos), así que
                                se muestra el plan completo de la OT, no un cruce reporte-por-reporte. */}
                            {tareas.some(tt => (tt.desarrollo || '').trim()) && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={styles.tituloSub}>Plan de trabajo (metodología planificada)</div>
                                    <div style={{ border: `1px solid ${t.bordeZona}`, borderRadius: 2 }}>
                                        {tareas.filter(tt => (tt.desarrollo || '').trim()).map((tt, i) => (
                                            <div key={tt._id || tt.id || i} style={{ padding: '8px 12px', borderBottom: `1px solid ${t.hairlineFila}` }}>
                                                <div style={{ fontSize: 11.5, fontWeight: 600, color: t.textoPrincipal }}>{tt.descripcion}</div>
                                                <div style={{ fontSize: 11, color: t.textoSecundario2, marginTop: 2, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{tt.desarrollo}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ ...styles.tituloSub, display: 'flex', gap: 8 }}>
                                <span>Evidencias de terreno</span>
                                {otSeleccionada.reportes?.length > 0 && <span style={{ color: t.verde }}>({otSeleccionada.reportes.length})</span>}
                            </div>

                            {otSeleccionada.reportes?.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 12, marginTop: 10 }}>
                                    {otSeleccionada.reportes.map((rep, i) => (
                                        <div key={i} style={styles.tarjetaReporte}>
                                            {reporteEditIdx === i ? (
                                                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: t.textoAtenuado1 }}>EDITANDO REPORTE {i + 1}</div>
                                                    <textarea className="campo-ed" style={{ ...styles.inputPlano, minHeight: 60 }} value={reporteEditData.comentario} onChange={e => setReporteEditData(d => ({ ...d, comentario: e.target.value }))} />
                                                    {reporteEditData.foto && <img src={reporteEditData.foto} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 2 }} />}
                                                    <label style={{ fontSize: 11, color: t.textoSecundario1, cursor: 'pointer' }}>
                                                        Cambiar foto
                                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                                                            const file = e.target.files[0]; if (!file) return;
                                                            const reader = new FileReader();
                                                            reader.onload = ev => setReporteEditData(d => ({ ...d, foto: ev.target.result }));
                                                            reader.readAsDataURL(file);
                                                        }} />
                                                    </label>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button onClick={guardarEdicionReporte} style={{ ...styles.btnPrimario, flex: 1 }}>Guardar</button>
                                                        <button onClick={() => setReporteEditIdx(null)} style={{ ...styles.btnSecundario, flex: 1 }}>Cancelar</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ position: 'relative' }}>
                                                        {rep.foto && <img src={rep.foto} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', cursor: rep.anulado ? 'default' : 'pointer', filter: rep.anulado ? 'grayscale(1) opacity(.4)' : 'none' }} onClick={() => !rep.anulado && window.open(rep.foto, '_blank')} />}
                                                        {rep.anulado && <div style={styles.badgeAnulado}>ANULADO</div>}
                                                    </div>
                                                    <div style={{ padding: 10, flex: 1, opacity: rep.anulado ? .5 : 1 }}>
                                                        {rep.comentario && <p style={{ margin: 0, fontSize: 11.5, color: t.textoSecundario2, lineHeight: 1.4 }}>{rep.comentario}</p>}
                                                        {rep.usuario && <div style={{ fontSize: 10.5, color: t.textoAtenuado3, marginTop: 4 }}>{rep.usuario}</div>}
                                                        <div style={{ fontFamily: t.fontMono, fontSize: 10, color: t.textoAtenuado3, marginTop: 2 }}>{new Date(rep.fecha).toLocaleString('es-CL')}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', borderTop: `1px solid ${t.hairlineFila}` }}>
                                                        {rep.anulado ? (
                                                            <button onClick={() => restaurarReporte(i)} style={styles.btnFilaTarjeta}>Restaurar</button>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => abrirEdicionReporte(i)} style={styles.btnFilaTarjeta}>Editar</button>
                                                                <button onClick={() => anularReporte(i)} style={{ ...styles.btnFilaTarjeta, color: t.rojo }}>Anular</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 40, color: t.textoAtenuado3, fontSize: 12.5 }}>Sin reportes fotográficos aún. Aparecerán cuando el supervisor suba evidencias desde terreno.</div>
                            )}
                        </div>
                    )}

                    {/* EXCEPCIONES — "extensión de cotización" (ver models/OT.js §7). El supervisor
                        las crea en Borrador desde S3 (PWA Operativa); acá se completan con precios
                        y se envían al cliente. */}
                    {tabActiva === 'excepciones' && (
                        <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                            {excepciones.map((e, idx) => {
                                const esBorrador = e.estado === 'Borrador';
                                const monto = montoExcepcion(e);
                                return (
                                    <div key={e._id || idx} style={{ border: `1px solid ${t.bordeZona}`, borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ padding: '10px 14px', background: t.encabezadoTabla, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: esBorrador ? t.rojo : t.textoAtenuado1 }}>
                                                {e.estado} · {e.fecha ? new Date(e.fecha).toLocaleDateString('es-CL') : ''} {e.creadoPor ? `· ${e.creadoPor}` : ''}
                                            </span>
                                            <span style={{ fontFamily: t.fontMono, fontSize: 12.5, fontWeight: 700 }}>{CLP(monto)}</span>
                                        </div>
                                        <div style={{ padding: '10px 14px' }}>
                                            <div style={{ fontSize: 12.5, color: t.textoSecundario1, marginBottom: e.foto ? 8 : 0 }}>{e.descripcion}</div>
                                            {e.foto && <img src={e.foto} alt="Evidencia" style={{ maxWidth: 180, borderRadius: 2, border: `1px solid ${t.bordeZona}` }} />}
                                            {!esBorrador && e.motivoRechazo && (
                                                <div style={{ marginTop: 8, fontSize: 12, color: t.rojo }}>Motivo de rechazo: {e.motivoRechazo}</div>
                                            )}
                                        </div>

                                        {esBorrador ? (
                                            <>
                                                <div style={{ padding: '0 14px 6px' }}>
                                                    <div style={styles.tituloSub}>Materiales/equipos extra</div>
                                                    {(e.componentesExtra || []).map((c, j) => (
                                                        <div key={c.id || c._id || j} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                                            <input className="campo-ed" style={{ ...styles.inputCelda, flex: '0 0 90px' }} placeholder="Tipo" value={c.tipo || ''} onChange={ev => actualizarComponenteExtra(idx, j, 'tipo', ev.target.value)} />
                                                            <input className="campo-ed" style={{ ...styles.inputCelda, flex: '0 0 90px' }} placeholder="Código" value={c.codigo || ''} onChange={ev => actualizarComponenteExtra(idx, j, 'codigo', ev.target.value)} />
                                                            <input list="lista-componentes-recursos" className="campo-ed" style={{ ...styles.inputCelda, flex: 1 }} placeholder="Descripción" value={c.descripcion || ''} onChange={ev => actualizarComponenteExtra(idx, j, 'descripcion', ev.target.value)} />
                                                            <input type="number" className="campo-ed" style={{ ...styles.inputCelda, flex: '0 0 64px', textAlign: 'right' }} placeholder="Cant." value={c.cantidad} onChange={ev => actualizarComponenteExtra(idx, j, 'cantidad', ev.target.value)} />
                                                            <input type="number" className="campo-ed" style={{ ...styles.inputCelda, flex: '0 0 90px', textAlign: 'right' }} placeholder="Precio" value={c.precio} onChange={ev => actualizarComponenteExtra(idx, j, 'precio', ev.target.value)} />
                                                            <span style={{ ...styles.celdaSubtotal, flex: '0 0 90px' }}>{CLP((Number(c.cantidad) || 0) * (Number(c.precio) || 0))}</span>
                                                            <span onClick={() => eliminarComponenteExtra(idx, j)} style={styles.xFila}>×</span>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => agregarComponenteExtra(idx)} style={styles.btnAgregar}>Agregar material/equipo</button>
                                                </div>

                                                <div style={{ padding: '10px 14px 6px' }}>
                                                    <div style={styles.tituloSub}>Horas extra</div>
                                                    {(e.tareasExtra || []).map((tt, j) => (
                                                        <div key={tt.id || tt._id || j} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                                            <input className="campo-ed" style={{ ...styles.inputCelda, flex: 1 }} placeholder="Descripción" value={tt.descripcion || ''} onChange={ev => actualizarTareaExtra(idx, j, 'descripcion', ev.target.value)} />
                                                            <select className="campo-ed" style={{ ...styles.inputCelda, flex: '0 0 130px' }} value={tt.puesto || ''} onChange={ev => actualizarTareaExtra(idx, j, 'puesto', ev.target.value)}>
                                                                <option value="">Puesto —</option>
                                                                {puestosDB.map(p => <option key={p._id} value={p.nombre}>{p.nombre}</option>)}
                                                            </select>
                                                            <input type="number" className="campo-ed" style={{ ...styles.inputCelda, flex: '0 0 64px', textAlign: 'right' }} placeholder="Hrs" value={tt.duracion} onChange={ev => actualizarTareaExtra(idx, j, 'duracion', ev.target.value)} />
                                                            <input type="number" className="campo-ed" style={{ ...styles.inputCelda, flex: '0 0 90px', textAlign: 'right' }} placeholder="$/hora" value={tt.valorHora} onChange={ev => actualizarTareaExtra(idx, j, 'valorHora', ev.target.value)} />
                                                            <span style={{ ...styles.celdaSubtotal, flex: '0 0 90px' }}>{CLP((Number(tt.duracion) || 0) * (Number(tt.valorHora) || 0))}</span>
                                                            <span onClick={() => eliminarTareaExtra(idx, j)} style={styles.xFila}>×</span>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => agregarTareaExtra(idx)} style={styles.btnAgregar}>Agregar horas extra</button>
                                                </div>

                                                <div style={{ ...styles.continuarWrap, justifyContent: 'flex-start' }}>
                                                    <button
                                                        onClick={() => enviarExcepcion(idx)}
                                                        disabled={enviandoExcepcion === idx}
                                                        style={styles.btnPrimario}
                                                    >{enviandoExcepcion === idx ? 'Enviando…' : 'Enviar al cliente'}</button>
                                                </div>
                                            </>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* PAGO */}
                    {tabActiva === 'pago' && (
                        <div style={{ maxWidth: 520, padding: 16 }}>
                            <div style={styles.tituloSub}>Registro de pago</div>
                            {pago.anulado && (
                                <div style={{ background: t.barraFiltrosPie, borderLeft: `2px solid ${t.rojo}`, padding: '8px 10px', marginBottom: 12, fontSize: 11.5 }}>
                                    <div style={{ fontWeight: 700, color: t.rojo }}>Pago anulado</div>
                                    <div style={{ color: t.textoSecundario1 }}>
                                        {pago.fechaAnulacion && <>Fecha: <strong>{pago.fechaAnulacion}</strong> — </>}
                                        {pago.motivoAnulacion ? <>Motivo: <strong>{pago.motivoAnulacion}</strong></> : 'Sin motivo registrado'}
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                                {[
                                    { label: 'Total cotizado', valor: CLP(granTotal * 1.19), nota: 'con IVA' },
                                    { label: 'Monto pagado', valor: CLP(pago.montoPagado), nota: '' },
                                    { label: 'Saldo pendiente', valor: CLP(Math.max(0, granTotal * 1.19 - Number(pago.montoPagado || 0))), nota: '' },
                                ].map(k => (
                                    <div key={k.label} style={{ background: t.barraFiltrosPie, padding: 10, textAlign: 'center', borderRadius: 2 }}>
                                        <div style={{ fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: t.textoAtenuado3 }}>{k.label}</div>
                                        <div style={{ fontFamily: t.fontMono, fontSize: 16, fontWeight: 700, marginTop: 4 }}>{k.valor}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginBottom: 12, display: 'flex', gap: 2 }}>
                                {['Pendiente', 'Parcial', 'Pagado'].map(e => (
                                    <button key={e} onClick={() => setPago(p => ({ ...p, estado: e }))} style={pago.estado === e ? styles.chipActivo : styles.chip}>{pago.estado === e ? '▪ ' : ''}{e}</button>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '8px 12px', alignItems: 'center', marginBottom: 12 }}>
                                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>Monto pagado</span>
                                <input type="number" className="campo-ed" style={styles.inputPlano} value={pago.montoPagado} onChange={e => setPago(p => ({ ...p, montoPagado: Number(e.target.value) }))} />
                                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>Fecha de pago</span>
                                <input type="date" className="campo-ed" style={styles.inputPlano} value={pago.fechaPago} onChange={e => setPago(p => ({ ...p, fechaPago: e.target.value }))} />
                                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>Método</span>
                                <select className="campo-ed" style={styles.inputPlano} value={pago.metodoPago} onChange={e => setPago(p => ({ ...p, metodoPago: e.target.value }))}>
                                    {['Transferencia', 'Efectivo', 'Cheque', 'Débito', 'Crédito', 'Otro'].map(m => <option key={m}>{m}</option>)}
                                </select>
                                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>N° referencia</span>
                                <input className="campo-ed" style={styles.inputPlano} value={pago.referencia} onChange={e => setPago(p => ({ ...p, referencia: e.target.value }))} placeholder="Ej: TRF-20260817-001" />
                            </div>
                            <label style={styles.campoLabel}>
                                <span style={styles.etiqueta}>Notas</span>
                                <textarea className="campo-ed" style={{ ...styles.inputPlano, minHeight: 60 }} value={pago.notas} onChange={e => setPago(p => ({ ...p, notas: e.target.value }))} />
                            </label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                                <button onClick={guardarPago} style={styles.btnPrimario}>Guardar información de pago</button>
                                {!pago.anulado && pago.estado !== 'Pendiente' && <button onClick={anularPago} style={{ ...styles.btnSecundario, color: t.rojo }}>Anular pago</button>}
                                {pago.anulado && <button onClick={restaurarPago} style={styles.btnSecundario}>Restaurar pago</button>}
                            </div>
                        </div>
                    )}

                    {/* DOCUMENTOS DE TERRENO */}
                    {tabActiva === 'documentos' && (
                        <TabDocumentosPdf
                            otSeleccionada={otSeleccionada} tareas={tareas} componentes={componentes}
                            antecedentes={antecedentes} onGenerar={generarCarpetaOT}
                        />
                    )}
                </section>

                {/* Tira de colapso + separador + panel de resumen */}
                <div onClick={() => setAsideOculta(v => !v)} title={asideOculta ? 'Mostrar resumen' : 'Ocultar resumen'} style={styles.asideTira}>{asideOculta ? '‹' : '›'}</div>
                {!asideOculta && (
                    <>
                        <div onPointerDown={dragAside} title="Arrastra para ajustar el ancho del panel" style={styles.asideSeparador} />
                        <aside style={{ ...styles.aside, width: asideW }}>
                            <div style={styles.asideBloque}>
                                <div style={styles.tituloSub}>Requerimiento</div>
                                <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: t.textoSecundario2 }}>{otSeleccionada?.descripcion || datosRecibidos?.descripcion || '—'}</p>
                            </div>
                            <div style={styles.asideScroll}>
                                <div style={styles.asideBloque}>
                                    <div style={{ ...styles.tituloSub, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Resumen</span><span style={{ fontFamily: t.fontMono }}>{totalManoObra > 0 || tareas.length ? `${tareas.reduce((s, tt) => s + Number(tt.duracion || 0), 0)} h` : ''}</span>
                                    </div>
                                    {[
                                        { label: 'Mano de obra', valor: totalManoObra },
                                        { label: 'Equipos y materiales', valor: totalMateriales },
                                        { label: 'Suministros directos', valor: totalLogisticaFinal },
                                    ].map(r => (
                                        <div key={r.label} style={styles.fichaFila}><span style={styles.fichaLabel}>{r.label}</span><span style={styles.fichaValor}>{CLP(r.valor)}</span></div>
                                    ))}
                                    <div style={styles.granTotalFila}><span style={{ fontSize: 11.5, fontWeight: 700 }}>Total neto</span><span style={{ fontFamily: t.fontMono, fontSize: 14, fontWeight: 600 }}>{CLP(granTotal)}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                                        <span style={{ fontSize: 10.5, color: t.textoAtenuado3 }}>Total bruto con IVA</span>
                                        <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.textoAtenuado3 }}>{CLP(granTotal * 1.19)}</span>
                                    </div>
                                </div>
                                <div style={{ padding: '11px 16px 14px' }}>
                                    <div style={styles.tituloSub}>Acciones</div>
                                    <button onClick={() => guardarPlanificacion(false)} style={{ ...styles.btnPrimarioAside, width: '100%' }}>Guardar</button>
                                </div>
                            </div>
                        </aside>
                    </>
                )}
            </div>

            {/* DATALISTS */}
            <datalist id="lista-componentes-recursos">
                {(componentesDB || []).map((item, i) => <option key={item._id || i} value={item.tipo ? `${item.nombre} (${item.tipo})` : item.nombre} />)}
            </datalist>
            <datalist id="lista-suministros-recursos">
                {(suministrosDB || []).map((item, idx) => <option key={item._id || idx} value={item.codigo}>{item.descripcion} - {CLP(item.precio)}</option>)}
            </datalist>

            {/* MODAL HOJA DE RUTA */}
            {modalPlantilla && (
                <div style={styles.overlay}>
                    <div style={{ ...styles.modal, width: 700, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={styles.modalHeader}>
                            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Seleccionar hoja de ruta</span>
                            <span onClick={() => { setModalPlantilla(false); setPlantillaPreview(null); }} style={styles.xModal}>×</span>
                        </div>
                        <div style={{ display: 'flex', gap: 14, flex: 1, overflow: 'hidden', padding: 14 }}>
                            <div style={{ width: 210, overflowY: 'auto', borderRight: `1px solid ${t.hairlineBloque}`, paddingRight: 12 }}>
                                {plantillas.length === 0 && <p style={{ color: t.textoAtenuado3, fontSize: 11.5 }}>No hay hojas de ruta creadas. Ve a Recursos → Plantillas.</p>}
                                {plantillas.map(p => (
                                    <div key={p._id} onClick={() => setPlantillaPreview(p)} style={{ padding: 8, borderRadius: 2, cursor: 'pointer', marginBottom: 4, background: plantillaPreview?._id === p._id ? t.barraFiltrosPie : 'transparent', border: `1px solid ${plantillaPreview?._id === p._id ? t.acento : 'transparent'}` }}>
                                        <div style={{ fontWeight: 700, fontSize: 11.5 }}>{p.nombre}</div>
                                        <div style={{ fontSize: 10.5, color: t.textoAtenuado3, marginTop: 2 }}>{p.categoria}</div>
                                        <div style={{ fontSize: 10.5, color: t.textoAtenuado3 }}>{p.tareas?.length || 0} tareas · {p.componentes?.length || 0} equipos · {p.logistica?.length || 0} suministros</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {!plantillaPreview ? (
                                    <div style={{ color: t.textoAtenuado3, fontSize: 11.5, padding: 20, textAlign: 'center' }}>Selecciona una hoja de ruta para ver su contenido.</div>
                                ) : (
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 13 }}>{plantillaPreview.nombre}</div>
                                        <div style={{ fontSize: 11, color: t.textoAtenuado3, margin: '4px 0 12px' }}>{plantillaPreview.descripcion}</div>
                                        <button onClick={() => aplicarPlantilla(plantillaPreview)} style={styles.btnPrimario}>Aplicar hoja de ruta</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL ENVÍO POR CORREO */}
            {isModalEnvioOpen && (
                <div style={styles.overlay}>
                    <div style={styles.modal}>
                        <div style={styles.modalHeader}>
                            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Enviar cotización por correo</span>
                            <span onClick={() => setIsModalEnvioOpen(false)} style={styles.xModal}>×</span>
                        </div>
                        <div style={{ padding: 16 }}>
                            <p style={{ fontSize: 11.5, color: t.textoSecundario2, margin: '0 0 8px' }}>Confirma los destinatarios para enviar la cotización:</p>
                            <div style={{ border: `1px solid ${t.bordeZona}`, padding: 8, borderRadius: 2, minHeight: 40, marginBottom: 10 }}>
                                {emailsEnvio.map((email, index) => (
                                    <span key={index} style={styles.tagEmail}>
                                        {email}
                                        <span onClick={() => setEmailsEnvio(emailsEnvio.filter((_, i) => i !== index))} style={{ cursor: 'pointer', marginLeft: 6, color: t.rojo }}>×</span>
                                    </span>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input type="email" placeholder="Añadir otro correo" className="campo-ed" style={styles.inputPlano} value={nuevoEmail} onChange={e => setNuevoEmail(e.target.value)} />
                                <button onClick={() => { if (nuevoEmail && nuevoEmail.includes('@')) { setEmailsEnvio([...emailsEnvio, nuevoEmail]); setNuevoEmail(''); } }} style={styles.btnSecundario}>Añadir</button>
                            </div>
                        </div>
                        <div style={styles.modalFooter}>
                            <button onClick={() => setIsModalEnvioOpen(false)} style={styles.btnSecundario}>Cancelar</button>
                            <button
                                onClick={async () => {
                                    try {
                                        const fechasRaw = tareas.map(tt => tt.fecha).filter(Boolean);
                                        if (fechasRaw.length === 0) { notificar.advertencia("No hay fechas programadas en las tareas."); return; }
                                        const objetosFecha = fechasRaw.map(f => new Date(f + 'T00:00:00'));
                                        const minFecha = new Date(Math.min(...objetosFecha));
                                        const maxFecha = new Date(Math.max(...objetosFecha));

                                        const doc = await generarPDF();
                                        const pdfBase64 = doc.output('datauristring').split(',')[1];
                                        const respuesta = await axios.post(`${API}/mail/enviar-cotizacion`, {
                                            emails: emailsEnvio,
                                            otId: datosRecibidos?._id,
                                            cliente: datosRecibidos?.solicitante || "Cliente General",
                                            total: granTotal || 0,
                                            pdfData: pdfBase64,
                                            tareas,
                                        });
                                        if (respuesta.data.ok) {
                                            await actualizarOtGlobal(otSeleccionada._id, {
                                                'cotizacion.enviada': true,
                                                'cotizacion.fechaEnvio': new Date().toISOString(),
                                            });
                                            notificar.exito(`Cotización enviada. Programado del ${minFecha.toLocaleDateString('es-CL')} al ${maxFecha.toLocaleDateString('es-CL')}`);
                                            setIsModalEnvioOpen(false);
                                            navigate('/dashboard');
                                        }
                                    } catch (error) {
                                        console.error("Error en el envío:", error);
                                        notificar.error("Error al enviar la cotización. Revisa la consola.");
                                    }
                                }}
                                style={styles.btnPrimario}
                            >Enviar ahora</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const styles = {
    raiz: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: t.fondoMain, color: t.textoPrincipal, fontFamily: t.fontUi, fontSize: '13px' },
    header: { flex: 'none', display: 'flex', alignItems: 'baseline', gap: 14, padding: '9px 16px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    h1: { margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap' },
    empresa: { fontSize: 12.5, fontWeight: 600, color: t.textoSecundario1, whiteSpace: 'nowrap' },
    subtitulo: { fontSize: 11.5, color: t.textoAtenuado2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    btnVolver: { marginLeft: 'auto', flex: 'none', height: 24, padding: '0 10px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11.5, color: '#262622', cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },

    pipeline: { flex: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 16px', padding: '6px 16px', background: t.barraContexto, borderBottom: `1px solid ${t.hairlineBloque}` },
    pipelineItem: { display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },

    tabsFila: { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '0 16px', background: t.barraFiltrosPie, borderBottom: `1px solid ${t.hairlineBloque}` },
    tabs: { display: 'flex', flexWrap: 'wrap', gap: 1 },
    tab: { height: 31, padding: '0 12px', background: 'transparent', border: 0, borderBottom: '2px solid transparent', fontSize: 11.5, fontWeight: 400, color: t.textoAtenuado1, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: t.fontUi },
    tabActivo: { height: 31, padding: '0 12px', background: t.superficie, border: 0, borderBottom: `2px solid ${t.textoPrincipal}`, fontSize: 11.5, fontWeight: 700, color: t.textoPrincipal, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: t.fontUi },

    cuerpo: { flex: 1, minHeight: 0, display: 'flex' },
    contenido: { flex: 1, minWidth: 0, overflow: 'auto', background: t.superficie },

    tablaHeader: (grid) => ({
        position: 'sticky', top: 0, zIndex: 2, display: 'grid', gridTemplateColumns: grid, gap: 8, alignItems: 'center',
        height: 26, padding: '0 16px', background: t.encabezadoTabla, borderBottom: `1px solid ${t.bordeZona}`,
        fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700,
    }),
    tablaFila: (grid) => ({ display: 'grid', gridTemplateColumns: grid, gap: 8, alignItems: 'center', padding: '4px 16px', borderBottom: `1px solid ${t.hairlineFila}` }),
    inputCelda: { height: 24, minWidth: 0, padding: '0 6px', fontFamily: 'inherit', fontSize: 11.5, color: t.textoPrincipal, borderRadius: 2, width: '100%', boxSizing: 'border-box' },
    celdaSubtotal: { fontFamily: t.fontMono, fontSize: 11.5, textAlign: 'right', color: t.textoPrincipal },
    xFila: { fontFamily: t.fontMono, fontSize: 12, color: '#c9c7c0', cursor: 'pointer', textAlign: 'center' },
    celdaResponsable: { display: 'flex', alignItems: 'center', gap: 4, height: 24, padding: '0 6px', border: '1px solid transparent', borderRadius: 2, minWidth: 0 },
    selectInvisible: { width: 16, flex: 'none', border: 'none', background: 'transparent', fontSize: 11, color: t.acento, cursor: 'pointer' },

    btnAgregar: { height: 24, padding: '0 10px', background: t.superficie, border: '1px dashed rgba(0,0,0,.28)', fontSize: 11.5, color: t.textoSecundario3, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    continuarWrap: { display: 'flex', justifyContent: 'flex-end', padding: '10px 16px' },
    btnOC: { height: 20, padding: '0 8px', background: t.superficie, border: `1px solid ${t.rojo}`, color: t.rojo, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },

    campoLabel: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
    etiqueta: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 },
    inputPlano: { height: 27, minWidth: 0, padding: '0 8px', border: `1px solid ${t.bordeInput}`, background: t.superficie, fontFamily: 'inherit', fontSize: 12, color: t.textoPrincipal, outline: 'none', borderRadius: 2, width: '100%', boxSizing: 'border-box' },
    avisoOk: { background: '#eafaf1', border: '1px solid rgba(0,0,0,.08)', borderRadius: 2, padding: '8px 10px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: t.verde },
    xFoto: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#fff', border: `1px solid ${t.bordeZona}`, fontSize: 11, lineHeight: '16px', textAlign: 'center', cursor: 'pointer', color: t.rojo },
    agregarFoto: { width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(0,0,0,.28)', borderRadius: 2, cursor: 'pointer', color: t.textoAtenuado3, fontSize: 11 },
    tituloSub: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3, marginBottom: 7, padding: '11px 16px 0' },

    filaCosto: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '7px 0', borderBottom: `1px solid ${t.hairlineBloque}` },
    thGantt: { textAlign: 'left', padding: '4px 8px', background: t.encabezadoTabla, fontWeight: 700, color: t.textoAtenuado1, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.06em' },
    tdGantt: { padding: '4px 8px', borderBottom: `1px solid ${t.hairlineFila}`, color: t.textoSecundario1 },

    tarjetaReporte: { background: t.superficie, border: `1px solid ${t.bordeZona}`, borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    badgeAnulado: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(180,35,24,.85)', color: '#fff', fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 2, letterSpacing: '.06em' },
    btnFilaTarjeta: { flex: 1, padding: 8, background: 'none', border: 'none', color: t.acento, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: t.fontUi },

    chip: { height: 24, padding: '0 11px', background: t.superficie, border: `1px solid ${t.bordeInput}`, fontSize: 11.5, color: t.textoSecundario1, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    chipActivo: { height: 24, padding: '0 11px', background: t.textoPrincipal, border: `1px solid ${t.textoPrincipal}`, fontSize: 11.5, color: '#fff', fontWeight: 600, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },

    asideTira: { width: 13, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.encabezadoTabla, color: t.textoAtenuado3, fontFamily: t.fontMono, fontSize: 12, cursor: 'pointer', borderLeft: `1px solid ${t.hairlineBloque}` },
    asideSeparador: { width: 5, flex: 'none', cursor: 'col-resize', background: t.encabezadoTabla, borderLeft: `1px solid ${t.hairlineBloque}`, borderRight: `1px solid ${t.hairlineBloque}` },
    aside: { flex: 'none', display: 'flex', flexDirection: 'column', background: t.fondoMain, minHeight: 0, overflow: 'hidden' },
    asideBloque: { flex: 'none', padding: '0 0 11px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    asideScroll: { flex: 1, minHeight: 0, overflow: 'auto' },
    fichaFila: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 16px', fontSize: 11.5 },
    fichaLabel: { color: t.textoAtenuado2, flex: 'none' },
    fichaValor: { fontFamily: t.fontMono, color: '#262622' },
    granTotalFila: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '7px 16px 0', paddingTop: 7, borderTop: '1px solid rgba(0,0,0,.16)' },
    accionesGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
    btnAccion: { height: 28, padding: '0 8px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11.5, fontWeight: 600, color: '#262622', cursor: 'pointer', borderRadius: 2, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: t.fontUi },
    btnPrimarioAside: { width: '100%', height: 30, marginTop: 6, background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    notaAside: { fontSize: 10.5, color: t.textoAtenuado3, marginTop: 6, lineHeight: 1.5 },

    btnPrimario: { height: 30, padding: '0 14px', background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    btnSecundario: { height: 27, padding: '0 12px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 12, color: '#262622', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },

    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
    modal: { background: t.superficie, borderRadius: 2, width: 450, boxShadow: '0 8px 24px rgba(0,0,0,.14)' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${t.hairlineBloque}` },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: `1px solid ${t.hairlineBloque}` },
    xModal: { fontFamily: t.fontMono, fontSize: 14, color: t.textoAtenuado3, cursor: 'pointer' },
    tagEmail: { display: 'inline-flex', alignItems: 'center', background: t.barraFiltrosPie, color: t.textoSecundario1, padding: '3px 8px', borderRadius: 2, margin: 3, fontSize: 11.5 },
};

export default TratamientoScreen;
