import { useEffect, useState } from 'react';
import { misInformes } from '../api.js';
import { hoyISO } from '../fecha.js';
import Cargando from './Cargando.jsx';

const fechaCorta = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });

// Informes iniciales todavía sin enviar — separado de S5_MisInformes.jsx (que ahora es solo
// enviados) a pedido explícito, mismo motivo: dos listas mezcladas en una pantalla llamada
// "Mis informes" hacía parecer que lo pendiente también contaba como "informe" ya hecho.
// Mismo endpoint que S5 (misInformes ya trae {pendientes, enviados} en una sola llamada).
export default function S7InformesPendientes({ nav }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => { misInformes().then(setDatos).catch((e) => setError(e.message)); }, []);

    const pendientes = datos?.pendientes || [];

    // La barra superior se pinta de inmediato: al pasar de una pantalla a otra debe quedar
    // una barra visible, no una pantalla en blanco mientras carga el contenido.
    const cabecera = (
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
            <button onClick={nav.volver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Informes pendientes</span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: pendientes.length > 0 ? 'var(--detenido)' : 'var(--texto-atenuado-1)' }}>{datos ? `${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''}` : ''}</span>
        </header>
    );

    if (error) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div></div>;
    if (!datos) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<Cargando /></div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {cabecera}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {pendientes.length > 0 ? (
                    pendientes.map((p) => <TarjetaPendiente key={p._id} p={p} nav={nav} />)
                ) : (
                    <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>Sin informes pendientes por ahora.</div>
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

    const borde = p.hallazgos === 0 ? 'var(--atencion)' : (p.fechaPlanificada < hoy ? 'var(--detenido)' : 'var(--atencion)');

    return (
        <div style={{ padding: '15px 18px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-fina)', borderLeft: `3px solid ${borde}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <span className="mono" style={{ fontSize: 13, color: 'var(--texto-secundario-2)' }}>{p.numeroSolicitud}</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: colorEtiqueta }}>{etiqueta}</span>
            </div>
            <div style={{ marginTop: 7, fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{p.descripcion}</div>
            <div style={{ marginTop: 4, fontSize: 13.5, color: 'var(--texto-secundario-2)' }}>{p.empresaSolicitante}</div>

            {p.hallazgos > 0 ? (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--texto-secundario-2)' }}>
                    {p.hallazgos} hallazgo{p.hallazgos !== 1 ? 's' : ''} registrado{p.hallazgos !== 1 ? 's' : ''}
                </div>
            ) : (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--texto-atenuado-3)' }}>Sin empezar.</div>
            )}

            <button
                onClick={() => nav.ir('o5', { asignacion: { _id: p._id, solicitudId: p.solicitudId } })}
                className={p.hallazgos > 0 ? 'boton-primario' : 'boton-secundario'}
                style={{ marginTop: 12, height: p.hallazgos > 0 ? 56 : 48 }}
            >
                {p.hallazgos > 0 ? 'Continuar informe' : 'Abrir informe'}
            </button>
        </div>
    );
}
