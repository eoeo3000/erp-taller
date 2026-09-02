import { useEffect, useState } from 'react';
import { solicitudesSinInforme, misInformes, ejecutadas, tomarSolicitud, miSemana, obtenerOT } from '../api.js';
import { hoyISO } from '../fecha.js';
import Cargando from './Cargando.jsx';

// Una sola puerta de entrada a las solicitudes, con filtros adentro — pedido explícito del
// usuario. Antes eran cuatro entradas separadas en S1 ("Solicitudes sin informe inicial",
// "Informes iniciales míos sin enviar", "Informes enviados este mes", "Solicitudes
// ejecutadas"), cada una con su pantalla propia (S4/S7/S5/S6): la misma solicitud aparecía
// en un acceso distinto según en qué punto del ciclo estuviera, y había que acordarse de
// cuál era cuál. Acá es siempre el mismo lugar y lo que cambia es el filtro.
// El handoff de diseño (docs/rediseno/design_handoff_pwa_supervisor) todavía describe las
// cuatro pantallas por separado — quedó como registro del diseño original, igual que cuando
// S5 se partió en dos.
const FILTROS = [
    { id: 'sin-informe', etiqueta: 'Sin informe inicial', ayuda: 'Sin supervisor todavía — puedes asignártelas. Las que ya tomó otro supervisor no aparecen acá.' },
    { id: 'asignadas', etiqueta: 'Asignadas a mí', ayuda: 'Ya son tuyas: falta completar y enviar el informe inicial.' },
    { id: 'enviados', etiqueta: 'Enviados', ayuda: 'Informes que enviaste este mes — incluye los que tienen observaciones.' },
    { id: 'observaciones', etiqueta: 'Con observaciones', ayuda: 'La oficina pide corregir el informe: hasta que no vuelva a enviarse, no puede cotizar.' },
    { id: 'ejecutadas', etiqueta: 'Ejecutadas', ayuda: 'Solo consulta · últimos 30 días. El cierre lo hace la oficina.' },
];

// El filtro que se abre por defecto es el primero de esta lista que tenga algo — no el orden
// de los chips: "con observaciones" va primero porque es lo único que deja a la oficina
// esperando por el supervisor.
const ORDEN_POR_DEFECTO = ['observaciones', 'sin-informe', 'asignadas', 'enviados', 'ejecutadas'];

const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fechaCorta = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
const fechaCortaTimestamp = (valor) => new Date(valor).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });

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

function agruparEjecutadas(ots) {
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

export default function S4Solicitudes({ nav }) {
    const [sinInforme, setSinInforme] = useState(null);
    const [informes, setInformes] = useState(null);
    const [listaEjecutadas, setListaEjecutadas] = useState(null);
    const [errores, setErrores] = useState({});
    const [filtroElegido, setFiltroElegido] = useState(null);
    const [aAsignar, setAAsignar] = useState(null);
    const [ejecutadaAbierta, setEjecutadaAbierta] = useState(null);

    // Las tres listas vienen de endpoints distintos. Antes cada una era su propia pantalla, así
    // que un endpoint caído solo rompía la suya; ahora comparten pantalla y el error tiene que
    // quedar contenido en el filtro afectado, no dejar en blanco a los otros cuatro.
    const cargarLista = (promesa, guardar, vacio, clave) => promesa
        .then((d) => { guardar(d); setErrores((prev) => ({ ...prev, [clave]: null })); })
        .catch((e) => { guardar(vacio); setErrores((prev) => ({ ...prev, [clave]: e.message })); });

    const cargarSinInforme = () => cargarLista(solicitudesSinInforme().then((d) => d.solicitudes), setSinInforme, [], 'sinInforme');
    const cargarInformes = () => cargarLista(misInformes(), setInformes, { pendientes: [], enviados: [] }, 'informes');

    useEffect(() => {
        cargarSinInforme();
        cargarInformes();
        cargarLista(ejecutadas().then((d) => d.ots), setListaEjecutadas, [], 'ejecutadas');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const errorDelFiltro = (id) => {
        if (id === 'sin-informe') return errores.sinInforme;
        if (id === 'ejecutadas') return errores.ejecutadas;
        return errores.informes;
    };

    const enviados = informes?.enviados || [];
    const pendientes = informes?.pendientes || [];
    const conObservaciones = enviados.filter((e) => e.revision?.estado === 'ConObservaciones');

    const conteos = {
        'sin-informe': sinInforme?.length || 0,
        asignadas: pendientes.length,
        enviados: enviados.length,
        observaciones: conObservaciones.length,
        ejecutadas: listaEjecutadas?.length || 0,
    };

    const cargando = !sinInforme || !informes || !listaEjecutadas;
    const filtro = filtroElegido
        || ORDEN_POR_DEFECTO.find((id) => conteos[id] > 0)
        || 'sin-informe';
    const filtroActual = FILTROS.find((f) => f.id === filtro) || FILTROS[0];

    // La barra superior se pinta de inmediato: al pasar de una pantalla a otra debe quedar
    // una barra visible, no una pantalla en blanco mientras carga el contenido.
    const cabecera = (
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
            <button onClick={nav.volver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Solicitudes</span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--texto-atenuado-1)' }}>
                {cargando ? '' : `${conteos[filtro]} ${filtroActual.etiqueta.toLowerCase()}`}
            </span>
        </header>
    );

    if (ejecutadaAbierta) {
        return <DetalleEjecutada otId={ejecutadaAbierta} onVolver={() => setEjecutadaAbierta(null)} />;
    }
    if (cargando) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<Cargando /></div>;

    const errorActual = errorDelFiltro(filtro);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {cabecera}

            {/* Fila de filtros con scroll horizontal: en un teléfono no entran los cinco a la
                vez y partirlos en dos líneas comía demasiado alto de pantalla. */}
            <div style={{ flex: 'none', display: 'flex', gap: 8, padding: '10px 14px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-fina)', overflowX: 'auto' }}>
                {FILTROS.map((f) => {
                    const activo = f.id === filtro;
                    const conteo = conteos[f.id];
                    const alerta = f.id === 'observaciones' && conteo > 0;
                    return (
                        <button
                            key={f.id}
                            onClick={() => setFiltroElegido(f.id)}
                            style={{
                                flex: 'none', minHeight: 40, padding: '0 12px', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
                                background: activo ? 'var(--accion-primaria)' : 'var(--superficie)',
                                color: activo ? 'var(--accion-primaria-texto)' : (alerta ? 'var(--detenido)' : 'var(--texto-secundario-1)'),
                                border: `1px solid ${activo ? 'var(--accion-primaria)' : (alerta ? 'var(--detenido)' : 'rgba(0,0,0,.18)')}`,
                                fontSize: 13.5, fontWeight: 600,
                            }}
                        >
                            {f.etiqueta}
                            <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, opacity: activo ? 1 : (conteo > 0 ? 1 : .45) }}>{conteo}</span>
                        </button>
                    );
                })}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '11px 18px 4px', fontSize: 13, lineHeight: 1.5, color: 'var(--texto-atenuado-1)' }}>{filtroActual.ayuda}</div>

                {errorActual && (
                    <div style={{ padding: '4px 18px 8px', fontSize: 13, lineHeight: 1.5, color: 'var(--detenido)' }}>{errorActual}</div>
                )}

                {filtro === 'sin-informe' && (
                    sinInforme.length === 0
                        ? <Vacio texto="No hay solicitudes esperando informe inicial." />
                        : sinInforme.map((s, i) => (
                            <TarjetaSinInforme key={s._id} s={s} destacada={i === 0} onTomar={() => setAAsignar(s)} />
                        ))
                )}

                {filtro === 'asignadas' && (
                    pendientes.length === 0
                        ? <Vacio texto="No tienes informes iniciales pendientes de enviar." />
                        : pendientes.map((p) => <TarjetaPendiente key={p._id} p={p} nav={nav} />)
                )}

                {(filtro === 'enviados' || filtro === 'observaciones') && (() => {
                    const lista = filtro === 'observaciones' ? conObservaciones : enviados;
                    if (lista.length === 0) {
                        return <Vacio texto={filtro === 'observaciones' ? 'Ningún informe tuyo tiene observaciones pendientes.' : 'Todavía no envías ningún informe este mes.'} />;
                    }
                    return (
                        <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                            {lista.map((e, i) => <FilaEnviado key={e._id} e={e} ultima={i === lista.length - 1} nav={nav} />)}
                        </div>
                    );
                })()}

                {filtro === 'ejecutadas' && (
                    listaEjecutadas.length === 0
                        ? <Vacio texto="Sin solicitudes ejecutadas en los últimos 30 días." />
                        : [...agruparEjecutadas(listaEjecutadas).entries()].map(([grupo, ots]) => (
                            <div key={grupo}>
                                <div style={{ padding: '13px 18px 6px' }}><span className="versalita">{grupo}</span></div>
                                <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                                    {ots.map((ot, i) => (
                                        <div
                                            key={ot._id} onClick={() => setEjecutadaAbierta(ot._id)}
                                            style={{ display: 'flex', gap: 12, padding: '13px 18px', borderBottom: i === ots.length - 1 ? 'none' : '1px solid var(--linea-fina)', cursor: 'pointer' }}
                                        >
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{ot.descripcion}</span>
                                                <span style={{ display: 'block', marginTop: 3, fontSize: 13, color: 'var(--texto-secundario-2)' }}>{ot.numeroOT} · {ot.solicitante}</span>
                                                <span className="mono" style={{ display: 'block', marginTop: 6, fontSize: 12.5, color: 'var(--texto-atenuado-1)' }}>
                                                    cerrado {fechaCortaTimestamp(ot.cerrado)} · {ot.horas} h · {ot.fotos} foto{ot.fotos !== 1 ? 's' : ''}
                                                </span>
                                            </span>
                                            <span className="mono" style={{ alignSelf: 'center', fontSize: 18, color: 'var(--deshabilitado-1)' }}>›</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                )}

                <div style={{ height: 18 }} />
            </div>

            {aAsignar && (
                <HojaAsignar
                    solicitud={aAsignar}
                    onCancelar={() => setAAsignar(null)}
                    // Tomarla la saca de "Sin informe inicial" y la mete en "Asignadas a mí" —
                    // hay que recargar las dos listas, no solo la que se está viendo.
                    onAsignada={() => { setAAsignar(null); cargarSinInforme(); cargarInformes(); }}
                />
            )}
        </div>
    );
}

function Vacio({ texto }) {
    return <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>{texto}</div>;
}

function TarjetaSinInforme({ s, destacada, onTomar }) {
    return (
        <div style={{
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
                onClick={onTomar}
                className={destacada ? 'boton-primario' : 'boton-secundario'}
                style={{ marginTop: 12, height: destacada ? 56 : 48 }}
            >
                Asignármela y agendar visita
            </button>
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

function FilaEnviado({ e, ultima, nav }) {
    const conObservaciones = e.revision?.estado === 'ConObservaciones';
    return (
        <div style={{ padding: '11px 18px', borderBottom: ultima ? 'none' : '1px solid var(--linea-fina)' }}>
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

function DetalleEjecutada({ otId, onVolver }) {
    const [ot, setOt] = useState(null);
    useEffect(() => { obtenerOT(otId).then(setOt); }, [otId]);

    const cabecera = (
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
            <button onClick={onVolver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
            <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{ot?.numeroOT || '…'}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--texto-atenuado-1)' }}>Solo consulta</span>
        </header>
    );

    if (!ot) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}</div>;

    const fotos = [
        ...(ot.reportes || []).filter((r) => r.foto).map((r) => r.foto),
        ...(ot.tareas || []).flatMap((t) => t.registro?.fotos || []),
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {cabecera}

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
