import { useEffect, useState } from 'react';
import { ejecutadas, obtenerOT } from '../api.js';

const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });

function agrupar(ots) {
    const hoy = new Date();
    const haceUnaSemana = new Date(hoy); haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);
    const grupos = new Map();
    for (const ot of ots) {
        const fecha = new Date(ot.cerrado);
        const clave = fecha >= haceUnaSemana ? 'Esta semana' : MES[fecha.getMonth()];
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(ot);
    }
    return grupos;
}

export default function S6Ejecutadas({ nav }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');
    const [seleccionada, setSeleccionada] = useState(null);

    useEffect(() => { ejecutadas().then((d) => setDatos(d.ots)).catch((e) => setError(e.message)); }, []);

    if (error) return <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div>;
    if (!datos) return null;

    if (seleccionada) {
        return <DetalleEjecutada otId={seleccionada} onVolver={() => setSeleccionada(null)} />;
    }

    const grupos = agrupar(datos);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
                <span style={{ fontSize: 17, fontWeight: 700 }}>Ejecutadas</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--texto-atenuado-1)' }}>30 días</span>
            </header>

            <div className="franja" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--texto-secundario-2)' }}>Solo consulta · el cierre lo hace la oficina</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>{datos.length}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {datos.length === 0 && <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>Sin solicitudes ejecutadas en los últimos 30 días.</div>}
                {[...grupos.entries()].map(([grupo, ots]) => (
                    <div key={grupo}>
                        <div style={{ padding: '13px 18px 6px' }}><span className="versalita">{grupo}</span></div>
                        <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                            {ots.map((ot, i) => (
                                <div
                                    key={ot._id} onClick={() => setSeleccionada(ot._id)}
                                    style={{ display: 'flex', gap: 12, padding: '13px 18px', borderBottom: i === ots.length - 1 ? 'none' : '1px solid var(--linea-fina)', cursor: 'pointer' }}
                                >
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{ot.descripcion}</span>
                                        <span style={{ display: 'block', marginTop: 3, fontSize: 13, color: 'var(--texto-secundario-2)' }}>{ot.numeroOT} · {ot.solicitante}</span>
                                        <span className="mono" style={{ display: 'block', marginTop: 6, fontSize: 12.5, color: 'var(--texto-atenuado-1)' }}>cerrado {fechaCorta(ot.cerrado)} · {ot.horas} h · {ot.fotos} foto{ot.fotos !== 1 ? 's' : ''}</span>
                                    </span>
                                    <span className="mono" style={{ alignSelf: 'center', fontSize: 18, color: 'var(--deshabilitado-1)' }}>›</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                <div style={{ padding: '16px 18px 22px', fontSize: 13, lineHeight: 1.55, color: 'var(--texto-atenuado-1)' }}>
                    Abrir una muestra tareas, horas reales y las fotos del trabajo. No hay nada que editar acá.
                </div>
            </div>
        </div>
    );
}

function DetalleEjecutada({ otId, onVolver }) {
    const [ot, setOt] = useState(null);
    useEffect(() => { obtenerOT(otId).then(setOt); }, [otId]);
    if (!ot) return null;

    const fotos = [
        ...(ot.reportes || []).filter((r) => r.foto).map((r) => r.foto),
        ...(ot.tareas || []).flatMap((t) => t.registro?.fotos || []),
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={onVolver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
                <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{ot.numeroOT}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--texto-atenuado-1)' }}>Solo consulta</span>
            </header>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '16px 18px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-fina)' }}>
                    <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>{ot.descripcion}</div>
                    <div style={{ marginTop: 6, fontSize: 13.5, color: 'var(--texto-secundario-2)' }}>{ot.solicitante}</div>
                </div>

                <div style={{ padding: '15px 18px 6px' }}><span className="versalita">Tareas</span></div>
                <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                    {(ot.tareas || []).map((t, i) => (
                        <div key={t._id || i} style={{ padding: '11px 18px', borderBottom: i === ot.tareas.length - 1 ? 'none' : '1px solid var(--linea-fina)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                <span style={{ fontSize: 15, color: t.completada ? 'var(--texto-atenuado-3)' : 'var(--texto-principal)' }}>{t.descripcion}</span>
                                <span className="mono" style={{ fontSize: 13, color: 'var(--texto-atenuado-1)' }}>{t.duracion} h</span>
                            </div>
                            {t.motivoNoRealizada && <div style={{ marginTop: 3, fontSize: 13, color: 'var(--atencion)' }}>No realizada: {t.motivoNoRealizada}</div>}
                            {t.registro?.texto && <div style={{ marginTop: 3, fontSize: 13, color: 'var(--texto-secundario-2)' }}>{t.registro.texto}</div>}
                        </div>
                    ))}
                </div>

                {fotos.length > 0 && (
                    <>
                        <div style={{ padding: '15px 18px 6px' }}><span className="versalita">Fotos ({fotos.length})</span></div>
                        <div style={{ padding: '0 18px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {fotos.map((f, i) => <img key={i} src={f} alt="" style={{ width: 90, height: 68, objectFit: 'cover' }} />)}
                        </div>
                    </>
                )}
                <div style={{ height: 16 }} />
            </div>
        </div>
    );
}
