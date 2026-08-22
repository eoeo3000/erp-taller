import { useEffect, useState } from 'react';
import { misInformes } from '../api.js';

const fechaCorta = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function S5MisInformes({ nav }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => { misInformes().then(setDatos).catch((e) => setError(e.message)); }, []);

    if (error) return <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div>;
    if (!datos) return null;

    const pendientes = datos.pendientes || [];
    const enviados = datos.enviados || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
                <span style={{ fontSize: 17, fontWeight: 700 }}>Mis informes</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: pendientes.length > 0 ? 'var(--detenido)' : 'var(--texto-atenuado-1)' }}>{pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}</span>
            </header>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {pendientes.map((p) => (
                    <TarjetaPendiente key={p._id} p={p} nav={nav} />
                ))}

                {enviados.length > 0 && (
                    <>
                        <div style={{ padding: '15px 18px 6px' }}><span className="versalita">Enviados este mes</span></div>
                        <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                            {enviados.map((e, i) => (
                                <div key={e._id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '11px 18px', borderBottom: i === enviados.length - 1 ? 'none' : '1px solid var(--linea-fina)' }}>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 15 }}>{e.descripcion}</span>
                                        <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: 'var(--texto-atenuado-1)' }}>
                                            {e.numeroSolicitud} · enviado {fechaCorta(e.fechaEnvio.slice(0, 10))}{e.numeroOT ? ` · ya es ${e.numeroOT}` : ''}
                                        </span>
                                    </span>
                                    <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: e.desenlace === 'Cotizada' ? 'var(--listo)' : 'var(--texto-atenuado-1)' }}>{e.desenlace}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {pendientes.length === 0 && enviados.length === 0 && (
                    <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>Sin informes de evaluación por ahora.</div>
                )}

                <div style={{ height: 18 }} />
            </div>
        </div>
    );
}

function TarjetaPendiente({ p, nav }) {
    const hoy = hoyISO();
    let etiqueta, colorEtiqueta;
    if (!p.fechaPlanificada) { etiqueta = 'sin fecha de visita'; colorEtiqueta = 'var(--texto-atenuado-1)'; }
    else if (p.fechaPlanificada < hoy) { etiqueta = `visitado hace ${p.diasDesdeVisita} día${p.diasDesdeVisita !== 1 ? 's' : ''}`; colorEtiqueta = 'var(--detenido)'; }
    else if (p.fechaPlanificada === hoy) { etiqueta = `visita hoy ${p.horaPlanificada || ''}`.trim(); colorEtiqueta = 'var(--en-curso)'; }
    else { etiqueta = `visita ${fechaCorta(p.fechaPlanificada)} ${p.horaPlanificada || ''}`.trim(); colorEtiqueta = 'var(--texto-atenuado-1)'; }

    const borde = p.pasos === 0 ? 'var(--atencion)' : (p.fechaPlanificada < hoy ? 'var(--detenido)' : 'var(--atencion)');

    return (
        <div style={{ padding: '15px 18px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-fina)', borderLeft: `3px solid ${borde}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <span className="mono" style={{ fontSize: 13, color: 'var(--texto-secundario-2)' }}>{p.numeroSolicitud}</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: colorEtiqueta }}>{etiqueta}</span>
            </div>
            <div style={{ marginTop: 7, fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{p.descripcion}</div>
            <div style={{ marginTop: 4, fontSize: 13.5, color: 'var(--texto-secundario-2)' }}>{p.empresaSolicitante}</div>

            {p.pasos > 0 ? (
                <>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ flex: 1, height: 6, background: 'var(--encabezado-tabla)' }}>
                            <span style={{ display: 'block', width: `${(p.pasos / 4) * 100}%`, height: 6, background: 'var(--atencion)' }} />
                        </span>
                        <span className="mono" style={{ fontSize: 12.5, color: 'var(--texto-secundario-2)' }}>{p.pasos} de 4 pasos</span>
                    </div>
                    {p.pasos < 4 && <div style={{ marginTop: 7, fontSize: 13, color: 'var(--texto-atenuado-3)' }}>Faltan {4 - p.pasos} pasos. La oficina no puede cotizar sin esto.</div>}
                </>
            ) : (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--texto-atenuado-3)' }}>Sin empezar. Se puede prellenar antes de salir a terreno.</div>
            )}

            <button
                onClick={() => nav.ir('o5', { asignacion: { _id: p._id, solicitudId: p.solicitudId } })}
                className={p.pasos > 0 ? 'boton-primario' : 'boton-secundario'}
                style={{ marginTop: 12, height: p.pasos > 0 ? 56 : 48 }}
            >
                {p.pasos > 0 ? 'Continuar informe' : 'Abrir informe'}
            </button>
        </div>
    );
}
