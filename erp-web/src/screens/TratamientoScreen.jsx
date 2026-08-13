import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import useIsMobile from '../hooks/useIsMobile';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const TratamientoScreen = ({ cargarDatos, API, actualizarOtGlobal, recursos = [],
    componentes: componentesDB = [],
    suministros: suministrosDB = [],
    otSeleccionada: otDelPadre,
    setOtSeleccionada: setOtPadre,
    puestosDB: puestosDB = [],
    enviarASupervisor,
    plantillas = [],
    logistica: logisticaDB = [] }) => {
    const isMobile = useIsMobile();
    const { state: datosRecibidos } = useLocation();
    const navigate = useNavigate();
    const inicializado = useRef(false);
    const [tabActiva, setTabActiva] = useState('tareas');
    const [otSeleccionada, setOtSeleccionada] = useState(datosRecibidos || {});
    const [tareas, setTareas] = useState([]);
    const [componentes, setComponentes] = useState([]);
    const [cotizacion, setCotizacion] = useState({
        materiales: [], equipos: [], manoObra: [], lineaMando: [],
        insumos: [], logistica: { alimentacion: 0, traslado: 0, examenes: 0, banos: 0 }
    });

    const [isModalEnvioOpen, setIsModalEnvioOpen] = useState(false);
    const [emailsEnvio, setEmailsEnvio] = useState([]);
    const [nuevoEmail, setNuevoEmail] = useState('');
    const [suministros, setSuministros] = useState([]);
    const [modalPlantilla, setModalPlantilla] = useState(false);
    const [plantillaPreview, setPlantillaPreview] = useState(null);
    const [pago, setPago] = useState(() => {
        const p = datosRecibidos?.pago;
        return p || { estado: 'Pendiente', montoPagado: 0, fechaPago: '', metodoPago: 'Transferencia', referencia: '', notas: '' };
    });
    const manejarGuardadoFinal = async () => {
        try {
            const otParaGuardar = {
                ...otSeleccionada,
                solicitudId: otSeleccionada.solicitudId || otSeleccionada._id,
                tareas: tareas,
                componentes: componentes,
                cotizacion: cotizacion,
                pago: pago,
            };

            const resultado = await actualizarOtGlobal(otSeleccionada._id, otParaGuardar);

            if (resultado && resultado.exito) {
                // 1. Extraemos la OT numerada que viene del Backend
                const otNumerada = resultado.otActualizada;

                // 2. Actualizamos el estado de la OT (Esto pone el número en el <h2>)
                setOtSeleccionada(otNumerada);

                // 3. Opcional: Si el backend hizo algún ajuste en las tareas (como poner IDs), las actualizamos
                if (otNumerada.tareas) setTareas(otNumerada.tareas);
                if (otNumerada.pago) setPago(otNumerada.pago);

                alert(`✅ Guardado con éxito. OT #${otNumerada.numeroOT}`);
            }
        } catch (err) {
            console.error("Error en el cliente:", err);
        }
    };
    const handleGuardarCambios = async () => {
        // 1. Usamos 'datosRecibidos', que es como llamaste al state de useLocation()
        const otEditada = {
            ...datosRecibidos, // <-- CORREGIDO
            tareas: tareas,
            componentes: componentes, // Asegúrate de incluir estos si los tienes
            logistica: logistica,
            estado: 'Tratada'
        };

        // 2. Llamamos a la función usando el ID de 'datosRecibidos'
        // Además, asegúrate de que el nombre sea 'actualizarOtGlobal' (como lo recibes en props)
        const exito = await actualizarOtGlobal(datosRecibidos._id, otEditada); // <-- CORREGIDO

        if (exito) {
            alert("¡Cambios guardados con éxito!");
        } else {
            alert("Error al guardar en el servidor");
        }
    };
    const actualizarTarea = (index, campo, valor) => {
        setTareas(tareas.map((t, i) =>
            i === index
                ? {
                    ...t,
                    [campo]: (campo === 'duracion' || campo === 'valorHora') ? Number(valor) : valor
                }
                : t
        ));
    };
    const agregarComponente = () => {
        setComponentes([
            ...componentes,
            { id: Date.now(), codigo: '', descripcion: '', cantidad: 1, precio: 0 }
        ]);
    };
    const actualizarComponente = (index, campo, valor) => {
        // 🚩 IMPORTANTE: Usamos 'prev' para que las actualizaciones no se pisen
        setComponentes(prev => {
            return prev.map((c, i) => {
                if (i === index) {
                    return {
                        ...c,
                        [campo]: (campo === 'cantidad' || campo === 'precio')
                            ? parseFloat(valor || 0)
                            : valor,
                    };
                }
                return c;
            });
        });
    };
    const agregarItemCotizacion = (tipo) => {
        const nuevoItem = { id: Date.now(), descripcion: '', cantidad: 1, unitario: 0 };
        setCotizacion({ ...cotizacion, [tipo]: [...cotizacion[tipo], nuevoItem] });
    };
    const actualizarItemCotizacion = (tipo, id, campo, valor) => {
        const listaActualizada = cotizacion[tipo].map(item =>
            item._id === id ? { ...item, [campo]: valor } : item
        );
        setCotizacion({ ...cotizacion, [tipo]: listaActualizada });
    };
    const calcularSubtotal = (lista) => lista.reduce((sum, i) => sum + (Number(i.cantidad || 0) * Number(i.unitario || 0)), 0);
    const totalEqui = calcularSubtotal(cotizacion.equipos);
    const totalInsumos = calcularSubtotal(cotizacion.insumos);
    const totalEquipos = componentes.reduce((sum, c) => sum + (c.tipo === 'Equipo' ? Number(c.cantidad * c.precio) : 0), 0);
    const totalHerramientas = componentes.reduce((sum, c) => sum + (c.tipo === 'Herramienta' ? Number(c.cantidad * c.precio) : 0), 0);
    const totalInsumosMateriales = componentes.reduce((sum, c) => sum + (c.tipo === 'Insumo' || c.tipo === 'Material' ? Number(c.cantidad * c.precio) : 0), 0);
    const prepararPayload = () => {
        // Priorizamos el _id de MongoDB Atlas
        const idReal = datosRecibidos?._id || datosRecibidos?._id;

        return {
            solicitudId: idReal,
            otId: idReal,
            // Si ya tiene tareas, es una edición; si no, es una conversión nueva
            esEdicion: !!(datosRecibidos?.tareas && datosRecibidos.tareas.length > 0),

            tareas: tareas,
            componentes: componentes,

            // Unificamos la cotización con la logística independiente
            cotizacionDetalle: {
                ...cotizacion,
                logistica: logistica, // <--- Importante: Incluir tu estado 'logistica'
                totalCalculadoMat: totalMat,
            },

            resumenFinanciero: {
                totalNeto: granTotal,
                iva: granTotal * 0.19,
                totalGeneral: granTotal * 1.19
            },

            fechaGeneracion: new Date().toISOString()
        };
    };
    // 1. Helper para limpiar IDs temporales (Ponlo fuera para evitar el ReferenceError)
    const limpiarIds = (lista) => (lista || []).map(item => {
        const { _id, id, ...resto } = item;
        // Solo conservamos _id si es un ObjectId válido de Mongo (24 caracteres)
        return (String(_id).length === 24) ? { _id, ...resto } : resto;
    });

    const guardarPlanificacion = async (estadoForzado) => {
        const limpiarIds = (lista) => (lista || []).map(item => {
            const { _id, id, ...resto } = item;
            return (String(_id).length === 24) ? { _id, ...resto } : resto;
        });

        const dataCompleta = {
            ...datosRecibidos,
            solicitudId: datosRecibidos.solicitudId || datosRecibidos._id,
            numeroOT: otSeleccionada.numeroOT || datosRecibidos.numeroOT,
            estado: estadoForzado || (['Pendiente','Tratada','Planificada','Programada','En Ejecución','Trabajo Terminado','Con Informe','Pagada'].includes(otSeleccionada?.estado) ? otSeleccionada.estado : 'Tratada'),
            tareas: tareas,
            componentes: limpiarIds(componentes),

            logistica: (logistica || []).map(l => ({
                _id: (String(l._id).length === 24) ? l._id : undefined,
                unidad: l.codigo || l.unidad || '',
                patente: l.patente || '',
                descripcion: l.descripcion || '',
                cantidad: Number(l.cantidad) || 0,
                precio: Number(l.precio) || 0
            })),

            granTotal: granTotal
        };

        try {
            const respuesta = await actualizarOtGlobal(datosRecibidos._id, dataCompleta);

            if (respuesta && respuesta.exito) {
                alert("✅ Planificación guardada.");

                // 🚩 CAMBIO DE LÓGICA AQUÍ:
                if (respuesta.otActualizada) {
                    setOtSeleccionada(respuesta.otActualizada);

                    // Solo actualizamos el estado si el servidor trae datos en logistica
                    // Si viene vacío o undefined, NO lo tocamos para que no se borre lo que escribió el usuario
                    if (respuesta.otActualizada.logistica && respuesta.otActualizada.logistica.length > 0) {
                        setLogistica(respuesta.otActualizada.logistica);
                    }
                }
                // Si cargarDatos es una función que vuelve a pedir todo al servidor, 
                // asegúrate de que el servidor realmente terminó de escribir en el DB.
                if (cargarDatos) await cargarDatos();
            }
        } catch (error) {
            console.error("Error al guardar:", error);
        }
    };
    const finalizarYCotizar = async () => {
        // 1. Validación de seguridad
        if (granTotal === 0) {
            const confirmar = window.confirm("⚠️ La cotización está en $0. ¿Deseas generar el PDF de todas formas?");
            if (!confirmar) return;
        }

        try {
            const payload = prepararPayload();

            // --- 🚀 GUARDADO EN BD ---
            const respuesta = await axios.post(`${API}/ots/convertir-ot`, payload);

            if (respuesta.status === 200 || respuesta.status === 201) {
                /*
                                // A. Registramos el Log (Usamos datosRecibidos._id que es tu fuente de verdad)
                                const idParaLog = datosRecibidos?._id;
                
                                await registrarEvento(
                                    idParaLog,
                                    'En Tratamiento',
                                    'Generación de OT',
                                    'Se completó la planificación de suministros y personal.'
                                );
                */
                // B. Sincronizamos datos globales
                if (typeof cargarDatos === 'function') {
                    await cargarDatos();
                }

                // C. 🚩 CORRECCIÓN CRÍTICA: Cambiamos solicitudSeleccionada por datosRecibidos
                const correoBase = datosRecibidos?.correo || "";
                setEmailsEnvio([correoBase]);
                setIsModalEnvioOpen(true);

                // D. Generar el PDF
                generarPDF();

                console.log("✅ OT Guardada y lista para envío.");
            }
        } catch (error) {
            console.error("❌ Error al finalizar:", error);
            const mensajeError = error.response?.data?.error || "Error al conectar con el servidor.";
            alert(`No se pudo procesar: ${mensajeError}`);
        }
    };

    const agregarTarea = () => {
        const nuevaTarea = {
            id: Date.now(), // ID temporal para el renderizado
            descripcion: '', // String vacío para evitar error de input null
            puesto: '',
            duracion: 0,
            fecha: '',
            hora: '',
            valorHora: 0 // Inicializado en 0 para cálculos
        };

        setTareas([...tareas, nuevaTarea]);
    };
    useEffect(() => {
        const cargarDetalleOT = async () => {
            if (!datosRecibidos?._id) return;

            try {
                const respuesta = await axios.get(`${API}/ots/solicitud/${datosRecibidos._id}`);

                if (respuesta.data) {
                    // ✅ DEFINIMOS 'data' AQUÍ
                    const data = respuesta.data;

                    console.log("-----------------------------------------");
                    console.log("📦 DATOS RECUPERADOS:", data);

                    // Ahora 'data' ya existe y no dará error
                    const encontrados = data.reportes || data.evidencias || data.fotos || [];
                    console.log("📸 Cantidad de reportes hallados:", encontrados.length);
                    console.log("-----------------------------------------");

                    setOtSeleccionada(data);
                    setTareas(data.tareas || []);
                    setComponentes(data.componentes || []);
                    if (data.pago) setPago(data.pago);

                    // Uso de la preferencia guardada: suministros/logistica
                    if (data.logistica && data.logistica.length > 0) {
                        setLogistica(data.logistica);
                    } else {
                        setLogistica([{ id: Date.now(), descripcion: '', cantidad: 1, precio: 0 }]);
                    }

                    setSuministros(data.suministros || []);
                }
            } catch (error) {
                console.error("❌ Error de red:", error.message);
            }
            inicializado.current = true;
        };

        cargarDetalleOT();
    }, [datosRecibidos?._id, API]);

    // Al montar: si datosRecibidos ya es una OT (tiene numeroOT), refrescar desde el servidor
    useEffect(() => {
        const id = datosRecibidos?._id;
        if (!id || !datosRecibidos?.numeroOT) return; // solo si es una OT directa, no una solicitud
        axios.get(`${API}/ots/${id}`)
            .then(({ data }) => {
                setOtSeleccionada(data);
                setTareas(data.tareas || []);
                setComponentes(data.componentes || []);
                if (data.logistica?.length > 0) setLogistica(data.logistica);
                if (data.pago) setPago(data.pago);
            })
            .catch(() => {});
    }, []);

    // Sincronizar estado fresco del backend cada vez que se abre el tab Reportes
    useEffect(() => {
        if (tabActiva !== 'reportes') return;
        const id = otSeleccionada?._id || datosRecibidos?._id;
        if (!id || !API) return;
        axios.get(`${API}/ots/${id}`)
            .then(({ data }) => setOtSeleccionada(data))
            .catch(() => {});
    }, [tabActiva]);

    useEffect(() => {
        const cargarDetalleOT = async () => {
            if (!datosRecibidos?._id) return;

            try {
                const respuesta = await axios.get(`${API}/ots/numero/${data.numeroOT}`); if (res.data) {
                    setOtSeleccionada(res.data);
                    setTareas(res.data.tareas || []);
                    setComponentes(res.data.componentes || []);

                    // 🚩 CORRECCIÓN CRÍTICA:
                    // Si tu tabla usa el estado 'logistica', debes cargar los datos ahí.
                    // Usamos res.data.logistica porque es el nombre que definiste en guardarPlanificacion.
                    if (res.data.logistica && res.data.logistica.length > 0) {
                        setLogistica(res.data.logistica);
                    } else {
                        // Si no hay nada, dejamos el campo inicial para que el usuario pueda escribir
                        setLogistica([{ id: Date.now(), descripcion: '', cantidad: 1, precio: 0 }]);
                    }

                    // Si aún necesitas setSuministros para otra lógica, mantenlo, 
                    // pero 'logistica' es lo que controla tu tabla actual.
                    setSuministros(res.data.suministros || []);
                }
            } catch (error) {
                if (error.response?.status === 404) {
                    console.info("📝 Nueva planificación: Iniciando campos en blanco.");
                    if (!inicializado.current) {
                        setTareas([{ id: Date.now(), descripcion: '', puesto: '', duracion: 0, fecha: '', hora: '', valorHora: 0 }]);
                        // Inicializamos también la logistica/suministros vacía
                        setLogistica([{ id: Date.now(), descripcion: '', cantidad: 1, precio: 0 }]);
                    }
                } else {
                    console.error("❌ Error de red:", error.message);
                }
            }
            inicializado.current = true;
        };
        cargarDetalleOT();
    }, [datosRecibidos?._id, API]);

    const [logistica, setLogistica] = useState([
        { id: Date.now(), descripcion: '', cantidad: 1, precio: 0 }
    ]);
    const agregarLogistica = () => {
        setLogistica([...logistica,
        {
            _id: Date.now().toString(),
            descripcion: '',
            cantidad: 1,
            precio: 0
        }]);
    };
    const actualizarLogistica = (index, campo, valor) => {
        setLogistica(prev => {
            const nueva = [...prev];

            // Convertimos a número solo si el campo es cantidad o precio
            const valorFinal = (campo === 'cantidad' || campo === 'precio')
                ? parseFloat(valor || 0)
                : valor;

            nueva[index] = {
                ...nueva[index],
                [campo]: valorFinal
            };

            return nueva;
        });
    };
    const generarPDF = async () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // 1. Encabezado Principal
        doc.setFontSize(18);
        doc.setTextColor(44, 62, 80);
        doc.text("COTIZACIÓN TÉCNICA Y COMERCIAL", pageWidth / 2, 20, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`OT N°: ${datosRecibidos?.numeroOT || 'N/A'}`, 14, 28);
        doc.text(`Fecha Emisión: ${new Date().toLocaleDateString()}`, pageWidth - 14, 28, { align: 'right' });

        // --- NUEVA SECCIÓN: DATOS DE LA SOLICITUD (CLIENTE Y REQUERIMIENTO) ---
        doc.setDrawColor(200);
        doc.line(14, 32, pageWidth - 14, 32); // Línea divisoria

        doc.setFontSize(11);
        doc.setTextColor(44, 62, 80);
        doc.setFont(undefined, 'bold');
        doc.text("INFORMACIÓN DEL CLIENTE", 14, 38);
        doc.text("DETALLES DEL SERVICIO", pageWidth / 2 + 7, 38);

        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.setFont(undefined, 'normal');

        // Columna Izquierda: Cliente
        doc.text(`Empresa: ${datosRecibidos?.empresaSolicitante || 'Particular'}`, 14, 45);
        doc.text(`Solicitante: ${datosRecibidos?.solicitante || '-'}`, 14, 50);
        doc.text(`Correo: ${datosRecibidos?.correo || '-'}`, 14, 55);
        doc.text(`Teléfono: ${datosRecibidos?.numero || '-'}`, 14, 60);

        // Columna Derecha: Requerimiento
        const col2 = pageWidth / 2 + 7;
        doc.text(`Origen: ${datosRecibidos?.origen || 'WhatsApp'}`, col2, 45);
        doc.text(`Fecha Solicitada: ${datosRecibidos?.fechaEjecucionSolicitada ? new Date(datosRecibidos.fechaEjecucionSolicitada).toLocaleDateString() : 'A convenir'}`, col2, 50);
        doc.text(`Plazo Sugerido: ${datosRecibidos?.plazoEjecucionSugerido || '0'} días`, col2, 55);

        // Descripción con salto de línea automático
        const desc = `Descripción: ${datosRecibidos?.descripcion || 'Sin detalle'}`;
        const splitDesc = doc.splitTextToSize(desc, pageWidth - 28);
        doc.text(splitDesc, 14, 68);

        // Calculamos dónde termina la descripción para mover las tablas
        const startTablesY = 68 + (splitDesc.length * 5) + 5;

        // 2. Tablas de Costos y Suministros
        autoTable(doc, {
            startY: startTablesY,
            head: [['1. MATERIALES / REPUESTOS', 'CANT.', 'SUBTOTAL']],
            body: componentes.map(c => [
                c.descripcion,
                c.cantidad,
                `$ ${(Number(c.cantidad) * Number(c.precio)).toLocaleString()}`
            ]),
            headStyles: { fillColor: [44, 62, 80] }
        });

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 10,
            head: [['2. PLAN DE TRABAJO (SUMINISTROS)', 'PUESTO', 'HRS', 'SUBTOTAL']],
            body: tareas.map(t => [
                t.descripcion,
                t.puesto,
                t.duracion,
                `$ ${(Number(t.duracion) * Number(t.valorHora) * (t.operarioId?.length || 1)).toLocaleString()}`
            ]),
            headStyles: { fillColor: [52, 73, 94] }
        });

        // 3. Gantt (Captura de imagen)
        const finalYPlan = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(12);
        doc.setTextColor(44, 62, 80);
        doc.text("3. CRONOGRAMA DE EJECUCIÓN (GANTT)", 14, finalYPlan);

        const ganttElement = document.getElementById('seccion-gantt-visual');
        let nextY = finalYPlan + 10;

        if (ganttElement) {
            const canvas = await html2canvas(ganttElement, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pageWidth - 28;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            // Verificar si la imagen cabe en la página actual, si no, añadir página
            if (finalYPlan + imgHeight > 270) {
                doc.addPage();
                doc.addImage(imgData, 'PNG', 14, 20, imgWidth, imgHeight);
                nextY = 20 + imgHeight + 15;
            } else {
                doc.addImage(imgData, 'PNG', 14, finalYPlan + 5, imgWidth, imgHeight);
                nextY = finalYPlan + imgHeight + 15;
            }
        }

        // 4. Suministros de Traslado (Logística)
        autoTable(doc, {
            startY: nextY,
            head: [['4. TRASLADOS Y OTROS SUMINISTROS', 'SUBTOTAL']],
            body: logistica.map(l => [
                l.descripcion,
                `$ ${(Number(l.cantidad) * Number(l.precio)).toLocaleString()}`
            ]),
            headStyles: { fillColor: [127, 140, 141] }
        });

        // 5. Totales Finales
        const resY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text(`TOTAL NETO: $ ${granTotal.toLocaleString()}`, pageWidth - 15, resY, { align: 'right' });
        doc.text(`IVA (19%): $ ${(granTotal * 0.19).toLocaleString()}`, pageWidth - 15, resY + 7, { align: 'right' });
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.text(`TOTAL BRUTO: $ ${(granTotal * 1.19).toLocaleString()}`, pageWidth - 15, resY + 15, { align: 'right' });

        // 6. Guardar Documento
        doc.save(`Cotizacion_OT_${datosRecibidos?._id || 'nueva'}.pdf`);
        return doc;
    };

    // --- 1. Primero calculamos los subtotales independientes ---
    // --- CÁLCULOS DINÁMICOS (Deben estar antes de usarse en granTotal) ---

    // 1. Total de la pestaña Componentes (La fuente de verdad para materiales)
    const totalMat = componentes.reduce((sum, c) =>
        sum + (Number(c.cantidad || 0) * Number(c.precio || 0)), 0);

    // 2. Totales de las tablas de Mano de Obra en la pestaña Cotización
    const totalMO = (cotizacion.manoObra || []).reduce((sum, i) =>
        sum + (Number(i.cantidad || 0) * Number(i.unitario || 0)), 0);

    const totalMando = (cotizacion.lineaMando || []).reduce((sum, i) =>
        sum + (Number(i.cantidad || 0) * Number(i.unitario || 0)), 0);

    // 3. Logística
    const totalLog = Object.values(cotizacion.logistica || {}).reduce((a, b) =>
        a + Number(b || 0), 0);

    // 4. Gran Total Unificado
    // --- CALCULOS CONSOLIDADOS ---
    const totalMateriales = componentes.reduce((sum, c) => sum + (Number(c.cantidad) * Number(c.precio) || 0), 0);
    const totalManoObra = tareas.reduce((sum, t) => sum + (Number(t.duracion) * Number(t.valorHora) || 0), 0);

    // Nuevo cálculo para Logística
    const totalLogisticaFinal = logistica.reduce((sum, l) => sum + (Number(l.cantidad) * Number(l.precio) || 0), 0);
    const totalManoObraTareas = tareas.reduce((sum, t) =>
        sum + (Number(t.duracion || 0) * Number(t.valorHora || 0)), 0);

    // Actualizamos el granTotal incluyendo este nuevo valor
    const granTotal = totalMateriales + totalManoObra + totalLogisticaFinal;

    // 1. Extraer días únicos de las tareas para las columnas
    const diasPlanificados = (() => {
        // 1. Filtrar tareas con fecha y obtener sus valores en milisegundos
        const tareasConFecha = tareas.filter(t => t.fecha);
        if (tareasConFecha.length === 0) return [];

        const fechasEnMs = tareasConFecha.map(t => new Date(t.fecha).getTime());

        // 2. Obtener el rango: del primer día al último día
        const inicioMs = Math.min(...fechasEnMs);
        const finMs = Math.max(...fechasEnMs);

        const listaCompleta = [];
        let fechaActual = new Date(inicioMs);
        const fechaFin = new Date(finMs);

        // 3. Bucle para llenar todos los días intermedios
        // Usamos un loop que suma 1 día en cada iteración
        while (fechaActual <= fechaFin) {
            // Aseguramos formato YYYY-MM-DD para que el .map de la tabla lo encuentre
            const isoStr = fechaActual.toISOString().split('T')[0];
            listaCompleta.push(isoStr);

            // Sumar un día
            fechaActual.setDate(fechaActual.getDate() + 1);
        }

        return listaCompleta;
    })();
    // 2. Función para formatear la fecha (ej: "09 ene")
    const formatearFechaGantt = (fechaStr) => {
        if (!fechaStr) return '';
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const [, mm, dd] = fechaStr.split('-');
        return `${dd} ${meses[parseInt(mm) - 1]}`;
    };

    // Ejemplo de cómo estructurar las funciones de eliminación
    const eliminarTarea = (index) => {
        // Usamos setTareas (que es tu estado local) en lugar de ot.tareas
        setTareas(prevTareas => prevTareas.filter((_, i) => i !== index));
    };
    // HAZ LO MISMO PARA COMPONENTES SI ES NECESARIO:
    const eliminarComponente = (index) => {
        setComponentes(prev => prev.filter((_, i) => i !== index));
    };
    const eliminarLogistica = (index) => {
        // 1. Usamos la variable 'logistica' directamente (que es tu estado actual)
        // No 'ot.logistica', para evitar que si 'ot' es nulo, la app falle.
        const nuevaLog = logistica.filter((_, i) => i !== index);

        // 2. Actualizamos el estado que controla la tabla
        setLogistica(nuevaLog);

        // 3. (Opcional) Si también necesitas actualizar el objeto 'ot' principal:
        if (otSeleccionada) {
            setOtSeleccionada({ ...otSeleccionada, logistica: nuevaLog });
        }
    };

    if (!datosRecibidos) return <div style={{ padding: '50px' }}>⚠️ No hay datos.</div>;
    useEffect(() => {
        if (logisticaDB && logisticaDB.length > 0) {
        }
    }, [logisticaDB, suministrosDB]);
    const abrirModalEnvio = (solicitud) => {
        // Iniciamos la lista con el correo que ya tiene la solicitud
        setEmailsEnvio([solicitud.correo]);
        setIsModalEnvioOpen(true);
    };

    const aplicarPlantilla = (plantilla) => {
        const confirmar = tareas.length > 0 || componentes.length > 0
            ? window.confirm(`¿Aplicar la plantilla "${plantilla.nombre}"? Se agregarán sus tareas y materiales a los existentes.`)
            : true;
        if (!confirmar) return;

        // Tareas de la plantilla sin fecha/hora/operario (los completa el usuario)
        const tareasNuevas = (plantilla.tareas || []).map(t => ({
            descripcion: t.descripcion || '',
            puesto: t.puesto || '',
            duracion: t.duracion || 0,
            fecha: '',
            hora: '',
            operarioId: [],
            operarioNombre: []
        }));

        setTareas(prev => [...prev, ...tareasNuevas]);
        setComponentes(prev => [...prev, ...(plantilla.componentes || [])]);
        setLogistica(prev => [...prev, ...(plantilla.logistica || [])]);

        setModalPlantilla(false);
        setPlantillaPreview(null);
        alert(`✅ Plantilla "${plantilla.nombre}" aplicada. Ahora asigna fechas, horarios y responsables a las tareas.`);
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
        const reportesActualizados = otSeleccionada.reportes.map((r, i) =>
            i === reporteEditIdx ? { ...r, comentario: reporteEditData.comentario, foto: reporteEditData.foto } : r
        );
        try {
            const { data } = await axios.put(`${API}/ots/${id}`, { reportes: reportesActualizados });
            setOtSeleccionada(prev => ({ ...prev, reportes: reportesActualizados }));
            setReporteEditIdx(null);
            if (cargarDatos) cargarDatos();
        } catch (e) { alert('Error al guardar: ' + e.message); }
    };

    const anularReporte = async (idx) => {
        if (!window.confirm('¿Anular este reporte?')) return;
        const id = otSeleccionada._id;
        const reportesActualizados = otSeleccionada.reportes.map((r, i) =>
            i === idx ? { ...r, anulado: true } : r
        );
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
        const reportesActualizados = otSeleccionada.reportes.map((r, i) =>
            i === idx ? { ...r, anulado: false } : r
        );
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
            alert('✅ Información de pago guardada');
        } catch (e) {
            alert('Error al guardar pago: ' + e.message);
        }
    };

    const anularPago = async () => {
        const motivo = window.prompt('Motivo de anulación (opcional):') ?? '';
        if (motivo === null) return;
        try {
            const id = otSeleccionada?._id || datosRecibidos?._id;
            if (!id) return;
            const pagoAnulado = {
                ...pago,
                anulado: true,
                fechaAnulacion: new Date().toISOString().slice(0, 10),
                motivoAnulacion: motivo
            };
            // Revertir OT de 'Pagada' a 'Con Informe'
            const nuevoEstadoOT = otSeleccionada.estado === 'Pagada' ? 'Con Informe' : otSeleccionada.estado;
            await axios.put(`${API}/ots/${id}`, { pago: pagoAnulado, estado: nuevoEstadoOT });
            setOtSeleccionada(prev => ({ ...prev, pago: pagoAnulado, estado: nuevoEstadoOT }));
            setPago(pagoAnulado);
            if (cargarDatos) cargarDatos();
        } catch (e) {
            alert('Error al anular pago: ' + e.message);
        }
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
        } catch (e) {
            alert('Error al restaurar pago: ' + e.message);
        }
    };

    const recargarOT = async () => {
        try {
            const id = otSeleccionada?._id || datosRecibidos?._id;
            if (!id) return;
            const { data } = await axios.get(`${API}/ots/${id}`);
            setOtSeleccionada(data);
            if (cargarDatos) await cargarDatos();
        } catch (e) {
            alert('Error al actualizar: ' + e.message);
        }
    };

    const notificarSupervisor = async () => {
        try {
            const otId = otSeleccionada?._id || datosRecibidos?._id;

            // Buscar supervisor (primer operario con email o teléfono)
            const ids = [...new Set(tareas.flatMap(t => Array.isArray(t.operarioId) ? t.operarioId : [t.operarioId]).filter(Boolean))];
            const recurso = recursos.find(r => ids.map(String).includes(String(r._id)) && (r.email || r.telefono));

            let supervisorEmail = recurso?.email || '';
            const supervisorNombre = recurso?.nombre || 'Supervisor';
            const telefono = recurso?.telefono;

            if (!supervisorEmail) {
                supervisorEmail = window.prompt(`Sin email registrado para ${supervisorNombre}.\nIngresa el email del supervisor:`);
                if (!supervisorEmail) return;
            }

            // Validación final antes de enviar
            const emailFinal = supervisorEmail.trim();
            if (!emailFinal || !emailFinal.includes('@')) {
                alert('Ingresa un email válido para el supervisor.');
                return;
            }

            // Llamar al endpoint que genera PDF + envía email + genera token
            const { data } = await axios.post(`${API}/ots/${otId}/enviar-supervisor`, {
                supervisorEmail: emailFinal,
                supervisorNombre
            });
            const link = data.link;

            // Abrir WhatsApp con resumen + link
            const tareasTexto = tareas.map(t =>
                `  • ${t.descripcion}${t.fecha ? ` — ${t.fecha}` : ''}${t.hora ? ` ${t.hora}` : ''}${t.operarioNombre?.length ? ` (${[].concat(t.operarioNombre).join(', ')})` : ''}`
            ).join('\n');

            const resumen = [
                `*ORDEN DE TRABAJO: ${otSeleccionada?.numeroOT || ''}*`,
                `Cliente: ${otSeleccionada?.solicitante || ''}`,
                `Descripción: ${otSeleccionada?.descripcion || ''}`,
                ``,
                `*Tareas programadas:*`,
                tareasTexto || '  Sin tareas',
                ``,
                `📧 Se te envió el PDF completo a ${supervisorEmail}`,
                ``,
                `Para confirmar inicio del trabajo toca el link:`,
                link
            ].join('\n');

            const msg = encodeURIComponent(resumen);
            if (telefono) {
                window.open(`https://wa.me/${telefono}?text=${msg}`, '_blank');
            } else {
                const num = window.prompt(`Sin teléfono registrado para ${supervisorNombre}.\nIngresa el número (ej: 56912345678):`);
                if (num) window.open(`https://wa.me/${num.trim()}?text=${msg}`, '_blank');
            }
        } catch (e) {
            alert('Error al enviar al supervisor: ' + e.message);
        }
    };

    const manejarCambioEvidencia = (idx, campo, valor) => {
        const nuevasTareas = [...tareas];
        nuevasTareas[idx] = { ...nuevasTareas[idx], [campo]: valor };
        setTareas(nuevasTareas);
    };

    const capturarFoto = (idx, archivo) => {
        if (!archivo) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            manejarCambioEvidencia(idx, 'fotoEvidencia', reader.result);
            alert("📸 Foto cargada correctamente");
        };
        reader.readAsDataURL(archivo);
    };

    // Pipeline de estados de la OT (solo visual, el sistema avanza automáticamente)
    const PIPELINE = [
        { key: 'Tratada',           label: 'Tratamiento',  color: '#e67e22' },
        { key: 'Planificada',       label: 'Planificada',  color: '#3498db' },
        { key: 'Programada',        label: 'Programada',   color: '#8e44ad' },
        { key: 'En Ejecución',      label: 'En Ejecución', color: '#f39c12' },
        { key: 'Trabajo Terminado', label: 'Terminado',    color: '#16a085' },
        { key: 'Con Informe',       label: 'Con Informe',  color: '#27ae60' },
        { key: 'Pagada',            label: 'Pagada',       color: '#2ecc71' },
    ];
    const idxActual = PIPELINE.findIndex(e => e.key === otSeleccionada?.estado);

    return (
        <div style={styles.container}>
            <div style={styles.cardFull}>
                <div style={styles.header}>
                    <div>
                        <div className="mb-4 p-3 border-start border-4 border-primary bg-light">
                            <h2 className="mb-0">
                                {otSeleccionada?.numeroOT ? (
                                    <span className="text-primary">Orden de Trabajo: {otSeleccionada.numeroOT}</span>
                                ) : (
                                    <span className="text-muted italic">Nueva Planificación</span>
                                )}
                            </h2>
                            <small className="text-secondary">
                                Referencia Solicitud: {datosRecibidos?.numeroOT || datosRecibidos?._id?.slice(-8)}
                            </small>
                        </div>
                        <p>Cliente: <strong>{otSeleccionada.solicitante || otSeleccionada.cliente}</strong></p>
                    </div>
                </div>
                {/* BARRA DE PROGRESO DE ESTADO (solo visual) */}
                {otSeleccionada?._id && (() => {
                    const estaCerrada = otSeleccionada?.estado === 'Pagada';
                    return (
                        <>
                            {estaCerrada && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    background: '#d4edda', border: '1px solid #c3e6cb',
                                    borderRadius: '8px', padding: '8px 16px', marginBottom: '10px'
                                }}>
                                    <span style={{ fontSize: '18px' }}>✅</span>
                                    <span style={{ fontWeight: 'bold', color: '#155724', fontSize: '14px' }}>
                                        OT CERRADA — Completamente Pagada
                                    </span>
                                </div>
                            )}
                            <div style={{
                                display: 'flex', alignItems: 'center',
                                margin: '10px 0 16px', overflowX: 'auto', paddingBottom: '4px', gap: '0'
                            }}>
                                {PIPELINE.map((etapa, idx) => {
                                    const esPasada = estaCerrada ? true : idx < idxActual;
                                    const esActual = estaCerrada ? false : idx === idxActual;
                                    return (
                                        <React.Fragment key={etapa.key}>
                                            <div style={{
                                                padding: '5px 12px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: esActual ? 'bold' : 'normal',
                                                whiteSpace: 'nowrap',
                                                backgroundColor: esActual ? etapa.color : esPasada ? etapa.color + '25' : '#f5f5f5',
                                                color: esActual ? 'white' : esPasada ? etapa.color : '#ccc',
                                                boxShadow: esActual ? `0 2px 6px ${etapa.color}55` : 'none',
                                            }}>
                                                {esPasada ? '✓ ' : ''}{etapa.label}
                                            </div>
                                            {idx < PIPELINE.length - 1 && (
                                                <div style={{
                                                    width: '16px', height: '2px', flexShrink: 0,
                                                    backgroundColor: esPasada ? etapa.color + '40' : '#e8e8e8'
                                                }} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </>
                    );
                })()}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={styles.tabBar}>
                        <button onClick={() => setTabActiva('tareas')} style={tabActiva === 'tareas' ? styles.tabBtnActive : styles.tabBtn}>1. Tareas</button>
                        <button onClick={() => setTabActiva('componentes')} style={tabActiva === 'componentes' ? styles.tabBtnActive : styles.tabBtn}>2. Equipos/Herramientas</button>
                        <button onClick={() => setTabActiva('Logistica')} style={tabActiva === 'Logistica' ? styles.tabBtnActive : styles.tabBtn}>3. Suministros Directos</button>
                        <button onClick={() => setTabActiva('cotizacion')} style={tabActiva === 'cotizacion' ? styles.tabBtnActive : styles.tabBtn}>4. Cotización</button>
                        {(() => {
                            const puedeEjecucion = ['Programada','En Ejecución','Trabajo Terminado','Con Informe','Pagada'].includes(otSeleccionada.estado);
                            return (
                                <button
                                    onClick={() => puedeEjecucion && setTabActiva('reportes')}
                                    title={puedeEjecucion ? '' : 'Disponible una vez que la OT esté Programada'}
                                    style={{
                                        ...styles.tabBtn,
                                        backgroundColor: tabActiva === 'reportes' ? '#27ae60' : (puedeEjecucion ? '#eee' : '#f5f5f5'),
                                        color: puedeEjecucion ? '#333' : '#bbb',
                                        cursor: puedeEjecucion ? 'pointer' : 'not-allowed',
                                        opacity: puedeEjecucion ? 1 : 0.6
                                    }}
                                >
                                    🔧 En Ejecución ({otSeleccionada.reportes?.length || 0})
                                </button>
                            );
                        })()}
                        <button
                            onClick={() => setTabActiva('pago')}
                            style={{
                                ...styles.tabBtn,
                                backgroundColor: tabActiva === 'pago' ? '#16a085' : '#eee',
                                color: tabActiva === 'pago' ? 'white' : '#333'
                            }}
                        >
                            💵 Pago
                        </button>
                        <button
                            onClick={() => navigate('/gantt')}
                            style={{
                                ...styles.tabBtn,
                                backgroundColor: '#2c3e50',
                                color: 'white',
                                fontWeight: 'bold'
                            }}
                        >
                            📅 Programar
                        </button>
                    </div>
                    <button
                        onClick={() => setModalPlantilla(true)}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#8e44ad',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '13px',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        📋 Cargar Plantilla
                    </button>
                </div>
                <div style={styles.content}>
                    {/* VISTA 1: TAREAS */}
                    {tabActiva === 'tareas' && (
                        <div>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa' }}>
                                        <th>Descripción</th>
                                        <th>Puesto</th>
                                        <th>Responsable</th>
                                        <th>Hrs</th>
                                        <th>Fecha Inicio</th>
                                        <th>Hora Inicio</th>
                                        <th>$/Hora</th>
                                        <th>Subtotal</th>
                                        <th style={{ width: '50px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tareas.map((t, idx) => (
                                        <tr key={t._id || t.id || `tarea-${idx}`}>
                                            {/* ... celda descripción ... */}
                                            <td><input style={styles.inputTable} value={t.descripcion} onChange={(e) => actualizarTarea(idx, 'descripcion', e.target.value)} /></td>
                                            <td>
                                                <select
                                                    style={styles.inputTable}
                                                    value={t.puesto}
                                                    onChange={(e) => {
                                                        const nombreSeleccionado = e.target.value;
                                                        const puestoEncontrado = puestosDB.find(p => p.nombre === nombreSeleccionado);

                                                        // Creamos el objeto con los nuevos datos
                                                        const nuevosDatos = { puesto: nombreSeleccionado };
                                                        if (puestoEncontrado) {
                                                            nuevosDatos.valorHora = puestoEncontrado.costoHora;
                                                        }

                                                        // Actualizamos la tarea de una sola vez enviando un objeto
                                                        // Nota: Esto requiere que tu función actualizarTarea soporte recibir un objeto
                                                        setTareas(prev => prev.map((tarea, i) =>
                                                            i === idx ? { ...tarea, ...nuevosDatos } : tarea
                                                        ));
                                                    }}
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    {puestosDB && puestosDB.map((p) => (
                                                        <option key={p._id} value={p.nombre}>
                                                            {p.nombre}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            {/* NUEVA CELDA: RESPONSABLE */}
                                            <td>
                                                <div
                                                    style={styles.inputCeldaLimpia}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Backspace' && (t.operarioId || []).length > 0) {
                                                            const nuevosIds = t.operarioId.slice(0, -1);
                                                            const nuevosNombres = (t.operarioNombre || []).slice(0, -1);

                                                            setTareas(prev => prev.map((tarea, i) =>
                                                                i === idx ? { ...tarea, operarioId: nuevosIds, operarioNombre: nuevosNombres } : tarea
                                                            ));
                                                        }
                                                    }}
                                                    // Evita que el doble clic dispare eventos que causen el crash
                                                    onDoubleClick={(e) => e.stopPropagation()}
                                                    tabIndex="0"
                                                >
                                                    <div style={styles.nombresWrapper}>
                                                        {Array.isArray(t.operarioId) && t.operarioId.length > 0 ? (
                                                            t.operarioId.map((id, opIdx) => {
                                                                const recurso = recursos.find(r => String(r._id) === String(id));
                                                                // Filtramos para que si el nombre es "Sin asignar", no rompa la estética
                                                                const nombre = recurso ? recurso.nombre : "Cargando...";

                                                                // Si por error el nombre es "Sin asignar", no renderizamos este span
                                                                if (nombre === "Sin asignar") return null;

                                                                const esUltimo = opIdx === t.operarioId.length - 1;

                                                                return (
                                                                    <span key={`op-${id}-${opIdx}`} style={styles.textoNombre}>
                                                                        {`${nombre}${!esUltimo ? ', ' : ''}`}
                                                                    </span>
                                                                );
                                                            })
                                                        ) : (
                                                            <span key="empty-placeholder" style={styles.placeholder}>Sin asignar</span>
                                                        )}
                                                    </div>

                                                    <div style={styles.botonAgregarWrapper}>
                                                        <select
                                                            style={styles.selectInvisible}
                                                            value=""
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (!val) return;

                                                                // 1. Buscamos el recurso primero
                                                                const recurso = recursos.find(r => String(r._id) === String(val));
                                                                if (!recurso) return;

                                                                // 2. Filtramos cualquier basura (null, undefined, "") que ya exista en la tarea
                                                                const idsActuales = (t.operarioId || []).filter(id => id);
                                                                const nombresActuales = (t.operarioNombre || []).filter(n => n && n !== "Sin asignar" && n !== "");

                                                                // 3. Evitamos duplicados sobre la lista limpia
                                                                if (idsActuales.includes(val)) return;

                                                                // 4. Creamos los nuevos arrays limpios
                                                                const nuevosIds = [...idsActuales, val];
                                                                const nuevosNombres = [...nombresActuales, recurso.nombre];

                                                                setTareas(prev => prev.map((tarea, i) =>
                                                                    i === idx ? {
                                                                        ...tarea,
                                                                        operarioId: nuevosIds,
                                                                        operarioNombre: nuevosNombres
                                                                    } : tarea
                                                                ));
                                                            }}
                                                        >
                                                            <option value="">+</option>
                                                            {recursos.map(r => (
                                                                <option key={r._id} value={r._id}>{r.nombre}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            </td>
                                            {/* 4. Duración */}
                                            <td><input type="number" style={styles.inputTable} value={t.duracion} onChange={(e) => actualizarTarea(idx, 'duracion', e.target.value)} /></td>
                                            {/* 5. Fecha */}
                                            <td><input type="date" style={styles.inputTable} value={t.fecha} onChange={(e) => actualizarTarea(idx, 'fecha', e.target.value)} /></td>
                                            {/* 6. Hora */}
                                            <td><input type="time" style={styles.inputTable} value={t.hora} onChange={(e) => actualizarTarea(idx, 'hora', e.target.value)} /></td>
                                            {/* 7. Valor Hora */}
                                            <td><input type="number" style={styles.inputTable} value={t.valorHora || ''} placeholder="$" onChange={(e) => actualizarTarea(idx, 'valorHora', e.target.value)} /></td>

                                            {/* 8. Subtotal (Calculado) */}
                                            {/* 8. Subtotal (Calculado: Hrs * $/Hora * N° Personas) */}
                                            <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '0 10px' }}>
                                                {(() => {
                                                    const horas = Number(t.duracion) || 0;
                                                    const precioHora = Number(t.valorHora) || 0;
                                                    // Contamos cuántos operarios hay asignados
                                                    const cantidadPersonas = Array.isArray(t.operarioId) ? t.operarioId.length : 0;

                                                    // Si no hay nadie asignado, podrías decidir si multiplicar por 0 o por 1.
                                                    // Lo lógico para costos de suministros humanos es:
                                                    const factorPersonas = cantidadPersonas > 0 ? cantidadPersonas : 1;

                                                    const sub = horas * precioHora * factorPersonas;

                                                    return `$ ${sub.toLocaleString()}`;
                                                })()}
                                            </td>
                                            {/* BOTÓN PARA BORRAR FILA */}
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    onClick={() => eliminarTarea(idx)}
                                                    style={styles.btnDeleteRow}
                                                    title="Eliminar línea"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={agregarTarea} style={styles.btnAdd}>+ Añadir Tarea</button>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                                <button
                                    onClick={() => setTabActiva('componentes')}
                                    style={{ padding: '10px 24px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                                >
                                    Continuar: Equipos / Herramientas →
                                </button>
                            </div>
                        </div>
                    )}
                    {/* VISTA 2: COMPONENTES CON AUTOCOMPLETADO */}
                    {tabActiva === 'componentes' && (
                        <div>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa' }}>
                                        <th>Código</th>
                                        <th>Descripción (Equipos/Herramientas)</th>
                                        <th>Cant.</th>
                                        <th>Precio</th>
                                        <th>Subtotal</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {componentes.map((c, idx) => (
                                        <tr key={c.id || idx}>
                                            {/* 1. Código */}
                                            <td>
                                                <input
                                                    style={styles.inputTable}
                                                    value={c.codigo || ''}
                                                    onChange={(e) => actualizarComponente(idx, 'codigo', e.target.value)}
                                                />
                                            </td>

                                            {/* 2. Descripción con Buscador */}
                                            <td>
                                                <input
                                                    list="lista-componentes-recursos"
                                                    style={{ ...styles.inputTable, width: '100%' }}
                                                    placeholder="Escribe para buscar..."
                                                    value={c.descripcion || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        // 1. Siempre actualizamos lo que se ve en el input para que no se trabe
                                                        actualizarComponente(idx, 'descripcion', val);

                                                        // 2. Si el valor es muy corto, no buscamos (ahorra recursos)
                                                        if (val.length < 2) return;

                                                        const listaParaBuscar = componentesDB || [];

                                                        // 3. Buscamos el match
                                                        const match = listaParaBuscar.find(db => {
                                                            const nombreLimpio = db.nombre ? db.nombre.trim() : "";
                                                            const formatoCompleto = db.tipo ? `${nombreLimpio} (${db.tipo})` : nombreLimpio;

                                                            // Comparamos contra el nombre solo O contra el formato con paréntesis
                                                            return val === nombreLimpio || val === formatoCompleto;
                                                        });

                                                        // 4. Si hay match, inyectamos los datos con un pequeño respiro para React
                                                        if (match) {
                                                            setTimeout(() => {
                                                                actualizarComponente(idx, 'descripcion', match.nombre);
                                                                actualizarComponente(idx, 'tipo', match.tipo || 'Equipo');
                                                                actualizarComponente(idx, 'codigo', match.codigo || 'REF');
                                                                actualizarComponente(idx, 'precio', match.precio || 0);
                                                            }, 50); // 50ms bastan para que el datalist suelte el foco
                                                        }
                                                    }}
                                                />
                                            </td>

                                            {/* 🚩 3. NUEVA COLUMNA: TIPO (Faltaba en tu código) */}
                                            <td>
                                                <input
                                                    type="text"
                                                    style={styles.inputTable}
                                                    placeholder="Tipo"
                                                    value={c.tipo || ''}
                                                    onChange={(e) => actualizarComponente(idx, 'tipo', e.target.value)}
                                                />
                                            </td>

                                            {/* 4. Cantidad */}
                                            <td>
                                                <input
                                                    type="number"
                                                    style={styles.inputTable}
                                                    value={c.cantidad}
                                                    onChange={(e) => actualizarComponente(idx, 'cantidad', e.target.value)}
                                                />
                                            </td>

                                            {/* 5. Precio */}
                                            <td>
                                                <input
                                                    type="number"
                                                    style={styles.inputTable}
                                                    value={c.precio}
                                                    onChange={(e) => actualizarComponente(idx, 'precio', e.target.value)}
                                                />
                                            </td>

                                            {/* 6. Subtotal */}
                                            {/* 6. Subtotal (Calculado: Cantidad * Precio) */}
                                            <td style={{
                                                textAlign: 'right',
                                                fontWeight: 'bold',
                                                padding: '0 10px',
                                                minWidth: '100px'
                                            }}>
                                                {(() => {
                                                    const cant = Number(c.cantidad) || 0;
                                                    const prec = Number(c.precio) || 0;
                                                    const sub = cant * prec;

                                                    return `$ ${sub.toLocaleString('es-CL')}`;
                                                })()}
                                            </td>

                                            {/* 7. Eliminar */}
                                            <td>
                                                <button onClick={() => eliminarComponente(idx)} style={styles.btnEliminar}>×</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={agregarComponente} style={styles.btnPrimario}>+ Añadir Componente</button>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                                <button
                                    onClick={() => setTabActiva('Logistica')}
                                    style={{ padding: '10px 24px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                                >
                                    Continuar: Suministros Directos →
                                </button>
                            </div>
                        </div>
                    )}
                    {/* VISTA 3: LOGÍSTICA */}
                    {tabActiva === 'Logistica' && ( // Nota: Podrías cambiar el label de la pestaña a 'Suministros'
                        <div>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa' }}>
                                        <th>Código / Suministro</th>
                                        <th>Descripción</th>
                                        <th>Cant.</th>
                                        <th>Precio Unit.</th>
                                        <th>Subtotal</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(logistica || []).map((l, idx) => (
                                        <tr key={l._id || idx}>
                                            <td>
                                                <input
                                                    list="lista-suministros-recursos"
                                                    style={styles.inputTable}
                                                    value={l.codigo || l.unidad || ''}
                                                    placeholder="Buscar código..."
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        actualizarLogistica(idx, 'codigo', val);
                                                        actualizarLogistica(idx, 'unidad', val);
                                                        // Buscador Actualizado para el nuevo Schema
                                                        const match = (suministrosDB || []).find(s =>
                                                            s.codigo?.toLowerCase() === val.toLowerCase() ||
                                                            s.descripcion?.toLowerCase() === val.toLowerCase()
                                                        );

                                                        if (match) {
                                                            actualizarLogistica(idx, 'codigo', match.codigo);
                                                            actualizarLogistica(idx, 'descripcion', match.descripcion);
                                                            actualizarLogistica(idx, 'precio', Number(match.precio) || 0);
                                                        }
                                                    }}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    style={styles.inputTable}
                                                    value={l.descripcion || ''}
                                                    placeholder="Descripción del suministro"
                                                    onChange={(e) => actualizarLogistica(idx, 'descripcion', e.target.value)}
                                                />
                                            </td>
                                            <td style={{ width: '80px' }}>
                                                <input
                                                    type="number"
                                                    style={styles.inputTable}
                                                    value={l.cantidad || 1}
                                                    onChange={(e) => actualizarLogistica(idx, 'cantidad', Number(e.target.value))}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    style={styles.inputTable}
                                                    value={l.precio || 0}
                                                    onChange={(e) => actualizarLogistica(idx, 'precio', Number(e.target.value))}
                                                />
                                            </td>
                                            <td style={{ fontWeight: 'bold', textAlign: 'right', padding: '0 10px', color: '#2c3e50' }}>
                                                {(() => {
                                                    const sub = (Number(l.cantidad) || 0) * (Number(l.precio) || 0);
                                                    return `$ ${sub.toLocaleString('es-CL')}`;
                                                })()}
                                            </td>
                                            <td>
                                                <button onClick={() => eliminarLogistica(idx)} style={styles.btnEliminar}>×</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={agregarLogistica} style={styles.btnPrimario}>+ Añadir Suministro</button>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', padding: '16px', backgroundColor: '#f0f7f0', borderRadius: '8px', border: '1px solid #c3e6c3' }}>
                                <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✓ Todo listo — tareas, equipos y suministros definidos</span>
                                <button
                                    onClick={() => guardarPlanificacion('Planificada')}
                                    style={{ padding: '12px 28px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}
                                >
                                    ✓ Terminar Planificación
                                </button>
                            </div>
                        </div>
                    )}
                    {/* 🚩 DATALISTS ACTUALIZADOS */}
                    <datalist id="lista-componentes-recursos">
                        {(componentesDB || []).map((item, i) => (
                            <option
                                key={item._id || i}
                                value={item.tipo ? `${item.nombre} (${item.tipo})` : item.nombre}
                            />
                        ))}
                    </datalist>
                    <datalist id="lista-suministros-recursos">
                        {(suministrosDB || []).map((item, idx) => (
                            <option
                                key={item._id || idx}
                                value={item.codigo}
                            >
                                {item.descripcion} - ${Number(item.precio).toLocaleString('es-CL')}
                            </option>
                        ))}
                    </datalist>
                    {tabActiva === 'cotizacion' && (
                        <div style={styles.documentoHoja}>
                            {/* ENCABEZADO PROFESIONAL */}
                            <div style={styles.headerDoc}>
                                <h2 style={{ textAlign: 'center', color: '#2c3e50' }}>COTIZACIÓN TÉCNICA Y COMERCIAL</h2>
                                <p><strong>OT N°:</strong> {datosRecibidos?.numeroOT || 'N/A'}</p>
                            </div>
                            <section style={{
                                ...styles.seccionDoc,
                                border: '1px solid #ced4da',
                                borderRadius: '8px',
                                padding: '20px',
                                marginBottom: '25px',
                                backgroundColor: '#fff',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}>
                                {/* Contenedor Principal Flex */}
                                <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>

                                    {/* COLUMNA 1: CLIENTE */}
                                    <div style={{ flex: '1', minWidth: '300px' }}>
                                        <h6 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '5px', fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                            👤 Identificación del Cliente
                                        </h6>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', fontSize: '0.95rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#6c757d' }}>Empresa:</span>
                                                <span style={{ fontWeight: '600' }}>{datosRecibidos?.empresaSolicitante || 'Particular'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#6c757d' }}>Solicitante:</span>
                                                <span>{datosRecibidos?.solicitante || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#6c757d' }}>Correo:</span>
                                                <span style={{ color: '#007bff' }}>{datosRecibidos?.correo || '-'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#6c757d' }}>Teléfono / Dir:</span>
                                                <span>{datosRecibidos?.numero || '-'} | {datosRecibidos?.direccion || '-'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* COLUMNA 2: REQUERIMIENTO */}
                                    <div style={{ flex: '1', minWidth: '300px' }}>
                                        <h6 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '5px', fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                            📋 Detalles del Requerimiento
                                        </h6>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', fontSize: '0.95rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#6c757d' }}>Origen / Plazo:</span>
                                                <span>{datosRecibidos?.origen || 'WhatsApp'} / {datosRecibidos?.plazoEjecucionSugerido || '0'} días</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: '#6c757d' }}>Fecha Solicitada:</span>
                                                <span style={{ fontWeight: '600' }}>{datosRecibidos?.fechaEjecucionSolicitada ? new Date(datosRecibidos.fechaEjecucionSolicitada).toLocaleDateString() : 'A convenir'}</span>
                                            </div>
                                            <div style={{ marginTop: '5px' }}>
                                                <span style={{ color: '#6c757d', fontSize: '0.85rem' }}>Descripción del servicio:</span>
                                                <div style={{
                                                    backgroundColor: '#f8f9fa',
                                                    padding: '10px',
                                                    borderRadius: '5px',
                                                    border: '1px solid #e9ecef',
                                                    marginTop: '5px',
                                                    fontSize: '0.9rem',
                                                    fontStyle: 'italic',
                                                    color: '#495057'
                                                }}>
                                                    {datosRecibidos?.descripcion || 'Sin descripción.'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </section>

                            {/* SECCIÓN 1: COMPONENTES / REPUESTOS */}
                            <section style={styles.seccionDoc}>
                                <h4 style={styles.tituloSeccionDoc}>1. Materiales, Repuestos e Insumos</h4>
                                <table style={styles.tableDoc}>
                                    <thead>
                                        <tr><th>Ítem</th><th style={{ textAlign: 'center' }}>Cant.</th><th style={{ textAlign: 'right' }}>P. Unitario</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr>
                                    </thead>
                                    <tbody>
                                        {componentes.map(c => (
                                            <tr key={c._id}>
                                                <td>{c.descripcion}</td>
                                                <td style={{ textAlign: 'center' }}>{c.cantidad}</td>
                                                <td style={{ textAlign: 'right' }}>$ {Number(c.precio || 0).toLocaleString()}</td>
                                                <td style={{ textAlign: 'right' }}>$ {(Number(c.cantidad || 0) * Number(c.precio || 0)).toLocaleString()}</td>
                                            </tr>
                                        ))}</tbody>
                                </table>
                            </section>

                            {/* SECCIÓN 2: MANO DE OBRA Y TAREAS - CORREGIDA */}
                            <section style={styles.seccionDoc}>
                                <h4 style={styles.tituloSeccionDoc}>2. Plan de Trabajo y Mano de Obra</h4>
                                <table style={styles.tableDoc}>
                                    <thead>
                                        <tr><th>Tarea</th><th>Puesto</th><th style={{ textAlign: 'center' }}>Hrs</th><th style={{ textAlign: 'right' }}>Valor H.</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr>
                                    </thead>
                                    <tbody>
                                        {tareas.map(t => (
                                            <tr key={t._id}>
                                                <td>{t.descripcion}</td>
                                                <td>{t.puesto}</td>
                                                <td style={{ textAlign: 'center' }}>{t.duracion}</td>
                                                <td style={{ textAlign: 'right' }}>$ {Number(t.valorHora || 0).toLocaleString()}</td>
                                                <td style={{ textAlign: 'right' }}>$ {(Number(t.duracion || 0) * Number(t.valorHora || 0)).toLocaleString()}</td>
                                            </tr>
                                        ))}</tbody>
                                </table>
                            </section>

                            <section style={styles.seccionDoc}>
                                <h4 style={styles.tituloSeccionDoc}>4. Logística y Gastos Operacionales</h4>
                                <table style={styles.tableDoc}>
                                    <tbody>
                                        {logistica.map(l => (
                                            <tr key={l._id}>
                                                <td style={{ width: '70%' }}>{l.descripcion}</td>
                                                <td style={{ textAlign: 'right' }}>$ {(Number(l.cantidad || 0) * Number(l.precio || 0)).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>
                            {/* SECCIÓN 3: CRONOGRAMA DE EJECUCIÓN (Estilo Plano de Ejecución) */}
                            <section style={styles.seccionDoc}>
                                <h4 style={styles.tituloSeccionDoc}>3. Cronograma de Ejecución (Gantt)</h4>
                                <div id="seccion-gantt-visual" style={{ backgroundColor: 'white', padding: '10px', overflowX: 'auto' }}>
                                    <table style={{ ...styles.tableDoc, fontSize: '11px', borderCollapse: 'collapse', width: '100%' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#2c3e50', color: 'white' }}>
                                                <th style={{ padding: '8px', border: '1px solid #ddd' }}>#</th>
                                                <th style={{ padding: '8px', border: '1px solid #ddd' }}>Descripción de Tarea</th>
                                                <th style={{ padding: '8px', border: '1px solid #ddd' }}>Puesto</th>
                                                {/* ✅ Título dinámico para múltiples responsables */}
                                                <th style={{ padding: '8px', border: '1px solid #ddd' }}>Personal Asignado</th>
                                                <th style={{ padding: '8px', border: '1px solid #ddd' }}>Duración</th>
                                                {diasPlanificados.map(dia => (
                                                    <th key={dia} style={{ padding: '8px', border: '1px solid #ddd', minWidth: '70px' }}>
                                                        {formatearFechaGantt(dia)}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tareas.map((t, idx) => (
                                                <tr key={t._id || t.id || `tarea-${idx}`}>
                                                    <td style={{ border: '1px solid #ddd', textAlign: 'center' }}>{idx + 1}</td>
                                                    <td style={{ border: '1px solid #ddd', padding: '5px' }}><strong>{t.descripcion}</strong></td>
                                                    <td style={{ border: '1px solid #ddd', textAlign: 'center' }}>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            fontSize: '10px',
                                                            color: '#34495e',
                                                            backgroundColor: '#f0f2f5',
                                                            border: '1px solid #dcdfe6'
                                                        }}>
                                                            {t.puesto}
                                                        </span>
                                                    </td>
                                                    {/* ✅ Renderizado de la lista de operarios */}
                                                    <td style={{ border: '1px solid #ddd', padding: '5px', fontSize: '10px' }}>
                                                        {Array.isArray(t.operarioNombre) && t.operarioNombre.length > 0 ? (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                                                {t.operarioNombre.map((nom, i) => (
                                                                    <span key={i} className="badge bg-light text-dark border">
                                                                        {nom}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted italic">No asignado</span>
                                                        )}
                                                    </td>
                                                    <td style={{ border: '1px solid #ddd', textAlign: 'center' }}>{t.duracion} h</td>
                                                    {diasPlanificados.map(dia => (
                                                        <td key={dia} style={{ border: '1px solid #ddd', position: 'relative', padding: '4px' }}>
                                                            {t.fecha === dia && (
                                                                <div style={{
                                                                    backgroundColor: t.puesto === 'Soldador' ? '#e67e22' : '#3498db',
                                                                    color: 'white',
                                                                    textAlign: 'center',
                                                                    borderRadius: '4px',
                                                                    padding: '4px 2px',
                                                                    fontSize: '9px',
                                                                    fontWeight: 'bold',
                                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                                }}>
                                                                    <div>{t.hora}</div>
                                                                    {/* ✅ Muestra cantidad de personas en el gráfico si hay más de una */}
                                                                    {t.operarioId?.length > 1 && (
                                                                        <div style={{ fontSize: '8px', borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: '2px' }}>
                                                                            {t.operarioId.length} pers.
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            {/* RESUMEN FINAL Y TOTALES */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: '20px' }}>
                                <div style={{ width: '250px' }}>
                                    <div style={styles.filaTotalDoc}><span>TOTAL NETO:</span> <span>$ {granTotal.toLocaleString()}</span></div>
                                    <div style={styles.filaTotalDoc}><span>IVA (19%):</span> <span>$ {(granTotal * 0.19).toLocaleString()}</span></div>
                                    <div style={{ ...styles.filaTotalDoc, fontWeight: 'bold', fontSize: '1.2em', borderTop: '2px solid #333', marginTop: '5px', paddingTop: '5px' }}>
                                        <span>TOTAL BRUTO:</span> <span>$ {(granTotal * 1.19).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {tabActiva === 'reportes' && (
                        <div style={{ padding: '20px' }}>

                            {/* ── SECCIÓN 1: DESPACHO AL SUPERVISOR ── */}
                            <div style={{ marginBottom: '30px', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
                                <div style={{ padding: '14px 20px', backgroundColor: '#2c3e50', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '15px' }}>📋 Despacho al Supervisor</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            padding: '4px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                                            backgroundColor: otSeleccionada?.estado === 'En Ejecución' ? '#e67e22' : otSeleccionada?.estado === 'Programada' ? '#3498db' : otSeleccionada?.estado === 'Trabajo Terminado' ? '#27ae60' : otSeleccionada?.estado === 'Con Informe' ? '#8e44ad' : '#95a5a6',
                                            color: 'white'
                                        }}>{otSeleccionada?.estado || 'Sin estado'}</span>
                                        <button
                                            onClick={recargarOT}
                                            title="Actualizar estado desde el servidor"
                                            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px', color: 'white', padding: '4px 10px', cursor: 'pointer', fontSize: '13px' }}
                                        >🔄</button>
                                    </div>
                                </div>

                                <div style={{ padding: '20px' }}>
                                    {/* Resumen de la OT */}
                                    <div style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '16px', marginBottom: '20px', fontSize: '13px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                                            <div><span style={{ color: '#888' }}>OT:</span> <strong>{otSeleccionada?.numeroOT || '—'}</strong></div>
                                            <div><span style={{ color: '#888' }}>Cliente:</span> <strong>{otSeleccionada?.solicitante || '—'}</strong></div>
                                            <div style={{ gridColumn: '1/-1' }}><span style={{ color: '#888' }}>Descripción:</span> {otSeleccionada?.descripcion || '—'}</div>
                                        </div>
                                        {tareas.length > 0 && (
                                            <>
                                                <div style={{ color: '#888', fontWeight: 'bold', marginBottom: '6px', fontSize: '12px' }}>TAREAS PROGRAMADAS</div>
                                                {tareas.map((t, i) => (
                                                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
                                                        <span style={{ flex: 2, color: '#2c3e50' }}>{t.descripcion}</span>
                                                        {t.fecha && <span style={{ color: '#3498db', fontSize: '12px', whiteSpace: 'nowrap' }}>📅 {t.fecha}</span>}
                                                        {t.hora && <span style={{ color: '#7f8c8d', fontSize: '12px' }}>⏰ {t.hora}</span>}
                                                        {t.operarioNombre?.length > 0 && <span style={{ color: '#27ae60', fontSize: '12px' }}>👷 {[].concat(t.operarioNombre).join(', ')}</span>}
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>

                                    {/* Acción según estado */}
                                    {otSeleccionada?.estado === 'En Ejecución' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', backgroundColor: '#f0fff4', borderRadius: '8px', border: '1px solid #c3e6c3' }}>
                                                <span style={{ fontSize: '24px' }}>⚙️</span>
                                                <div>
                                                    <div style={{ fontWeight: 'bold', color: '#27ae60', fontSize: '14px' }}>Trabajo En Ejecución</div>
                                                    <div style={{ color: '#555', fontSize: '12px' }}>El supervisor confirmó el inicio del trabajo</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={notificarSupervisor}
                                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                                            >
                                                📱 Reenviar link al Supervisor
                                            </button>
                                        </div>
                                    ) : otSeleccionada?.estado === 'Programada' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <p style={{ margin: 0, color: '#555', fontSize: '13px' }}>
                                                La OT está programada. Envía la orden al supervisor para que confirme el inicio del trabajo.
                                            </p>
                                            <button
                                                onClick={notificarSupervisor}
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 24px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                                            >
                                                📱 Enviar OT al Supervisor vía WhatsApp
                                            </button>
                                        </div>
                                    ) : (
                                        <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>
                                            El botón de despacho se habilitará cuando la OT esté en estado <strong>Programada</strong>.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* ── SECCIÓN 2: EVIDENCIAS DE TERRENO ── */}
                            <h3 style={{ borderBottom: '2px solid #27ae60', paddingBottom: '10px', marginBottom: '20px' }}>
                                📸 Evidencias de Terreno
                                {otSeleccionada.reportes?.length > 0 && (
                                    <span style={{ marginLeft: '10px', fontSize: '14px', color: '#27ae60', fontWeight: 'normal' }}>
                                        ({otSeleccionada.reportes.length} reporte{otSeleccionada.reportes.length !== 1 ? 's' : ''})
                                    </span>
                                )}
                            </h3>

                            {otSeleccionada.reportes && otSeleccionada.reportes.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
                                    {otSeleccionada.reportes.map((rep, i) => (
                                        <div key={i} style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                                            {reporteEditIdx === i ? (
                                                /* ── MODO EDICIÓN ── */
                                                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d' }}>EDITANDO REPORTE #{i + 1}</div>
                                                    <textarea
                                                        value={reporteEditData.comentario}
                                                        onChange={e => setReporteEditData(d => ({ ...d, comentario: e.target.value }))}
                                                        rows={3}
                                                        style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit' }}
                                                        placeholder="Comentario del reporte..."
                                                    />
                                                    {reporteEditData.foto && (
                                                        <img src={reporteEditData.foto} alt="actual" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px' }} />
                                                    )}
                                                    <label style={{ fontSize: '12px', color: '#555', cursor: 'pointer' }}>
                                                        📷 Cambiar foto
                                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                                                            const file = e.target.files[0];
                                                            if (!file) return;
                                                            const reader = new FileReader();
                                                            reader.onload = ev => setReporteEditData(d => ({ ...d, foto: ev.target.result }));
                                                            reader.readAsDataURL(file);
                                                        }} />
                                                    </label>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button onClick={guardarEdicionReporte} style={{ flex: 1, padding: '8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                                                            💾 Guardar
                                                        </button>
                                                        <button onClick={() => setReporteEditIdx(null)} style={{ flex: 1, padding: '8px', background: '#ecf0f1', color: '#555', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* ── MODO NORMAL ── */
                                                <>
                                                    <div style={{ position: 'relative' }}>
                                                        {rep.foto && (
                                                            <img
                                                                src={rep.foto}
                                                                alt="Evidencia"
                                                                style={{ width: '100%', height: '180px', objectFit: 'cover', cursor: rep.anulado ? 'default' : 'pointer', filter: rep.anulado ? 'grayscale(1) opacity(0.4)' : 'none' }}
                                                                onClick={() => !rep.anulado && window.open(rep.foto, '_blank')}
                                                            />
                                                        )}
                                                        {rep.anulado && (
                                                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(231,76,60,0.85)', color: 'white', fontWeight: 'bold', fontSize: '13px', padding: '4px 12px', borderRadius: '4px', letterSpacing: '1px' }}>
                                                                ANULADO
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', opacity: rep.anulado ? 0.45 : 1 }}>
                                                        {rep.tareaId && <p style={{ margin: 0, fontWeight: 'bold', color: '#2c3e50', fontSize: '13px', textDecoration: rep.anulado ? 'line-through' : 'none' }}>{rep.tareaId}</p>}
                                                        {rep.comentario && <p style={{ margin: 0, fontSize: '13px', color: '#555', lineHeight: '1.4', textDecoration: rep.anulado ? 'line-through' : 'none' }}>{rep.comentario}</p>}
                                                        {rep.usuario && <small style={{ color: '#aaa' }}>👷 {rep.usuario}</small>}
                                                        <small style={{ color: '#bdc3c7' }}>📅 {new Date(rep.fecha).toLocaleString('es-CL')}</small>
                                                    </div>
                                                    <div style={{ display: 'flex', borderTop: '1px solid #f0f0f0' }}>
                                                        {rep.anulado ? (
                                                            <button
                                                                onClick={() => restaurarReporte(i)}
                                                                style={{ flex: 1, padding: '8px', background: 'none', border: 'none', color: '#27ae60', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                                                            >↩️ Restaurar</button>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => abrirEdicionReporte(i)}
                                                                    style={{ flex: 1, padding: '8px', background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                                                                >✏️ Editar</button>
                                                                <div style={{ width: '1px', background: '#f0f0f0' }} />
                                                                <button
                                                                    onClick={() => anularReporte(i)}
                                                                    style={{ flex: 1, padding: '8px', background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                                                                >🚫 Anular</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '50px', color: '#95a5a6', backgroundColor: '#fafafa', borderRadius: '10px', border: '1px dashed #ddd' }}>
                                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📷</div>
                                    <p style={{ fontSize: '14px', margin: 0 }}>Sin reportes fotográficos aún.</p>
                                    <small>Aparecerán aquí cuando el supervisor suba evidencias desde terreno.</small>
                                </div>
                            )}
                        </div>
                    )}
                    {/* PESTAÑA PAGO */}
                    {tabActiva === 'pago' && (
                        <div style={{ padding: '25px', maxWidth: '700px', margin: '0 auto' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #16a085', paddingBottom: '10px', marginBottom: '25px' }}>
                                <h3 style={{ margin: 0, color: '#16a085' }}>💵 Control de Pago</h3>
                                {pago.anulado && (
                                    <span style={{ background: '#e74c3c', color: 'white', fontWeight: 'bold', fontSize: '12px', padding: '4px 14px', borderRadius: '20px', letterSpacing: '1px' }}>
                                        🚫 PAGO ANULADO
                                    </span>
                                )}
                            </div>

                            {/* Banner de anulación */}
                            {pago.anulado && (
                                <div style={{ background: '#fff5f5', border: '1px solid #fcc', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px' }}>
                                    <div style={{ fontWeight: 'bold', color: '#c0392b', marginBottom: '4px' }}>🚫 Pago Anulado</div>
                                    <div style={{ fontSize: '13px', color: '#666' }}>
                                        {pago.fechaAnulacion && <span>Fecha: <strong>{pago.fechaAnulacion}</strong> — </span>}
                                        {pago.motivoAnulacion ? <span>Motivo: <strong>{pago.motivoAnulacion}</strong></span> : <span>Sin motivo registrado</span>}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                        El registro de pago se conserva. Puede restaurarlo o ingresar uno nuevo.
                                    </div>
                                </div>
                            )}

                            {/* Resumen financiero */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '30px' }}>
                                <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', textAlign: 'center', border: '1px solid #eee' }}>
                                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '5px' }}>TOTAL COTIZADO</div>
                                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#2c3e50' }}>$ {(granTotal * 1.19).toLocaleString('es-CL')}</div>
                                    <div style={{ fontSize: '11px', color: '#aaa' }}>con IVA</div>
                                </div>
                                <div style={{ background: '#f0fdf4', padding: '15px', borderRadius: '10px', textAlign: 'center', border: '1px solid #d1fae5' }}>
                                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '5px' }}>MONTO PAGADO</div>
                                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#16a085' }}>$ {Number(pago.montoPagado || 0).toLocaleString('es-CL')}</div>
                                </div>
                                <div style={{ background: '#fff5f5', padding: '15px', borderRadius: '10px', textAlign: 'center', border: '1px solid #fed7d7' }}>
                                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '5px' }}>SALDO PENDIENTE</div>
                                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#e74c3c' }}>
                                        $ {Math.max(0, (granTotal * 1.19) - Number(pago.montoPagado || 0)).toLocaleString('es-CL')}
                                    </div>
                                </div>
                            </div>

                            {/* Estado del pago */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: '#555' }}>Estado del Pago</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {['Pendiente', 'Parcial', 'Pagado'].map(e => (
                                        <button key={e} onClick={() => setPago(p => ({ ...p, estado: e }))}
                                            style={{
                                                padding: '8px 20px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
                                                backgroundColor: pago.estado === e
                                                    ? (e === 'Pagado' ? '#27ae60' : e === 'Parcial' ? '#f39c12' : '#e74c3c')
                                                    : '#ecf0f1',
                                                color: pago.estado === e ? 'white' : '#666'
                                            }}>
                                            {e === 'Pagado' ? '✅ Pagado' : e === 'Parcial' ? '⏳ Parcial' : '🔴 Pendiente'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Formulario de pago */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#555', fontSize: '13px' }}>Monto Pagado ($)</label>
                                    <input type="number" value={pago.montoPagado} onChange={e => setPago(p => ({ ...p, montoPagado: Number(e.target.value) }))}
                                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#555', fontSize: '13px' }}>Fecha de Pago</label>
                                    <input type="date" value={pago.fechaPago} onChange={e => setPago(p => ({ ...p, fechaPago: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#555', fontSize: '13px' }}>Método de Pago</label>
                                    <select value={pago.metodoPago} onChange={e => setPago(p => ({ ...p, metodoPago: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}>
                                        {['Transferencia', 'Efectivo', 'Cheque', 'Débito', 'Crédito', 'Otro'].map(m => <option key={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#555', fontSize: '13px' }}>N° Referencia / Comprobante</label>
                                    <input type="text" value={pago.referencia} onChange={e => setPago(p => ({ ...p, referencia: e.target.value }))}
                                        placeholder="Ej: TRF-20240801-001"
                                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#555', fontSize: '13px' }}>Notas</label>
                                <textarea value={pago.notas} onChange={e => setPago(p => ({ ...p, notas: e.target.value }))}
                                    placeholder="Observaciones sobre el pago..."
                                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <button onClick={guardarPago}
                                    style={{ padding: '12px 30px', backgroundColor: '#16a085', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
                                    💾 Guardar Información de Pago
                                </button>
                                {!pago.anulado && pago.estado !== 'Pendiente' && (
                                    <button onClick={anularPago}
                                        style={{ padding: '12px 24px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
                                        🚫 Anular Pago
                                    </button>
                                )}
                                {pago.anulado && (
                                    <button onClick={restaurarPago}
                                        style={{ padding: '12px 24px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
                                        ↩️ Restaurar Pago
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* MODAL HOJAS DE RUTA */}
                    {modalPlantilla && (
                        <div style={styles.overlay}>
                            <div style={{ ...styles.modal, width: '700px', maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                                <div style={styles.modalHeader}>
                                    <h3 style={{ margin: 0 }}>📋 Seleccionar Hoja de Ruta</h3>
                                    <button onClick={() => { setModalPlantilla(false); setPlantillaPreview(null); }} style={styles.btnCloseModal}>&times;</button>
                                </div>
                                <div style={{ display: 'flex', gap: '15px', flex: 1, overflow: 'hidden', padding: '15px' }}>
                                    {/* Lista de plantillas */}
                                    <div style={{ width: '220px', overflowY: 'auto', borderRight: '1px solid #eee', paddingRight: '15px' }}>
                                        {plantillas.length === 0 && (
                                            <p style={{ color: '#999', fontSize: '13px' }}>No hay plantillas creadas. Ve a Recursos → Plantillas.</p>
                                        )}
                                        {plantillas.map(p => (
                                            <div
                                                key={p._id}
                                                onClick={() => setPlantillaPreview(p)}
                                                style={{
                                                    padding: '10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    marginBottom: '6px',
                                                    backgroundColor: plantillaPreview?._id === p._id ? '#ede7f6' : '#f8f9fa',
                                                    border: plantillaPreview?._id === p._id ? '2px solid #8e44ad' : '1px solid #eee'
                                                }}
                                            >
                                                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{p.nombre}</div>
                                                <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>{p.categoria}</div>
                                                <div style={{ fontSize: '11px', color: '#aaa' }}>
                                                    {p.tareas?.length || 0} tareas · {p.componentes?.length || 0} equipos · {p.logistica?.length || 0} suministros
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Preview de la plantilla seleccionada */}
                                    <div style={{ flex: 1, overflowY: 'auto' }}>
                                        {!plantillaPreview ? (
                                            <div style={{ color: '#999', textAlign: 'center', marginTop: '40px' }}>
                                                Selecciona una plantilla para ver el detalle
                                            </div>
                                        ) : (
                                            <div>
                                                <h4 style={{ color: '#8e44ad', margin: '0 0 5px' }}>{plantillaPreview.nombre}</h4>
                                                <p style={{ color: '#666', fontSize: '13px', margin: '0 0 15px' }}>{plantillaPreview.descripcion}</p>
                                                {plantillaPreview.procedimiento && (
                                                    <div style={{ background: '#f8f4ff', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '15px', whiteSpace: 'pre-wrap' }}>
                                                        <strong>Procedimiento:</strong><br />{plantillaPreview.procedimiento}
                                                    </div>
                                                )}
                                                {plantillaPreview.tareas?.length > 0 && (
                                                    <>
                                                        <strong style={{ fontSize: '13px' }}>Tareas ({plantillaPreview.tareas.length})</strong>
                                                        <table style={{ width: '100%', fontSize: '12px', marginTop: '5px', marginBottom: '12px', borderCollapse: 'collapse' }}>
                                                            <thead><tr style={{ background: '#f0f0f0' }}>
                                                                <th style={{ padding: '6px', textAlign: 'left' }}>Descripción</th>
                                                                <th style={{ padding: '6px' }}>Puesto</th>
                                                                <th style={{ padding: '6px' }}>Horas</th>
                                                            </tr></thead>
                                                            <tbody>{plantillaPreview.tareas.map((t, i) => (
                                                                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                                                    <td style={{ padding: '6px' }}>{t.descripcion}</td>
                                                                    <td style={{ padding: '6px', textAlign: 'center' }}>{t.puesto}</td>
                                                                    <td style={{ padding: '6px', textAlign: 'center' }}>{t.duracion}h</td>
                                                                </tr>
                                                            ))}</tbody>
                                                        </table>
                                                    </>
                                                )}
                                                {plantillaPreview.componentes?.length > 0 && (
                                                    <>
                                                        <strong style={{ fontSize: '13px' }}>Equipos/Herramientas ({plantillaPreview.componentes.length})</strong>
                                                        <ul style={{ fontSize: '12px', margin: '5px 0 12px', paddingLeft: '18px' }}>
                                                            {plantillaPreview.componentes.map((c, i) => <li key={i}>{c.descripcion} × {c.cantidad}</li>)}
                                                        </ul>
                                                    </>
                                                )}
                                                {plantillaPreview.logistica?.length > 0 && (
                                                    <>
                                                        <strong style={{ fontSize: '13px' }}>Suministros ({plantillaPreview.logistica.length})</strong>
                                                        <ul style={{ fontSize: '12px', margin: '5px 0 12px', paddingLeft: '18px' }}>
                                                            {plantillaPreview.logistica.map((l, i) => <li key={i}>{l.descripcion} × {l.cantidad} {l.unidad}</li>)}
                                                        </ul>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => aplicarPlantilla(plantillaPreview)}
                                                    style={{ marginTop: '10px', padding: '10px 20px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}
                                                >
                                                    ✅ Aplicar esta plantilla
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {isModalEnvioOpen && (
                        <div style={styles.overlay}>
                            <div style={styles.modal}>
                                <div style={styles.modalHeader}>
                                    <h3 style={{ margin: 0 }}>📧 Enviar Cotización por Correo</h3>
                                    <button onClick={() => setIsModalEnvioOpen(false)} style={styles.btnCloseModal}>&times;</button>
                                </div>

                                <div style={styles.modalBody}>
                                    <p>Confirme los destinatarios para enviar la cotización:</p>

                                    <div style={styles.listaEmails}>
                                        {emailsEnvio.map((email, index) => (
                                            <div key={index} style={styles.tagEmail}>
                                                {email}
                                                <span
                                                    onClick={() => setEmailsEnvio(emailsEnvio.filter((_, i) => i !== index))}
                                                    style={{ cursor: 'pointer', marginLeft: '8px', color: '#e74c3c', fontWeight: 'bold' }}
                                                >✕</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                                        <input
                                            type="email"
                                            placeholder="Añadir otro correo (ej: finanzas@empresa.com)"
                                            style={styles.inputTable}
                                            value={nuevoEmail}
                                            onChange={(e) => setNuevoEmail(e.target.value)}
                                        />
                                        <button
                                            onClick={() => {
                                                if (nuevoEmail && nuevoEmail.includes('@')) {
                                                    setEmailsEnvio([...emailsEnvio, nuevoEmail]);
                                                    setNuevoEmail('');
                                                }
                                            }}
                                            style={styles.btnAgregarEmail}
                                        >+ Añadir</button>
                                    </div>
                                </div>

                                <div style={styles.modalFooter}>
                                    <button onClick={() => setIsModalEnvioOpen(false)} style={styles.btnInactivo}>Cancelar</button>
                                    <button
                                        onClick={async () => {
                                            try {
                                                console.log("=== 🛠️ VERIFICACIÓN DE SUMINISTROS ===");

                                                // 1. Extraemos las fechas limpias de las tareas
                                                const fechasRaw = tareas.map(t => t.fecha).filter(f => f);
                                                console.log("1. Fechas detectadas en la tabla:", fechasRaw);

                                                if (fechasRaw.length === 0) {
                                                    alert("⚠️ No hay fechas programadas en las tareas.");
                                                    return;
                                                }

                                                // 2. Simulamos el cálculo de rango (Motor de fechas)
                                                // Usamos 'T00:00:00' para evitar que la zona horaria nos quite un día
                                                const objetosFecha = fechasRaw.map(f => new Date(f + 'T00:00:00'));

                                                const minFecha = new Date(Math.min(...objetosFecha));
                                                const maxFecha = new Date(Math.max(...objetosFecha));

                                                console.log("2. Cálculo de Cronograma:");
                                                console.log("   - Fecha de Inicio:", minFecha.toLocaleDateString('es-CL'));
                                                console.log("   - Fecha de Término:", maxFecha.toLocaleDateString('es-CL'));
                                                console.log("   - Días totales:", Math.ceil((maxFecha - minFecha) / (1000 * 60 * 60 * 24)) + 1);

                                                /*
                                                // 3. Generamos el PDF (sin descarga automática)
                                                const doc = await generarPDF();
                                                const pdfBase64 = doc.output('datauristring').split(',')[1];
                                                console.log("3. ✅ PDF generado correctamente.");

                                                // 4. Envío real al Backend
                                                const respuesta = await axios.post('http://localhost:5000/api/mail/enviar-cotizacion', {
                                                    emails: emailsEnvio,
                                                    otId: datosRecibidos?._id,
                                                    cliente: datosRecibidos?.solicitante || "Cliente General",
                                                    total: granTotal || 0,
                                                    pdfData: pdfBase64,
                                                    tareas: tareas // Enviamos las tareas para que el backend repita el cálculo en el HTML del correo
                                                });
                                                */

                                                if (respuesta.data.ok) {
                                                    alert(`🚀 Cotización enviada. Programado del ${minFecha.toLocaleDateString('es-CL')} al ${maxFecha.toLocaleDateString('es-CL')}`);
                                                    setIsModalEnvioOpen(false);
                                                    navigate('/');
                                                }

                                            } catch (error) {
                                                console.error("❌ Error en el proceso:", error);
                                                alert("Error al procesar los suministros. Revisa la consola.");
                                            }
                                        }}
                                        style={styles.btnSuccessFinal}
                                    >
                                        🚀 Enviar Ahora
                                    </button>

                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div style={{ ...styles.footerAcciones, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '10px' : undefined }}>
                    <div style={{ display: 'flex', gap: '15px', width: isMobile ? '100%' : undefined }}>
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            style={{ ...styles.btnSecundario, flex: isMobile ? 1 : undefined }}
                        >
                            ❌ Cancelar
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                guardarPlanificacion(false);
                            }}
                            style={{ ...styles.btnPlanificar, flex: isMobile ? 1 : undefined }}
                        >
                            💾 Solo Guardar Planificación
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            if (tabActiva !== 'cotizacion') {
                                setTabActiva('cotizacion');
                            } else {
                                finalizarYCotizar();
                            }
                        }}
                        style={{ ...(tabActiva === 'cotizacion' ? styles.btnSuccessFinal : styles.btnSuccessNormal), width: isMobile ? '100%' : undefined }}
                    >
                        💰 {tabActiva === 'cotizacion' ? 'FINALIZAR Y GENERAR COTIZACIÓN' : 'SIGUIENTE: REVISAR COTIZACIÓN'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ESTILOS ADICIONALES PARA EL DISEÑO NUEVO
const styles = {
    overlay: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999
    },
    modal: {
        backgroundColor: '#fff',
        padding: '25px',
        borderRadius: '12px',
        width: '450px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
    },
    tagEmail: {
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: '#ebf5ff',
        color: '#007bff',
        padding: '5px 12px',
        borderRadius: '20px',
        margin: '5px',
        fontSize: '14px',
        border: '1px solid #cce5ff'
    },
    listaEmails: {
        border: '1px solid #ddd',
        padding: '10px',
        borderRadius: '8px',
        minHeight: '60px',
        marginBottom: '15px',
        backgroundColor: '#fcfcfc'
    },
    btnInactivo: {
        backgroundColor: '#95a5a6',
        color: 'white',
        border: 'none',
        padding: '10px 20px',
        borderRadius: '6px',
        cursor: 'pointer'
    },
    btnCloseModal: {
        background: 'none',
        border: 'none',
        fontSize: '24px',
        cursor: 'pointer',
        color: '#7f8c8d'
    },
    seccionDoc: {
        border: '1px solid #ced4da',
        borderRadius: '8px',
        padding: '20px',
        overflowX: 'auto',
        marginBottom: '25px',
        backgroundColor: '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    },
    btnDeleteRow: {
        backgroundColor: 'transparent',
        border: 'none',
        color: '#e74c3c',
        cursor: 'pointer',
        fontSize: '16px',
        padding: '5px',
        borderRadius: '4px',
        transition: 'all 0.2s ease',
    },
    container: {
        width: '100%',
        maxWidth: '1500px', // Limita el ancho para mejor lectura
        margin: '0 auto',    // Centra el bloque en la pantalla
        minHeight: '100vh',
        padding: '20px',
        backgroundColor: '#f0f2f5',
        boxSizing: 'border-box' // Asegura que el padding no sume ancho extra
    },
    cardFull: { background: 'white', borderRadius: '10px', padding: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
    tabBar: { display: 'flex', gap: '5px', marginBottom: '0' },
    tabBtn: { padding: '12px 25px', border: '1px solid #ddd', cursor: 'pointer', borderRadius: '8px 8px 0 0', background: '#f8f9fa' },
    tabBtnActive: { padding: '12px 25px', border: '1px solid #3498db', borderBottom: '2px solid white', background: 'white', fontWeight: 'bold', color: '#3498db', borderRadius: '8px 8px 0 0', zIndex: 1 },
    content: { border: '1px solid #ddd', padding: '25px', borderRadius: '0 8px 8px 8px', marginTop: '-1px' },
    table: { minWidth: '800px', tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', marginBottom: '10px' },
    headerTable: { background: '#f8f9fa', textAlign: 'left' },
    inputTable: { boxSizing: 'border-box', width: '90%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' },
    celdaSubtotal: { textAlign: 'right', fontWeight: 'bold', paddingRight: '10px' },
    cotizadorGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' },
    subTitulo: { borderLeft: '4px solid #3498db', paddingLeft: '10px', color: '#2c3e50', marginBottom: '15px' },
    logisticaForm: { display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #eee' },
    inputGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    resumenCaja: { marginTop: '20px', padding: '25px', background: '#2c3e50', color: 'white', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' },
    resumenLinea: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '15px' },
    totalTexto: { color: '#27ae60', margin: '10px 0 0 0', textAlign: 'right' },
    btnAddSmall: { padding: '8px 15px', background: '#34495e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
    footerAcciones: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '30px',
        paddingTop: '20px',
        borderTop: '1px solid #eee'
    },
    btnSecundario: { padding: '12px 20px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' },
    btnPlanificar: { padding: '12px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
    btnSuccessFinal: {
        padding: '15px 30px',
        background: '#27ae60',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
        boxShadow: '0 4px 10px rgba(39, 174, 96, 0.3)'
    },
    btnSuccessInactivo: {
        padding: '15px 30px',
        background: '#bdc3c7',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer'
    },
    inputCeldaLimpia: {
        display: 'flex',
        justifyContent: 'space-between', // Empuja el "+" a la derecha
        alignItems: 'center',
        padding: '4px 8px',
        minHeight: '30px',
        cursor: 'text',
        outline: 'none',
        borderBottom: '1px solid transparent', // Línea sutil solo al hacer foco
        transition: 'all 0.2s'
    },
    nombresWrapper: {
        display: 'flex',
        flexWrap: 'wrap',
        fontSize: '13px',
        color: '#444'
    },
    textoNombre: {
        marginRight: '4px',
        fontWeight: '500'
    },
    placeholder: {
        color: '#999',
        fontStyle: 'italic'
    },
    botonAgregarWrapper: {
        marginLeft: '10px',
        display: 'flex',
        alignItems: 'center'
    },
    selectInvisible: {
        border: 'none',
        background: 'none',
        outline: 'none',
        color: '#3498db',
        fontSize: '18px', // El "+" un poco más grande
        fontWeight: 'bold',
        cursor: 'pointer',
        width: '20px',
        appearance: 'none', // Quita la flecha de Windows/Chrome
        textAlign: 'center'
    }
};


export default TratamientoScreen;