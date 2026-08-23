import { useEffect, useState } from 'react';
import { misInformes } from '../api.js';
import Cargando from './Cargando.jsx';

const fechaCorta = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });

// Solo informes ENVIADOS (a pedido explícito: esta pantalla mostraba pendientes arriba y
// enviados abajo, y "Mis informes" debe ser únicamente lo ya enviado). Los pendientes tienen
// su propia pantalla, S7_InformesPendientes.jsx — mismo endpoint (misInformes ya trae ambas
// listas en una sola llamada), cada pantalla usa solo la mitad que le corresponde.
export default function S5MisInformes({ nav }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => { misInformes().then(setDatos).catch((e) => setError(e.message)); }, []);

    const enviados = datos?.enviados || [];

    // La barra superior se pinta de inmediato: al pasar de una pantalla a otra debe quedar
    // una barra visible, no una pantalla en blanco mientras carga el contenido.
    const cabecera = (
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
            <button onClick={nav.volver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Informes enviados</span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--texto-atenuado-1)' }}>{datos ? `${enviados.length} este mes` : ''}</span>
        </header>
    );

    if (error) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div></div>;
    if (!datos) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<Cargando /></div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {cabecera}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {enviados.length > 0 ? (
                    <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                        {enviados.map((e, i) => {
                            const conObservaciones = e.revision?.estado === 'ConObservaciones';
                            return (
                                <div key={e._id} style={{ padding: '11px 18px', borderBottom: i === enviados.length - 1 ? 'none' : '1px solid var(--linea-fina)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56 }}>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 15 }}>{e.descripcion}</span>
                                            <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: 'var(--texto-atenuado-1)' }}>
                                                {e.numeroSolicitud} · enviado {fechaCorta(e.fechaEnvio.slice(0, 10))}{e.numeroOT ? ` · ya es ${e.numeroOT}` : ''}
                                            </span>
                                        </span>
                                        <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: conObservaciones ? 'var(--detenido)' : e.desenlace === 'Cotizada' ? 'var(--listo)' : 'var(--texto-atenuado-1)' }}>
                                            {conObservaciones ? 'Tiene observaciones' : e.desenlace}
                                        </span>
                                    </div>
                                    {conObservaciones && (
                                        <div style={{ marginTop: 8 }}>
                                            {e.revision?.comentario && (
                                                <div style={{ fontSize: 13, color: 'var(--texto-secundario-2)', marginBottom: 8 }}>{e.revision.comentario}</div>
                                            )}
                                            <button
                                                onClick={() => nav.ir('o5', { asignacion: { _id: e._id, solicitudId: e.solicitudId } })}
                                                className="boton-primario"
                                                style={{ height: 48 }}
                                            >Corregir informe</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>Todavía no envías ningún informe este mes.</div>
                )}

                <div style={{ height: 18 }} />
            </div>
        </div>
    );
}
