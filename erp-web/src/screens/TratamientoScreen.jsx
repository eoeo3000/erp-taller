import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import useIsMobile from '../hooks/useIsMobile';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
    Tratada: 1, Planificada: 2, Aprobada: 2, Programada: 3,
    'En Ejecución': 4, 'Trabajo Terminado': 5, 'Con Informe': 6, Pagada: 7,
};
const etapaInfo = (estado) => {
    if (!estado) return { idx: 0, label: ETAPAS_VISUAL[0], rechazada: false };
    if (estado === 'Rechazada') return { idx: 2, label: 'Rechazada', rechazada: true };
    const idx = MAPA_ETAPA[estado] ?? 0;
    return { idx, label: ETAPAS_VISUAL[idx], rechazada: false };
};

const informeEvaluacionVacio = {
    fecha: '', responsable: '', condicionesSitio: '', recursosObservados: '',
    riesgos: '', metodologia: '', fotos: [], completo: false,
    tareas: [], componentes: [], logistica: []
};

// Grillas fijas de cada tabla editable (README §6). Las de materiales/suministros suman una
// columna de disponibilidad/OC que el mock no contemplaba (ver Gap 2b/2c, funcionalidades-v2.md).
const GRID_TAREAS = 'minmax(200px,1fr) 118px 132px 52px 68px 62px 84px 96px 24px';
const GRID_MATERIALES = '104px 128px minmax(200px,1fr) 62px 96px 100px 100px 24px';
const GRID_LOGISTICA = '96px 96px minmax(200px,1fr) 62px 96px 100px 140px 24px';

const fmtFecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

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
    const [tabActiva, setTabActiva] = useState('antecedentes');
    const [otSeleccionada, setOtSeleccionada] = useState(datosRecibidos || {});
    const [tareas, setTareas] = useState([]);
    const [componentes, setComponentes] = useState([]);
    const [informeEvaluacion, setInformeEvaluacion] = useState({ ...informeEvaluacionVacio, ...(datosRecibidos?.informeEvaluacion || {}) });
    // Se mantiene solo para no romper el contrato de /ots/convertir-ot (ver prepararPayload) — ya no tiene UI propia.
    const [cotizacion] = useState({
        materiales: [], equipos: [], manoObra: [], lineaMando: [],
        insumos: [], logistica: { alimentacion: 0, traslado: 0, examenes: 0, banos: 0 }
    });
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

    const manejarGuardadoFinal = async () => {
        try {
            const otParaGuardar = {
                ...otSeleccionada,
                solicitudId: otSeleccionada.solicitudId || otSeleccionada._id,
                tareas, componentes, cotizacion, pago,
            };
            const resultado = await actualizarOtGlobal(otSeleccionada._id, otParaGuardar);
            if (resultado && resultado.exito) {
                const otNumerada = resultado.otActualizada;
                setOtSeleccionada(otNumerada);
                if (otNumerada.tareas) setTareas(otNumerada.tareas);
                if (otNumerada.pago) setPago(otNumerada.pago);
                alert(`Guardado con éxito. OT #${otNumerada.numeroOT}`);
            }
        } catch (err) {
            console.error("Error en el cliente:", err);
        }
    };

    const actualizarTarea = (index, campo, valor) => {
        setTareas(tareas.map((tItem, i) => i === index
            ? { ...tItem, [campo]: (campo === 'duracion' || campo === 'valorHora') ? Number(valor) : valor }
            : tItem));
    };
    const agregarComponente = () => setComponentes([...componentes, { id: Date.now(), codigo: '', descripcion: '', cantidad: 1, precio: 0 }]);
    const actualizarComponente = (index, campo, valor) => {
        setComponentes(prev => prev.map((c, i) => i === index
            ? { ...c, [campo]: (campo === 'cantidad' || campo === 'precio') ? parseFloat(valor || 0) : valor }
            : c));
    };

    const calcularSubtotal = (lista) => lista.reduce((sum, i) => sum + (Number(i.cantidad || 0) * Number(i.unitario || 0)), 0);
    void calcularSubtotal;

    const prepararPayload = () => {
        const idReal = datosRecibidos?._id;
        return {
            solicitudId: idReal,
            otId: idReal,
            esEdicion: !!(datosRecibidos?.tareas && datosRecibidos.tareas.length > 0),
            tareas, componentes,
            cotizacionDetalle: { ...cotizacion, logistica, totalCalculadoMat: totalMat },
            resumenFinanciero: { totalNeto: granTotal, iva: granTotal * 0.19, totalGeneral: granTotal * 1.19 },
            fechaGeneracion: new Date().toISOString()
        };
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
            estado: estadoForzado || (['Pendiente', 'Tratada', 'Planificada', 'Aprobada', 'Rechazada', 'Programada', 'En Ejecución', 'Trabajo Terminado', 'Con Informe', 'Pagada'].includes(otSeleccionada?.estado) ? otSeleccionada.estado : 'Tratada'),
            tareas,
            componentes: limpiarIds(componentes),
            logistica: (logistica || []).map(l => ({
                _id: (String(l._id).length === 24) ? l._id : undefined,
                unidad: l.codigo || l.unidad || '', patente: l.patente || '', descripcion: l.descripcion || '',
                cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0
            })),
            informeEvaluacion,
            granTotal,
        };
        try {
            const respuesta = await actualizarOtGlobal(datosRecibidos._id, dataCompleta);
            if (respuesta && respuesta.exito) {
                alert("Planificación guardada.");
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

    const generarPDF = async () => {
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
        const startTablesY = 68 + (splitDesc.length * 5) + 5;

        autoTable(doc, {
            startY: startTablesY,
            head: [['1. MATERIALES / REPUESTOS', 'CANT.', 'SUBTOTAL']],
            body: componentes.map(c => [c.descripcion, c.cantidad, `$ ${(Number(c.cantidad) * Number(c.precio)).toLocaleString()}`]),
            headStyles: { fillColor: [44, 62, 80] }
        });
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 10,
            head: [['2. PLAN DE TRABAJO (SUMINISTROS)', 'PUESTO', 'HRS', 'SUBTOTAL']],
            body: tareas.map(tt => [tt.descripcion, tt.puesto, tt.duracion, `$ ${(Number(tt.duracion) * Number(tt.valorHora) * (tt.operarioId?.length || 1)).toLocaleString()}`]),
            headStyles: { fillColor: [52, 73, 94] }
        });

        const finalYPlan = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(12); doc.setTextColor(44, 62, 80);
        doc.text("3. CRONOGRAMA DE EJECUCIÓN", 14, finalYPlan);
        const ganttElement = document.getElementById('seccion-gantt-visual');
        let nextY = finalYPlan + 10;
        if (ganttElement) {
            const canvas = await html2canvas(ganttElement, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pageWidth - 28;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            if (finalYPlan + imgHeight > 270) {
                doc.addPage(); doc.addImage(imgData, 'PNG', 14, 20, imgWidth, imgHeight);
                nextY = 20 + imgHeight + 15;
            } else {
                doc.addImage(imgData, 'PNG', 14, finalYPlan + 5, imgWidth, imgHeight);
                nextY = finalYPlan + imgHeight + 15;
            }
        }
        autoTable(doc, {
            startY: nextY,
            head: [['4. TRASLADOS Y OTROS SUMINISTROS', 'SUBTOTAL']],
            body: logistica.map(l => [l.descripcion, `$ ${(Number(l.cantidad) * Number(l.precio)).toLocaleString()}`]),
            headStyles: { fillColor: [127, 140, 141] }
        });
        const resY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(11); doc.setTextColor(0);
        doc.text(`TOTAL NETO: $ ${granTotal.toLocaleString()}`, pageWidth - 15, resY, { align: 'right' });
        doc.text(`IVA (19%): $ ${(granTotal * 0.19).toLocaleString()}`, pageWidth - 15, resY + 7, { align: 'right' });
        doc.setFontSize(13); doc.setFont(undefined, 'bold');
        doc.text(`TOTAL BRUTO: $ ${(granTotal * 1.19).toLocaleString()}`, pageWidth - 15, resY + 15, { align: 'right' });
        doc.save(`Cotizacion_OT_${datosRecibidos?._id || 'nueva'}.pdf`);
        return doc;
    };

    const finalizarYCotizar = async () => {
        if (granTotal === 0) {
            if (!window.confirm("La cotización está en $0. ¿Deseas generar el PDF de todas formas?")) return;
        }
        try {
            const payload = prepararPayload();
            const respuestaConvertir = await axios.post(`${API}/ots/convertir-ot`, payload);
            if (respuestaConvertir.status === 200 || respuestaConvertir.status === 201) {
                if (typeof cargarDatos === 'function') await cargarDatos();
                const correoBase = datosRecibidos?.correo || "";
                setEmailsEnvio([correoBase]);
                setIsModalEnvioOpen(true);
                generarPDF();
            }
        } catch (error) {
            console.error("Error al finalizar:", error);
            alert(`No se pudo procesar: ${error.response?.data?.error || "Error al conectar con el servidor."}`);
        }
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
    const faltantesComponentes = componentes
        .filter(c => c.tipo === 'Equipo' || c.tipo === 'Herramienta')
        .map(c => ({ ...c, estadoCatalogo: disponibilidadEquipo(c.codigo) }))
        .filter(c => c.codigo && c.estadoCatalogo && c.estadoCatalogo !== 'Disponible');
    const faltantesLogistica = (logistica || [])
        .map(l => ({ ...l, disponible: disponibilidadSuministro(l.codigo || l.unidad) }))
        .filter(l => (l.codigo || l.unidad) && l.disponible !== null && Number(l.cantidad) > l.disponible);
    const hayFaltantesStock = faltantesComponentes.length > 0 || faltantesLogistica.length > 0;

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
    const eliminarComponente = (index) => setComponentes(prev => prev.filter((_, i) => i !== index));
    const eliminarLogistica = (index) => {
        const nuevaLog = logistica.filter((_, i) => i !== index);
        setLogistica(nuevaLog);
        if (otSeleccionada) setOtSeleccionada({ ...otSeleccionada, logistica: nuevaLog });
    };

    const aplicarPlantilla = (plantilla) => {
        const confirmar = tareas.length > 0 || componentes.length > 0
            ? window.confirm(`¿Aplicar la hoja de ruta "${plantilla.nombre}"? Se agregarán sus tareas y materiales a los existentes.`)
            : true;
        if (!confirmar) return;
        const tareasNuevas = (plantilla.tareas || []).map(tt => ({ descripcion: tt.descripcion || '', puesto: tt.puesto || '', duracion: tt.duracion || 0, fecha: '', hora: '', operarioId: [], operarioNombre: [] }));
        setTareas(prev => [...prev, ...tareasNuevas]);
        setComponentes(prev => [...prev, ...(plantilla.componentes || [])]);
        setLogistica(prev => [...prev, ...(plantilla.logistica || [])]);
        setModalPlantilla(false);
        setPlantillaPreview(null);
        alert(`Hoja de ruta "${plantilla.nombre}" aplicada. Ahora asigna fechas, horarios y responsables a las tareas.`);
    };

    const itemVacioInforme = (lista) => {
        if (lista === 'tareas') return { descripcion: '', puesto: '', duracion: 0 };
        if (lista === 'componentes') return { codigo: '', descripcion: '', cantidad: 1, precio: 0, tipo: 'Material' };
        return { descripcion: '', cantidad: 1, unidad: '', precio: 0 };
    };
    const setInformeCampo = (campo, valor) => setInformeEvaluacion(prev => ({ ...prev, [campo]: valor }));
    const agregarInformeItem = (lista) => setInformeEvaluacion(prev => ({ ...prev, [lista]: [...prev[lista], itemVacioInforme(lista)] }));
    const actualizarInformeItem = (lista, idx, campo, valor) => setInformeEvaluacion(prev => ({
        ...prev,
        [lista]: prev[lista].map((it, i) => i === idx ? { ...it, [campo]: (['cantidad', 'precio', 'duracion'].includes(campo)) ? Number(valor) || 0 : valor } : it)
    }));
    const eliminarInformeItem = (lista, idx) => setInformeEvaluacion(prev => ({ ...prev, [lista]: prev[lista].filter((_, i) => i !== idx) }));
    const agregarFotoInforme = (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;
        const reader = new FileReader();
        reader.onload = (ev) => setInformeEvaluacion(prev => ({ ...prev, fotos: [...prev.fotos, ev.target.result] }));
        reader.readAsDataURL(archivo);
        e.target.value = '';
    };
    const eliminarFotoInforme = (idx) => setInformeEvaluacion(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) }));
    const marcarInformeCompleto = () => {
        if (!informeEvaluacion.fecha || !informeEvaluacion.responsable || !informeEvaluacion.condicionesSitio) {
            alert('Completa al menos fecha, responsable y condiciones del sitio antes de marcar el informe como completo.');
            return;
        }
        setInformeEvaluacion(prev => ({ ...prev, completo: true }));
    };
    const reabrirInforme = () => setInformeEvaluacion(prev => ({ ...prev, completo: false }));
    const aplicarInformeAOT = () => {
        const { tareas: tInforme = [], componentes: cInforme = [], logistica: lInforme = [] } = informeEvaluacion;
        if (!tInforme.length && !cInforme.length && !lInforme.length) {
            alert('El informe no tiene tareas, equipos ni suministros cargados para aplicar.');
            return;
        }
        const tareasNuevas = tInforme.map(tt => ({ descripcion: tt.descripcion || '', puesto: tt.puesto || '', duracion: tt.duracion || 0, fecha: '', hora: '', operarioId: [], operarioNombre: [] }));
        setTareas(prev => [...prev, ...tareasNuevas]);
        setComponentes(prev => [...prev, ...cInforme]);
        setLogistica(prev => [...prev, ...lInforme]);
        alert('Informe aplicado a la OT. Ahora asigna fechas, horarios y responsables en la pestaña Tareas.');
        setTabActiva('tareas');
    };

    const irATab = (tab) => {
        if (['tareas', 'componentes', 'Logistica', 'cotizacion'].includes(tab) && !informeEvaluacion.completo && !yaTeniaContenidoPrevio) {
            alert('Completa y marca como terminado el Informe Inicial antes de continuar.');
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
        } catch (e) { alert('Error al guardar: ' + e.message); }
    };
    const anularReporte = async (idx) => {
        if (!window.confirm('¿Anular este reporte?')) return;
        const id = otSeleccionada._id;
        const reportesActualizados = otSeleccionada.reportes.map((r, i) => i === idx ? { ...r, anulado: true } : r);
        const todosAnulados = reportesActualizados.every(r => r.anulado);
        const nuevoEstado = todosAnulados ? 'Trabajo Terminado' : otSeleccionada.estado;
        try {
            await axios.put(`${API}/ots/${id}`, { reportes: reportesActualizados, estado: nuevoEstado });
            setOtSeleccionada(prev => ({ ...prev, reportes: reportesActualizados, estado: nuevoEstado }));
            if (cargarDatos) cargarDatos();
        } catch (e) { alert('Error al anular: ' + e.message); }
    };
    const restaurarReporte = async (idx) => {
        const id = otSeleccionada._id;
        const reportesActualizados = otSeleccionada.reportes.map((r, i) => i === idx ? { ...r, anulado: false } : r);
        const nuevoEstado = otSeleccionada.estado === 'Trabajo Terminado' ? 'Con Informe' : otSeleccionada.estado;
        try {
            await axios.put(`${API}/ots/${id}`, { reportes: reportesActualizados, estado: nuevoEstado });
            setOtSeleccionada(prev => ({ ...prev, reportes: reportesActualizados, estado: nuevoEstado }));
            if (cargarDatos) cargarDatos();
        } catch (e) { alert('Error al restaurar: ' + e.message); }
    };

    const guardarPago = async () => {
        try {
            const id = otSeleccionada?._id || datosRecibidos?._id;
            if (!id) return alert('Sin OT seleccionada');
            const estadoActual = otSeleccionada?.estado || datosRecibidos?.estado || 'Con Informe';
            const nuevoEstadoOT = pago.estado === 'Pagado' ? 'Pagada' : estadoActual;
            const pagoAGuardar = { ...pago, anulado: false, fechaAnulacion: '', motivoAnulacion: '' };
            const { data } = await axios.put(`${API}/ots/${id}`, { pago: pagoAGuardar, estado: nuevoEstadoOT });
            setOtSeleccionada(prev => ({ ...prev, pago: pagoAGuardar, estado: nuevoEstadoOT }));
            setPago(data.pago || pagoAGuardar);
            if (cargarDatos) cargarDatos();
            alert('Información de pago guardada');
        } catch (e) { alert('Error al guardar pago: ' + e.message); }
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
        } catch (e) { alert('Error al anular pago: ' + e.message); }
    };
    const restaurarPago = async () => {
        if (!window.confirm('¿Restaurar el pago y volver al estado "Pagada"?')) return;
        try {
            const id = otSeleccionada?._id || datosRecibidos?._id;
            if (!id) return;
            const pagoRestaurado = { ...pago, anulado: false, fechaAnulacion: '', motivoAnulacion: '' };
            const nuevoEstadoOT = pagoRestaurado.estado === 'Pagado' ? 'Pagada' : otSeleccionada.estado;
            await axios.put(`${API}/ots/${id}`, { pago: pagoRestaurado, estado: nuevoEstadoOT });
            setOtSeleccionada(prev => ({ ...prev, pago: pagoRestaurado, estado: nuevoEstadoOT }));
            setPago(pagoRestaurado);
            if (cargarDatos) cargarDatos();
        } catch (e) { alert('Error al restaurar pago: ' + e.message); }
    };
    const recargarOT = async () => {
        try {
            const id = otSeleccionada?._id || datosRecibidos?._id;
            if (!id) return;
            const { data } = await axios.get(`${API}/ots/${id}`);
            setOtSeleccionada(data);
            if (cargarDatos) await cargarDatos();
        } catch (e) { alert('Error al actualizar: ' + e.message); }
    };

    const notificarSupervisor = async () => {
        try {
            const otId = otSeleccionada?._id || datosRecibidos?._id;
            const ids = [...new Set(tareas.flatMap(tt => Array.isArray(tt.operarioId) ? tt.operarioId : [tt.operarioId]).filter(Boolean))];
            const recurso = recursos.find(r => ids.map(String).includes(String(r._id)) && (r.email || r.telefono));
            let supervisorEmail = recurso?.email || '';
            const supervisorNombre = recurso?.nombre || 'Supervisor';
            const telefono = recurso?.telefono;
            if (!supervisorEmail) {
                supervisorEmail = window.prompt(`Sin email registrado para ${supervisorNombre}.\nIngresa el email del supervisor:`);
                if (!supervisorEmail) return;
            }
            const emailFinal = supervisorEmail.trim();
            if (!emailFinal || !emailFinal.includes('@')) { alert('Ingresa un email válido para el supervisor.'); return; }
            const { data } = await axios.post(`${API}/ots/${otId}/enviar-supervisor`, { supervisorEmail: emailFinal, supervisorNombre });
            const link = data.link;
            const tareasTexto = tareas.map(tt => `  • ${tt.descripcion}${tt.fecha ? ` — ${tt.fecha}` : ''}${tt.hora ? ` ${tt.hora}` : ''}${tt.operarioNombre?.length ? ` (${[].concat(tt.operarioNombre).join(', ')})` : ''}`).join('\n');
            const resumen = [
                `*ORDEN DE TRABAJO: ${otSeleccionada?.numeroOT || ''}*`,
                `Cliente: ${otSeleccionada?.solicitante || ''}`,
                `Descripción: ${otSeleccionada?.descripcion || ''}`,
                ``, `*Tareas programadas:*`, tareasTexto || '  Sin tareas', ``,
                `Se te envió el PDF completo a ${supervisorEmail}`, ``,
                `Para confirmar inicio del trabajo toca el link:`, link
            ].join('\n');
            const msg = encodeURIComponent(resumen);
            if (telefono) window.open(`https://wa.me/${telefono}?text=${msg}`, '_blank');
            else {
                const num = window.prompt(`Sin teléfono registrado para ${supervisorNombre}.\nIngresa el número (ej: 56912345678):`);
                if (num) window.open(`https://wa.me/${num.trim()}?text=${msg}`, '_blank');
            }
        } catch (e) { alert('Error al enviar al supervisor: ' + e.message); }
    };

    if (!datosRecibidos) return <div style={{ padding: '50px', fontFamily: t.fontUi }}>No hay datos.</div>;

    const info = etapaInfo(otSeleccionada?.estado);
    const puedeEjecucion = ['Programada', 'En Ejecución', 'Trabajo Terminado', 'Con Informe', 'Pagada'].includes(otSeleccionada.estado);
    const habilitadoTabs14 = informeEvaluacion.completo || yaTeniaContenidoPrevio;
    const requiereSupervisorAntesQueOT = !otSeleccionada?.numeroOT;

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
                    <button onClick={() => irATab('cotizacion')} disabled={!habilitadoTabs14} title={habilitadoTabs14 ? '' : 'Completa el Informe Inicial primero'} style={{ ...(tabActiva === 'cotizacion' ? styles.tabActivo : styles.tab), opacity: habilitadoTabs14 ? 1 : .5 }}>4 · Cotización</button>
                    <button onClick={() => puedeEjecucion && setTabActiva('reportes')} disabled={!puedeEjecucion} title={puedeEjecucion ? '' : 'Disponible una vez que la OT esté Programada'} style={{ ...(tabActiva === 'reportes' ? styles.tabActivo : styles.tab), opacity: puedeEjecucion ? 1 : .5 }}>
                        Ejecución {otSeleccionada.reportes?.length ? `(${otSeleccionada.reportes.length})` : ''}
                    </button>
                    <button onClick={() => setTabActiva('pago')} style={tabActiva === 'pago' ? styles.tabActivo : styles.tab}>Pago</button>
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
                            {informeEvaluacion.completo && (
                                <div style={styles.avisoOk}>
                                    <span>Informe marcado como completo.</span>
                                    <button onClick={reabrirInforme} style={styles.btnSecundario}>Reabrir para editar</button>
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 10, marginBottom: 14 }}>
                                <label style={styles.campoLabel}>
                                    <span style={styles.etiqueta}>Fecha del levantamiento *</span>
                                    <input type="date" className="campo-ed" style={styles.inputPlano} value={informeEvaluacion.fecha} onChange={e => setInformeCampo('fecha', e.target.value)} disabled={informeEvaluacion.completo} />
                                </label>
                                <label style={styles.campoLabel}>
                                    <span style={styles.etiqueta}>Responsable *</span>
                                    <input className="campo-ed" style={styles.inputPlano} value={informeEvaluacion.responsable} onChange={e => setInformeCampo('responsable', e.target.value)} disabled={informeEvaluacion.completo} />
                                </label>
                            </div>
                            {[
                                ['condicionesSitio', 'Condiciones del sitio *'],
                                ['recursosObservados', 'Recursos observados en terreno'],
                                ['riesgos', 'Riesgos'],
                                ['metodologia', 'Metodología propuesta'],
                            ].map(([campo, label]) => (
                                <label key={campo} style={{ ...styles.campoLabel, marginBottom: 10 }}>
                                    <span style={styles.etiqueta}>{label}</span>
                                    <textarea className="campo-ed" style={{ ...styles.inputPlano, minHeight: 60, lineHeight: 1.5 }} value={informeEvaluacion[campo]} onChange={e => setInformeCampo(campo, e.target.value)} disabled={informeEvaluacion.completo} />
                                </label>
                            ))}

                            <div style={styles.etiqueta}>Fotos del sitio</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '6px 0 16px' }}>
                                {informeEvaluacion.fotos.map((foto, idx) => (
                                    <div key={idx} style={{ position: 'relative' }}>
                                        <img src={foto} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 2 }} />
                                        {!informeEvaluacion.completo && <span onClick={() => eliminarFotoInforme(idx)} style={styles.xFoto}>×</span>}
                                    </div>
                                ))}
                                {!informeEvaluacion.completo && (
                                    <label style={styles.agregarFoto}>
                                        + Agregar
                                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={agregarFotoInforme} />
                                    </label>
                                )}
                            </div>

                            <div style={styles.tituloSub}>Tareas identificadas</div>
                            <div style={styles.tablaHeader('minmax(200px,1fr) 132px 62px 24px')}>
                                <span>Descripción</span><span>Puesto</span><span style={{ textAlign: 'right' }}>Hrs</span><span />
                            </div>
                            {informeEvaluacion.tareas.map((it, idx) => (
                                <div key={idx} style={styles.tablaFila('minmax(200px,1fr) 132px 62px 24px')}>
                                    <input className="campo-ed" style={styles.inputCelda} value={it.descripcion} onChange={e => actualizarInformeItem('tareas', idx, 'descripcion', e.target.value)} disabled={informeEvaluacion.completo} />
                                    <select className="campo-ed" style={styles.inputCelda} value={it.puesto} onChange={e => actualizarInformeItem('tareas', idx, 'puesto', e.target.value)} disabled={informeEvaluacion.completo}>
                                        <option value="">—</option>
                                        {puestosDB.map(p => <option key={p._id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                    <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={it.duracion} onChange={e => actualizarInformeItem('tareas', idx, 'duracion', e.target.value)} disabled={informeEvaluacion.completo} />
                                    {!informeEvaluacion.completo ? <span onClick={() => eliminarInformeItem('tareas', idx)} style={styles.xFila}>×</span> : <span />}
                                </div>
                            ))}
                            {!informeEvaluacion.completo && <button onClick={() => agregarInformeItem('tareas')} style={styles.btnAgregar}>Agregar tarea</button>}

                            <div style={{ ...styles.tituloSub, marginTop: 18 }}>Herramientas / equipos / materiales identificados</div>
                            <div style={styles.tablaHeader('96px minmax(200px,1fr) 104px 62px 96px 24px')}>
                                <span>Código</span><span>Descripción</span><span>Tipo</span><span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>Precio</span><span />
                            </div>
                            {informeEvaluacion.componentes.map((c, idx) => (
                                <div key={idx} style={styles.tablaFila('96px minmax(200px,1fr) 104px 62px 96px 24px')}>
                                    <input className="campo-ed" style={styles.inputCelda} value={c.codigo} onChange={e => actualizarInformeItem('componentes', idx, 'codigo', e.target.value)} disabled={informeEvaluacion.completo} />
                                    <input className="campo-ed" style={styles.inputCelda} value={c.descripcion} onChange={e => actualizarInformeItem('componentes', idx, 'descripcion', e.target.value)} disabled={informeEvaluacion.completo} />
                                    <select className="campo-ed" style={styles.inputCelda} value={c.tipo} onChange={e => actualizarInformeItem('componentes', idx, 'tipo', e.target.value)} disabled={informeEvaluacion.completo}>
                                        <option value="Material">Material</option><option value="Equipo">Equipo</option><option value="Herramienta">Herramienta</option>
                                    </select>
                                    <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={c.cantidad} onChange={e => actualizarInformeItem('componentes', idx, 'cantidad', e.target.value)} disabled={informeEvaluacion.completo} />
                                    <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={c.precio} onChange={e => actualizarInformeItem('componentes', idx, 'precio', e.target.value)} disabled={informeEvaluacion.completo} />
                                    {!informeEvaluacion.completo ? <span onClick={() => eliminarInformeItem('componentes', idx)} style={styles.xFila}>×</span> : <span />}
                                </div>
                            ))}
                            {!informeEvaluacion.completo && <button onClick={() => agregarInformeItem('componentes')} style={styles.btnAgregar}>Agregar ítem</button>}

                            <div style={{ ...styles.tituloSub, marginTop: 18 }}>Logística identificada</div>
                            <div style={styles.tablaHeader('minmax(200px,1fr) 96px 62px 96px 24px')}>
                                <span>Descripción</span><span>Unidad</span><span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>Precio</span><span />
                            </div>
                            {informeEvaluacion.logistica.map((l, idx) => (
                                <div key={idx} style={styles.tablaFila('minmax(200px,1fr) 96px 62px 96px 24px')}>
                                    <input className="campo-ed" style={styles.inputCelda} value={l.descripcion} onChange={e => actualizarInformeItem('logistica', idx, 'descripcion', e.target.value)} disabled={informeEvaluacion.completo} />
                                    <input className="campo-ed" style={styles.inputCelda} value={l.unidad} onChange={e => actualizarInformeItem('logistica', idx, 'unidad', e.target.value)} disabled={informeEvaluacion.completo} />
                                    <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={l.cantidad} onChange={e => actualizarInformeItem('logistica', idx, 'cantidad', e.target.value)} disabled={informeEvaluacion.completo} />
                                    <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={l.precio} onChange={e => actualizarInformeItem('logistica', idx, 'precio', e.target.value)} disabled={informeEvaluacion.completo} />
                                    {!informeEvaluacion.completo ? <span onClick={() => eliminarInformeItem('logistica', idx)} style={styles.xFila}>×</span> : <span />}
                                </div>
                            ))}
                            {!informeEvaluacion.completo && <button onClick={() => agregarInformeItem('logistica')} style={styles.btnAgregar}>Agregar ítem</button>}

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, flexWrap: 'wrap', gap: 8 }}>
                                {!informeEvaluacion.completo
                                    ? <button onClick={marcarInformeCompleto} style={styles.btnPrimario}>Marcar informe como completo</button>
                                    : <span />}
                                <button onClick={aplicarInformeAOT} disabled={!informeEvaluacion.completo} style={{ ...styles.btnPrimario, opacity: informeEvaluacion.completo ? 1 : .5, cursor: informeEvaluacion.completo ? 'pointer' : 'not-allowed' }}>Aplicar a la OT →</button>
                            </div>
                        </div>
                    )}

                    {/* 1 · TAREAS */}
                    {tabActiva === 'tareas' && (
                        <div style={{ padding: '0 0 16px' }}>
                            <div style={styles.tablaHeader(GRID_TAREAS)}>
                                <span>Descripción</span><span>Puesto</span><span>Responsable</span>
                                <span style={{ textAlign: 'right' }}>Hrs</span><span style={{ textAlign: 'right' }}>Fecha</span>
                                <span style={{ textAlign: 'right' }}>Hora</span><span style={{ textAlign: 'right' }}>$/hora</span>
                                <span style={{ textAlign: 'right' }}>Subtotal</span><span />
                            </div>
                            {tareas.map((tt, idx) => {
                                const horas = Number(tt.duracion) || 0;
                                const precioHora = Number(tt.valorHora) || 0;
                                const personas = Array.isArray(tt.operarioId) ? tt.operarioId.length : 0;
                                const sub = horas * precioHora * (personas > 0 ? personas : 1);
                                return (
                                    <div key={tt._id || tt.id || `tarea-${idx}`} style={styles.tablaFila(GRID_TAREAS)}>
                                        <input className="campo-ed" style={styles.inputCelda} value={tt.descripcion} onChange={e => actualizarTarea(idx, 'descripcion', e.target.value)} />
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
                                        <span onClick={() => eliminarTarea(idx)} style={styles.xFila}>×</span>
                                    </div>
                                );
                            })}
                            <div style={{ padding: '8px 16px' }}>
                                <button onClick={agregarTarea} style={styles.btnAgregar}>Agregar tarea</button>
                            </div>
                            <div style={styles.continuarWrap}><button onClick={() => setTabActiva('componentes')} style={styles.btnSecundario}>Continuar: Equipos y materiales →</button></div>
                        </div>
                    )}

                    {/* 2 · EQUIPOS Y MATERIALES */}
                    {tabActiva === 'componentes' && (
                        <div style={{ padding: '0 0 16px' }}>
                            <div style={styles.tablaHeader(GRID_MATERIALES)}>
                                <span>Tipo</span><span>Código</span><span>Descripción</span>
                                <span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>Unitario</span>
                                <span style={{ textAlign: 'right' }}>Subtotal</span><span>Disponibilidad</span><span />
                            </div>
                            {componentes.map((c, idx) => {
                                const estado = disponibilidadEquipo(c.codigo);
                                const ok = estado === 'Disponible';
                                return (
                                    <div key={c.id || idx} style={styles.tablaFila(GRID_MATERIALES)}>
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
                            <div style={styles.tablaHeader(GRID_LOGISTICA)}>
                                <span>Código</span><span>Patente</span><span>Descripción</span>
                                <span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>Unitario</span>
                                <span style={{ textAlign: 'right' }}>Subtotal</span><span>Stock</span><span />
                            </div>
                            {(logistica || []).map((l, idx) => {
                                const codigo = l.codigo || l.unidad;
                                const disponible = disponibilidadSuministro(codigo);
                                const falta = disponible !== null && Number(l.cantidad) > disponible;
                                return (
                                    <div key={l._id || idx} style={styles.tablaFila(GRID_LOGISTICA)}>
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
                                <span style={{ fontSize: 11.5, color: t.verde, fontWeight: 600 }}>Tareas, equipos y suministros definidos</span>
                                <button onClick={() => guardarPlanificacion('Planificada')} style={styles.btnPrimario}>Terminar planificación</button>
                            </div>
                        </div>
                    )}

                    {/* 4 · COTIZACIÓN */}
                    {tabActiva === 'cotizacion' && (
                        <div style={{ maxWidth: 620, padding: 16 }}>
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
                            <div style={{ fontSize: 10.5, color: t.textoAtenuado3, marginTop: 12, lineHeight: 1.5 }}>El PDF se genera con encabezado de cliente, plan de trabajo, cronograma y traslados, y queda adjunto al envío al solicitante.</div>
                        </div>
                    )}

                    {/* EJECUCIÓN */}
                    {tabActiva === 'reportes' && (
                        <div style={{ padding: 16 }}>
                            <div style={{ marginBottom: 20, border: `1px solid ${t.bordeZona}`, borderRadius: 2 }}>
                                <div style={{ padding: '10px 14px', background: t.encabezadoTabla, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11.5, fontWeight: 700 }}>Despacho al supervisor</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: t.textoSecundario1 }}>{otSeleccionada?.estado || 'Sin estado'}</span>
                                        <button onClick={recargarOT} title="Actualizar estado desde el servidor" style={styles.btnSecundario}>Actualizar</button>
                                    </div>
                                </div>
                                <div style={{ padding: 14 }}>
                                    <div style={{ fontSize: 11.5, color: t.textoSecundario2, marginBottom: 10 }}>
                                        <div><span style={{ color: t.textoAtenuado3 }}>OT: </span><strong>{otSeleccionada?.numeroOT || '—'}</strong> · <span style={{ color: t.textoAtenuado3 }}>Cliente: </span><strong>{otSeleccionada?.solicitante || '—'}</strong></div>
                                    </div>
                                    {otSeleccionada?.estado === 'En Ejecución' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <div style={{ fontSize: 11.5, color: t.verde, fontWeight: 600 }}>Trabajo en ejecución — el supervisor confirmó el inicio.</div>
                                            <button onClick={notificarSupervisor} style={styles.btnPrimario}>Reenviar link al supervisor</button>
                                        </div>
                                    ) : otSeleccionada?.estado === 'Programada' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <p style={{ margin: 0, fontSize: 11.5, color: t.textoSecundario2 }}>La OT está programada. Envía la orden al supervisor para que confirme el inicio del trabajo.</p>
                                            <button onClick={notificarSupervisor} style={styles.btnPrimario}>Enviar OT al supervisor por WhatsApp</button>
                                        </div>
                                    ) : (
                                        <p style={{ color: t.textoAtenuado3, fontSize: 11.5, margin: 0 }}>El despacho se habilita cuando la OT esté <strong>Programada</strong>.</p>
                                    )}
                                </div>
                            </div>

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
                                    <div style={styles.accionesGrid}>
                                        <button onClick={() => guardarPlanificacion(false)} style={styles.btnAccion}>Guardar</button>
                                        <button onClick={() => setModalPlantilla(true)} style={styles.btnAccion}>Hoja de ruta</button>
                                        <button onClick={generarPDF} style={styles.btnAccion}>Cotización PDF</button>
                                        <button
                                            onClick={() => { if (hayFaltantesStock) { alert('No se puede programar: hay equipos/herramientas no disponibles o suministros con stock insuficiente. Revisa las pestañas Equipos y materiales / Suministros directos.'); return; } navigate('/gantt'); }}
                                            title={hayFaltantesStock ? 'Hay faltantes de stock sin cubrir' : ''}
                                            style={{ ...styles.btnAccion, ...(hayFaltantesStock ? { color: t.rojo, borderColor: t.rojo } : {}) }}
                                        >{hayFaltantesStock ? 'Programar (faltantes)' : 'Programar'}</button>
                                    </div>
                                    {requiereSupervisorAntesQueOT ? (
                                        <>
                                            <button onClick={finalizarYCotizar} style={styles.btnPrimarioAside}>Finalizar y cotizar</button>
                                            <div style={styles.notaAside}>Convierte la solicitud en OT, genera el PDF y abre el envío por correo.</div>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={notificarSupervisor} style={styles.btnPrimarioAside}>Enviar al supervisor</button>
                                            <div style={styles.notaAside}>El supervisor recibe un enlace con token; no requiere cuenta.</div>
                                        </>
                                    )}
                                    <button onClick={manejarGuardadoFinal} style={{ ...styles.btnSecundario, width: '100%', marginTop: 6 }}>Guardar y actualizar OT completa</button>
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
                                        if (fechasRaw.length === 0) { alert("No hay fechas programadas en las tareas."); return; }
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
                                            alert(`Cotización enviada. Programado del ${minFecha.toLocaleDateString('es-CL')} al ${maxFecha.toLocaleDateString('es-CL')}`);
                                            setIsModalEnvioOpen(false);
                                            navigate('/dashboard');
                                        }
                                    } catch (error) {
                                        console.error("Error en el envío:", error);
                                        alert("Error al enviar la cotización. Revisa la consola.");
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
