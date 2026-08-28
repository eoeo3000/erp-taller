// Compresión y ancho máximo de las fotos: no se reprocesan acá. Las fotos ya llegan
// comprimidas desde el origen — O3/O4 (PWA Operativa) y el portal por token
// (otController.supervisorPortal, previsualizarFoto) recomprimen a un ancho máximo de
// 1200px y calidad JPEG .75 antes de guardarlas en OT.reportes[]/tareas[].registro. Esta
// pantalla solo las muestra a ancho completo de tarjeta (ver spec: "foto de 190px de alto a
// ancho completo"), sin volver a tocar el archivo — sería recomprimir una imagen ya
// comprimida sin necesidad.
const fmtHora = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
const fmtFecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

// Solo informativo (mismo criterio que TabPago.jsx en erp-web) — sin vencimiento ni acción
// automática, a diferencia del plazo de 12h de la cotización.
function horasDesde(iso) {
    if (!iso) return '';
    const horas = (Date.now() - new Date(iso).getTime()) / 3600000;
    if (horas < 1) return 'hace menos de 1 hora';
    if (horas < 24) return `hace ${Math.floor(horas)} h`;
    return `hace ${Math.floor(horas / 24)} día${Math.floor(horas / 24) === 1 ? '' : 's'}`;
}

export default function C4AvanceFotos({ nav, trabajo }) {
    if (!trabajo) return null;
    const ot = trabajo.ot;
    const reportes = [...(ot?.reportes || [])].reverse();
    const total = (ot?.tareas || []).length;
    const listas = (ot?.tareas || []).filter((t) => t.completada).length;
    // El informe completo (Solicitud + Informe Inicial + plan + lo reportado por tarea) recién
    // se arma acá una vez que la oficina lo envía explícitamente (TabPago.jsx, botón "Enviar
    // informe al cliente") — antes de eso, esta pantalla es solo el feed en vivo de avance,
    // igual que siempre fue. Pedido del usuario: que el cliente vea "el trabajo completo como
    // producto de la solicitud", no solo fotos sueltas sin contexto.
    const informeEnviado = !!ot?.informeFinal?.enviado;
    const tareasConDetalle = (ot?.tareas || []).filter((t) => (t.desarrollo || '').trim() || t.registro?.texto || t.registro?.fotos?.length);
    const hallazgos = ot?.informeEvaluacion?.hallazgos || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }} className="mono">‹</button>
                <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>{informeEnviado ? 'Informe' : 'Avance'}</span>
            </header>

            <div className="franja">
                <div style={{ fontSize: 'var(--fs-secundario)', fontWeight: 600 }}>
                    {ot?.estado === 'En Ejecución' ? 'En ejecución' : ot?.estado} · {listas} de {total} tareas listas
                </div>
                <div style={{ height: 4, background: 'var(--linea-zona)', marginTop: 8 }}>
                    <div style={{ height: 4, width: total ? `${Math.round((listas / total) * 100)}%` : '0%', background: 'var(--en-curso)' }} />
                </div>
                {informeEnviado && (
                    <div style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-1)', marginTop: 8 }} className="mono">
                        Informe enviado {horasDesde(ot.informeFinal.fechaEnvio)}
                    </div>
                )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {informeEnviado && (
                    <>
                        <div style={{ padding: '16px 16px 4px' }} className="versalita">Su solicitud</div>
                        <div style={{ padding: '0 16px 14px' }}>
                            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{trabajo.descripcion}</div>
                            <div style={{ fontSize: 13, color: 'var(--texto-secundario-2)', marginTop: 4 }}>
                                {trabajo.numeroSolicitud}{trabajo.fechaCreacion ? ` · ${fmtFecha(trabajo.fechaCreacion)}` : ''}
                            </div>
                        </div>

                        {hallazgos.length > 0 && (
                            <>
                                <div style={{ padding: '14px 16px 4px', borderTop: '1px solid var(--linea-zona)' }} className="versalita">Evaluación inicial</div>
                                {hallazgos.map((h, i) => (
                                    <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--linea-fina)' }}>
                                        {h.fotos?.[0] && <img src={h.fotos[0]} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 'var(--radio)' }} />}
                                        {h.texto && <div style={{ fontSize: 14, marginTop: h.fotos?.[0] ? 8 : 0, whiteSpace: 'pre-wrap' }}>{h.texto}</div>}
                                    </div>
                                ))}
                            </>
                        )}

                        {tareasConDetalle.length > 0 && (
                            <>
                                <div style={{ padding: '14px 16px 4px', borderTop: '1px solid var(--linea-zona)' }} className="versalita">Trabajo realizado, por tarea</div>
                                {tareasConDetalle.map((t, i) => (
                                    <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--linea-fina)' }}>
                                        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t.descripcion}</div>
                                        {(t.desarrollo || '').trim() && (
                                            <div style={{ fontSize: 13, color: 'var(--texto-secundario-2)', marginTop: 3, whiteSpace: 'pre-wrap' }}>{t.desarrollo}</div>
                                        )}
                                        {(t.registro?.texto || t.registro?.fotos?.length > 0) && (
                                            <div style={{ marginTop: 8, padding: '9px 10px', background: 'var(--fondo-pantalla)', borderLeft: '2px solid var(--listo)' }}>
                                                {t.registro.fotos?.[0] && <img src={t.registro.fotos[0]} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 'var(--radio)' }} />}
                                                {t.registro.texto && <div style={{ fontSize: 13.5, marginTop: t.registro.fotos?.[0] ? 8 : 0 }}>{t.registro.texto}</div>}
                                                <div className="mono" style={{ fontSize: 11.5, color: 'var(--texto-atenuado-1)', marginTop: 4 }}>
                                                    {[t.registro.autor, t.registro.hora].filter(Boolean).join(' · ')}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </>
                        )}

                        <div style={{ padding: '14px 16px 6px', borderTop: '1px solid var(--linea-zona)' }} className="versalita">Evidencias generales</div>
                    </>
                )}
                {reportes.length === 0 && <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>Todavía no hay reportes de terreno.</div>}
                {reportes.map((r, i) => (
                    <div key={i} style={{ borderBottom: '1px solid var(--linea-fina)', padding: '14px 16px' }}>
                        <div className="mono" style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-1)' }}>
                            {fmtHora(r.fecha)}{r.usuario ? ` · ${r.usuario}` : ''}
                        </div>
                        {r.foto && <img src={r.foto} alt="" style={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 'var(--radio)', marginTop: 8 }} />}
                        {r.comentario && <div style={{ fontSize: 14.5, marginTop: 8 }}>{r.comentario}</div>}
                    </div>
                ))}
            </div>

            <div style={{ padding: '14px 16px', fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-2)' }}>
                Las fotos las sube el equipo en terreno. Se publican al momento, sin edición.
            </div>
        </div>
    );
}
