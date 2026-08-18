import { useEffect, useState } from 'react';
import { miSemana, obtenerOT } from '../api.js';

// No hay endpoint que exponga la capacidad diaria real de una persona (vendría de
// Recurso.calendarioId + Calendario, hoy solo calculado en erp-web/src/App.jsx sobre
// /api/data completo — no algo que esta PWA deba consumir, por diseño: cada persona ve
// solo lo suyo). Placeholder documentado, a definir con la oficina.
const CAPACIDAD_DIARIA = 8;

const NOMBRE_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function O6MiSemana({ nav }) {
    const [datos, setDatos] = useState(null);
    const [horasPorDia, setHorasPorDia] = useState({});
    const [error, setError] = useState('');

    useEffect(() => {
        miSemana().then(async (d) => {
            setDatos(d);
            const otsCache = {};
            const horas = {};
            for (const dia of d.dias) horas[dia] = 0;
            for (const a of d.asignaciones) {
                if (!a.otId) continue;
                if (!otsCache[a.otId]) otsCache[a.otId] = await obtenerOT(a.otId).catch(() => null);
                const ot = otsCache[a.otId];
                const t = (ot?.tareas || []).find((tt) => tt.fecha === a.fechaPlanificada);
                if (t) horas[a.fechaPlanificada] = (horas[a.fechaPlanificada] || 0) + (Number(t.duracion) || 0);
            }
            setHorasPorDia(horas);
        }).catch((e) => setError(e.message));
    }, []);

    if (error) return <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div>;
    if (!datos) return null;

    const totalHoras = Object.values(horasPorDia).reduce((a, b) => a + b, 0);
    const capacidadSemana = CAPACIDAD_DIARIA * 5;
    const pct = capacidadSemana ? Math.round((totalHoras / capacidadSemana) * 100) : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }} className="mono">‹</button>
                <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Mi semana</span>
            </header>

            <div className="franja">
                <span className="mono" style={{ fontSize: 'var(--fs-cifra)', fontWeight: 600 }}>{totalHoras} / {capacidadSemana} h</span>
                <span style={{ fontSize: 'var(--fs-secundario)', marginLeft: 8, color: 'var(--texto-secundario-2)' }}>· {pct} % de capacidad</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {datos.dias.map((dia) => {
                    const fecha = new Date(dia + 'T12:00:00');
                    const esHoy = dia === hoyISO();
                    const esSabado = fecha.getDay() === 6;
                    const horas = horasPorDia[dia] || 0;
                    const sobrecargado = horas > CAPACIDAD_DIARIA;
                    const asignacionesDia = datos.asignaciones.filter((a) => a.fechaPlanificada === dia);

                    return (
                        <div key={dia} style={{
                            display: 'flex', minHeight: 64, borderBottom: '1px solid var(--linea-fina)',
                            background: esSabado ? 'var(--fondo-pantalla)' : 'var(--superficie)',
                            borderLeft: esHoy ? '3px solid var(--texto-principal)' : '3px solid transparent',
                        }}>
                            <div className="mono" style={{ width: 52, flex: 'none', padding: '10px 0 0 10px', fontSize: 'var(--fs-linea-mono)' }}>
                                {NOMBRE_DIA[fecha.getDay()]}<br />{horas > 0 ? `${horas} h` : '—'}
                            </div>
                            <div style={{ flex: 1, padding: '10px 12px', color: sobrecargado ? 'var(--detenido)' : 'var(--texto-principal)' }}>
                                <div style={{ fontSize: 'var(--fs-secundario)' }}>
                                    {asignacionesDia.length > 0 ? `${asignacionesDia.length} asignación(es)` : 'Sin asignaciones'}
                                </div>
                                {sobrecargado && (
                                    <div style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--detenido)' }}>
                                        Sobre mi capacidad de {CAPACIDAD_DIARIA} h · Avisar a la oficina
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div style={{ padding: '14px 16px', fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-2)' }}>
                La semana la arma la oficina. Aquí solo se consulta y se avisa.
            </div>
        </div>
    );
}
