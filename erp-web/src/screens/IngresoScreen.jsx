import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// Recibimos 'solicitudes' como prop desde App.jsx para actualización automática
const IngresoScreen = ({ solicitudes = [], liberarSolicitudManual, cargarDatos, API, crearSolicitudGlobal, ots = [] }) => {
    const [form, setForm] = useState({
        solicitante: '',
        empresaSolicitante: '',
        correo: '',
        numero: '',
        direccion: '',
        descripcion: '',
        origen: 'WhatsApp',
        fechaEjecucionSolicitada: '',
        plazoEjecucionSugerido: '',
        adjuntos: ''
    });
    const [menuAbierto, setMenuAbierto] = useState(null);
    const [filtros, setFiltros] = useState({
        estado: '',
        empresa: '',
        solicitante: ''
    });
    const navigate = useNavigate();
    const [archivo, setArchivo] = useState(null);
    // src/screens/IngresoScreen.jsx
    useEffect(() => {
        const cerrarMenu = (e) => {
            // Si el clic no fue en un botón de filtro o dentro del dropdown, cerramos
            if (!e.target.closest('.contenedor-filtro')) {
                setMenuAbierto(null);
            }
        };
        window.addEventListener('click', cerrarMenu);
        return () => window.removeEventListener('click', cerrarMenu);
    }, []);

    // Cambiamos hasolcindleCrear en IngresoScreen.jsx
    const handleCrear = async () => {
        // 2. Validación extendida
        if (!form.solicitante || !form.empresaSolicitante || !form.descripcion) {
            alert("Por favor completa los campos obligatorios: Solicitante, Empresa y Descripción.");
            return;
        }

        // --- CAMBIO CLAVE ---
        // Pasamos el 'form' Y el 'archivo' a la función de App.js
        const exito = await crearSolicitudGlobal(form, archivo);

        if (exito) {
            // 3. Limpiamos todos los campos y el archivo
            setForm({
                solicitante: '',
                empresaSolicitante: '',
                correo: '',
                numero: '',
                direccion: '',
                descripcion: '',
                origen: 'WhatsApp',
                fechaEjecucionSolicitada: '',
                plazoEjecucionSugerido: '',
                adjuntos: ''
            });
            setArchivo(null); // Reset del archivo seleccionado

            // Opcional: Resetear el input file manualmente si usas un ref
            alert("✅ Solicitud registrada con éxito");
        }
    };

    const manejarCambioFiltro = (columna, valor) => {
        setFiltros(prev => ({ ...prev, [columna]: valor }));
    };
    const solicitudesFiltradas = solicitudes.filter(s => {
        // Comparamos cada criterio. Si el filtro está vacío, deja pasar todo (true)
        const cumpleEstado = !filtros.estado || s.estado === filtros.estado;

        const cumpleEmpresa = !filtros.empresa ||
            s.empresaSolicitante?.toLowerCase().includes(filtros.empresa.toLowerCase());

        const cumpleSolicitante = !filtros.solicitante ||
            s.solicitante?.toLowerCase().includes(filtros.solicitante.toLowerCase());

        return cumpleEstado && cumpleEmpresa && cumpleSolicitante;
    });
    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h2 style={{ color: '#2c3e50', marginBottom: '20px' }}>📋 Nueva Solicitud de Servicio</h2>

                {/* Grid principal del formulario */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '15px'
                }}>

                    {/* --- DATOS DEL CLIENTE --- */}
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Empresa Solicitante *</label>
                        <input
                            style={styles.input}
                            placeholder="Nombre de la empresa"
                            value={form.empresaSolicitante}
                            onChange={e => setForm({ ...form, empresaSolicitante: e.target.value })}
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Nombre Solicitante *</label>
                        <input
                            style={styles.input}
                            placeholder="Quién solicita"
                            value={form.solicitante}
                            onChange={e => setForm({ ...form, solicitante: e.target.value })}
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Correo Electrónico</label>
                        <input
                            style={styles.input}
                            type="email"
                            placeholder="ejemplo@correo.com"
                            value={form.correo}
                            onChange={e => setForm({ ...form, correo: e.target.value })}
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Número de Contacto</label>
                        <input
                            style={styles.input}
                            placeholder="+56 9..."
                            value={form.numero}
                            onChange={e => setForm({ ...form, numero: e.target.value })}
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Dirección del Servicio</label>
                        <input
                            style={styles.input}
                            placeholder="Calle, Ciudad, Planta"
                            value={form.direccion}
                            onChange={e => setForm({ ...form, direccion: e.target.value })}
                        />
                    </div>

                    {/* --- PLANIFICACIÓN SUGERIDA --- */}
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Fecha Ejecución Solicitada</label>
                        <input
                            style={styles.input}
                            type="date"
                            value={form.fechaEjecucionSolicitada}
                            onChange={e => setForm({ ...form, fechaEjecucionSolicitada: e.target.value })}
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Plazo Sugerido</label>
                        <input
                            style={styles.input}
                            placeholder="Ej: 48 horas / 5 días"
                            value={form.plazoEjecucionSugerido}
                            onChange={e => setForm({ ...form, plazoEjecucionSugerido: e.target.value })}
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Canal de Origen</label>
                        <select
                            style={styles.input}
                            value={form.origen}
                            onChange={e => setForm({ ...form, origen: e.target.value })}
                        >
                            <option value="WhatsApp">WhatsApp</option>
                            <option value="Correo">Correo</option>
                            <option value="Llamada">Llamada</option>
                            <option value="Presencial">Presencial</option>
                        </select>
                    </div>

                    {/* --- DESCRIPCIÓN (Ocupa todo el ancho) --- */}
                    <div style={{ ...styles.inputGroup, gridColumn: '1 / -1' }}>
                        <label style={styles.label}>Descripción Detallada *</label>
                        <textarea
                            style={{ ...styles.input, minHeight: '100px', resize: 'vertical' }}
                            placeholder="Explique el requerimiento técnico..."
                            value={form.descripcion}
                            onChange={e => setForm({ ...form, descripcion: e.target.value })}
                        />
                    </div>
                </div>
                <div style={{ ...styles.inputGroup, gridColumn: '1 / -1' }}>
                    <label style={styles.label}>📎 Adjuntar Archivo o Documentación</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {/* Campo de texto (opcional por si quieren pegar un link) */}
                        <input
                            style={{ ...styles.input, flex: 1 }}
                            placeholder={archivo ? `Archivo seleccionado: ${archivo.name}` : "Seleccione un archivo o pegue un link..."}
                            value={form.adjuntos}
                            onChange={e => setForm({ ...form, adjuntos: e.target.value })}
                            readOnly={!!archivo} // Si hay archivo físico, bloqueamos el texto para evitar confusiones
                        />

                        {/* Input de archivo real (oculto) */}
                        <input
                            type="file"
                            id="file-upload"
                            style={{ display: 'none' }}
                            onChange={(e) => setArchivo(e.target.files[0])}
                        />

                        {/* Botón que dispara el selector de archivos */}
                        <button
                            type="button"
                            onClick={() => document.getElementById('file-upload').click()}
                            style={{
                                ...styles.btnSecundario,
                                backgroundColor: archivo ? '#e8f5e9' : '#ecf0f1',
                                borderColor: archivo ? '#27ae60' : '#bdc3c7'
                            }}
                        >
                            {archivo ? '✅ Cambiar' : '📁 Explorar'}
                        </button>

                        {/* Botón para quitar el archivo si se equivocan */}
                        {archivo && (
                            <button
                                type="button"
                                onClick={() => setArchivo(null)}
                                style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <small style={{ color: '#7f8c8d', fontSize: '11px' }}>
                        {archivo
                            ? `Listo para subir: ${archivo.name} (${(archivo.size / 1024).toFixed(1)} KB)`
                            : "* Adjunte planos, fotos del equipo o términos de referencia."}
                    </small>
                </div>
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={handleCrear} style={styles.btnPrimario}>
                        💾 Generar Solicitud de Servicio
                    </button>
                </div>
            </div>
            {/* RECTÁNGULO INFERIOR: TABLA */}
            <div style={styles.card}>
                <h2 style={{ marginBottom: '15px' }}>Solicitudes Ingresadas</h2>
                <div style={styles.contenedorScrollTabla}>
                    <table style={styles.tablaAnchoFijo}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left', color: '#7f8c8d' }}>
                                <th style={{ ...styles.th, width: '30px' }}>N°</th>

                                {/* COLUMNA ESTADO */}
                                <th style={{ ...styles.th, width: '80px', position: 'relative' }}>
                                    <div style={styles.headerCell}>
                                        <span>Estado</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setMenuAbierto(menuAbierto === 'estado' ? null : 'estado');
                                            }}
                                            style={styles.btnFiltro}
                                        >
                                            {filtros.estado ? '✅' : '▼'}
                                        </button>
                                    </div>

                                    {menuAbierto === 'estado' && (
                                        <div style={styles.dropdownDirecto}>
                                            {['', 'Pendiente', 'Generada', 'Convertida'].map((opcion) => (
                                                <div
                                                    key={opcion}
                                                    onClick={() => {
                                                        manejarCambioFiltro('estado', opcion);
                                                        setMenuAbierto(null); // Se cierra inmediatamente
                                                    }}
                                                    style={{
                                                        ...styles.itemMenu,
                                                        backgroundColor: filtros.estado === opcion ? '#f0f7ff' : 'transparent',
                                                        fontWeight: filtros.estado === opcion ? 'bold' : 'normal'
                                                    }}
                                                >
                                                    {opcion === '' ? 'Mostrar Todos' : opcion}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </th>

                                <th style={{ ...styles.th, width: '100px' }}>Solicitante</th>
                                <th style={{ ...styles.th, width: '120px' }}>Nombre Solicitante</th>
                                <th style={{ ...styles.th, width: '120px' }}>Adjunto</th>
                                <th style={{ ...styles.th, width: '120px' }}>Acción</th>
                            </tr>
                        </thead>

                        <tbody>
                            {solicitudesFiltradas && solicitudesFiltradas.map((s, index) => {
                                // --- ESTA LÓGICA DEBE ESTAR AQUÍ DENTRO ---
                                // 1. Buscamos si hay una OT vinculada para ESTA solicitud 's'
                                const otEncontrada = (ots || []).find(item => item.solicitudId === s._id || item._id === s._id);

                                // 2. Determinamos el estado real (priorizando el de la OT si existe)
                                const estadoFinal = otEncontrada ? otEncontrada.estado : s.estado;

                                // 3. Definimos si "Ya tiene OT" para el botón
                                const yaTieneOT = (estadoFinal === 'Generada' || estadoFinal === 'Convertida' || estadoFinal === 'Planificada');

                                return (
                                    <tr key={s._id || index} style={{
                                        borderBottom: '1px solid #eee',
                                        backgroundColor: yaTieneOT ? '#f9f9f9' : 'white'
                                    }}>
                                        <td style={styles.td}>{index + 1}</td>

                                        <td style={{
                                            ...styles.td,
                                            fontWeight: 'bold',
                                            color: yaTieneOT ? '#27ae60' : '#f39c12'
                                        }}>
                                            <span style={styles.badge}>
                                                {estadoFinal || 'Pendiente'}
                                            </span>
                                        </td>

                                        <td style={styles.td}>{s.empresaSolicitante || '---'}</td>

                                        <td style={{ ...styles.td, opacity: yaTieneOT ? 0.6 : 1 }}>
                                            {s.solicitante}
                                        </td>

                                        <td style={styles.td}>
                                            {s.adjuntos ? (
                                                <a
                                                    href={`${API.replace('/api', '')}${s.adjuntos}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={styles.linkAdjunto}
                                                >
                                                    📎 Ver Archivo
                                                </a>
                                            ) : (
                                                <span style={{ color: '#ccc' }}>---</span>
                                            )}
                                        </td>

                                        <td style={styles.td}>
                                            <button
                                                onClick={() => {
                                                    const datosParaTratamiento = {
                                                        ...(otEncontrada || s),
                                                        solicitudId: s._id,
                                                    };
                                                    navigate('/tratamiento', { state: datosParaTratamiento });
                                                }}
                                                style={yaTieneOT ? styles.btnEdit : styles.btnTratar}
                                            >
                                                {yaTieneOT ? '📝 Ver OT' : '⚙️ Tratar'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
};

const styles = {
    contenedorScrollTabla: {
        width: '100%',
        overflowX: 'auto',       // Activa el scroll horizontal
        overflowY: 'visible',    // Permite ver el dropdown
        paddingBottom: '100px',  // Espacio para que el menú no se corte
        marginBottom: '-100px',  // Elimina el espacio sobrante del fondo
    },
    tablaAnchoFijo: {
        width: '100%',
        minWidth: '1000px',      // Fuerza a que no se amontonen las columnas
        borderCollapse: 'collapse',
        tableLayout: 'fixed'     // Mantiene anchos de columna estables
    },
    dropdownDirecto: {
        position: 'absolute',
        top: '100%',
        left: '0',
        zIndex: 1000,            // Por encima de todo
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        width: '180px',
        marginTop: '5px'
    },
    th: {
        padding: '12px 10px',
        backgroundColor: '#f8f9fa',
        fontSize: '13px'
    },
    itemMenu: {
        padding: '10px 15px',
        fontSize: '13px',
        color: '#333',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.2s',
        borderBottom: '1px solid #f5f5f5',
        // Hover: esto es mejor ponerlo en un CSS real, 
        // pero puedes simularlo con onMouseEnter/Leave si prefieres
    },
    inputFiltroColumna: {
        width: '100%',
        padding: '6px',
        fontSize: '12px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        outline: 'none',
        boxSizing: 'border-box'
    },
    headerCell: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '5px'
    },
    btnFiltro: {
        background: '#f1f3f5',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        padding: '2px 6px',
        cursor: 'pointer',
        fontSize: '10px'
    },
    dropdown: {
        position: 'absolute',
        top: '100%',
        left: '50%', // Se mueve a la mitad del botón
        transform: 'translateX(-50%)', // Se retrocede la mitad de su propio ancho
        zIndex: 1000,
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        width: '220px', // Puedes ajustarlo según necesites
        marginTop: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
    },
    inputPop: {
        width: '100%',
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid #ccc',
        fontSize: '13px',
        boxSizing: 'border-box',
        outline: 'none'
    },
    btnCerrar: {
        backgroundColor: '#3498db',
        color: 'white',
        border: 'none',
        padding: '6px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px'
    },
    headerContenedor: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    btnIconFiltro: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#95a5a6',
        fontSize: '10px',
        padding: '2px 5px'
    },
    popover: {
        position: 'absolute',
        top: '100%',
        left: '0',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '6px',
        padding: '10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000, // Asegura que esté por encima de todo
        width: '180px',
        marginTop: '5px'
    },
    inputFiltro: {
        width: '100%',
        padding: '8px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '13px',
        boxSizing: 'border-box',
        outline: 'none'
    },
    // En IngresoScreen.jsx
    container: {
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',      // Asegúrate de que sea flex
        flexDirection: 'column',
        gap: '20px',
        padding: '20px',
        boxSizing: 'border-box'
        // Quitamos minHeight y backgroundColor porque ya están en el 'main' de App.js
    },
    btnTratar: { background: '#f39c12', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' },
    btnEdit: { background: '#27ae60', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' },
    card: {
        background: 'white',
        minHeight: '400px',
        padding: '25px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
    },
    label: {
        fontSize: '13px',
        fontWeight: 'bold',
        color: '#4b5563' // Gris oscuro profesional
    },
    input: {
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #d1d5db',
        fontSize: '14px',
        outline: 'none'
    },
    btnPrimario: {
        background: '#2563eb',
        color: 'white',
        border: 'none',
        padding: '14px 28px',
        cursor: 'pointer',
        borderRadius: '8px',
        fontWeight: 'bold',
        fontSize: '15px'
    }
};

export default IngresoScreen;