import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import useIsMobile from '../hooks/useIsMobile';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { notificar, confirmar } from '../utils/notificar';
import { t, styles, fmtFecha, CLP } from './tratamiento/comunTratamiento';
import TabAntecedentes from './tratamiento/TabAntecedentes';
import TabDocumentosPdf from './tratamiento/TabDocumentosPdf';
import TabTareas from './tratamiento/TabTareas';
import TabEquiposMateriales from './tratamiento/TabEquiposMateriales';
import TabSuministrosDirectos from './tratamiento/TabSuministrosDirectos';
import TabPago from './tratamiento/TabPago';

// Paso 4 del rediseño (ver docs/rediseno/design_handoff_panel_control/README.md §6):
// pipeline + 7 tabs (se agrega "0 · Informe Inicial", que no estaba en el mock, ver resumen
// entregado al usuario) + tablas editables + panel de resumen. Mismos tokens que el resto (§2).
// Sin emoji, sin clases de Bootstrap (había varias reales en el archivo anterior: mb-4, p-3,
// border-start, bg-light, text-primary, text-muted — se retiran todas).
// Tokens de estilo (`t`, `styles`) y `fmtFecha` viven en ./tratamiento/comunTratamiento —
// compartidos con las pestañas ya extraídas a archivo propio (TabAntecedentes,
// TabDocumentosPdf), ver plan de robustecimiento, punto 6.

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

// Mismo criterio y mismo límite que otController.cotizacionVencida/GanttScreen.cotizacionVencida
// — duplicado acá porque no hay forma de compartir código entre el backend y el frontend, y
// entre pantallas del frontend, en este repo.
const HORAS_LIMITE_APROBACION_COTIZACION = 12;
const cotizacionVencida = (ot) => !!(
    ot?.cotizacion?.enviada && ot?.cotizacion?.respuestaCliente === 'Pendiente' && ot?.cotizacion?.fechaEnvio
    && (Date.now() - new Date(ot.cotizacion.fechaEnvio).getTime()) > HORAS_LIMITE_APROBACION_COTIZACION * 3600 * 1000
);
const horasRestantesAprobacion = (ot) => {
    if (!ot?.cotizacion?.fechaEnvio) return null;
    const limite = new Date(ot.cotizacion.fechaEnvio).getTime() + HORAS_LIMITE_APROBACION_COTIZACION * 3600 * 1000;
    return Math.max(0, limite - Date.now()) / 3600000;
};

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

    // Cierra la ventana de aprobación antes de que venzan las 12h — vuelve todo a foja cero:
    // hay que reconfirmar programación en el Gantt y reenviar para que el cliente pueda
    // aprobar de nuevo (mismo criterio que el vencimiento automático, ver cotizacionVencida).
    const cancelarAceptacion = async () => {
        if (!(await confirmar('¿Cancelar la aceptación pendiente? El cliente ya no podrá aprobar este envío — habrá que reconfirmar programación y reenviar.', { danger: false, textoConfirmar: 'Cancelar aceptación' }))) return;
        const resultado = await actualizarOtGlobal(otSeleccionada._id, {
            'cotizacion.enviada': false,
            'cotizacion.capacidadVerificada': false,
        });
        if (resultado?.exito) {
            notificar.exito('Aceptación cancelada.');
            if (cargarDatos) await cargarDatos();
        } else {
            notificar.error(resultado?.error || 'No se pudo cancelar.');
        }
    };

    // Corregir algo (una tarea, un material) sin esperar a que el supervisor marque
    // 'Reprogramar' desde terreno — solo tiene sentido mientras la OT sigue en 'Planificada'
    // (ver soloLecturaPlanificacion): pasada esa etapa ya hay reservas de stock/equipos reales
    // comprometidas y esto dejaría de ser seguro. Si la cotización ya se había enviado, primero
    // se cancela (mismo efecto que cancelarAceptacion) antes de volver a Tareas.
    const volverAPlanificacion = async () => {
        const yaEnviada = !!otSeleccionada?.cotizacion?.enviada;
        const mensaje = yaEnviada
            ? 'Vas a cancelar el envío pendiente y volver a Tareas/Equipos/Suministros. El cliente ya no podrá aprobar este envío — habrá que reconfirmar programación y reenviar. ¿Continuar?'
            : '¿Volver a Tareas/Equipos/Suministros para corregir algo antes de enviar la cotización?';
        if (!(await confirmar(mensaje, { danger: false, textoConfirmar: 'Volver a planificación' }))) return;
        if (yaEnviada) {
            const resultado = await actualizarOtGlobal(otSeleccionada._id, {
                'cotizacion.enviada': false,
                'cotizacion.capacidadVerificada': false,
            });
            if (!resultado?.exito) { notificar.error(resultado?.error || 'No se pudo cancelar el envío.'); return; }
            if (cargarDatos) await cargarDatos();
        }
        setTabActiva('tareas');
    };

    const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);

    // Vía alternativa a "Enviar cotización por correo": mismo link autenticado a la PWA
    // Cliente (mailRoutes.resolverLinkPortal), pero compartido por WhatsApp — mismo patrón que
    // enviarPortalCliente en App.jsx (wa.me armado en el cliente), acá con el link real de
    // aprobación en vez del portal público de solo lectura.
    const enviarCotizacionWhatsApp = async () => {
        setEnviandoWhatsApp(true);
        try {
            const respuesta = await axios.post(`${API}/mail/link-cotizacion`, { otId: otSeleccionada._id });
            const { link, telefono } = respuesta.data;
            if (!link || !telefono) { notificar.error('No se pudo generar el link — revisa que la Solicitud tenga teléfono registrado.'); return; }
            await actualizarOtGlobal(otSeleccionada._id, {
                'cotizacion.enviada': true,
                'cotizacion.fechaEnvio': new Date().toISOString(),
                'cotizacion.respuestaCliente': 'Pendiente',
                'cotizacion.fechaRespuesta': null,
            });
            const mensaje = `Hola ${datosRecibidos?.solicitante || ''}, le compartimos la cotización de la OT ${otSeleccionada?.numeroOT || ''}. Puede revisarla y responder desde acá:\n\n${link}`;
            window.open(`https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
            notificar.exito('Cotización enviada — se abrió WhatsApp con el link.');
            if (cargarDatos) await cargarDatos();
        } catch (error) {
            notificar.error('No se pudo generar el link: ' + (error.response?.data?.error || error.message));
        } finally {
            setEnviandoWhatsApp(false);
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

    // Prioriza el match por catalogoId (ObjectId real, capturado al elegir del
    // autocompletado) sobre el texto — mismo criterio que
    // otController.aplicarReservaPorCambioEstado, ver plan de robustecimiento punto 7.
    // `c` puede venir como string (codigo suelto, uso histórico) para no romper otros
    // llamadores que todavía no pasan el componente completo.
    const disponibilidadEquipo = (c) => {
        const codigo = typeof c === 'string' ? c : c?.codigo;
        const catalogoId = typeof c === 'string' ? null : c?.catalogoId;
        const item = (componentesDB || []).find(db =>
            (catalogoId && String(db._id) === String(catalogoId)) || (db.codigo && codigo && db.codigo === codigo)
        );
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
    // Congelar Tareas/Equipos/Suministros una vez terminada la planificación: "Terminar
    // planificación" (puedeTerminarPlanificacion, arriba) ya exige tareas completas y equipos
    // con costo antes de habilitarse, así que al llegar acá los datos YA estaban completos por
    // definición — no hace falta seguir revisando en vivo si siguen completos para decidir el
    // freeze (eso volvía el freeze reactivo a cada tecleo y se activaba a mitad de una edición,
    // ver historial de este archivo). Regla simple y estable: solo el estado. 'Reprogramar' es
    // la excepción — es justo el estado en el que el planificador necesita volver a Tareas a
    // reasignar fechas (ver aplicarAccionOT accion:'reprogramar' y GanttScreen.confirmarCapacidad).
    //
    // Una OT vieja con datos incompletos de antes de que existiera esta validación (no puede
    // volver a pasar con una OT nueva) se corrige reprogramándola desde la PWA del supervisor,
    // no reabriendo el freeze automáticamente.
    //
    // Segunda excepción: mientras la OT sigue en 'Planificada' y la cotización todavía NO se
    // envió, no hay ningún riesgo en destrabar — aplicarReservaPorCambioEstado (backend) solo
    // reserva stock/equipos en la transición Planificada->Programada, así que nada se
    // comprometió todavía. Antes, corregir un olvido acá exigía esperar a que el supervisor
    // marcara 'Reprogramar' desde terreno; ahora el botón "Cancelar y volver a planificación"
    // de la pestaña Cotización cubre este caso sin salir del escritorio. `cotizacion.enviada`
    // solo cambia por una acción explícita (enviar / cancelar aceptación), nunca como efecto
    // de tipear en las tablas — no reintroduce el freeze reactivo que se sacó antes (ver
    // comentario de arriba).
    const cotizacionEnviada = !!otSeleccionada?.cotizacion?.enviada;
    const soloLecturaPlanificacion = planificacionTerminada
        && otSeleccionada?.estado !== 'Reprogramar'
        && !(otSeleccionada?.estado === 'Planificada' && !cotizacionEnviada);

    // Único condicionante bloqueante de la pestaña Cotización, en el orden en que se resuelven
    // (tareas -> costos -> terminar planificación -> programar). Se muestra solo ese recuadro,
    // sin el resto del contenido de la pestaña — para que quede claro que es un paso obligatorio,
    // no un aviso más al lado de una cotización que en realidad todavía no se puede ver/enviar.
    const bloqueoCotizacion = !todasTareasCompletas
        ? { mensaje: 'Faltan datos en Tareas: descripción, puesto, responsable, horas, fecha, hora o $/hora de alguna tarea.', boton: 'Ir a Tareas', accion: () => irATab('tareas') }
        : !equiposHerramientasConCosto
            ? { mensaje: 'Todo equipo o herramienta debe tener un costo mayor a $0.', boton: 'Ir a Equipos y materiales', accion: () => irATab('componentes') }
            : !planificacionTerminada
                ? { mensaje: 'Todavía falta presionar "Terminar planificación" en la pestaña Suministros directos.', boton: 'Ir a Suministros directos', accion: () => irATab('Logistica') }
                : !otSeleccionada.cotizacion?.capacidadVerificada
                    ? { mensaje: 'Requiere programar la OT: falta verificar capacidad y fijar las fechas antes de poder enviar la cotización.', boton: 'Ir a Programación', accion: () => navigate('/gantt', { state: { _volverAOT: otSeleccionada._id } }) }
                    : null;

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
                    {/* Ya no se deshabilita por tareas/costos/planificación incompletos (antes, si algo
                        faltaba, la pestaña quedaba gris sin ninguna pista de qué hacer ni a dónde ir —
                        se podía quedar "varado" en otra pestaña). Ahora siempre se puede entrar, y adentro
                        se explica qué falta con un botón directo a la pestaña correspondiente. */}
                    <button
                        onClick={() => irATab('cotizacion')}
                        disabled={!habilitadoTabs14}
                        title={habilitadoTabs14 ? '' : 'Completa el Informe Inicial primero'}
                        style={{ ...(tabActiva === 'cotizacion' ? styles.tabActivo : styles.tab), opacity: habilitadoTabs14 ? 1 : .5 }}
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

                    {soloLecturaPlanificacion && ['tareas', 'componentes', 'Logistica'].includes(tabActiva) && (
                        <div style={{ padding: '8px 16px', background: '#fdf3e7', borderBottom: `1px solid ${t.bordeZona}`, fontSize: 11.5, color: t.textoSecundario1 }}>
                            Planificación terminada — esta pestaña quedó de solo lectura. Para cambiar fechas, reprograma la OT desde la PWA del supervisor.
                        </div>
                    )}

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
                        <TabTareas
                            tareas={tareas} setTareas={setTareas} actualizarTarea={actualizarTarea}
                            agregarTarea={agregarTarea} eliminarTarea={eliminarTarea}
                            tareaExpandida={tareaExpandida} setTareaExpandida={setTareaExpandida}
                            puestosDB={puestosDB} recursos={recursos}
                            soloLecturaPlanificacion={soloLecturaPlanificacion} setTabActiva={setTabActiva}
                        />
                    )}

                    {/* 2 · EQUIPOS Y MATERIALES */}
                    {tabActiva === 'componentes' && (
                        <TabEquiposMateriales
                            componentes={componentes} componentesDB={componentesDB}
                            actualizarComponente={actualizarComponente} agregarComponente={agregarComponente}
                            eliminarComponente={eliminarComponente} disponibilidadEquipo={disponibilidadEquipo}
                            soloLecturaPlanificacion={soloLecturaPlanificacion} setTabActiva={setTabActiva}
                        />
                    )}

                    {/* 3 · SUMINISTROS DIRECTOS */}
                    {tabActiva === 'Logistica' && (
                        <TabSuministrosDirectos
                            logistica={logistica} suministrosDB={suministrosDB}
                            actualizarLogistica={actualizarLogistica} agregarLogistica={agregarLogistica}
                            eliminarLogistica={eliminarLogistica} disponibilidadSuministro={disponibilidadSuministro}
                            soloLecturaPlanificacion={soloLecturaPlanificacion}
                            puedeTerminarPlanificacion={puedeTerminarPlanificacion}
                            todasTareasCompletas={todasTareasCompletas}
                            equiposHerramientasConCosto={equiposHerramientasConCosto}
                            informeEvaluacion={informeEvaluacion} guardarPlanificacion={guardarPlanificacion}
                            navigate={navigate} otIdParaOC={otSeleccionada._id || datosRecibidos?._id}
                        />
                    )}

                    {/* 4 · COTIZACIÓN */}
                    {tabActiva === 'cotizacion' && (
                        <div style={{ padding: 16 }}>
                        {bloqueoCotizacion ? (
                            // Se muestra SOLO este recuadro, sin el resto de la pestaña (desglose,
                            // envío) — para que quede claro que es un paso obligatorio y no un aviso
                            // más al lado de una cotización que en realidad todavía no se puede ver.
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fbeceb', border: `1px solid ${t.rojo}`, borderRadius: 2 }}>
                                <span style={{ fontSize: 12, color: t.textoPrincipal }}>{bloqueoCotizacion.mensaje}</span>
                                <button onClick={bloqueoCotizacion.accion} style={{ ...styles.btnPrimario, flex: 'none' }}>{bloqueoCotizacion.boton}</button>
                            </div>
                        ) : (
                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {otSeleccionada.cotizacion?.enviada && otSeleccionada.cotizacion?.respuestaCliente === 'Pendiente' && (
                            <div style={{
                                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 2,
                                background: cotizacionVencida(otSeleccionada) ? '#fbeceb' : '#fdf3e7',
                                border: `1px solid ${cotizacionVencida(otSeleccionada) ? t.rojo : t.bordeZona}`,
                            }}>
                                <span style={{ fontSize: 12, color: t.textoPrincipal }}>
                                    {cotizacionVencida(otSeleccionada)
                                        ? 'La cotización venció (pasaron 12 h) — el cliente ya no puede aprobarla. Cancela y reenvía si sigue vigente.'
                                        : `Esperando respuesta del cliente — vence en ${(() => {
                                            const h = horasRestantesAprobacion(otSeleccionada);
                                            return h == null ? '—' : `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;
                                        })()}.`}
                                </span>
                                <button onClick={cancelarAceptacion} style={{ ...styles.btnSecundario, flex: 'none' }}>Cancelar aceptación</button>
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

                            {/* Desglose completo: qué se hace, con qué, cómo y cuándo — la cotización
                                es la culminación de la planificación, así que le sirve tanto al
                                cliente (qué está aprobando) como al planificador (revisar que todo
                                concuerde con lo que se va a ejecutar) antes de enviarla. */}
                            {tareas.length > 0 && (
                                <div style={{ marginTop: 20, overflowX: 'auto', background: '#fff' }}>
                                    <div style={styles.tituloSub}>Tareas — qué, con quién, cuándo y cómo</div>
                                    <table style={{ borderCollapse: 'collapse', fontSize: 10.5, width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th style={styles.thGantt}>Tarea</th><th style={styles.thGantt}>Puesto</th>
                                                <th style={styles.thGantt}>Responsables</th><th style={styles.thGantt}>Fecha</th>
                                                <th style={styles.thGantt}>Hora</th><th style={{ ...styles.thGantt, textAlign: 'right' }}>Hrs</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tareas.map((tt, idx) => (
                                                <React.Fragment key={tt._id || tt.id || idx}>
                                                    <tr>
                                                        <td style={styles.tdGantt}>{tt.descripcion || '—'}</td>
                                                        <td style={styles.tdGantt}>{tt.puesto || '—'}</td>
                                                        <td style={styles.tdGantt}>{(tt.operarioNombre || []).join(', ') || '—'}</td>
                                                        <td style={styles.tdGantt}>{tt.fecha ? fmtFecha(tt.fecha) : '—'}</td>
                                                        <td style={styles.tdGantt}>{tt.hora || '—'}</td>
                                                        <td style={{ ...styles.tdGantt, textAlign: 'right' }}>{tt.duracion || 0}</td>
                                                    </tr>
                                                    {(tt.desarrollo || '').trim() && (
                                                        <tr>
                                                            <td colSpan={6} style={{ ...styles.tdGantt, color: t.textoSecundario2, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                                                                Metodología: {tt.desarrollo}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {componentes.length > 0 && (
                                <div style={{ marginTop: 20, overflowX: 'auto', background: '#fff' }}>
                                    <div style={styles.tituloSub}>Con qué — Equipos y materiales</div>
                                    <table style={{ borderCollapse: 'collapse', fontSize: 10.5, width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th style={styles.thGantt}>Descripción</th><th style={styles.thGantt}>Tipo</th>
                                                <th style={{ ...styles.thGantt, textAlign: 'right' }}>Cant.</th>
                                                <th style={{ ...styles.thGantt, textAlign: 'right' }}>Unitario</th>
                                                <th style={{ ...styles.thGantt, textAlign: 'right' }}>Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {componentes.map((c, idx) => (
                                                <tr key={c._id || c.id || idx}>
                                                    <td style={styles.tdGantt}>{c.descripcion || '—'}</td>
                                                    <td style={styles.tdGantt}>{c.tipo || '—'}</td>
                                                    <td style={{ ...styles.tdGantt, textAlign: 'right' }}>{c.cantidad || 0}</td>
                                                    <td style={{ ...styles.tdGantt, textAlign: 'right' }}>{CLP(c.precio || 0)}</td>
                                                    <td style={{ ...styles.tdGantt, textAlign: 'right' }}>{CLP((Number(c.cantidad) || 0) * (Number(c.precio) || 0))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {logistica.length > 0 && (
                                <div style={{ marginTop: 20, overflowX: 'auto', background: '#fff' }}>
                                    <div style={styles.tituloSub}>Suministros directos</div>
                                    <table style={{ borderCollapse: 'collapse', fontSize: 10.5, width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th style={styles.thGantt}>Descripción</th>
                                                <th style={{ ...styles.thGantt, textAlign: 'right' }}>Cant.</th>
                                                <th style={{ ...styles.thGantt, textAlign: 'right' }}>Unitario</th>
                                                <th style={{ ...styles.thGantt, textAlign: 'right' }}>Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logistica.map((l, idx) => (
                                                <tr key={l._id || l.id || idx}>
                                                    <td style={styles.tdGantt}>{l.descripcion || '—'}</td>
                                                    <td style={{ ...styles.tdGantt, textAlign: 'right' }}>{l.cantidad || 0}</td>
                                                    <td style={{ ...styles.tdGantt, textAlign: 'right' }}>{CLP(l.precio || 0)}</td>
                                                    <td style={{ ...styles.tdGantt, textAlign: 'right' }}>{CLP((Number(l.cantidad) || 0) * (Number(l.precio) || 0))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

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
                            <button
                                onClick={enviarCotizacionWhatsApp}
                                disabled={!otSeleccionada.cotizacion?.capacidadVerificada || enviandoWhatsApp}
                                title={otSeleccionada.cotizacion?.capacidadVerificada ? '' : 'Verifica la capacidad en Programación antes de enviar'}
                                style={{ ...styles.btnSecundario, width: '100%', marginTop: 6, opacity: (otSeleccionada.cotizacion?.capacidadVerificada && !enviandoWhatsApp) ? 1 : .5 }}
                            >{enviandoWhatsApp ? 'Generando link…' : 'Enviar cotización por WhatsApp'}</button>
                            {otSeleccionada.estado === 'Planificada' && (
                                <button
                                    onClick={volverAPlanificacion}
                                    style={{ ...styles.btnSecundario, width: '100%', marginTop: 10, color: t.rojo }}
                                    title="Corrige tareas, equipos o suministros sin esperar una reprogramación desde terreno"
                                >Cancelar y volver a planificación</button>
                            )}
                            <div style={{ fontSize: 10.5, color: t.textoAtenuado3, marginTop: 9, lineHeight: 1.5 }}>Las cotizaciones ya emitidas se siguen viendo con su formato original.</div>
                        </div>
                        </div>
                        )}
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
                        <TabPago
                            pago={pago} setPago={setPago} granTotal={granTotal}
                            guardarPago={guardarPago} anularPago={anularPago} restaurarPago={restaurarPago}
                        />
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
                                                // Reenvío tras reprogramar: si el cliente ya la había
                                                // aprobado/rechazado antes, hay que volver a dejarla
                                                // 'Pendiente' — si no, aplicarRespuestaCotizacion la
                                                // rechaza con 409 "ya fue respondida" y el cliente no
                                                // puede aprobar la fecha nueva desde la app.
                                                'cotizacion.respuestaCliente': 'Pendiente',
                                                'cotizacion.fechaRespuesta': null,
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

export default TratamientoScreen;
