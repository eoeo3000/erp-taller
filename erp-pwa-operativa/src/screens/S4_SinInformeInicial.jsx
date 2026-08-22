import { useEffect, useState } from 'react';
import { solicitudesSinInforme, tomarSolicitud, miSemana } from '../api.js';
import Cargando from './Cargando.jsx';

const CAPACIDAD_DIARIA = 8; // mismo placeholder documentado que O6MiSemana — no hay endpoint de capacidad real.

function horasDecimal(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    return h + (Number.isNaN(m) ? 0 : m) / 60;
}

function lunesDe(iso) {
    const d = new Date(iso + 'T12:00:00');
    const dia = d.getDay();
    d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
    return d.toISOString().slice(0, 10);
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function S4SinInformeInicial({ nav }) {
    const [lista, setLista] = useState(null);
    const [error, setError] = useState('');
    const [abierta, setAbierta] = useState(null);

    const cargar = () => solicitudesSinInforme().then((d) => setLista(d.solicitudes)).catch((e) => setError(e.message));
    useEffect(() => { cargar(); }, []);

    // La barra superior se pinta de inmediato: al pasar de una pantalla a otra debe quedar
    // una barra visible, no una pantalla en blanco mientras carga el contenido.
    const cabecera = (
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
            <button onClick={nav.volver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Sin informe inicial</span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--texto-atenuado-1)' }}>{lista ? `${lista.length} sin tomar` : ''}</span>
        </header>
    );

    if (error) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div></div>;
    if (!lista) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<Cargando /></div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {cabecera}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {lista.length === 0 && <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>No hay solicitudes esperando informe inicial.</div>}
                {lista.map((s, i) => (
                    <div key={s._id} style={{
                        padding: '15px 18px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-fina)',
                        borderLeft: `3px solid ${s.diasEsperando >= 1 ? 'var(--atencion)' : 'var(--deshabilitado-1)'}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                            <span className="mono" style={{ fontSize: 13, color: 'var(--texto-secundario-2)' }}>{s.numeroSolicitud}</span>
                            <span className="mono" style={{ marginLeft: 'auto', fontSize: 12.5, color: s.diasEsperando >= 1 ? 'var(--atencion)' : 'var(--texto-atenuado-3)' }}>
                                {s.diasEsperando >= 1 ? `${s.diasEsperando} día${s.diasEsperando > 1 ? 's' : ''} esperando` : 'hoy'}
                            </span>
                        </div>
                        <div style={{ marginTop: 7, fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{s.descripcion}</div>
                        <div style={{ marginTop: 4, fontSize: 13.5, color: 'var(--texto-secundario-2)' }}>{s.empresaSolicitante}{s.direccion ? ` · ${s.direccion}` : ''}</div>
                        <button
                            onClick={() => setAbierta(s)}
                            className={i === 0 ? 'boton-primario' : 'boton-secundario'}
                            style={{ marginTop: 12, height: i === 0 ? 56 : 48 }}
                        >
                            Asignármela y agendar visita
                        </button>
                    </div>
                ))}
                <div style={{ padding: '16px 18px', fontSize: 13, lineHeight: 1.55, color: 'var(--texto-atenuado-1)' }}>
                    Las que ya tomó otro supervisor no aparecen acá.
                </div>
            </div>

            {abierta && (
                <HojaAsignar
                    solicitud={abierta}
                    onCancelar={() => setAbierta(null)}
                    onAsignada={() => { setAbierta(null); cargar(); }}
                />
            )}
        </div>
    );
}

function HojaAsignar({ solicitud, onCancelar, onAsignada }) {
    const [fecha, setFecha] = useState(hoyISO());
    const [hora, setHora] = useState('10:00');
    const [semana, setSemana] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        miSemana(lunesDe(fecha)).then(setSemana).catch(() => setSemana(null));
    }, [fecha]);

    const tareasDia = (semana?.tareasSupervisadas || []).filter((t) => t.fecha === fecha);
    const ocupadas = tareasDia.reduce((a, t) => a + (Number(t.duracion) || 0), 0);
    const libres = Math.max(0, CAPACIDAD_DIARIA - ocupadas);
    const horaNum = horasDecimal(hora);
    const choca = horaNum != null && tareasDia.some((t) => {
        const ini = horasDecimal(t.horaInicio), fin = horasDecimal(t.horaFin);
        return ini != null && fin != null && horaNum >= ini && horaNum < fin;
    });

    const confirmar = async () => {
        setEnviando(true);
        setError('');
        try {
            await tomarSolicitud(solicitud._id, { fecha, hora });
            onAsignada();
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div onClick={onCancelar} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.32)' }} />
            <div style={{ position: 'relative', background: 'var(--superficie)', borderTop: '1px solid rgba(0,0,0,.20)', boxShadow: '0 -8px 24px rgba(0,0,0,.10)' }}>
                <div style={{ padding: '14px 18px 6px' }}>
                    <span className="versalita">Asignarme {solicitud.numeroSolicitud}</span>
                    <div style={{ marginTop: 8, fontSize: 14.5, lineHeight: 1.5, color: 'var(--texto-secundario-1)' }}>Queda a tu nombre al confirmar. La visita entra en tu semana.</div>
                </div>
                <div style={{ padding: '12px 18px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label>
                        <div style={{ fontSize: 12.5, color: 'var(--texto-secundario-2)' }}>Día</div>
                        <input
                            type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                            className="mono"
                            style={{ marginTop: 5, height: 52, width: '100%', padding: '0 12px', border: '1px solid rgba(0,0,0,.22)', borderRadius: 'var(--radio)', fontSize: 16, background: '#fff' }}
                        />
                    </label>
                    <label>
                        <div style={{ fontSize: 12.5, color: 'var(--texto-secundario-2)' }}>Hora</div>
                        <input
                            type="time" value={hora} onChange={(e) => setHora(e.target.value)}
                            className="mono"
                            style={{ marginTop: 5, height: 52, width: '100%', padding: '0 12px', border: '1px solid rgba(0,0,0,.22)', borderRadius: 'var(--radio)', fontSize: 16, background: '#fff' }}
                        />
                    </label>
                </div>
                <div style={{ margin: '11px 18px 0', padding: '11px 13px', background: 'var(--franja)', fontSize: 13, lineHeight: 1.5, color: 'var(--texto-secundario-1)' }}>
                    Ese día tienes {libres} h libres. {choca ? 'Choca con algo tuyo a esa hora.' : 'No choca con nada tuyo.'}
                </div>
                {error && <div style={{ margin: '10px 18px 0', fontSize: 13, color: 'var(--detenido)', fontWeight: 600 }}>{error}</div>}
                <div style={{ padding: '12px 18px 20px' }}>
                    <button className="boton-primario" disabled={enviando} onClick={confirmar}>{enviando ? 'Asignando…' : 'Confirmar y asignarme'}</button>
                    <button
                        onClick={onCancelar}
                        style={{ marginTop: 8, height: 48, width: '100%', background: 'none', border: 'none', fontSize: 15, fontWeight: 600, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
}
