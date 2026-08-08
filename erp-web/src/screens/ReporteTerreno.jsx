import React, { useState, useEffect } from 'react';

const ReporteTerreno = ({ ots, actualizarOtGlobal }) => {
    const [ot, setOt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [procesando, setProcesando] = useState(false);

    // 1. Vinculación inicial de la OT
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const otId = params.get("id");

        if (otId && ots && ots.length > 0) {
            const encontrada = ots.find(o => String(o._id) === String(otId) || String(o.id) === String(otId));
            if (encontrada && !ot) { // 🚩 Solo setear si el estado local 'ot' está vacío
                // Clonamos profundamente para que el input no "salte" al escribir
                setOt(JSON.parse(JSON.stringify(encontrada)));
            }
        }
        setLoading(false);
    }, [ots, ot]); // Agregamos 'ot' para control, pero la condición !ot evita el borrado

    const manejarCambioEvidencia = (idx, campo, valor) => {
        const nuevasTareas = [...ot.tareas];
        nuevasTareas[idx] = { ...nuevasTareas[idx], [campo]: valor };
        setOt({ ...ot, tareas: nuevasTareas });
    };

    const capturarFoto = (idx, archivo) => {
        if (!archivo) return;
        setProcesando(true);

        const reader = new FileReader();
        reader.onloadend = () => {
            manejarCambioEvidencia(idx, 'fotoEvidencia', reader.result);
            manejarCambioEvidencia(idx, 'estado', 'Completada');
            setProcesando(false);
        };
        reader.readAsDataURL(archivo);
    };

    const enviarReporte = async () => {
        // 1. Log inicial
        console.log("🛠️ Preparando hito de reporte...");

        try {
            // VERIFICACIÓN DE SEGURIDAD
            if (!ot) {
                console.error("❌ Error: El objeto 'ot' no existe.");
                return;
            }
            if (!ot.tareas || !Array.isArray(ot.tareas)) {
                console.error("❌ Error: 'ot.tareas' no es un array válido.", ot.tareas);
                alert("Error: No se encontraron tareas en esta OT.");
                return;
            }

            console.log(`📊 Analizando ${ot.tareas.length} tareas...`);

            // Creamos los hitos con validación de existencia de campos
            const nuevosHitos = ot.tareas
                .filter(t => t && t.comentarioAvance && t.comentarioAvance.trim() !== "")
                .map(t => ({
                    fecha: new Date().toISOString(),
                    tareaId: t.descripcion || "Tarea sin nombre",
                    comentario: t.comentarioAvance,
                    usuario: ot.tecnicoAsignado || 'Operario'
                }));

            console.log("📝 Hitos generados:", nuevosHitos.length);

            if (nuevosHitos.length === 0) {
                alert("⚠️ No hay comentarios nuevos para enviar.");
                return;
            }

            const otParaEnviar = {
                ...ot,
                reportes: [...(ot.reportes || []), ...nuevosHitos]
            };

            // 2. Log de salida
            console.log("📤 DATOS LISTOS PARA ENVIAR:", {
                id: ot._id || ot.id,
                totalReportes: otParaEnviar.reportes.length
            });

            setProcesando(true);
            const resultado = await actualizarOtGlobal(ot._id || ot.id, otParaEnviar);

            if (resultado && resultado.exito) {
                console.log("✅ ÉXITO: Reporte guardado en la DB.");
                setOt(resultado.otActualizada);
                alert("✅ Reporte guardado correctamente.");
            } else {
                console.error("❌ FALLO: El servidor no confirmó el guardado.");
            }

        } catch (error) {
            // 🚩 ESTO TE DIRÁ EXACTAMENTE QUÉ FALLÓ
            console.error("💥 ERROR CRÍTICO EN enviarReporte:", error.message);
            console.error("Stack:", error.stack);
        } finally {
            setProcesando(false);
        }
    };

    if (loading) return <div style={styles.loading}>Cargando reporte...</div>;
    if (!ot) return <div style={styles.loading}>⚠️ No se encontró la Orden de Trabajo.</div>;

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h2 style={{ margin: 0 }}>👷‍♂️ Reporte de Terreno</h2>
                <p style={{ margin: '5px 0 0', opacity: 0.9 }}>
                    OT: #{ot.numeroOT} | {ot.solicitante || ot.empresaSolicitante}
                </p>
            </header>

            <div style={styles.listaTareas}>
                {/* 🚩 Sección de Tareas Activas */}
                <h3 style={styles.seccionTitulo}>Tareas a Reportar</h3>
                {ot.tareas && ot.tareas.map((t, idx) => (
                    <div key={idx} style={{
                        ...styles.card,
                        borderLeft: t.fotoEvidencia ? '5px solid #27ae60' : '5px solid #f1c40f'
                    }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>{t.descripcion}</h4>

                        <div style={styles.row}>
                            <label style={{
                                ...styles.btnCamara,
                                backgroundColor: t.fotoEvidencia ? '#27ae60' : '#3498db'
                            }}>
                                {t.fotoEvidencia ? '📸 Cambiar' : '📷 Foto'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: 'none' }}
                                    onChange={(e) => capturarFoto(idx, e.target.files[0])}
                                />
                            </label>

                            <input
                                style={styles.input}
                                placeholder="Nota de avance..."
                                value={t.comentarioAvance || ''}
                                onChange={(e) => manejarCambioEvidencia(idx, 'comentarioAvance', e.target.value)}
                            />
                        </div>

                        {t.fotoEvidencia && (
                            <div style={styles.previewContainer}>
                                <img src={t.fotoEvidencia} style={styles.preview} alt="evidencia" />
                            </div>
                        )}
                    </div>
                ))}

                {/* 🚩 Sección de Historial (Solo lectura para el supervisor) */}
                {ot.reportes && ot.reportes.length > 0 && (
                    <>
                        <h3 style={styles.seccionTitulo}>Historial de Avances</h3>
                        <div style={styles.historialContainer}>
                            {ot.reportes.map((rep, i) => (
                                <div key={i} style={styles.miniCard}>
                                    <small>{new Date(rep.fecha).toLocaleString()}</small>
                                    <p style={{ margin: '5px 0' }}><b>{rep.tareaNombre}:</b> {rep.comentario}</p>
                                    <img src={rep.foto} style={styles.miniFoto} alt="historial" />
                                </div>
                            )).reverse()} {/* Mostrar el más reciente arriba */}
                        </div>
                    </>
                )}
            </div>

            <div style={styles.footer}>
                <button
                    onClick={enviarReporte}
                    disabled={procesando}
                    style={{
                        ...styles.btnEnviar,
                        opacity: procesando ? 0.6 : 1
                    }}
                >
                    {procesando ? 'GUARDANDO...' : 'ENVIAR REPORTE DE HOY'}
                </button>
            </div>
        </div>
    );
};

const styles = {
    container: { backgroundColor: '#f4f7f6', minHeight: '100vh', paddingBottom: '100px' },
    header: { backgroundColor: '#27ae60', color: 'white', padding: '20px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10 },
    listaTareas: { padding: '15px', maxWidth: '500px', margin: '0 auto' },
    seccionTitulo: { fontSize: '1.1em', color: '#2c3e50', marginTop: '20px', marginBottom: '10px', borderBottom: '1px solid #ddd' },
    card: { background: 'white', padding: '15px', borderRadius: '10px', marginBottom: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
    row: { display: 'flex', gap: '10px', alignItems: 'center' },
    btnCamara: { color: 'white', padding: '12px', borderRadius: '8px', flex: 1, textAlign: 'center', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' },
    input: { flex: 2, padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' },
    previewContainer: { position: 'relative', marginTop: '10px' },
    preview: { width: '100%', borderRadius: '8px', display: 'block' },
    footer: { position: 'fixed', bottom: 0, left: 0, right: 0, padding: '15px', backgroundColor: 'white', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'center', zIndex: 10 },
    btnEnviar: { maxWidth: '500px', width: '100%', padding: '15px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '16px' },
    loading: { padding: '50px', textAlign: 'center', fontSize: '18px', color: '#666' },
    // Estilos del historial
    historialContainer: { opacity: 0.8 },
    miniCard: { backgroundColor: '#eee', padding: '10px', borderRadius: '8px', marginBottom: '10px', fontSize: '12px' },
    miniFoto: { width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', marginTop: '5px' }
};

export default ReporteTerreno;