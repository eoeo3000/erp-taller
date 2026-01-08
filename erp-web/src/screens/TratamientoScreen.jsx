import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


const TratamientoScreen = () => {
    const { state: datosRecibidos } = useLocation();
    const navigate = useNavigate();
    const [tabActiva, setTabActiva] = useState('tareas');

    // ESTADOS PRINCIPALES
    const [tareas, setTareas] = useState(
        datosRecibidos?.tareas ? datosRecibidos.tareas : [{ id: 1, descripcion: '', puesto: '', duracion: '', fecha: '', hora: '' }]
    );
    const [componentes, setComponentes] = useState([]);

    // NUEVO ESTADO PARA COTIZACIÓN
    const [cotizacion, setCotizacion] = useState({
        materiales: [],
        equipos: [],
        manoObra: [], // Técnicos
        lineaMando: [], // Supervisores/Prevencionistas
        insumos: [], // Servicios externos o consumibles
        logistica: { alimentacion: 0, traslado: 0, examenes: 0, banos: 0 }
    });

    // --- FUNCIONES DE LOGICA ---
    const agregarTarea = () => {
        setTareas([...tareas, { id: tareas.length + 1, descripcion: '', puesto: '', duracion: '', fecha: '', hora: '' }]);
    };

    const actualizarTarea = (index, campo, valor) => {
        const nuevasTareas = [...tareas];
        nuevasTareas[index][campo] = valor;
        setTareas(nuevasTareas);
    };

    const agregarComponente = () => {
        setComponentes([...componentes, { id: componentes.length + 1, codigo: '', cantidad: '', tareaVinculada: '' }]);
    };
    // Funciones para Materiales/Equipos Cotizados
    const agregarItemCotizacion = (tipo) => {
        const nuevoItem = { id: Date.now(), descripcion: '', cantidad: 1, unitario: 0 };
        setCotizacion({ ...cotizacion, [tipo]: [...cotizacion[tipo], nuevoItem] });
    };

    const actualizarItemCotizacion = (tipo, id, campo, valor) => {
        const listaActualizada = cotizacion[tipo].map(item =>
            item.id === id ? { ...item, [campo]: valor } : item
        );
        setCotizacion({ ...cotizacion, [tipo]: listaActualizada });
    };

    // --- CÁLCULOS DINÁMICOS ---
    const calcularSubtotal = (lista) => lista.reduce((sum, i) => sum + (Number(i.cantidad || 0) * Number(i.unitario || 0)), 0);

    const totalMat = calcularSubtotal(cotizacion.materiales);
    const totalEqui = calcularSubtotal(cotizacion.equipos);
    const totalMO = calcularSubtotal(cotizacion.manoObra);
    const totalMando = calcularSubtotal(cotizacion.lineaMando);
    const totalInsumos = calcularSubtotal(cotizacion.insumos);
    const totalLog = Object.values(cotizacion.logistica).reduce((a, b) => a + Number(b), 0);

    const granTotal = totalMat + totalEqui + totalMO + totalMando + totalInsumos + totalLog;

    const finalizar = async () => {
        if (tareas.length === 0 && granTotal === 0) {
            alert("⚠️ Por favor, ingrese tareas o costos antes de finalizar.");
            return;
        }

        try {
            const payload = {
                otId: datosRecibidos?.id,
                solicitudId: datosRecibidos?.id,
                esEdicion: !!datosRecibidos?.tareas,
                tareas: tareas,
                componentes: componentes,
                cotizacionDetalle: {
                    manoObra: cotizacion.manoObra,
                    lineaMando: cotizacion.lineaMando,
                    materiales: cotizacion.materiales,
                    equipos: cotizacion.equipos,
                    insumos: cotizacion.insumos,
                    logistica: cotizacion.logistica
                },
                resumenFinanciero: {
                    totalNeto: granTotal,
                    iva: granTotal * 0.19,
                    totalGeneral: granTotal * 1.19
                },
                fechaGeneracion: new Date().toISOString()
            };

            const respuesta = await axios.post('http://localhost:5000/api/convertir-ot', payload);

            if (respuesta.status === 200 || respuesta.status === 201) {
                // --- PASO CLAVE: GENERAR EL PDF ANTES DE SALIR ---
                generarPDF();

                alert("✅ Cotización guardada y PDF generado correctamente.");
                navigate('/gantt');
            }
        } catch (error) {
            console.error("Error:", error);
            alert("❌ Error al procesar la cotización.");
        }
    };

    const generarPDF = () => {
        const doc = new jsPDF();

        // En lugar de usar doc.autoTable directamente, usamos la función importada
        autoTable(doc, {
            startY: 45,
            head: [['Descripción', 'Cant.', 'Precio Unit.', 'Subtotal']],
            body: [
                ...cotizacion.manoObra.map(i => [i.descripcion, i.cantidad, i.unitario, (i.cantidad * i.unitario)]),
                // ... resto de tus mapeos
            ],
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80] }
        });

        // Para las siguientes tablas, usas doc.lastAutoTable.finalY normalmente
        const finalY = doc.lastAutoTable.finalY + 10;

        autoTable(doc, {
            startY: finalY,
            head: [['Materiales', 'Cant.', 'Unitario', 'Subtotal']],
            body: cotizacion.materiales.map(i => [i.descripcion, i.cantidad, i.unitario, i.cantidad * i.unitario]),
        });

        doc.save(`Cotizacion_OT_${datosRecibidos.id}.pdf`);
    };

    if (!datosRecibidos) return <div style={{ padding: '50px' }}>⚠️ No hay datos.</div>;

    return (
        <div style={styles.container}>
            <div style={styles.cardFull}>
                <div style={styles.header}>
                    <h2>{datosRecibidos.tareas ? '📝 Editando Planificación' : '⚙️ Tratamiento Técnico'} : OT #{datosRecibidos.id}</h2>
                    <p>Cliente: <strong>{datosRecibidos.solicitante || datosRecibidos.cliente}</strong></p>
                </div>

                <div style={styles.tabBar}>
                    <button onClick={() => setTabActiva('tareas')} style={tabActiva === 'tareas' ? styles.tabBtnActive : styles.tabBtn}>1. Tareas</button>
                    <button onClick={() => setTabActiva('componentes')} style={tabActiva === 'componentes' ? styles.tabBtnActive : styles.tabBtn}>2. Componentes (Técnicos)</button>
                    <button onClick={() => setTabActiva('cotizacion')} style={tabActiva === 'cotizacion' ? styles.tabBtnActive : styles.tabBtn}>3. Cotización Comercial</button>
                </div>

                <div style={styles.content}>
                    {/* VISTA 1: TAREAS */}
                    {tabActiva === 'tareas' && (
                        <div>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa' }}>
                                        <th>Descripción</th><th>Puesto</th><th>Hrs</th><th>Fecha</th><th>Hora</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tareas.map((t, idx) => (
                                        <tr key={t.id}>
                                            <td><input style={styles.inputTable} value={t.descripcion} onChange={(e) => actualizarTarea(idx, 'descripcion', e.target.value)} /></td>
                                            <td><select style={styles.inputTable} value={t.puesto} onChange={(e) => actualizarTarea(idx, 'puesto', e.target.value)}>
                                                <option value="">Seleccionar...</option>
                                                <option value="Mecánico">Mecánico</option>
                                                <option value="Soldador">Soldador</option>
                                            </select></td>
                                            <td><input type="number" style={styles.inputTable} value={t.duracion} onChange={(e) => actualizarTarea(idx, 'duracion', e.target.value)} /></td>
                                            <td><input type="date" style={styles.inputTable} value={t.fecha} onChange={(e) => actualizarTarea(idx, 'fecha', e.target.value)} /></td>
                                            <td><input type="time" style={styles.inputTable} value={t.hora} onChange={(e) => actualizarTarea(idx, 'hora', e.target.value)} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={agregarTarea} style={styles.btnAdd}>+ Añadir Tarea</button>
                        </div>
                    )}

                    {tabActiva === 'componentes' && (
                        <div>
                            <table style={styles.table}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa' }}>
                                        <th>Descripción</th><th>Puesto</th><th>Hrs</th><th>Fecha</th><th>Hora</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tareas.map((t, idx) => (
                                        <tr key={t.id}>
                                            <td><input style={styles.inputTable} value={t.descripcion} onChange={(e) => actualizarTarea(idx, 'descripcion', e.target.value)} /></td>
                                            <td><select style={styles.inputTable} value={t.puesto} onChange={(e) => actualizarTarea(idx, 'puesto', e.target.value)}>
                                                <option value="">Seleccionar...</option>
                                                <option value="Mecánico">Mecánico</option>
                                                <option value="Soldador">Soldador</option>
                                            </select></td>
                                            <td><input type="number" style={styles.inputTable} value={t.duracion} onChange={(e) => actualizarTarea(idx, 'duracion', e.target.value)} /></td>
                                            <td><input type="date" style={styles.inputTable} value={t.fecha} onChange={(e) => actualizarTarea(idx, 'fecha', e.target.value)} /></td>
                                            <td><input type="time" style={styles.inputTable} value={t.hora} onChange={(e) => actualizarTarea(idx, 'hora', e.target.value)} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button onClick={agregarTarea} style={styles.btnAdd}>+ Añadir Tarea</button>
                        </div>
                    )}
                    {tabActiva === 'cotizacion' && (
                        <div style={styles.cotizadorGrid}>
                            <div style={styles.seccionCostos}>
                                {/* --- CATEGORÍA: MANO DE OBRA Y SUPERVISIÓN --- */}
                                <h4 style={styles.subTitulo}>👷 Mano de Obra (Técnicos) / Línea de Mando</h4>
                                <table style={styles.table}>
                                    <thead>
                                        <tr style={styles.headerTable}>
                                            <th>Descripción (Cargo/Rol)</th><th>Cant.</th><th>Valor Unitario</th><th>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...cotizacion.manoObra, ...cotizacion.lineaMando].map((item) => (
                                            <tr key={item.id}>
                                                <td><input style={styles.inputTable} placeholder="Ej: Mecánico A / Supervisor" value={item.descripcion} onChange={(e) => actualizarItemCotizacion('manoObra', item.id, 'descripcion', e.target.value)} /></td>
                                                <td><input type="number" style={styles.inputTable} value={item.cantidad} onChange={(e) => actualizarItemCotizacion('manoObra', item.id, 'cantidad', e.target.value)} /></td>
                                                <td><input type="number" style={styles.inputTable} value={item.unitario} onChange={(e) => actualizarItemCotizacion('manoObra', item.id, 'unitario', e.target.value)} /></td>
                                                <td style={styles.celdaSubtotal}>$ {(item.cantidad * item.unitario).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button onClick={() => agregarItemCotizacion('manoObra')} style={styles.btnAddSmall}>+ Añadir Personal</button>

                                {/* --- CATEGORÍA: MATERIALES, EQUIPOS E INSUMOS --- */}
                                <h4 style={{ ...styles.subTitulo, marginTop: '30px' }}>🏗️ Materiales Directos, Equipos e Insumos</h4>
                                <table style={styles.table}>
                                    <thead>
                                        <tr style={styles.headerTable}>
                                            <th>Descripción del Ítem / Servicio</th><th>Cant.</th><th>Valor Unitario</th><th>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...cotizacion.materiales, ...cotizacion.equipos, ...cotizacion.insumos].map((item) => (
                                            <tr key={item.id}>
                                                <td><input style={styles.inputTable} placeholder="Ej: Acero / Arriendo Grúa" value={item.descripcion} onChange={(e) => actualizarItemCotizacion('materiales', item.id, 'descripcion', e.target.value)} /></td>
                                                <td><input type="number" style={styles.inputTable} value={item.cantidad} onChange={(e) => actualizarItemCotizacion('materiales', item.id, 'cantidad', e.target.value)} /></td>
                                                <td><input type="number" style={styles.inputTable} value={item.unitario} onChange={(e) => actualizarItemCotizacion('materiales', item.id, 'unitario', e.target.value)} /></td>
                                                <td style={styles.celdaSubtotal}>$ {(item.cantidad * item.unitario).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button onClick={() => agregarItemCotizacion('materiales')} style={styles.btnAddSmall}>+ Añadir Material / Insumo</button>
                            </div>

                            {/* --- PANEL LATERAL: LOGÍSTICA Y RESUMEN TOTAL --- */}
                            <div style={styles.seccionLogistica}>
                                <h4>🚚 Gastos Generales y Logística</h4>
                                <div style={styles.logisticaForm}>
                                    <div style={styles.inputGroup}>
                                        <label>Alimentación</label>
                                        <input type="number" value={cotizacion.logistica.alimentacion} onChange={(e) => setCotizacion({ ...cotizacion, logistica: { ...cotizacion.logistica, alimentacion: e.target.value } })} />
                                    </div>
                                    <div style={styles.inputGroup}>
                                        <label>Traslado Personal</label>
                                        <input type="number" value={cotizacion.logistica.traslado} onChange={(e) => setCotizacion({ ...cotizacion, logistica: { ...cotizacion.logistica, traslado: e.target.value } })} />
                                    </div>
                                    <div style={styles.inputGroup}>
                                        <label>Habilitación/Exámenes</label>
                                        <input type="number" value={cotizacion.logistica.examenes} onChange={(e) => setCotizacion({ ...cotizacion, logistica: { ...cotizacion.logistica, examenes: e.target.value } })} />
                                    </div>
                                    <div style={styles.inputGroup}>
                                        <label>Baños Químicos/Otros</label>
                                        <input type="number" value={cotizacion.logistica.banos} onChange={(e) => setCotizacion({ ...cotizacion, logistica: { ...cotizacion.logistica, banos: e.target.value } })} />
                                    </div>
                                </div>

                                <div style={styles.resumenCaja}>
                                    <p style={{ fontSize: '14px', marginBottom: '5px' }}>DESGLOSE TOTAL</p>
                                    <div style={styles.resumenLinea}><span>HH y Supervisión:</span> <span>$ {totalMO.toLocaleString()}</span></div>
                                    <div style={styles.resumenLinea}><span>Materiales/Insumos:</span> <span>$ {totalMat.toLocaleString()}</span></div>
                                    <div style={styles.resumenLinea}><span>Logística:</span> <span>$ {totalLog.toLocaleString()}</span></div>
                                    <hr style={{ borderColor: '#555' }} />
                                    <h2 style={styles.totalTexto}>TOTAL: $ {granTotal.toLocaleString()}</h2>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div style={styles.footerAcciones}>
                    <button onClick={() => navigate(-1)} style={styles.btnSecundario}>
                        ❌ Cancelar y Volver
                    </button>

                    <button onClick={finalizar} style={styles.btnSuccessFinal}>
                        💰 GENERAR COTIZACIÓN Y PLANIFICACIÓN
                    </button>
                </div>
                <button onClick={finalizar} style={styles.btnSuccess}>APROBAR Y GENERAR PLANO COMPLETO</button>
            </div>

        </div>
    );
};

// ESTILOS ADICIONALES PARA EL DISEÑO NUEVO
const styles = {
    // ... tus estilos base ...
    container: { width: '100%', minHeight: '100vh', padding: '20px', backgroundColor: '#f0f2f5' },
    cardFull: { background: 'white', borderRadius: '10px', padding: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
    tabBar: { display: 'flex', gap: '5px', marginBottom: '0' },
    tabBtn: { padding: '12px 25px', border: '1px solid #ddd', cursor: 'pointer', borderRadius: '8px 8px 0 0', background: '#f8f9fa' },
    tabBtnActive: { padding: '12px 25px', border: '1px solid #3498db', borderBottom: '2px solid white', background: 'white', fontWeight: 'bold', color: '#3498db', borderRadius: '8px 8px 0 0', zIndex: 1 },
    content: { border: '1px solid #ddd', padding: '25px', borderRadius: '0 8px 8px 8px', marginTop: '-1px' },
    table: { width: '100%', borderCollapse: 'collapse', marginBottom: '10px' },
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
    btnSuccess: { width: '100%', marginTop: '30px', padding: '18px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(39, 174, 96, 0.3)' }
};

export default TratamientoScreen;