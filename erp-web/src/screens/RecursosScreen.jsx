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
        guardarCalendarioGlobal,
        obtenerHorasParaDia,
        asignarCalendario,
        guardarCambioManualGlobal,
        eliminarCalendarioMaestro
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

    // En RecursosScreen (suponiendo que recibes las props)
    /*
    const guardarCambioManual = (recursoId, dia, nuevasHoras) => {
        // Usamos la función central de App.js
        actualizarAjusteRecurso(recursoId, dia, nuevasHoras);
        setAjusteManual(null);
    };*/
    // Estado para saber si estamos editando un calendario existente

    // RecursosScreen.jsx
    const guardarCalendario = async () => {
        // 1. Log prioritario para ver qué estamos enviando realmente

        // 2. Llamamos a la función del padre UNA SOLA VEZ
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

    // Busca estas líneas y cámbialas por:
    const [anio, setAnio] = useState(new Date().getFullYear());
    const [mes, setMes] = useState(new Date().getMonth()); // 0 = Enero, 1 = Febrero...

    // Generar días del mes con manejo de errores
    // Esto se recalcula automáticamente cada vez que mes o anio cambian
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
        // Cargamos los datos en el estado que usa el formulario de creación
        setNuevoRecurso({
            _id: recurso._id, // Identificador para saber que es edición
            nombre: recurso.nombre,
            calendarioId: recurso.calendarioId || '',
            especialidad: recurso.puesto || recurso.especialidad || '',
            fechaInicioCiclo: recurso.fechaInicioCiclo ? recurso.fechaInicioCiclo.split('T')[0] : ''
        });

        // Cerramos el listado y abrimos el formulario de "Crear" (que ahora será de editar)
        setMostrarModalPersonal(false);
        setModalRecursoAbierto(true);
    };

    // Este log se disparará cada vez que el modal se intente abrir
    if (modalRecursoAbierto) {
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2>⚙️ Gestión de Recursos</h2>
                <p>Configura turnos y visualiza carga horaria.</p>
            </div>

            <div style={styles.layout}>

                <div style={{ marginBottom: '20px', display: 'flex', gap: '15px' }}>
                    <button onClick={() => setModalRecursoAbierto(true)} style={styles.btnPrimary}>
                        👤 Crear personal
                    </button>

                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                    <button
                        onClick={() => setMostrarModalPersonal(true)}
                        style={{ ...styles.btnGestion, backgroundColor: '#34495e', color: 'white', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        👥 Editar Recursos
                    </button>
                </div>
                <div style={styles.layoutCalendarios}>
                    {/* FORMULARIO (IZQUIERDA) */}
                    <div style={styles.card}>
                        <h3>{editandoId ? '📝 Editando Calendario' : '🗓️ Nuevo Calendario'}</h3>
                        <input
                            style={styles.input}
                            value={nuevoCal.nombre}
                            onChange={e => setNuevoCal({ ...nuevoCal, nombre: e.target.value })}
                            placeholder="Nombre del turno..."
                        />
                        {/* Aquí van los inputs de horas por día que definimos antes */}
                        <button onClick={guardarCalendario} style={styles.btnPrimary}>
                            {editandoId ? 'Guardar Cambios' : 'Crear Plantilla'}
                        </button>
                        {editandoId && <button onClick={() => setEditandoId(null)} style={styles.btnLink}>Cancelar</button>}
                    </div>

                    {/* LISTA DE CALENDARIOS (DERECHA) */}
                    <div style={styles.listaCal}>
                        <h4>Plantillas Disponibles</h4>
                        {calendarios.map(cal => (
                            <div key={cal._id} style={styles.calItem}>
                                <span>{cal.nombre}</span>
                                <button onClick={() => prepararEdicion(cal)} style={styles.btnIcon}>✏️</button>
                                <button
                                    onClick={() => eliminarCalendarioMaestro(cal._id)}
                                    style={styles.btnEliminar}
                                >
                                    🗑️
                                </button>
                            </div>
                        ))}
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
                                {/* Celda vacía sobre los nombres de los operarios */}
                                <th style={styles.thNombre}>Recurso</th>

                                {/* Generación de los días */}
                                {diasDelMes.map((d, index) => {
                                    const fecha = new Date(d.fechaCompleta);
                                    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                                    const nombreDia = diasSemana[fecha.getDay()];
                                    const esFinDeSemana = fecha.getDay() === 0 || fecha.getDay() === 6;

                                    return (
                                        <th
                                            key={index}
                                            style={{
                                                ...styles.thDia,
                                                backgroundColor: esFinDeSemana ? '#f5f5f5' : '#fff', // Gris claro si es finde
                                                color: esFinDeSemana ? '#999' : '#333',
                                                minWidth: '45px',
                                                padding: '8px 4px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', fontSize: '10px' }}>
                                                {/* El nombre del día arriba (Lun, Mar...) */}
                                                <span style={{ fontWeight: 'normal', marginBottom: '2px' }}>{nombreDia}</span>
                                                {/* El número del día abajo (1, 2, 3...) */}
                                                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{fecha.getDate()}</span>
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
                                                    {/* CORRECCIÓN: Validamos que sea un número antes de usar toFixed */}
                                                    {typeof horasFinales === 'number' && horasFinales > 0
                                                        ? horasFinales.toFixed(1)
                                                        : '-'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>


            </div>

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

            {/* MODAL NUEVO RECURSO */}
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
                                value={nuevoRecurso.especialidad}
                                onChange={e => setNuevoRecurso({ ...nuevoRecurso, especialidad: e.target.value })}
                            >
                                <option value="">Seleccionar Puesto...</option>
                                <option value="Mecánico">Mecánico</option>
                                <option value="Soldador">Soldador</option>
                                <option value="Ayudante">Ayudante</option>
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
                                    if (!nuevoRecurso.nombre) return alert("Falta nombre");

                                    try {
                                        if (nuevoRecurso._id) {
                                            // SI TIENE ID: Llamamos a la función de actualizar que definiste en App.js
                                            await actualizarRecurso(nuevoRecurso._id, nuevoRecurso);
                                        } else {
                                            // SI NO TIENE ID: Es un recurso nuevo
                                            await crearRecurso(nuevoRecurso);
                                        }

                                        setModalRecursoAbierto(false);
                                        // Limpiamos el estado para que el ID no se quede pegado
                                        setNuevoRecurso({ nombre: '', tipo: 'Humano', especialidad: '', calendarioId: '' });

                                        // Opcional: Si quieres que al terminar de editar se vuelva a abrir la lista:
                                        // setMostrarModalPersonal(true);

                                    } catch (error) {
                                        console.error("Error al guardar:", error);
                                        alert("No se pudo guardar el recurso");
                                    }
                                }}
                                style={{ ...styles.btnPrimary, width: 'auto', padding: '10px 20px' }}
                            >
                                {/* Cambiamos el texto dinámicamente para que el usuario sepa qué está haciendo */}
                                {nuevoRecurso._id ? 'Actualizar Cambios' : 'Guardar Recurso'}
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
        minWidth: '220px',
        padding: '15px',
        position: 'sticky',
        left: 0,
        zIndex: 20,
        background: '#2c3e50',
        color: 'white',
        textAlign: 'left',
        borderRight: '2px solid #34495e'
    },

    recursoName: {
        padding: '12px 15px',
        position: 'sticky',
        left: 0,
        background: '#ffffff',
        zIndex: 5,
        borderRight: '3px solid #3498db', // Separación visual clara
        borderBottom: '1px solid #eee',
        fontWeight: '600'
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
        minWidth: '45px',
        padding: '10px 5px',
        borderRight: '1px solid #3e4f5f',
        textAlign: 'center'
    },

    celdaDia: {
        borderRight: '1px solid #eee',
        borderBottom: '1px solid #eee',
        textAlign: 'center',
        height: '60px'
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