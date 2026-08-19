import { useEffect, useState } from 'react';
import { obtenerOT, accionOT, actualizarOT } from '../api.js';

function claveInicio(otId) { return `operativo.inicio.${otId}`; }

function tiempoTranscurrido(desde) {
    const ms = Date.now() - new Date(desde).getTime();
    const horas = Math.floor(ms / 3600000);
    const min = Math.floor((ms % 3600000) / 60000);
    return horas > 0 ? `${horas} h ${min} min` : `${min} min`;
}

export default function O3TrabajoEnCurso({ nav, asignacion }) {
    const [ot, setOt] = useState(null);
    const [error, setError] = useState('');
    const [procesando, setProcesando] = useState(false);
    const otId = asignacion?.otId;

    const recargar = () => obtenerOT(otId).then(setOt).catch((e) => setError(e.message));

    useEffect(() => {
        if (!otId) return;
        (async () => {
            try {
                let actual = await obtenerOT(otId);
                if (actual.estado === 'Programada') {
                    await accionOT(otId, { accion: 'iniciar' });
                    localStorage.setItem(claveInicio(otId), new Date().toISOString());
                    actual = await obtenerOT(otId);
                }
                if (!localStorage.getItem(claveInicio(otId))) localStorage.setItem(claveInicio(otId), new Date().toISOString());
                setOt(actual);
            } catch (e) { setError(e.message); }
        })();
    }, [otId]);

    if (error) return <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div>;
    if (!ot) return null;

    const marcarListo = async (idx) => {
        setProcesando(true);
        const tareas = ot.tareas.map((t, i) => (i === idx ? { ...t, completada: true } : t));
        try { await actualizarOT(otId, { tareas }); await recargar(); } finally { setProcesando(false); }
    };

    const terminar = async () => {
        setProcesando(true);
        try { await accionOT(otId, { accion: 'terminar' }); await recargar(); } finally { setProcesando(false); }
    };

    const interrumpir = async () => {
        const motivo = window.prompt('Motivo de la interrupción:');
        if (!motivo) return;
        setProcesando(true);
        try { await accionOT(otId, { accion: 'interrumpir', motivo }); nav.volver(); } finally { setProcesando(false); }
    };

    const inicio = localStorage.getItem(claveInicio(otId));
    const reportesHoy = (ot.reportes || []).filter((r) => new Date(r.fecha).toDateString() === new Date().toDateString());

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }} className="mono">‹</button>
                <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{ot.numeroOT}</span>
                <span className="versalita" style={{ marginLeft: 'auto' }}>{ot.estado}</span>
            </header>

            <div style={{ padding: 16 }}>
                <div style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>{ot.descripcion}</div>
                <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)', marginTop: 4 }}>{ot.solicitante}</div>
            </div>

            <div className="franja" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                    <div className="versalita">En obra desde</div>
                    <div className="mono" style={{ fontSize: 'var(--fs-secundario)', marginTop: 2 }}>
                        {inicio ? `${new Date(inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · ${tiempoTranscurrido(inicio)}` : '—'}
                    </div>
                </div>
                <div>
                    <div className="versalita">Planificado</div>
                    <div className="mono" style={{ fontSize: 'var(--fs-secundario)', marginTop: 2 }}>{asignacion.fechaPlanificada}</div>
                </div>
            </div>

            <div style={{ padding: '14px 16px 4px' }} className="versalita">Tareas</div>
            <div>
                {(ot.tareas || []).filter((t) => t.fecha === asignacion.fechaPlanificada).map((t) => {
                    const idx = ot.tareas.indexOf(t);
                    return (
                        <div key={idx} style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--linea-fina)' }}>
                            <span className="mono" style={{ color: t.completada ? 'var(--listo)' : 'var(--texto-atenuado-3)' }}>{t.completada ? '×' : '·'}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 15, textDecoration: t.completada ? 'line-through' : 'none', color: t.completada ? 'var(--texto-atenuado-1)' : 'var(--texto-principal)' }}>{t.descripcion}</div>
                                <div style={{ fontSize: 13, color: 'var(--texto-atenuado-1)' }}>{(t.operarioNombre || []).join(', ')} · {t.duracion} h</div>
                                {t.desarrollo && (
                                    <div style={{ fontSize: 13, color: 'var(--texto-secundario-2)', marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{t.desarrollo}</div>
                                )}
                            </div>
                            {!t.completada && (
                                <button className="boton-secundario" style={{ width: 'auto', minHeight: 44, padding: '0 14px' }} disabled={procesando} onClick={() => marcarListo(idx)}>Listo</button>
                            )}
                        </div>
                    );
                })}
            </div>

            {reportesHoy.length > 0 && (
                <>
                    <div style={{ padding: '14px 16px 4px' }} className="versalita">Reportes de hoy</div>
                    {reportesHoy.map((r, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 16px', alignItems: 'center' }}>
                            {r.foto && <img src={r.foto} alt="" style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 'var(--radio)' }} />}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14 }}>{r.comentario}</div>
                                <div className="mono" style={{ fontSize: 13, color: 'var(--texto-atenuado-1)' }}>{new Date(r.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · enviado</div>
                            </div>
                        </div>
                    ))}
                </>
            )}

            <div style={{ flex: 1 }} />

            <div className="pie-accion">
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="boton-secundario" style={{ minHeight: 48 }} onClick={() => nav.ir('o4', { asignacion, modo: 'reporte' })}>Reportar avance</button>
                    <button className="boton-secundario boton-riesgo" style={{ minHeight: 48 }} onClick={interrumpir}>Interrupción</button>
                </div>
                <button className="boton-primario" disabled={procesando} onClick={terminar}>Terminar trabajo</button>
            </div>
        </div>
    );
}
