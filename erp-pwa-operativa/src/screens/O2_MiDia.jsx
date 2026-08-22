import { useEffect, useState } from 'react';
import { miDia, obtenerOT } from '../api.js';
import { listarCola } from '../db.js';
import TabsSupervisor from './TabsSupervisor.jsx';

const fechaMono = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });

const COLOR_ESTADO = {
    'Programada': 'var(--en-curso)',
    'En Ejecución': 'var(--atencion)',
    'Trabajo Terminado': 'var(--listo)',
    'Con Informe': 'var(--listo)',
};

async function cargarTarjetas(asignaciones) {
    return Promise.all(asignaciones.map(async (a) => {
        const ot = a.otId ? await obtenerOT(a.otId).catch(() => null) : null;
        return { asignacion: a, ot };
    }));
}

export default function O2MiDia({ nav, persona }) {
    const [datos, setDatos] = useState(null);
    const [tarjetas, setTarjetas] = useState([]);
    const [sinEnviar, setSinEnviar] = useState(0);
    const [error, setError] = useState('');

    useEffect(() => {
        miDia().then(async (d) => {
            setDatos(d);
            setTarjetas(await cargarTarjetas(d.asignaciones));
        }).catch((e) => setError(e.message));
        listarCola().then((c) => setSinEnviar(c.length));
    }, []);

    if (error) return <Mensaje texto={error} />;
    if (!datos) return null;

    const horasPlanificadas = tarjetas.reduce((acc, { asignacion, ot }) => {
        const t = (ot?.tareas || []).find((tt) => tt.fecha === datos.fecha);
        return acc + (t ? Number(t.duracion) || 0 : 0);
    }, 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {/* La pantalla en sí queda igual que en el handoff anterior (README §1: "sin
                cambios"); esta fila de pestañas se agrega solo para que un supervisor pueda
                volver a Mi panel — un ejecutor nunca tiene persona.rol === 'supervisor'. */}
            {persona?.rol === 'supervisor' && (
                <div style={{ padding: '10px 16px 0', background: 'var(--superficie)' }}>
                    <TabsSupervisor activa="o2" nav={nav} />
                </div>
            )}
            <header style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <div>
                    <div style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 700 }}>Mi día</div>
                    <div className="mono" style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-1)' }}>{fechaMono(datos.fecha)}</div>
                </div>
                <button onClick={() => nav.ir('o6')} style={{ background: 'none', border: 'none', color: 'var(--en-curso)', fontSize: 'var(--fs-secundario)', fontWeight: 600, cursor: 'pointer' }}>
                    Mi semana ›
                </button>
            </header>

            <div className="franja" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                    <span className="mono" style={{ fontSize: 'var(--fs-cifra)', fontWeight: 600 }}>{datos.asignaciones.length}</span>
                    <span style={{ fontSize: 'var(--fs-secundario)', marginLeft: 6, color: 'var(--texto-secundario-2)' }}>asignaciones · {horasPlanificadas} h</span>
                </div>
                {sinEnviar > 0 && (
                    <span className="mono" style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--atencion)', fontWeight: 600 }}>
                        {sinEnviar} en cola
                    </span>
                )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {tarjetas.length === 0 && <Mensaje texto="Sin asignaciones para hoy." />}
                {tarjetas.map(({ asignacion, ot }) => (
                    <TarjetaAsignacion key={asignacion._id} asignacion={asignacion} ot={ot} nav={nav} />
                ))}
            </div>

            <div style={{ padding: '14px 16px', fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-2)' }}>
                Después de las 16:00 no hay más asignaciones. La programación la hace la oficina.
            </div>
        </div>
    );
}

function TarjetaAsignacion({ asignacion, ot, nav }) {
    const tareaHoy = (ot?.tareas || []).find((t) => t.fecha === asignacion.fechaPlanificada);
    const color = (ot && COLOR_ESTADO[ot.estado]) || 'var(--deshabilitado-1)';

    let boton = null;
    if (asignacion.tipo === 'evaluacion') {
        boton = <button className="boton-secundario" onClick={() => nav.ir('o5', { asignacion })}>Levantar informe</button>;
    } else if (ot?.estado === 'En Ejecución') {
        boton = (
            <div style={{ display: 'flex', gap: 8 }}>
                <button className="boton-secundario" style={{ flex: 1 }} onClick={() => nav.ir('o3', { asignacion })}>Continuar</button>
                <button className="boton-secundario" style={{ flex: 1 }} onClick={() => nav.ir('o4', { asignacion, modo: 'reporte' })}>Reportar</button>
            </div>
        );
    } else if (ot?.estado === 'Programada') {
        boton = <button className="boton-secundario" onClick={() => nav.ir('o3', { asignacion })}>Iniciar trabajo</button>;
    }

    return (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--linea-fina)' }}>
            <div className="barra-estado" style={{ background: color }} />
            <div style={{ flex: 1, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="mono" style={{ fontSize: 'var(--fs-linea-mono)' }}>{ot?.numeroOT || '—'}</span>
                    <span className="versalita">{ot?.estado || asignacion.tipo}</span>
                    {tareaHoy?.hora && <span className="mono" style={{ fontSize: 'var(--fs-linea-mono)' }}>{tareaHoy.hora}</span>}
                </div>
                <div style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600, marginTop: 4 }}>{ot?.descripcion || 'Visita de evaluación'}</div>
                <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)', marginTop: 2 }}>{ot?.solicitante || ''}</div>
                {tareaHoy && (
                    <div style={{ fontSize: 'var(--fs-secundario)', marginTop: 6 }}>
                        {tareaHoy.descripcion} <span className="mono" style={{ color: 'var(--texto-atenuado-1)' }}>· {tareaHoy.duracion} h</span>
                    </div>
                )}
                {boton && <div style={{ marginTop: 10 }}>{boton}</div>}
            </div>
        </div>
    );
}

function Mensaje({ texto }) {
    return <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>{texto}</div>;
}
