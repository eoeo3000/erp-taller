import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const TratamientoScreen = ({ cargarDatos, API, actualizarOtGlobal, recursos = [] }) => {
    const { state: datosRecibidos } = useLocation();
    const navigate = useNavigate();
    const [tabActiva, setTabActiva] = useState('tareas');
    const [tareas, setTareas] = useState([]); // Inicia vacío
    const [componentes, setComponentes] = useState([]); // Inicia vacío
    const [cotizacion, setCotizacion] = useState({
        materiales: [],
        equipos: [],
        manoObra: [],
        lineaMando: [],
        insumos: [],
        logistica: { alimentacion: 0, traslado: 0, examenes: 0, banos: 0 }
    });
    // --- FUNCIONES DE LOGICA ---
    // En TratamientoScreen
    const manejarGuardadoFinal = () => {
        const otParaGuardar = {
            ...otSeleccionada, // Datos originales
            tareas: tareas     // Tus nuevas tareas creadas con agregarTarea
        };

        actualizarOtGlobal(otSeleccionada._id, otParaGuardar);
    };

    // Dentro de TratamientoScreen.js
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

    // Función para añadir componente con la nueva estructura
    const agregarComponente = () => {
        setComponentes([
            ...componentes,
            { id: Date.now(), codigo: '', descripcion: '', cantidad: 1, precio: 0 }
        ]);
    };

    // Función para actualizar campos de componentes
    const actualizarComponente = (index, campo, valor) => {
        // Usamos map para crear un array totalmente nuevo
        const nuevosComponentes = componentes.map((c, i) => {
            if (i === index) {
                // Retornamos una COPIA del objeto con el nuevo valor
                return {
                    ...c,
                    [campo]: (campo === 'cantidad' || campo === 'precio')
                        ? parseFloat(valor || 0)
                        : valor,

                };
            }
            return c; // El resto queda igual
        });

        setComponentes(nuevosComponentes);
    };


    // Funciones para Materiales/Equipos Cotizados
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

    // --- CÁLCULOS DINÁMICOS ---
    const calcularSubtotal = (lista) => lista.reduce((sum, i) => sum + (Number(i.cantidad || 0) * Number(i.unitario || 0)), 0);

    const totalEqui = calcularSubtotal(cotizacion.equipos);
    const totalInsumos = calcularSubtotal(cotizacion.insumos);
    // Totales agrupados de la pestaña Componentes
    const totalEquipos = componentes.reduce((sum, c) => sum + (c.tipo === 'Equipo' ? Number(c.cantidad * c.precio) : 0), 0);
    const totalHerramientas = componentes.reduce((sum, c) => sum + (c.tipo === 'Herramienta' ? Number(c.cantidad * c.precio) : 0), 0);
    const totalInsumosMateriales = componentes.reduce((sum, c) => sum + (c.tipo === 'Insumo' || c.tipo === 'Material' ? Number(c.cantidad * c.precio) : 0), 0);
    // Mano de obra (puedes sumarlo de la tabla de HH en cotización o de las tareas)

    // El Gran Total actualizado
    // ... (resto del código igual)

    // 1. Función ÚNICA para preparar los datos (evitamos repetir código)
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

            estado: 'Generada', // Le avisamos al backend que ya debe pasar a la Gantt
            fechaGeneracion: new Date().toISOString()
        };
    };


    const guardarPlanificacion = async () => {
        // 1. Limpiamos los objetos para que MongoDB no se confunda con IDs inválidos
        const logisticaLimpia = logistica.map(item => {
            const { _id, id, ...resto } = item;
            // Si el _id parece un ObjectId de Mongo (24 chars), lo dejamos. 
            // Si es el temporal de React, lo quitamos.
            return (String(_id).length === 24) ? { _id, ...resto } : resto;
        });

        const componentesLimpios = componentes.map(item => {
            const { _id, id, ...resto } = item;
            return (String(_id).length === 24) ? { _id, ...resto } : resto;
        });

        // 2. Construimos el objeto final
        const dataCompleta = {
            ...datosRecibidos,
            tareas: tareas,
            componentes: componentesLimpios,
            logistica: logisticaLimpia,
            granTotal: granTotal,
            estado: 'Generada'
        };

        console.log("Enviando datos limpios al servidor...", dataCompleta);

        // 3. Enviamos a App.js
        const exito = await actualizarOtGlobal(datosRecibidos._id, dataCompleta);

        if (exito) {
            alert("Planificación guardada con éxito.");
        }
    };

    // 3. Función para FINALIZAR TODO (Guarda + PDF + Navegar)
    const finalizarYCotizar = async () => {
        // 1. Validación de seguridad
        if (granTotal === 0) {
            const confirmar = window.confirm("⚠️ La cotización está en $0. ¿Deseas generar el PDF de todas formas?");
            if (!confirmar) return;
        }

        try {
            const payload = prepararPayload();

            // --- 🚀 CORRECCIÓN CRÍTICA DE RUTA ---
            // Cambiamos `${API}/convertir-ot` por `${API}/ots/convertir-ot`
            const respuesta = await axios.post(`${API}/ots/convertir-ot`, payload);

            if (respuesta.status === 200 || respuesta.status === 201) {
                // 2. Sincronizamos el estado global en App.js
                if (typeof cargarDatos === 'function') {
                    await cargarDatos();
                }

                // 3. Generar el documento (solo si el backend confirmó el guardado)
                generarPDF();

                alert("✅ Cotización guardada en Atlas y PDF generado con éxito.");
                navigate('/');
            }
        } catch (error) {
            console.error("❌ Error al finalizar:", error);
            // Mostramos un mensaje más descriptivo si el backend nos da detalles
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

            // CASO A: Ya es una OT generada (Buscamos en el servidor)
            if (datosRecibidos.estado !== 'Pendiente') {
                try {
                    const res = await axios.get(`${API}/ots/${datosRecibidos._id}`);

                    if (res.data) {
                        // Seteamos solo si el servidor tiene datos, si no, inicializamos vacío
                        setTareas(res.data.tareas?.length > 0 ? res.data.tareas : [{ id: 1, descripcion: '', puesto: '', duracion: '', fecha: '', hora: '' }]);
                        setComponentes(res.data.componentes || []);
                        setLogistica(res.data.logistica || []);
                        if (res.data.cotizacionDetalle) setCotizacion(res.data.cotizacionDetalle);
                    }
                } catch (error) {
                    console.error("❌ Error al recuperar de Atlas:", error);
                }
            }
            // CASO B: Es una solicitud nueva (Iniciamos formulario limpio)
            else {
                setTareas([{ id: 1, descripcion: '', puesto: '', duracion: '', fecha: '', hora: '' }]);
                setComponentes([]);
                setLogistica([{ id: Date.now(), descripcion: '', cantidad: 1, precio: 0 }]);
            }
        };

        cargarDetalleOT();
    }, [datosRecibidos?._id, datosRecibidos?.estado]); // Se dispara al cargar o al cambiar el estado (después de guardar)
    // ... (resto del código igual)
    // Estado independiente para Logística
    const [logistica, setLogistica] = useState([
        { id: Date.now(), descripcion: '', cantidad: 1, precio: 0 }
    ]);

    // Función para añadir ítem de logística
    const agregarLogistica = () => {
        setLogistica([...logistica,
        {
            _id: Date.now().toString(),
            descripcion: '',
            cantidad: 1,
            precio: 0
        }]);
    };

    // Función para actualizar ítem de logística
    const actualizarLogistica = (index, campo, valor) => {
        setLogistica(logistica.map((item, i) =>
            i === index
                ? { ...item, [campo]: (campo === 'cantidad' || campo === 'precio') ? Number(valor) : valor }
                : item
        ));
    };

    const generarPDF = async () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // 1. Encabezado
        doc.setFontSize(18);
        doc.setTextColor(44, 62, 80);
        doc.text("COTIZACIÓN TÉCNICA Y COMERCIAL", pageWidth / 2, 20, { align: 'center' });

        doc.setFontSize(10);
        doc.text(`OT N°: ${datosRecibidos?._id || 'N/A'}`, 14, 30);

        // 2. Tabla de Materiales
        autoTable(doc, {
            startY: 40,
            head: [['1. MATERIALES / REPUESTOS', 'CANT.', 'SUBTOTAL']],
            body: componentes.map(c => [
                c.descripcion,
                c.cantidad,
                `$ ${(Number(c.cantidad) * Number(c.precio)).toLocaleString()}`
            ]),
            headStyles: { fillColor: [44, 62, 80] }
        });

        // 3. Tabla de Mano de Obra
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 10,
            head: [['2. PLAN DE TRABAJO', 'PUESTO', 'HRS', 'SUBTOTAL']],
            body: tareas.map(t => [
                t.descripcion,
                t.puesto,
                t.duracion,
                `$ ${(Number(t.duracion) * Number(t.valorHora)).toLocaleString()}`
            ]),
            headStyles: { fillColor: [52, 73, 94] }
        });

        // --- 4. SECCIÓN CARTA GANTT (CAPTURA VISUAL) ---
        const finalYPlan = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(12);
        doc.text("3. CRONOGRAMA DE EJECUCIÓN (GANTT)", 14, finalYPlan);

        // Capturamos el elemento HTML de la Gantt
        const ganttElement = document.getElementById('seccion-gantt-visual');
        if (ganttElement) {
            const canvas = await html2canvas(ganttElement, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');

            // Ajustamos la imagen al ancho del PDF
            const imgWidth = pageWidth - 28;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            doc.addImage(imgData, 'PNG', 14, finalYPlan + 5, imgWidth, imgHeight);

            // Actualizamos la posición para la siguiente tabla
            var nextY = finalYPlan + imgHeight + 15;
        } else {
            var nextY = finalYPlan + 10;
        }

        // 5. Tabla de Logística
        autoTable(doc, {
            startY: nextY,
            head: [['4. LOGÍSTICA Y TRASLADOS', 'SUBTOTAL']],
            body: logistica.map(l => [
                l.descripcion,
                `$ ${(Number(l.cantidad) * Number(l.precio)).toLocaleString()}`
            ]),
            headStyles: { fillColor: [127, 140, 141] }
        });

        // 6. Resumen de Totales
        const resY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(11);
        doc.text(`TOTAL NETO: $ ${granTotal.toLocaleString()}`, pageWidth - 15, resY, { align: 'right' });
        doc.text(`IVA (19%): $ ${(granTotal * 0.19).toLocaleString()}`, pageWidth - 15, resY + 7, { align: 'right' });
        doc.setFontSize(13);
        doc.text(`TOTAL BRUTO: $ ${(granTotal * 1.19).toLocaleString()}`, pageWidth - 15, resY + 15, { align: 'right' });

        // 7. Guardar
        doc.save(`Cotizacion_OT_${datosRecibidos._id}.pdf`);
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


    // Sumamos la mano de obra de todas las tareas
    const totalManoObraTareas = tareas.reduce((sum, t) =>
        sum + (Number(t.duracion || 0) * Number(t.valorHora || 0)), 0);

    // Actualizamos el granTotal incluyendo este nuevo valor
    const granTotal = totalMateriales + totalManoObra + totalLogisticaFinal;

    // 1. Extraer días únicos de las tareas para las columnas
    const diasPlanificados = [...new Set(tareas
        .filter(t => t.fecha)
        .map(t => t.fecha))]
        .sort();

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
        const nuevaLog = ot.logistica.filter((_, i) => i !== index);
        setOt({ ...ot, logistica: nuevaLog });
    };

    if (!datosRecibidos) return <div style={{ padding: '50px' }}>⚠️ No hay datos.</div>;

    return (
        <div style={styles.container}>
            <div style={styles.cardFull}>
                <div style={styles.header}>
                    <h2>{datosRecibidos.tareas ? '📝 Editando Planificación' : '⚙️ Tratamiento Técnico'} : OT #{datosRecibidos._id}</h2>
                    <p>Cliente: <strong>{datosRecibidos.solicitante || datosRecibidos.cliente}</strong></p>
                </div>

                <div style={styles.tabBar}>
                    <button onClick={() => setTabActiva('tareas')} style={tabActiva === 'tareas' ? styles.tabBtnActive : styles.tabBtn}>1. Tareas</button>
                    <button onClick={() => setTabActiva('componentes')} style={tabActiva === 'componentes' ? styles.tabBtnActive : styles.tabBtn}>2. Componentes (Técnicos)</button>
                    <button onClick={() => setTabActiva('Logistica')} style={tabActiva === 'Logistica' ? styles.tabBtnActive : styles.tabBtn}>3. Logística</button>
                    <button onClick={() => setTabActiva('cotizacion')} style={tabActiva === 'cotizacion' ? styles.tabBtnActive : styles.tabBtn}>3. Cotización Comercial</button>
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
                                        <th>Fecha</th>
                                        <th>Hora</th>
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
                                                <select style={styles.inputTable} value={t.puesto} onChange={(e) => actualizarTarea(idx, 'puesto', e.target.value)}>
                                                    <option value="">Seleccionar...</option>
                                                    <option value="Mecánico">Mecánico</option>
                                                    <option value="Soldador">Soldador</option>
                                                    <option value="Eléctrico">Eléctrico</option>
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
                                            <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '0 10px' }}>
                                                {(() => {
                                                    const sub = (Number(t.duracion) || 0) * (Number(t.valorHora) || 0);
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
                        </div>
                    )}

                    {tabActiva === 'componentes' && ( // O la pestaña que corresponda
                        <div>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                                        <th style={{ width: '40%' }}>Código</th>
                                        <th style={{ width: '20%' }}>Descripción</th>
                                        <th style={{ width: '15%' }}>Cant.</th>
                                        <th style={{ width: '20%' }}>Precio Unit.</th>
                                        <th style={{ width: '5%' }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(componentes || []).map((c, idx) => (
                                        <tr key={c.id || c._id || idx} style={{ borderBottom: '1px solid #ddd' }}>
                                            {/* COLUMNA CÓDIGO */}
                                            <td style={styles.td}>
                                                <input
                                                    style={styles.inputTable}
                                                    placeholder="Ej: MAT-001"
                                                    value={c.codigo || ''}
                                                    onChange={(e) => actualizarComponente(idx, 'codigo', e.target.value)}
                                                />
                                            </td>
                                            {/* COLUMNA DESCRIPCIÓN */}
                                            <td style={styles.td}>
                                                <input
                                                    style={{ ...styles.inputTable, width: '100%' }}
                                                    placeholder="Nombre del componente..."
                                                    value={c.descripcion || ''}
                                                    onChange={(e) => actualizarComponente(idx, 'descripcion', e.target.value)}
                                                />
                                            </td>
                                            {/* COLUMNA CANTIDAD */}
                                            <td style={{ ...styles.td, textAlign: 'center' }}>
                                                <input
                                                    type="number"
                                                    style={{ ...styles.inputTable, textAlign: 'center', width: '50px' }}
                                                    value={c.cantidad || 0}
                                                    onChange={(e) => actualizarComponente(idx, 'cantidad', e.target.value)}
                                                />
                                            </td>
                                            {/* COLUMNA PRECIO */}
                                            <td style={{ ...styles.td, textAlign: 'right' }}>
                                                <input
                                                    type="number"
                                                    style={{ ...styles.inputTable, textAlign: 'right', width: '90px' }}
                                                    value={c.precio || 0}
                                                    onChange={(e) => actualizarComponente(idx, 'precio', e.target.value)}
                                                />
                                            </td>
                                            {/* COLUMNA TOTAL FILA */}
                                            <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>
                                                $ {(Number(c.cantidad || 0) * Number(c.precio || 0)).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={agregarComponente} style={{ ...styles.btnPrimario, marginTop: '15px' }}>
                                + Añadir Componente
                            </button>
                        </div>
                    )}

                    {tabActiva === 'Logistica' && (
                        <div>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa' }}>
                                        <th style={{ width: '60%' }}>Descripción del Servicio Logístico (Fletes, Viáticos, Arriendos)</th>
                                        <th style={{ width: '10%' }}>Cant.</th>
                                        <th style={{ width: '15%' }}>Precio Unit.</th>
                                        <th style={{ width: '15%' }}>Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logistica.map((item, idx) => (
                                        <tr key={item._id}>
                                            <td>
                                                <input
                                                    style={styles.inputTable}
                                                    placeholder="Ej: Flete Antofagasta - Santiago"
                                                    value={item.descripcion}
                                                    onChange={(e) => actualizarLogistica(idx, 'descripcion', e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    style={styles.inputTable}
                                                    value={item.cantidad || ''}
                                                    onChange={(e) => actualizarLogistica(idx, 'cantidad', e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    style={styles.inputTable}
                                                    value={item.precio || ''}
                                                    onChange={(e) => actualizarLogistica(idx, 'precio', e.target.value)}
                                                />
                                            </td>
                                            <td style={styles.celdaSubtotal}>
                                                $ {(Number(item.cantidad || 0) * Number(item.precio || 0)).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={agregarLogistica} style={styles.btnAdd}>+ Añadir Item Logístico</button>
                        </div>
                    )}

                    {tabActiva === 'cotizacion' && (
                        <div style={styles.documentoHoja}>
                            {/* ENCABEZADO PROFESIONAL */}
                            <div style={styles.headerDoc}>
                                <h2 style={{ textAlign: 'center', color: '#2c3e50' }}>COTIZACIÓN TÉCNICA Y COMERCIAL</h2>
                                <p><strong>OT N°:</strong> {datosRecibidos?._id || 'N/A'}</p>
                            </div>

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
                            {/* SECCIÓN 3: CRONOGRAMA DE EJECUCIÓN (Estilo Plano de Ejecución) */}
                            <section style={styles.seccionDoc}>
                                <h4 style={styles.tituloSeccionDoc}>3. Cronograma de Ejecución (Gantt)</h4>
                                <div id="seccion-gantt-visual" style={{ backgroundColor: 'white', padding: '10px', overflowX: 'auto' }}>
                                    <table style={{ ...styles.tableDoc, fontSize: '11px', borderCollapse: 'collapse', width: '100%' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#2c3e50', color: 'white' }}>
                                                <th style={{ padding: '8px', border: '1px solid #ddd' }}>#</th>
                                                <th style={{ padding: '8px', border: '1px solid #ddd' }}>Descripción General / OT</th>
                                                <th style={{ padding: '8px', border: '1px solid #ddd' }}>Personal</th>
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
                                                                    fontSize: '10px',
                                                                    fontWeight: 'bold',
                                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                                }}>
                                                                    {t.hora}
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

                            {/* SECCIÓN 4: LOGÍSTICA */}
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

                </div>
                <div style={styles.footerAcciones}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            style={styles.btnSecundario}
                        >
                            ❌ Cancelar
                        </button>

                        <button
                            type="button"
                            onClick={() => guardarPlanificacion(false)}
                            style={styles.btnPlanificar}
                        >
                            💾 Solo Guardar Planificación
                        </button>
                    </div>

                    {/* Este botón destaca más y sugiere el cierre del proceso */}
                    <button
                        type="button"
                        onClick={finalizarYCotizar}
                        style={tabActiva === 'cotizacion' ? styles.btnSuccessFinal : styles.btnSuccessInactivo}
                    >
                        💰 {tabActiva === 'cotizacion' ? 'FINALIZAR Y GENERAR COTIZACIÓN' : 'IR A COTIZAR'}
                    </button>
                </div>            </div>

        </div>
    );
};

// ESTILOS ADICIONALES PARA EL DISEÑO NUEVO
const styles = {
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
    table: { tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', marginBottom: '10px' },
    headerTable: { background: '#f8f9fa', textAlign: 'left' },
    inputTable: { width: '90%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' },
    celdaSubtotal: { textAlign: 'right', fontWeight: 'bold', paddingRight: '10px' },
    cotizadorGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' },
    subTitulo: { borderLeft: '4px solid #3498db', paddingLeft: '10px', color: '#2c3e50', marginBottom: '15px' },
    logisticaForm: { display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #eee' },
    inputGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    resumenCaja: { marginTop: '20px', padding: '25px', background: '#2c3e50', color: 'white', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' },
    resumenLinea: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '15px' },
    totalTexto: { color: '#27ae60', margin: '10px 0 0 0', textAlign: 'right' },
    btnAddSmall: { padding: '8px 15px', background: '#34495e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
    btnSuccess: { width: '100%', marginTop: '30px', padding: '18px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(39, 174, 96, 0.3)' },
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