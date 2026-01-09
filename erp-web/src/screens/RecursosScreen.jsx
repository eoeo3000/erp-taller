import React, { useState, useEffect } from 'react';
import axios from 'axios';

const RecursosScreen = () => {
    const [recursos, setRecursos] = useState([]);
    const [nuevoRecurso, setNuevoRecurso] = useState({ nombre: '', tipo: 'Humano', especialidad: '', calendarioId: '' });
    const [editandoId, setEditandoId] = useState(null); // null = creando, id = editando
    const [modalAbierto, setModalAbierto] = useState(false);
    const [modalRecursoAbierto, setModalRecursoAbierto] = useState(false);
    const [modalMaestroAbierto, setModalMaestroAbierto] = useState(false);
    const [ajusteManual, setAjusteManual] = useState(null); // { recursoId, dia, horas }
    const prepararEdicion = (cal) => {
        // 1. Cargamos el ID que estamos editando
        setEditandoId(cal.id);

        // 2. Cargamos los datos en el formulario (Copia profunda para no romper el original)
        setNuevoCal(JSON.parse(JSON.stringify(cal)));

        // 3. ¡IMPORTANTE! Abrimos la ventana
        setModalAbierto(true);
    };

    // Estado para el calendario que se está creando o editando
    const [nuevoCal, setNuevoCal] = useState({
        nombre: '',
        config: [
            { dia: 'lun', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '18:00' }] },
            { dia: 'mar', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '18:00' }] },
            { dia: 'mié', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '18:00' }] },
            { dia: 'jue', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '18:00' }] },
            { dia: 'vie', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '17:00' }] },
            { dia: 'sáb', activo: false, bloques: [{ inicio: '', fin: '' }, { inicio: '', fin: '' }] },
            { dia: 'dom', activo: false, bloques: [{ inicio: '', fin: '' }, { inicio: '', fin: '' }] }
        ]
    });


    const abrirNuevoMaestro = () => {
        setEditandoId(null);
        setNuevoCal(estadoInicialCalendario); // Asegúrate de tener tu objeto base limpio
        setModalMaestroAbierto(true);
    };


    const guardarCambioManual = async (recursoId, dia, nuevasHoras) => {
        // Aquí podrías enviar un PATCH a una tabla de "excepciones" o "asistencias"
        console.log(`Cambiando recurso ${recursoId} el día ${dia} a ${nuevasHoras}h`);
        // Lógica para actualizar en BD...
        setAjusteManual(null);
    };
    // Estado para saber si estamos editando un calendario existente
    const [editandoCalId, setEditandoCalId] = useState(null);
    const guardarCalendario = () => {
        if (editandoId) {
            // ACTUALIZAR EXISTENTE
            setCalendarios(prev => prev.map(c => c.id === editandoId ? { ...nuevoCal, id: editandoId } : c));
            setEditandoId(null);
        } else {
            // CREAR NUEVO
            const idGenerado = `cal_${Date.now()}`;
            setCalendarios([...calendarios, { ...nuevoCal, id: idGenerado }]);
        }
        // Limpiar formulario
        setNuevoCal({ nombre: '', config: [/* ...configuración inicial vacía... */] });
    };

    // 1. ESTADO DE CALENDARIOS (Plantillas)
    const [calendarios, setCalendarios] = useState([
        {
            id: 'cal_1',
            nombre: 'Turno Normal Oficina',
            config: [
                { dia: 'lun', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '18:00' }] },
                { dia: 'mar', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '18:00' }] },
                { dia: 'mié', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '18:00' }] },
                { dia: 'jue', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '18:00' }] },
                { dia: 'vie', activo: true, bloques: [{ inicio: '08:00', fin: '12:00' }, { inicio: '14:00', fin: '17:00' }] },
                { dia: 'sáb', activo: false, bloques: [] },
                { dia: 'dom', activo: false, bloques: [] }
            ]
        }
    ]);

    const [anio] = useState(2026);
    const [mes] = useState(0); // Enero

    // Generar días del mes con manejo de errores
    const diasDelMes = Array.from({ length: 31 }, (_, i) => {
        try {
            const fecha = new Date(anio, mes, i + 1);
            const nombre = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(fecha);
            return {
                numero: i + 1,
                nombreDia: nombre.toLowerCase().replace('.', ''),
                esFinde: fecha.getDay() === 0 || fecha.getDay() === 6
            };
        } catch (e) {
            return { numero: i + 1, nombreDia: '', esFinde: false };
        }
    });

    useEffect(() => { fetchRecursos(); }, []);

    const fetchRecursos = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/recursos');
            // Validamos que res.data sea un array antes de setearlo
            setRecursos(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error("Error al traer recursos", e);
            setRecursos([]); // Fallback a array vacío
        }
    };

    const calcularHorasDia = (bloques) => {
        if (!bloques || !Array.isArray(bloques)) return 0;
        return bloques.reduce((total, bloque) => {
            if (!bloque.inicio || !bloque.fin) return total;
            const [hInicio, mInicio] = bloque.inicio.split(':').map(Number);
            const [hFin, mFin] = bloque.fin.split(':').map(Number);
            const minutos = (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
            return total + (minutos / 60);
        }, 0);
    };

    const asignarCalendario = async (recursoId, calId) => {
        try {
            // Actualización local inmediata (Optimistic UI)
            setRecursos(prev => prev.map(r => r.id === recursoId ? { ...r, calendarioId: calId } : r));
            await axios.put(`http://localhost:5000/api/recursos/${recursoId}`, { calendarioId: calId });
        } catch (e) {
            console.error("Error al asignar calendario", e);
            fetchRecursos(); // Revertir si falla
        }
    };

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
                            <div key={cal.id} style={styles.calItem}>
                                <span>{cal.nombre}</span>
                                <button onClick={() => prepararEdicion(cal)} style={styles.btnIcon}>✏️</button>
                            </div>
                        ))}
                    </div>
                </div>


                <div style={styles.ganttContainer}>
                    <table style={styles.ganttTable}>
                        <thead>
                            <tr style={{ background: '#2c3e50', color: 'white' }}>
                                <th style={styles.recursoColHeader}>Recurso / Calendario</th>
                                {diasDelMes.map(d => (
                                    <th key={d.numero} translate="no" style={{
                                        ...styles.diaCol,
                                        backgroundColor: d.esFinde ? '#34495e' : '#2c3e50'
                                    }}>
                                        <div style={{ fontSize: '9px' }}>{d.nombreDia}</div>
                                        <div>{d.numero}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {recursos.map(r => {
                                const calAsignado = calendarios.find(c => String(c.id) === String(r.calendarioId));
                                return (
                                    <tr key={r.id} translate="no">
                                        <td style={styles.recursoName}>
                                            <div style={{ fontWeight: 'bold' }}>{r.nombre}</div>
                                            <select
                                                style={styles.miniSelect}
                                                value={r.calendarioId || ''}
                                                onChange={(e) => asignarCalendario(r.id, e.target.value)}
                                            >
                                                <option value="">Sin Turno</option>
                                                {calendarios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                            </select>
                                        </td>
                                        {diasDelMes.map(d => {
                                            const configDia = calAsignado?.config?.find(c => c.dia === d.nombreDia);
                                            const horasBase = configDia ? calcularHorasDia(configDia.bloques) : 0;

                                            return (
                                                <td
                                                    key={d.numero} translate="no"
                                                    onClick={() => setAjusteManual({ recursoId: r.id, nombre: r.nombre, dia: d.numero, horas: horasBase })}
                                                    style={{
                                                        ...styles.celdaDia,
                                                        backgroundColor: d.esFinde ? '#f9f9f9' : (horasBase > 0 ? '#e8f5e9' : '#fff'),
                                                        cursor: 'pointer', // Indica que es editable
                                                        transition: 'background 0.2s'
                                                    }}
                                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#d1f2eb'}
                                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = d.esFinde ? '#f9f9f9' : (horasBase > 0 ? '#e8f5e9' : '#fff')}
                                                >
                                                    {horasBase > 0 && <span style={styles.horaBadge}>{horasBase}h</span>}
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
                                onClick={() => guardarCambioManual(ajusteManual.recursoId, ajusteManual.dia, ajusteManual.horas)}
                                style={styles.btnPrimary}
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {modalAbierto && (
                <div style={styles.overlay}>
                    <div style={styles.modal}>
                        <div style={styles.modalHeader}>
                            <h3>📝 Editar Plantilla: {nuevoCal.nombre}</h3>
                            <button onClick={() => setModalAbierto(false)} style={styles.btnClose}>&times;</button>
                        </div>

                        <div style={styles.modalBody}>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Nombre del Turno</label>
                            <input
                                style={styles.input}
                                value={nuevoCal.nombre}
                                onChange={e => setNuevoCal({ ...nuevoCal, nombre: e.target.value })}
                            />

                            <div style={styles.scrollArea}>
                                {nuevoCal.config.map((d, idx) => (
                                    <div key={d.dia} style={styles.diaRow}>
                                        <span style={{ width: '60px', fontWeight: 'bold' }}>{d.dia.toUpperCase()}</span>

                                        {/* Input Inicio con protección */}
                                        <input
                                            type="time"
                                            style={styles.miniInput}
                                            value={d.bloques[0]?.inicio || ''}
                                            onChange={(e) => {
                                                const copia = { ...nuevoCal };
                                                if (!copia.config[idx].bloques[0]) copia.config[idx].bloques[0] = { inicio: '', fin: '' };
                                                copia.config[idx].bloques[0].inicio = e.target.value;
                                                setNuevoCal(copia);
                                            }}
                                        />

                                        <span>a</span>

                                        {/* Input Fin con protección (Aquí era el error) */}
                                        <input
                                            type="time"
                                            style={styles.miniInput}
                                            value={d.bloques[0]?.fin || ''}
                                            onChange={(e) => {
                                                const copia = { ...nuevoCal };
                                                if (!copia.config[idx].bloques[0]) copia.config[idx].bloques[0] = { inicio: '', fin: '' };
                                                copia.config[idx].bloques[0].fin = e.target.value;
                                                setNuevoCal(copia);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={styles.modalFooter}>
                            <button onClick={() => setModalAbierto(false)} style={styles.btnSecundario}>Cancelar</button>
                            <button
                                onClick={() => { guardarCalendario(); setModalAbierto(false); }}
                                style={{ ...styles.btnPrimary, width: 'auto', padding: '10px 20px' }}
                            >
                                Guardar Cambios
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
                                {calendarios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>

                        <div style={styles.modalFooter}>
                            <button onClick={() => setModalRecursoAbierto(false)} style={styles.btnSecundario}>Cancelar</button>
                            <button
                                onClick={() => {
                                    if (!nuevoRecurso.nombre) return alert("Falta nombre");
                                    axios.post('http://localhost:5000/api/recursos', nuevoRecurso).then(() => {
                                        fetchRecursos();
                                        setModalRecursoAbierto(false); // Cerrar al terminar
                                        setNuevoRecurso({ nombre: '', tipo: 'Humano', especialidad: '', calendarioId: '' }); // Limpiar
                                    });
                                }}
                                style={{ ...styles.btnPrimary, width: 'auto', padding: '10px 20px' }}
                            >
                                Guardar Recurso
                            </button>
                        </div>
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

                        <div style={styles.modalBody}>
                            <label style={{ fontWeight: 'bold' }}>Nombre de la Plantilla</label>
                            <input
                                style={styles.input}
                                placeholder="Ej: Turno Noche 12x12"
                                value={nuevoCal.nombre}
                                onChange={e => setNuevoCal({ ...nuevoCal, nombre: e.target.value })}
                            />

                            <div style={styles.scrollArea}>
                                <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>Configuración de horario por día:</p>
                                {nuevoCal.config.map((d, idx) => (
                                    <div key={d.dia} style={styles.diaRow}>
                                        <span style={{ width: '60px', fontWeight: 'bold' }}>{d.dia.toUpperCase()}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input
                                                type="time"
                                                style={styles.miniInput}
                                                value={d.bloques[0]?.inicio || ''}
                                                onChange={(e) => actualizarHora(idx, 'inicio', e.target.value)}
                                            />
                                            <span>a</span>
                                            <input
                                                type="time"
                                                style={styles.miniInput}
                                                value={d.bloques[0]?.fin || ''}
                                                onChange={(e) => actualizarHora(idx, 'fin', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={styles.modalFooter}>
                            <button onClick={() => setModalMaestroAbierto(false)} style={styles.btnSecundario}>Cancelar</button>
                            <button onClick={guardarCalendario} style={{ ...styles.btnPrimary, width: 'auto', padding: '10px 25px' }}>
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
    container: {
        padding: '20px',
        backgroundColor: '#f4f7f6',
        minHeight: '100vh',
        fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif'
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
};

export default RecursosScreen;