import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Estado para el calendario que se está creando o editando
// 3. Objeto inicial limpio para resetear formularios
const estadoInicialCalendario = {
    nombre: '',
    tipo: 'semanal', // 'semanal' o 'rotativo'
    cicloDias: 7, // Solo para tipo 'rotativo'
    config: [
        { dia: 'lun', activo: true, bloques: [] },
        { dia: 'mar', activo: true, bloques: [] },
        { dia: 'mié', activo: true, bloques: [] },
        { dia: 'jue', activo: true, bloques: [] },
        { dia: 'vie', activo: true, bloques: [] },
        { dia: 'sáb', activo: false, bloques: [] },
        { dia: 'dom', activo: false, bloques: [] }
    ]
};

const RecursosScreen = (
    { recursos = [],
        calendarios = [],
        setRecursos,
        actualizarAjusteRecurso,
        actualizarRecurso,
        eliminarRecurso,
        crearRecurso,
        crearSuministro,
        eliminarSuministro,
        guardarCalendarioGlobal,
        obtenerHorasParaDia,
        asignarCalendario,
        guardarCambioManualGlobal,
        eliminarCalendarioMaestro,
        componentes = [],
        suministros = [],
        actualizarSuministro,
        crearEquipo,
        eliminarEquipo,
        crearPuesto,
        eliminarPuesto,
        puestosDB = [],
        actualizarEquipo,
        plantillas = [],
        crearPlantilla,
        actualizarPlantilla,
        eliminarPlantilla
    }) => {

    const [nuevoRecurso, setNuevoRecurso] = useState({ nombre: '', tipo: 'Humano', especialidad: '', calendarioId: '' });
    const [editandoId, setEditandoId] = useState(null); // null = creando, id = editando
    const [modalAbierto, setModalAbierto] = useState(false);
    const [modalRecursoAbierto, setModalRecursoAbierto] = useState(false);
    const [modalMaestroAbierto, setModalMaestroAbierto] = useState(false);
    const [ajusteManual, setAjusteManual] = useState(null); // { recursoId, dia, horas }
    //const [calendarios, setCalendarios] = useState([]); // <-- Déjalo ASÍ, vacío.
    const [nuevoCal, setNuevoCal] = useState(estadoInicialCalendario);
    const [mostrarModalPersonal, setMostrarModalPersonal] = useState(false);
    const [recursoEnEdicion, setRecursoEnEdicion] = useState(null); // Almacena el ID de la fila activa
    const [datosTemporales, setDatosTemporales] = useState({ nombre: '', puesto: '' });
    // Añadir esto cerca de tus otros hooks
    const [tabActiva, setTabActiva] = useState('Personal');
    const plantillaVacia = { nombre: '', categoria: 'General', descripcion: '', procedimiento: '', tareas: [], componentes: [], logistica: [] };
    const [modalPlantilla, setModalPlantilla] = useState(false);
    const [plantillaEditando, setPlantillaEditando] = useState(null);
    const [formPlantilla, setFormPlantilla] = useState(plantillaVacia);
    // Añade esto donde están tus otros useState
    const [modalPuestosAbierto, setModalPuestosAbierto] = useState(false);
    const [modalComponenteAbierto, setModalComponenteAbierto] = useState({ nombre: '', tipo: 'Herramienta', estado: 'Disponible' });
    const [modalLogisticaAbierto, setModalLogisticaAbierto] = useState({ unidad: '', patente: '', ruta: '' });
    const [isModalCompOpen, setIsModalCompOpen] = useState(false);
    const [isModalLogOpen, setIsModalLogOpen] = useState(false);
    const [nuevoComponente, setNuevoComponente] = useState({
        nombre: '',
        tipo: 'Herramienta',
        estado: 'Disponible'
    });
    // Cambia esto en tus useState
    const [nuevaLogistica, setNuevaLogistica] = useState({
        codigo: '',       // Antes unidad
        descripcion: '',  // Antes patente
        precio: '',       // Antes ruta
        categoria: 'Insumo' // Nueva propiedad para diferenciar tipos de suministros
    });
    useEffect(() => {
        if (editandoId && modalMaestroAbierto) {
            const calOriginal = calendarios.find(c => c._id === editandoId);
            if (calOriginal && (!nuevoCal.nombre || nuevoCal.nombre !== calOriginal.nombre)) {
                setNuevoCal(JSON.parse(JSON.stringify(calOriginal)));
            }
        }
    }, [editandoId, modalMaestroAbierto, calendarios]);
    const prepararEdicion = (cal) => {
        // 1. Guardamos el ID para que el botón "Guardar" sepa que es un PUT y no un POST
        setEditandoId(cal._id);

        // 2. Creamos una copia profunda para no modificar el objeto original por referencia
        const copiaCal = JSON.parse(JSON.stringify(cal));

        // 3. Verificación de seguridad: si no tiene config, le ponemos la base
        if (!copiaCal.config || copiaCal.config.length === 0) {
            copiaCal.config = JSON.parse(JSON.stringify(estadoInicialCalendario.config));
        }

        // 4. Cargamos el estado que alimenta al formulario
        setNuevoCal(copiaCal);
        // 5. Abrimos el modal
        setModalMaestroAbierto(true);
    };
    const abrirNuevoMaestro = () => {
        setEditandoId(null);
        // Usamos JSON.parse/stringify para crear una copia física real
        // y que no arrastre datos del calendario anterior
        setNuevoCal(JSON.parse(JSON.stringify(estadoInicialCalendario)));
        setModalMaestroAbierto(true);
    };
    const actualizarDiasCiclo = (nuevoTotal) => {
        // Validamos que no sea NaN y sea al menos 1
        const total = isNaN(nuevoTotal) || nuevoTotal < 1 ? 1 : nuevoTotal;

        setNuevoCal(prev => {
            let nuevaConfig = [...prev.config];

            if (total > nuevaConfig.length) {
                // Añadir días faltantes
                const diasAAgregar = total - nuevaConfig.length;
                const nuevosDias = Array.from({ length: diasAAgregar }, (_, i) => ({
                    dia: `Día ${nuevaConfig.length + i + 1}`,
                    activo: true,
                    bloques: []
                }));
                nuevaConfig = [...nuevaConfig, ...nuevosDias];
            } else {
                // Recortar días sobrantes
                nuevaConfig = nuevaConfig.slice(0, total);
            }

            return {
                ...prev,
                cicloDias: total,
                config: nuevaConfig,
                // Si es rotativo, renombramos los labels a "Día X" para no confundir
                tipo: prev.tipo === 'semanal' && total !== 7 ? 'rotativo' : prev.tipo
            };
        });
    };
    const guardarCalendario = async () => {
        const exito = await guardarCalendarioGlobal(nuevoCal, editandoId);
        if (exito) {
            // 3. Si el servidor respondió OK, cerramos y limpiamos
            setModalMaestroAbierto(false);
            setEditandoId(null);
            // Usamos JSON.parse para asegurar una copia limpia del estado inicial
            setNuevoCal(JSON.parse(JSON.stringify(estadoInicialCalendario)));

        } else {
            alert("Error al guardar en el servidor");
        }

        // BORRAMOS las líneas extra que tenías aquí abajo que causaban el error
    };
    const [anio, setAnio] = useState(new Date().getFullYear());
    const [mes, setMes] = useState(new Date().getMonth()); // 0 = Enero, 1 = Febrero...
    const cantidadDias = new Date(anio, mes + 1, 0).getDate();
    const diasDelMes = Array.from({ length: cantidadDias }, (_, i) => {
        const fecha = new Date(anio, mes, i + 1);
        const nombre = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(fecha);

        return {
            numero: i + 1,
            nombreDia: nombre.toLowerCase().replace('.', ''),
            esFinde: fecha.getDay() === 0 || fecha.getDay() === 6,
            fechaCompleta: fecha // <--- CLAVE para el cálculo rotativo
        };
    });
    const actualizarHora = (diaIdx, bloqueIdx, campo, valor) => {
        setNuevoCal(prev => {
            // 1. Copia profunda del estado anterior
            const copia = JSON.parse(JSON.stringify(prev));

            // 2. Accedemos con seguridad al bloque y actualizamos el valor
            if (copia.config[diaIdx] && copia.config[diaIdx].bloques[bloqueIdx]) {
                copia.config[diaIdx].bloques[bloqueIdx][campo] = valor;
            }

            return copia;
        });
    };
    const agregarBloque = (diaIdx) => {
        setNuevoCal(prev => {
            const copia = JSON.parse(JSON.stringify(prev));
            // Aseguramos que bloques sea un array antes de hacer push
            if (!copia.config[diaIdx].bloques) copia.config[diaIdx].bloques = [];

            copia.config[diaIdx].bloques.push({ inicio: "08:00", fin: "17:00" });
            return copia;
        });
    };
    const eliminarBloque = (diaIdx, bloqueIdx) => {
        const copia = { ...nuevoCal };
        copia.config[diaIdx].bloques.splice(bloqueIdx, 1);
        setNuevoCal(copia);
    };
    useEffect(() => {
        if (modalMaestroAbierto) {
        }
    }, [nuevoCal, modalMaestroAbierto]);
    const manejarGuardar = async (id) => {
        const datosActualizados = {
            nombre: nombreInput, // El estado de tu input de nombre
            puesto: puestoInput  // El estado de tu select de puesto
        };

        const resultado = await actualizarRecurso(id, datosActualizados);

        if (resultado.success) {
            setEditandoId(null); // Sale del modo edición
            // No necesitas hacer nada más, App.js ya actualizó la lista y las OTs
        } else {
            alert("Hubo un error al guardar los cambios.");
        }
    };
    const prepararEdicionRecurso = (recurso) => {
        // Cargamos los datos en el estado que usa el formulario
        setNuevoRecurso({
            _id: recurso._id,
            nombre: recurso.nombre,
            calendarioId: recurso.calendarioId || '',

            // 🚩 CAMBIO CLAVE: Usa 'puesto' en lugar de (o además de) 'especialidad'
            // para que el <select value={nuevoRecurso.puesto}> lo encuentre.
            puesto: recurso.puesto || recurso.especialidad || '',

            // Mantenemos especialidad por si acaso otros componentes aún la usan
            especialidad: recurso.puesto || recurso.especialidad || '',

            fechaInicioCiclo: recurso.fechaInicioCiclo ? recurso.fechaInicioCiclo.split('T')[0] : ''
        });

        setMostrarModalPersonal(false);
        setModalRecursoAbierto(true);
    };
    if (modalRecursoAbierto) {
    }
    const renderContenidoTab = () => {
        let data = [];
        if (tabActiva === 'Personal') data = recursos;
        if (tabActiva === 'Equipos/Herramientas') data = componentes;
        if (tabActiva === 'Suministros Directos') data = suministros; // <-- Asegúrate de tener este estado
        if (tabActiva === 'Calendarios') data = calendarios;

        if (data.length === 0) {
            return <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No hay registros disponibles.</div>;
        }

        return data.map(item => (
            <div key={item.id || item._id} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 15px', // Coincide con el padding del encabezado
                borderBottom: '1px solid #f1f5f9',
                fontSize: '0.85rem'
            }}>
                {/* PERSONAL */}
                {tabActiva === 'Personal' && (
                    <>
                        {/* 1. Nombre (Se mantiene igual) */}
                        <span style={{ flex: 2, fontWeight: '500', color: '#1e293b' }}>
                            {item.nombre}
                        </span>

                        {/* 2. Especialidad -> CAMBIADO A: item.puesto */}
                        <span style={{ flex: 1.5, color: '#64748b' }}>
                            {item.puesto || 'Sin cargo'}
                        </span>

                        {/* 3. Fecha -> CAMBIADO A: item.createdAt (Formateada) */}
                        <span style={{ flex: 1, color: '#64748b' }}>
                            {item.createdAt
                                ? new Date(item.createdAt).toLocaleDateString()
                                : (item.fechaInicioCiclo || '---')}
                        </span>
                    </>
                )}
                {/* EQUIPOS */}
                {tabActiva === 'Equipos/Herramientas' && <>
                    {/* 🚩 NUEVA COLUMNA DE CÓDIGO */}
                    <span style={{ flex: 1, fontWeight: 'bold', color: '#7f8c8d' }}>
                        {item.codigo || 'S/C'}
                    </span>

                    <span style={{ flex: 2, fontWeight: '500' }}>{item.nombre}</span>

                    <span style={{ flex: 1.5 }}>{item.tipo}</span>

                    {/* COLUMNA DE PRECIO */}
                    <span style={{ flex: 1, fontWeight: 'bold', color: '#27ae60' }}>
                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(item.precio || 0)}
                    </span>

                    <span style={{
                        flex: 1,
                        color: item.estado === 'Disponible' ? '#27ae60' : item.estado === 'En Uso' ? '#f39c12' : '#e74c3c',
                        fontWeight: 'bold'
                    }}>
                        {item.estado}
                    </span>
                </>}
                {/* LOGÍSTICA (Suministros Directos) */}
                {tabActiva === 'Suministros Directos' && <>
                    <span style={{ flex: 2, fontWeight: '500' }}>{item.codigo}</span>
                    <span style={{ flex: 1.5 }}>{item.descripcion}</span>
                    <span style={{ flex: 1 }}>
                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(item.precio || 0)}
                    </span>
                </>}
                {/* CALENDARIOS */}
                {tabActiva === 'Calendarios' && <>
                    <span style={{ flex: 3, fontWeight: '500' }}>{item.nombre}</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>⚙️</span>
                </>}

                {/* ACCIONES (Siempre debe tener el mismo ancho que el encabezado) */}
                <div style={{ width: '70px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button
                        onClick={() => {
                            if (tabActiva === 'Personal') prepararEdicionRecurso(item);
                            if (tabActiva === 'Equipos/Herramientas') {
                                setNuevoComponente(item);
                                setEditandoId(item._id || item.id);
                                setIsModalCompOpen(true);
                            }
                            if (tabActiva === 'Suministros Directos') {
                                setNuevaLogistica(item);      // Carga los datos actuales en el estado del formulario
                                setEditandoId(item._id || item.id); // Guardamos el ID para saber que estamos editando
                                setIsModalLogOpen(true);      // Abrimos el modal de logística
                            }
                            if (tabActiva === 'Calendarios') {
                                setNuevoCalendario(item);
                                setEditandoId(item._id || item.id);
                                setIsModalCalendarioOpen(true);
                            }
                        }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem' }}
                    >
                        ✏️
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation(); // Evita que el clic afecte a otros elementos
                            const id = item._id || item.id;

                            if (window.confirm('¿Estás seguro de eliminar este registro?')) {
                                // Usamos switch para asegurar que solo entre en UNA opción
                                switch (tabActiva) {
                                    case 'Personal':
                                        eliminarRecurso(id);
                                        break;
                                    case 'Equipos/Herramientas':
                                        eliminarEquipo?.(id); // El ?. evita errores si no existe
                                        break;
                                    case 'Suministros Directos':
                                        eliminarSuministro(id);
                                        break;
                                    case 'Calendarios':
                                        eliminarCalendarioMaestro(id);
                                        break;
                                    default:
                                        console.warn("No se encontró una acción para la pestaña:", tabActiva);
                                }
                            }
                        }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem' }}
                    >
                        🗑️
                    </button>

                </div>
            </div>
        ));
    };
    // 1. Definir la lógica de guardado (Crear o Editar)
    const manejarGuardadoSuministro = async () => {
        // 1. Validación
        if (!nuevaLogistica.codigo || !nuevaLogistica.descripcion) {
            alert("El código y la descripción son obligatorios.");
            return;
        }

        // 2. SANITIZACIÓN: Creamos un objeto nuevo con solo los campos del Schema
        // Esto evita enviar el _id accidentalmente al crear uno nuevo
        const datosLimpios = {
            codigo: nuevaLogistica.codigo.trim(),
            descripcion: nuevaLogistica.descripcion,
            precio: Number(nuevaLogistica.precio) || 0,
            categoria: nuevaLogistica.categoria || 'Insumo'
        };

        console.log("📡 Intentando guardar:", datosLimpios);

        let exito;
        if (editandoId) {
            // Para actualizar usamos el ID de la fila, no el del objeto
            exito = await actualizarSuministro(editandoId, datosLimpios);
        } else {
            // Al crear, datosLimpios NO tiene _id, por lo que MongoDB generará uno nuevo
            exito = await crearSuministro(datosLimpios);
        }

        if (exito) {
            setIsModalLogOpen(false);
            setEditandoId(null);
            setNuevaLogistica({
                codigo: '',
                descripcion: '',
                precio: '',
                categoria: 'Insumo'
            });
        }
    };
    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2>⚙️ Gestión de Recursos</h2>
                <p>Configura turnos y visualiza carga horaria.</p>
            </div>
            <div style={styles.layout}>

                {/* NAVEGACIÓN POR PESTAÑAS (Tabs Superiores) */}
                <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
                    {['Personal', 'Equipos/Herramientas', 'Suministros Directos', 'Calendarios', 'Plantillas'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setTabActiva(tab)}
                            style={{
                                padding: '12px 20px',
                                border: 'none',
                                borderBottom: tabActiva === tab ? '3px solid #3498db' : '3px solid transparent',
                                background: 'none',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                color: tabActiva === tab ? '#3498db' : '#64748b',
                                transition: '0.2s'
                            }}
                        >
                            {tab === 'Personal' && '👤 '}
                            {tab === 'Equipos/Herramientas' && '⚙️ '}
                            {tab === 'Suministros Directos' && '📦 '}
                            {tab === 'Calendarios' && '🗓️ '}
                            {tab === 'Plantillas' && '📋 '}
                            {tab}
                        </button>
                    ))}
                </div>

                {/* BLOQUE SUPERIOR DINÁMICO */}
                {tabActiva !== 'Plantillas' && (<><div style={{ display: 'flex', gap: '20px', height: '400px', minWidth: '950px', marginBottom: '25px' }}>

                    {/* IZQUIERDA: Formulario de Creación (Contextual) */}
                    <div style={{
                        flex: '0 0 280px', // Reducido de 350px a 280px
                        backgroundColor: '#fff',
                        padding: '15px', // Padding más ajustado
                        borderRadius: '10px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignSelf: 'flex-start' // Evita que se estire a lo alto si el padre es grande
                    }}>
                        <h3 style={{ marginTop: 0, fontSize: '0.9rem', color: '#64748b', textAlign: 'center', marginBottom: '15px' }}>
                            Acciones: {tabActiva}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {tabActiva === 'Personal' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button
                                        onClick={() => setModalRecursoAbierto(true)}
                                        style={{ ...styles.btnPrimary, padding: '8px 12px', fontSize: '0.85rem' }}
                                    >
                                        ➕ Nuevo Integrante
                                    </button>
                                    <button
                                        onClick={() => setModalPuestosAbierto(true)}
                                        style={{ ...styles.btnPrimary, backgroundColor: '#34495e', padding: '8px 12px', fontSize: '0.85rem' }}
                                    >
                                        🛠️ Gestionar Puestos
                                    </button>
                                </div>

                            )}
                            {tabActiva === 'Equipos/Herramientas' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button onClick={() => setIsModalCompOpen(true)} style={{ ...styles.btnPrimary, backgroundColor: '#8e44ad', padding: '8px 12px', fontSize: '0.85rem' }}>
                                        ➕ Agregar Activo
                                    </button>
                                    <button onClick={() => setIsModalCompOpen(true)} style={{ ...styles.btnPrimary, backgroundColor: '#8e44ad', padding: '8px 12px', fontSize: '0.85rem' }}>
                                        ➕ Crear categoria
                                    </button>
                                </div>
                            )}
                            {tabActiva === 'Suministros Directos' && (
                                <button onClick={() => setIsModalLogOpen(true)} style={{ ...styles.btnPrimary, backgroundColor: '#f39c12', padding: '8px 12px', fontSize: '0.85rem' }}>
                                    ➕ Registrar Logística
                                </button>
                            )}
                            {tabActiva === 'Calendarios' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <input
                                        style={{ ...styles.input, padding: '8px', fontSize: '0.85rem' }}
                                        placeholder="Nombre de plantilla..."
                                        value={nuevoCal.nombre}
                                        onChange={e => setNuevoCal({ ...nuevoCal, nombre: e.target.value })}
                                    />
                                    <button onClick={guardarCalendario} style={{ ...styles.btnPrimary, backgroundColor: '#27ae60', padding: '8px 12px', fontSize: '0.85rem' }}>
                                        💾 Guardar Plantilla
                                    </button>
                                </div>
                            )}
                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginTop: '5px', lineHeight: '1.2' }}>
                                Los cambios se reflejarán en el listado y el Gantt.
                            </p>
                        </div>
                    </div>
                    <div style={{
                        flex: 1,
                        minWidth: 0,
                        backgroundColor: '#fff',
                        borderRadius: '12px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        border: '1px solid #eee',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <div style={{ width: '100%', overflowX: 'auto' }}>
                            <div style={{ minWidth: '500px' }}>
                                <div style={{
                                    display: 'flex',
                                    padding: '12px 15px',
                                    backgroundColor: '#f8fafc',
                                    borderBottom: '1px solid #eee',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    color: '#64748b',
                                    textTransform: 'uppercase'
                                }}>
                                    {tabActiva === 'Personal' && <>
                                        <span style={{ flex: 2 }}>Nombre</span>
                                        <span style={{ flex: 1.5 }}>Especialidad</span>
                                        <span style={{ flex: 1 }}>Inicio</span>
                                    </>}
                                    {tabActiva === 'Equipos/Herramientas' && <>
                                        <span style={{ flex: 2 }}>Modelo</span>
                                        <span style={{ flex: 1.5 }}>Tipo</span>
                                        <span style={{ flex: 1 }}>Precio</span>
                                        <span style={{ flex: 1 }}>Estado</span>
                                    </>}
                                    {tabActiva === 'Suministros Directos' && <>
                                        <span style={{ flex: 2 }}>Codigo</span>
                                        <span style={{ flex: 1.5 }}>Descripcion</span>
                                        <span style={{ flex: 1 }}>Precio</span>
                                    </>}
                                    {tabActiva === 'Calendarios' && <>
                                        <span style={{ flex: 3 }}>Nombre</span>
                                    </>}
                                    {/* ... resto de tus condiciones ... */}
                                    <span style={{ width: '70px', textAlign: 'center' }}>Acciones</span>
                                </div>

                                {/* Listado con Scroll Vertical */}
                                <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '10px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {renderContenidoTab()}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
                <div style={styles.ganttContainer}>
                    <div style={styles.selectorMesContainer}>
                        <button style={styles.btnSecundario} onClick={() => {
                            if (mes === 0) { setMes(11); setAnio(anio - 1); }
                            else { setMes(mes - 1); }
                        }}> ◀ Anterior </button>

                        <div style={styles.mesTextoLabel}>
                            {new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(anio, mes))}
                        </div>

                        <button style={styles.btnSecundario} onClick={() => {
                            if (mes === 11) { setMes(0); setAnio(anio + 1); }
                            else { setMes(mes + 1); }
                        }}> Siguiente ▶ </button>

                        <select
                            value={anio}
                            onChange={(e) => setAnio(parseInt(e.target.value))}
                            style={styles.miniSelectAnio}
                        >
                            {[2024, 2025, 2026, 2027, 2028].map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <table style={styles.ganttTable}>
                        <thead>
                            <tr>
                                <th style={styles.thNombre}>Recurso</th>
                                {/* Generación de los días */}
                                {diasDelMes.map((d, index) => {
                                    const fecha = new Date(d.fechaCompleta);
                                    const diasSemana = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
                                    const nombreDia = diasSemana[fecha.getDay()];
                                    const esFinDeSemana = fecha.getDay() === 0 || fecha.getDay() === 6;

                                    return (
                                        <th
                                            key={index}
                                            style={{
                                                ...styles.thDia,
                                                backgroundColor: esFinDeSemana ? '#f0f0f0' : '#fafafa',
                                                color: esFinDeSemana ? '#aaa' : '#333',
                                                width: '30px',
                                                minWidth: '30px',
                                                maxWidth: '30px',
                                                padding: '4px 2px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '9px' }}>
                                                <span style={{ color: esFinDeSemana ? '#bbb' : '#888' }}>{nombreDia}</span>
                                                <span style={{ fontSize: '11px', fontWeight: 'bold', marginTop: '1px' }}>{fecha.getDate()}</span>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            {/* 1. Iniciamos el mapeo de recursos. Aquí 'r' comienza a existir */}
                            {(recursos || []).map(r => {
                                const calAsignado = (calendarios || []).find(c => String(c._id) === String(r.calendarioId));

                                return (
                                    <tr key={r._id} translate="no">
                                        <td style={styles.recursoName}>
                                            <div style={{ fontWeight: 'bold' }}>{r.nombre}</div>
                                            <select
                                                style={styles.miniSelect}
                                                value={r.calendarioId || ''}
                                                onChange={(e) => asignarCalendario(r._id, e.target.value)}
                                            >
                                                <option value="">Sin Turno</option>
                                                {(calendarios || []).map(c => (
                                                    <option key={c._id} value={c._id}>{c.nombre}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* 2. Mapeamos los días PARA ESTE recurso 'r' específico */}
                                        {(diasDelMes || []).map((d) => {
                                            // 1. Calculamos las horas automáticas según el calendario
                                            const horasBase = obtenerHorasParaDia(r, d);

                                            // 2. Buscamos si hay un ajuste manual (sobreescritura)
                                            const diaKey = d.fechaCompleta.toISOString().split('T')[0];
                                            const ajusteExistente = r.ajustes && r.ajustes[diaKey];

                                            // 3. PRIORIDAD: Si hay ajuste manual (incluso si es 0), manda el ajuste. 
                                            // Si no, mandan las horas del calendario.
                                            const horasFinales = ajusteExistente !== undefined ? ajusteExistente : horasBase;
                                            return (
                                                <td
                                                    key={`${r._id}-${diaKey}`}
                                                    onClick={() => setAjusteManual({
                                                        recursoId: r._id,
                                                        nombre: r.nombre,
                                                        dia: diaKey,
                                                        horas: horasFinales
                                                    })}
                                                    style={{
                                                        ...styles.celdaDia,
                                                        backgroundColor: horasFinales > 0 ? '#e3f2fd' : '#fff',
                                                        color: horasFinales > 0 ? '#1976d2' : '#ccc',
                                                        fontWeight: horasFinales > 0 ? 'bold' : 'normal',
                                                        textAlign: 'center',
                                                        cursor: 'pointer',
                                                        // Opcional: Borde diferente si es un ajuste manual
                                                        border: r.ajustes && r.ajustes[diaKey] !== undefined ? '2px solid #ff9800' : '1px solid #eee'
                                                    }}
                                                >
                                                    {typeof horasFinales === 'number' && horasFinales > 0
                                                        ? (Number.isInteger(horasFinales) ? horasFinales : horasFinales.toFixed(1))
                                                        : <span style={{ color: '#ddd', fontSize: '10px' }}>·</span>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                </>)}
                {tabActiva === 'Plantillas' && (
                <div style={{ padding: '20px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0 }}>Hojas de Ruta Estándar</h3>
                        <button
                            onClick={() => { setFormPlantilla(plantillaVacia); setPlantillaEditando(null); setModalPlantilla(true); }}
                            style={{ padding: '10px 20px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            + Nueva Plantilla
                        </button>
                    </div>
                    {plantillas.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                            No hay plantillas creadas. Crea la primera con el botón de arriba.
                        </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
                        {plantillas.map(p => (
                            <div key={p._id} style={{ background: 'white', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #8e44ad' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 4px', color: '#2c3e50' }}>{p.nombre}</h4>
                                        <span style={{ fontSize: '11px', background: '#ede7f6', color: '#8e44ad', padding: '2px 8px', borderRadius: '10px' }}>{p.categoria}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button onClick={() => { setFormPlantilla({ ...p }); setPlantillaEditando(p._id); setModalPlantilla(true); }}
                                            style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>
                                            ✏️
                                        </button>
                                        <button onClick={() => { if (confirm(`¿Eliminar "${p.nombre}"?`)) eliminarPlantilla(p._id); }}
                                            style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                                {p.descripcion && <p style={{ fontSize: '12px', color: '#666', margin: '10px 0 8px' }}>{p.descripcion}</p>}
                                <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: '#888', marginTop: '8px' }}>
                                    <span>📌 {p.tareas?.length || 0} tareas</span>
                                    <span>⚙️ {p.componentes?.length || 0} equipos</span>
                                    <span>📦 {p.logistica?.length || 0} suministros</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MODAL EDITOR DE PLANTILLA */}
            {modalPlantilla && (
                <div style={styles.overlay}>
                    <div style={{ ...styles.modalContent, width: '680px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3 style={{ margin: '0 0 20px' }}>{plantillaEditando ? 'Editar Plantilla' : 'Nueva Hoja de Ruta'}</h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            <div>
                                <label style={styles.label}>Nombre *</label>
                                <input style={styles.input} value={formPlantilla.nombre} onChange={e => setFormPlantilla(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Mantenimiento Preventivo Motor" />
                            </div>
                            <div>
                                <label style={styles.label}>Categoría</label>
                                <select style={styles.input} value={formPlantilla.categoria} onChange={e => setFormPlantilla(f => ({ ...f, categoria: e.target.value }))}>
                                    {['General', 'Mantenimiento', 'Instalación', 'Reparación', 'Inspección', 'Montaje'].map(c => <option key={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={styles.label}>Descripción</label>
                            <input style={styles.input} value={formPlantilla.descripcion} onChange={e => setFormPlantilla(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción breve de cuándo usar esta plantilla" />
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={styles.label}>Procedimiento / Instrucciones</label>
                            <textarea style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }} value={formPlantilla.procedimiento} onChange={e => setFormPlantilla(f => ({ ...f, procedimiento: e.target.value }))} placeholder="Pasos del procedimiento..." />
                        </div>

                        {/* Tareas */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong>Tareas</strong>
                                <button onClick={() => setFormPlantilla(f => ({ ...f, tareas: [...f.tareas, { descripcion: '', puesto: '', duracion: 1 }] }))}
                                    style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}>+ Agregar</button>
                            </div>
                            {formPlantilla.tareas.map((t, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 30px', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                                    <input style={styles.input} placeholder="Descripción" value={t.descripcion} onChange={e => { const ts = [...formPlantilla.tareas]; ts[i] = { ...ts[i], descripcion: e.target.value }; setFormPlantilla(f => ({ ...f, tareas: ts })); }} />
                                    <input style={styles.input} placeholder="Puesto" value={t.puesto} onChange={e => { const ts = [...formPlantilla.tareas]; ts[i] = { ...ts[i], puesto: e.target.value }; setFormPlantilla(f => ({ ...f, tareas: ts })); }} />
                                    <input style={styles.input} type="number" placeholder="Horas" value={t.duracion} onChange={e => { const ts = [...formPlantilla.tareas]; ts[i] = { ...ts[i], duracion: Number(e.target.value) }; setFormPlantilla(f => ({ ...f, tareas: ts })); }} />
                                    <button onClick={() => setFormPlantilla(f => ({ ...f, tareas: f.tareas.filter((_, idx) => idx !== i) }))} style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}>✕</button>
                                </div>
                            ))}
                        </div>

                        {/* Equipos/Componentes */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong>Equipos / Herramientas</strong>
                                <button onClick={() => setFormPlantilla(f => ({ ...f, componentes: [...f.componentes, { descripcion: '', cantidad: 1, tipo: 'Herramienta' }] }))}
                                    style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}>+ Agregar</button>
                            </div>
                            {formPlantilla.componentes.map((c, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 30px', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                                    <input style={styles.input} placeholder="Descripción" value={c.descripcion} onChange={e => { const cs = [...formPlantilla.componentes]; cs[i] = { ...cs[i], descripcion: e.target.value }; setFormPlantilla(f => ({ ...f, componentes: cs })); }} />
                                    <input style={styles.input} type="number" placeholder="Cant." value={c.cantidad} onChange={e => { const cs = [...formPlantilla.componentes]; cs[i] = { ...cs[i], cantidad: Number(e.target.value) }; setFormPlantilla(f => ({ ...f, componentes: cs })); }} />
                                    <select style={styles.input} value={c.tipo} onChange={e => { const cs = [...formPlantilla.componentes]; cs[i] = { ...cs[i], tipo: e.target.value }; setFormPlantilla(f => ({ ...f, componentes: cs })); }}>
                                        <option>Herramienta</option><option>Equipo</option><option>Material</option>
                                    </select>
                                    <button onClick={() => setFormPlantilla(f => ({ ...f, componentes: f.componentes.filter((_, idx) => idx !== i) }))} style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}>✕</button>
                                </div>
                            ))}
                        </div>

                        {/* Suministros / Logística */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong>Suministros Directos</strong>
                                <button onClick={() => setFormPlantilla(f => ({ ...f, logistica: [...f.logistica, { descripcion: '', cantidad: 1, unidad: 'un', precio: 0 }] }))}
                                    style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}>+ Agregar</button>
                            </div>
                            {formPlantilla.logistica.map((l, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 60px 30px', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                                    <input style={styles.input} placeholder="Descripción" value={l.descripcion} onChange={e => { const ls = [...formPlantilla.logistica]; ls[i] = { ...ls[i], descripcion: e.target.value }; setFormPlantilla(f => ({ ...f, logistica: ls })); }} />
                                    <input style={styles.input} type="number" placeholder="Cant." value={l.cantidad} onChange={e => { const ls = [...formPlantilla.logistica]; ls[i] = { ...ls[i], cantidad: Number(e.target.value) }; setFormPlantilla(f => ({ ...f, logistica: ls })); }} />
                                    <input style={styles.input} placeholder="Unidad" value={l.unidad} onChange={e => { const ls = [...formPlantilla.logistica]; ls[i] = { ...ls[i], unidad: e.target.value }; setFormPlantilla(f => ({ ...f, logistica: ls })); }} />
                                    <button onClick={() => setFormPlantilla(f => ({ ...f, logistica: f.logistica.filter((_, idx) => idx !== i) }))} style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}>✕</button>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setModalPlantilla(false); setPlantillaEditando(null); }} style={styles.btnSecundario}>Cancelar</button>
                            <button
                                onClick={async () => {
                                    if (!formPlantilla.nombre.trim()) { alert('El nombre es obligatorio'); return; }
                                    if (plantillaEditando) {
                                        await actualizarPlantilla(plantillaEditando, formPlantilla);
                                    } else {
                                        await crearPlantilla(formPlantilla);
                                    }
                                    setModalPlantilla(false);
                                    setPlantillaEditando(null);
                                }}
                                style={{ ...styles.btnPrimary, padding: '10px 25px' }}
                            >
                                {plantillaEditando ? '💾 Guardar Cambios' : '✅ Crear Plantilla'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {ajusteManual && (
                <div style={styles.overlay}>
                    <div style={{ ...styles.modal, width: '300px' }}>
                        <h4>Ajuste Manual</h4>
                        <p style={{ fontSize: '14px' }}>
                            Recurso: <strong>{ajusteManual.nombre}</strong><br />
                            Día: <strong>{ajusteManual.dia}</strong>
                        </p>

                        <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Horas para este día:</label>
                        <input
                            type="number"
                            style={styles.input}
                            value={ajusteManual.horas}
                            onChange={(e) => setAjusteManual({ ...ajusteManual, horas: e.target.value })}
                        />

                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button onClick={() => setAjusteManual(null)} style={styles.btnSecundario}>
                                Cancelar
                            </button>
                            <button
                                onClick={() => guardarCambioManualGlobal(ajusteManual.recursoId, ajusteManual.dia, ajusteManual.horas)}
                                style={styles.btnPrimary}
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isModalCompOpen && (
                <div style={styles.overlay}>
                    <div style={styles.modal}>
                        <div style={styles.modalHeader}>
                            <h3>{nuevoComponente._id ? '📝 Editar Equipo' : '⚙️ Nuevo Equipo / Herramienta'}</h3>
                            <button onClick={() => setIsModalCompOpen(false)} style={styles.btnClose}>&times;</button>
                        </div>

                        <div style={styles.modalBody}>
                            {/* 🚩 NUEVO CAMPO: CÓDIGO */}
                            <label style={{ fontWeight: 'bold' }}>Código del Equipo / Suministro</label>
                            <input
                                placeholder="Ej: EQ-001 o SUM-45"
                                style={styles.input}
                                value={nuevoComponente.codigo || ''}
                                onChange={e => setNuevoComponente({ ...nuevoComponente, codigo: e.target.value })}
                            />

                            <label style={{ fontWeight: 'bold' }}>Nombre del Equipo</label>
                            <input
                                placeholder="Ej: Generador Eléctrico 5kW"
                                style={styles.input}
                                value={nuevoComponente.nombre}
                                onChange={e => setNuevoComponente({ ...nuevoComponente, nombre: e.target.value })}
                            />

                            <label style={{ fontWeight: 'bold' }}>Precio de Adquisición ($)</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                style={styles.input}
                                value={nuevoComponente.precio || ''}
                                onChange={e => setNuevoComponente({ ...nuevoComponente, precio: e.target.value })}
                            />

                            <label style={{ fontWeight: 'bold' }}>Categoría</label>
                            <select
                                style={styles.input}
                                value={nuevoComponente.tipo}
                                onChange={e => setNuevoComponente({ ...nuevoComponente, tipo: e.target.value })}
                            >
                                <option value="Herramienta">Herramienta Manual</option>
                                <option value="Maquinaria">Maquinaria Pesada</option>
                                <option value="Instrumento">Instrumento de Medición</option>
                            </select>

                            <label style={{ fontWeight: 'bold' }}>Estado Inicial</label>
                            <select
                                style={styles.input}
                                value={nuevoComponente.estado}
                                onChange={e => setNuevoComponente({ ...nuevoComponente, estado: e.target.value })}
                            >
                                <option value="Disponible">✅ Disponible</option>
                                <option value="En Uso">🛠️ En Uso</option>
                                <option value="Mantenimiento">⚠️ Mantenimiento</option>
                            </select>
                        </div>

                        <div style={styles.modalFooter}>
                            <button
                                onClick={() => {
                                    setIsModalCompOpen(false);
                                    // Reset incluyendo el código
                                    setNuevoComponente({ codigo: '', nombre: '', tipo: 'Herramienta', estado: 'Disponible', precio: 0 });
                                }}
                                style={styles.btnSecundario}
                            >
                                Cancelar
                            </button>

                            <button
                                onClick={async () => {
                                    if (!nuevoComponente.nombre) return alert("El nombre es obligatorio");

                                    // Aseguramos que los números sean números antes de enviar
                                    const dataEnviar = {
                                        ...nuevoComponente,
                                        precio: Number(nuevoComponente.precio) || 0
                                    };

                                    if (nuevoComponente._id) {
                                        await actualizarEquipo(nuevoComponente._id, dataEnviar);
                                    } else {
                                        await crearEquipo(dataEnviar);
                                    }

                                    setIsModalCompOpen(false);
                                    setNuevoComponente({ codigo: '', nombre: '', tipo: 'Herramienta', estado: 'Disponible', precio: 0 });
                                }}
                                style={{
                                    ...styles.btnPrimary,
                                    backgroundColor: nuevoComponente._id ? '#2980b9' : '#8e44ad'
                                }}
                            >
                                {nuevoComponente._id ? "Actualizar Equipo" : "Guardar Equipo"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isModalLogOpen && (
                <div style={styles.overlay}>
                    <div style={styles.modal}>
                        <div style={styles.modalHeader}>
                            <h3>🚚 Registro de Suministros</h3>
                            <button onClick={() => setIsModalLogOpen(false)} style={styles.btnClose}>&times;</button>
                        </div>
                        <div style={styles.modalBody}>
                            <label style={{ fontWeight: 'bold' }}>Código</label>
                            <input
                                placeholder="Ej: 0001"
                                style={styles.input}
                                value={nuevaLogistica.codigo || ''} // Usamos 'codigo'
                                onChange={e => setNuevaLogistica({ ...nuevaLogistica, codigo: e.target.value })}
                            />

                            <label style={{ fontWeight: 'bold' }}>Descripción</label>
                            <input
                                placeholder="Ej: Disco de Corte"
                                style={styles.input}
                                value={nuevaLogistica.descripcion || ''} // Usamos 'descripcion'
                                onChange={e => setNuevaLogistica({ ...nuevaLogistica, descripcion: e.target.value })}
                            />

                            <label style={{ fontWeight: 'bold' }}>Precio</label>
                            <input
                                type="number"
                                placeholder="Ej: 15000"
                                style={styles.input}
                                value={nuevaLogistica.precio || ''} // Usamos 'precio'
                                onChange={e => setNuevaLogistica({ ...nuevaLogistica, precio: e.target.value })}
                            />
                        </div>
                        <div style={styles.modalFooter}>
                            <button onClick={() => setIsModalLogOpen(false)} style={styles.btnSecundario}>Cancelar</button>
                            <button onClick={manejarGuardadoSuministro} style={styles.btnPrimary}>
                                {editandoId ? 'Actualizar Suministro' : 'Guardar Suministro'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {modalRecursoAbierto && (
                <div style={styles.overlay}>
                    <div style={styles.modal}>
                        <div style={styles.modalHeader}>
                            <h3>👤 Registrar Nuevo Recurso</h3>
                            <button onClick={() => setModalRecursoAbierto(false)} style={styles.btnClose}>&times;</button>
                        </div>

                        <div style={styles.modalBody}>
                            <label style={{ fontWeight: 'bold' }}>Nombre Completo</label>
                            <input
                                placeholder="Ej: Juan Pérez"
                                style={styles.input}
                                value={nuevoRecurso.nombre}
                                onChange={e => setNuevoRecurso({ ...nuevoRecurso, nombre: e.target.value })}
                            />

                            <label style={{ fontWeight: 'bold' }}>Teléfono / WhatsApp</label>
                            <input
                                placeholder="Ej: 56912345678 (con código de país, sin +)"
                                style={styles.input}
                                value={nuevoRecurso.telefono || ''}
                                onChange={e => setNuevoRecurso({ ...nuevoRecurso, telefono: e.target.value })}
                            />

                            <label style={{ fontWeight: 'bold' }}>Email</label>
                            <input
                                placeholder="supervisor@empresa.com"
                                style={styles.input}
                                value={nuevoRecurso.email || ''}
                                onChange={e => setNuevoRecurso({ ...nuevoRecurso, email: e.target.value })}
                            />

                            <label style={{ fontWeight: 'bold' }}>Tarifa por Hora (CLP)</label>
                            <input
                                type="number"
                                placeholder="Ej: 5000"
                                style={styles.input}
                                value={nuevoRecurso.tarifaHora || ''}
                                onChange={e => setNuevoRecurso({ ...nuevoRecurso, tarifaHora: Number(e.target.value) || 0 })}
                            />

                            <label style={{ fontWeight: 'bold' }}>Asignar Turno Inicial</label>
                            <select
                                style={styles.input}
                                value={nuevoRecurso.calendarioId}
                                onChange={e => setNuevoRecurso({ ...nuevoRecurso, calendarioId: e.target.value })}
                            >
                                <option value="">Seleccionar Calendario...</option>
                                {calendarios.map(c => <option key={c._id} value={c._id}>{c.nombre}</option>)}
                            </select>

                            <label style={{ fontWeight: 'bold' }}>Especialidad / Puesto</label>
                            <select
                                style={styles.input}
                                // 🚩 Cambiado de especialidad a puesto según tu modelo de Mongoose
                                value={nuevoRecurso.puesto || ''}
                                onChange={e => setNuevoRecurso({ ...nuevoRecurso, puesto: e.target.value })}
                            >
                                <option value="">Seleccionar Puesto...</option>

                                {/* 🚩 MAPEO DINÁMICO DE SUMINISTROS (Puestos de la DB) */}
                                {puestosDB && puestosDB.map(p => (
                                    <option key={p._id} value={p.nombre}>
                                        {p.nombre} ({p.categoria})
                                    </option>
                                ))}
                            </select>
                            <label style={{ fontWeight: 'bold' }}>¿Cuándo inicia su primer día de trabajo?</label>
                            <input
                                type="date"
                                style={styles.input}
                                value={nuevoRecurso.fechaInicioCiclo || ''}
                                onChange={e => setNuevoRecurso({ ...nuevoRecurso, fechaInicioCiclo: e.target.value })}
                            />
                        </div>

                        <div style={styles.modalFooter}>
                            <button
                                onClick={() => {
                                    setModalRecursoAbierto(false);
                                    // Es buena práctica limpiar aquí también por si acaso
                                    setNuevoRecurso({ nombre: '', tipo: 'Humano', especialidad: '', calendarioId: '' });
                                }}
                                style={styles.btnSecundario}
                            >
                                Cancelar
                            </button>

                            <button
                                onClick={async () => {
                                    // 1. Validamos que los campos no estén vacíos para evitar errores de Mongoose
                                    if (!nuevaLogistica.unidad || !nuevaLogistica.patente) {
                                        alert("Por favor completa Código y Descripción");
                                        return;
                                    }

                                    // 2. TRADUCCIÓN: Mapeamos los campos del Modal al Esquema de la DB
                                    const suministroParaDB = {
                                        codigo: nuevaLogistica.unidad,           // unidad -> codigo
                                        descripcion: nuevaLogistica.patente,      // patente -> descripcion
                                        precio: Number(nuevaLogistica.ruta) || 0, // ruta -> precio (forzamos número)
                                        categoria: 'Transporte'                   // Aseguramos que esté en el enum
                                    };

                                    console.log("Enviando al servidor:", suministroParaDB);

                                    // 3. Llamamos a la función de App.js
                                    const exito = await crearSuministro(suministroParaDB);

                                    if (exito) {
                                        setIsModalLogOpen(false);
                                        // Limpiamos con los nombres que usa tu estado local
                                        setNuevaLogistica({ unidad: '', patente: '', ruta: '' });
                                        alert("¡Suministro registrado con éxito!");
                                    } else {
                                        alert("Error al registrar: Puede que el código ya exista.");
                                    }
                                }}
                                style={{ ...styles.btnPrimary, backgroundColor: '#f39c12' }}
                            >
                                Confirmar Registro
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {mostrarModalPersonal && (
                <div style={styles.modalOverlay}>
                    <div style={{ ...styles.modalContent, width: '650px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0 }}>Gestión de Personal</h3>
                            <button onClick={() => setMostrarModalPersonal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px' }}>&times;</button>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', backgroundColor: '#f8f9fa' }}>
                                    <th style={{ padding: '10px' }}>Nombre</th>
                                    <th style={{ padding: '10px' }}>Puesto</th>
                                    <th style={{ padding: '10px', textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recursos.map(r => (
                                    <tr key={r._id} style={{ borderBottom: '1px solid #eee' }}>
                                        {/* Mostramos solo el texto, ya no necesitamos el Input aquí */}
                                        <td style={{ padding: '10px' }}>{r.nombre}</td>
                                        <td style={{ padding: '10px' }}>{r.especialidad || r.puesto}</td>

                                        <td style={{ padding: '10px', textAlign: 'right' }}>
                                            {/* BOTÓN EDITAR: Ahora llama a la función de "salto" al otro modal */}
                                            <button
                                                onClick={() => prepararEdicionRecurso(r)}
                                                style={styles.btnIcon}
                                                title="Editar en formulario completo"
                                            >
                                                ✏️
                                            </button>

                                            <button
                                                type='button'
                                                onClick={() => { eliminarRecurso(r._id); }}
                                                style={styles.btnIcon}
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {modalMaestroAbierto && (
                <div style={styles.overlay}>
                    <div style={styles.modal}>
                        <div style={styles.modalHeader}>
                            <h3>{editandoId ? '📝 Editar Plantilla' : '🗓️ Crear Nueva Plantilla'}</h3>
                            <button onClick={() => setModalMaestroAbierto(false)} style={styles.btnClose}>&times;</button>
                        </div>
                        <div style={{ marginBottom: '15px', display: 'flex', gap: '20px' }}>
                            <label>
                                <input
                                    type="radio"
                                    checked={nuevoCal.tipo === 'semanal'}
                                    onChange={() => {
                                        // En lugar de resetear todo, solo cambia el tipo si no quieres perder el nombre
                                        setNuevoCal(prev => ({ ...prev, tipo: 'semanal', cicloDias: 7 }));
                                    }}
                                /> Semana Fija
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    checked={nuevoCal.tipo === 'rotativo'}
                                    onChange={() => setNuevoCal({ ...nuevoCal, tipo: 'rotativo', cicloDias: 8 })}
                                /> Ciclo Rotativo (Ej: 4x4)
                            </label>
                        </div>

                        {nuevoCal.tipo === 'rotativo' && (
                            <div style={{ marginBottom: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '8px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Días del ciclo total: </label>
                                <input
                                    type="number"
                                    value={isNaN(nuevoCal.cicloDias) ? '' : nuevoCal.cicloDias}
                                    onChange={(e) => {
                                        const valor = e.target.value === '' ? 0 : parseInt(e.target.value);

                                        // --- LÓGICA DE ACTUALIZACIÓN DINÁMICA ---
                                        setNuevoCal(prev => {
                                            let nuevaConfig = [...prev.config];
                                            if (valor > nuevaConfig.length) {
                                                // Añadir días si el número sube
                                                const dif = valor - nuevaConfig.length;
                                                const extras = Array.from({ length: dif }, (_, i) => ({
                                                    dia: `Día ${nuevaConfig.length + i + 1}`,
                                                    activo: true,
                                                    bloques: []
                                                }));
                                                nuevaConfig = [...nuevaConfig, ...extras];
                                            } else if (valor < nuevaConfig.length) {
                                                // Cortar días si el número baja
                                                nuevaConfig = nuevaConfig.slice(0, valor);
                                            }
                                            return { ...prev, cicloDias: valor, config: nuevaConfig };
                                        });
                                    }}
                                    style={styles.miniInput}
                                />
                                <p style={{ fontSize: '10px', color: '#666', marginTop: '5px' }}>
                                    * Si pones 8, podrás configurar 4 días de trabajo y 4 de descanso abajo.
                                </p>
                            </div>
                        )}
                        <div style={styles.modalBody}>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>Nombre de la Plantilla</label>
                            <input
                                style={styles.input}
                                placeholder="Ej: Turno Mañana"
                                value={nuevoCal.nombre || ''}
                                onChange={e => setNuevoCal({ ...nuevoCal, nombre: e.target.value })}
                            />

                            <div style={styles.scrollArea}>
                                <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>Configuración de tramos por día:</p>

                                {nuevoCal.config.map((d, diaIdx) => (
                                    <div key={diaIdx} style={{ ...styles.diaContenedor, borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            {/* CAMBIO AQUÍ: Nombre dinámico según el tipo de turno */}
                                            <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                                                {nuevoCal.tipo === 'semanal'
                                                    ? d.dia.toUpperCase()
                                                    : `DÍA ${diaIdx + 1}`}
                                            </span>

                                            <button
                                                onClick={() => agregarBloque(diaIdx)}
                                                style={{ ...styles.btnMas, padding: '2px 8px', fontSize: '11px' }}
                                            > + Añadir Tramo </button>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            {/* Dentro del render del día (d) */}
                                            {d.bloques && d.bloques.map((bloque, bIdx) => (
                                                <div key={bIdx} style={styles.bloqueRow}>
                                                    <input
                                                        type="time"
                                                        style={styles.miniInput}
                                                        // USA ESTE FALLBACK: "" asegura que el input no se bloquee
                                                        value={bloque.inicio || ""}
                                                        onChange={(e) => actualizarHora(diaIdx, bIdx, 'inicio', e.target.value)}
                                                    />
                                                    <span style={{ margin: '0 5px' }}>a</span>
                                                    <input
                                                        type="time"
                                                        style={styles.miniInput}
                                                        value={bloque.fin || ""}
                                                        onChange={(e) => actualizarHora(diaIdx, bIdx, 'fin', e.target.value)}
                                                    />
                                                    <button
                                                        onClick={() => eliminarBloque(diaIdx, bIdx)}
                                                        style={styles.btnEliminarBloque}
                                                    >
                                                        &times;
                                                    </button>
                                                </div>
                                            ))}
                                            {d.bloques.length === 0 && (
                                                <span style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>Día no laborable / Descanso</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={styles.modalFooter}>
                            <button onClick={() => setModalMaestroAbierto(false)} style={styles.btnSecundario}>Cancelar</button>
                            <button
                                onClick={guardarCalendario}
                                style={{ ...styles.btnPrimary, width: 'auto', padding: '10px 25px' }}
                                disabled={!nuevoCal.nombre}
                            >
                                {editandoId ? 'Actualizar Plantilla' : 'Guardar Plantilla'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {modalPuestosAbierto && (
                <div style={styles.modalOverlay}>
                    <div style={{ ...styles.modalContent, width: '600px' }}>
                        <h3>🛠️ Configuración de Puestos y Especialidades</h3>

                        {/* Formulario de creación rápida */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                            <input
                                placeholder="Nombre del Puesto (ej: Soldador)"
                                style={styles.input}
                                id="nuevo-puesto-nombre"
                            />
                            <input
                                type="number"
                                placeholder="Costo/Hora ($)"
                                style={{ ...styles.input, width: '120px' }}
                                id="nuevo-puesto-costo"
                            />
                            <button
                                onClick={() => {
                                    const nombreVal = document.getElementById('nuevo-puesto-nombre').value;
                                    const costoVal = document.getElementById('nuevo-puesto-costo').value;

                                    if (nombreVal && costoVal) {
                                        // 🚩 PASO CLAVE: Envía los valores sueltos, no entre llaves {}
                                        // Esto asegura que 'nombre' sea un String y no un Objeto
                                        crearPuesto(nombreVal, costoVal);

                                        // Limpiar campos
                                        document.getElementById('nuevo-puesto-nombre').value = '';
                                        document.getElementById('nuevo-puesto-costo').value = '';
                                    }
                                }}
                                style={styles.btnPrimary}
                            >
                                Añadir
                            </button>
                        </div>

                        {/* Listado de Puestos */}
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                        <th style={{ padding: '8px' }}>Puesto</th>
                                        <th style={{ padding: '8px' }}>Costo/Hora</th>
                                        <th style={{ padding: '8px' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {puestosDB.map((puesto) => (
                                        <tr key={puesto._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px' }}>{puesto.nombre}</td>
                                            <td style={{ padding: '8px' }}>$ {puesto.costoHora}</td>
                                            <td style={{ padding: '8px' }}>
                                                <button onClick={() => eliminarPuesto(puesto._id)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <button onClick={() => setModalPuestosAbierto(false)} style={{ ...styles.btnSecundario, marginTop: '20px', width: '100%' }}>
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};

// ESTILOS (Mejorados para visibilidad)
const styles = {
    selectorMesContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '15px',
        marginBottom: '20px',
        backgroundColor: '#f8f9fa',
        padding: '12px',
        borderRadius: '10px',
        border: '1px solid #e0e0e0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    },
    mesTextoLabel: {
        fontWeight: 'bold',
        fontSize: '1.2rem',
        minWidth: '220px',
        textAlign: 'center',
        textTransform: 'capitalize',
        color: '#2c3e50',
        userSelect: 'none' // Evita que se seleccione el texto al hacer clic rápido
    },
    miniSelectAnio: {
        padding: '5px 10px',
        borderRadius: '5px',
        border: '1px solid #ccc',
        backgroundColor: '#fff',
        cursor: 'pointer',
        fontSize: '14px',
        outline: 'none'
    },
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.7)', // Fondo oscuro semitransparente
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999, // Asegúrate de que esté por encima de todo
    },
    modalContent: {
        backgroundColor: 'white',
        padding: '25px',
        borderRadius: '12px',
        width: '700px',
        maxHeight: '85vh',
        overflowY: 'auto',
        boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
        position: 'relative'
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
    header: { marginBottom: '20px' },

    // Cambiamos a Flex Direction Column para que la tabla use todo el ancho
    layout: {
        display: 'flex',
        flexDirection: 'column',
        gap: '25px'
    },

    // Agrupamos los formularios en una fila superior
    aside: {
        display: 'grid',
        // '1fr 1fr' fuerza dos columnas iguales. 
        // 'repeat(auto-fit, minmax(400px, 1fr))' es más responsivo.
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        alignItems: 'start' // Alinea las tarjetas por la parte superior
    },
    card: {
        background: 'white',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        border: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '220px' // Mantiene ambas tarjetas del mismo alto visual
    },

    // Inputs más grandes y legibles
    input: {
        width: '100%',
        padding: '12px',
        marginBottom: '12px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        fontSize: '14px',
        boxSizing: 'border-box'
    },

    // Área de scroll interna para que el formulario no sea infinito
    scrollArea: {
        maxHeight: '300px',
        overflowY: 'auto',
        paddingRight: '10px',
        marginBottom: '15px',
        borderBottom: '1px solid #eee'
    },

    diaRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid #f9f9f9'
    },

    miniInput: {
        padding: '5px',
        borderRadius: '4px',
        border: '1px solid #ddd',
        fontSize: '13px'
    },

    btnPrimary: {
        width: '100%',
        padding: '12px',
        background: '#27ae60',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        transition: 'background 0.3s'
    },

    btnSecundario: {
        padding: '10px 20px',
        background: '#95a5a6',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: 'bold'
    },

    // CONTENEDOR GANTT: Ahora ocupa el 100%
    ganttContainer: {
        overflowX: 'auto',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
        border: '1px solid #eee'
    },

    ganttTable: {
        width: '100%',
        borderCollapse: 'separate', // Cambiado para que el sticky se vea mejor
        borderSpacing: 0
    },

    // Columna de nombres más ancha y persistente
    recursoColHeader: {
        width: '140px',
        minWidth: '140px',
        maxWidth: '140px',
        padding: '10px 8px',
        position: 'sticky',
        left: 0,
        zIndex: 20,
        background: '#2c3e50',
        color: 'white',
        textAlign: 'left',
        borderRight: '2px solid #34495e'
    },

    recursoName: {
        padding: '8px 10px',
        position: 'sticky',
        left: 0,
        background: '#ffffff',
        zIndex: 5,
        borderRight: '3px solid #3498db',
        borderBottom: '1px solid #eee',
        fontWeight: '600',
        width: '140px',
        minWidth: '140px',
        maxWidth: '140px',
    },

    miniSelect: {
        fontSize: '12px',
        width: '100%',
        marginTop: '8px',
        padding: '4px',
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        color: '#555'
    },

    diaCol: {
        width: '30px',
        minWidth: '30px',
        maxWidth: '30px',
        padding: '6px 2px',
        borderRight: '1px solid #3e4f5f',
        textAlign: 'center'
    },

    celdaDia: {
        borderRight: '1px solid #eee',
        borderBottom: '1px solid #eee',
        textAlign: 'center',
        height: '50px',
        width: '30px',
        minWidth: '30px',
        maxWidth: '30px',
        padding: '2px'
    },

    horaBadge: {
        background: '#2ecc71',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 'bold',
        boxShadow: '0 2px 4px rgba(46, 204, 113, 0.3)'
    },

    calItem: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '12px',
        background: '#fcfcfc',
        borderBottom: '1px solid #eee',
        alignItems: 'center',
        borderRadius: '6px',
        marginBottom: '5px'
    },
    overlay: {
        position: 'fixed', // <-- LA CLAVE: Lo saca del flujo normal y lo fija a la pantalla
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)', // Fondo oscuro semitransparente
        display: 'flex',
        alignItems: 'center', // Centra el modal verticalmente
        justifyContent: 'center', // Centra el modal horizontalmente
        zIndex: 9999, // Asegura que esté por encima de TODO (incluyendo la tabla Gantt)
    },
    modal: {
        background: 'white',
        padding: '30px',
        borderRadius: '15px',
        width: '500px',
        maxWidth: '90%', // Para que se vea bien en celulares
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)', // Sombra para dar efecto de profundidad
        position: 'relative', // Para que el botón "X" se pueda posicionar dentro
        maxHeight: '90vh', // Evita que el modal sea más alto que la pantalla
        overflowY: 'auto' // Si el contenido es mucho, permite scroll interno
    },
    diaContenedor: {
        marginBottom: '15px',
        padding: '10px',
        backgroundColor: '#f9f9f9',
        borderRadius: '8px'
    },
    diaHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
    },
    diaNombre: { fontWeight: 'bold', color: '#333', fontSize: '14px' },
    btnMas: {
        background: '#3498db',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '2px 8px',
        fontSize: '11px',
        cursor: 'pointer'
    },
    bloquesLista: { display: 'flex', flexDirection: 'column', gap: '5px' },
    bloqueRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: 'white',
        padding: '5px',
        borderRadius: '4px',
        border: '1px solid #eee'
    },
    btnEliminar: {
        background: 'none',
        border: 'none',
        color: '#e74c3c',
        fontSize: '18px',
        cursor: 'pointer',
        padding: '0 5px'
    }
};

export default RecursosScreen;