import { useEffect, useState } from 'react';
import { obtenerOT, actualizarOT, accionOT, miSemana, subirFoto } from '../api.js';
import { detectarCruces } from '../cruces.js';
import { hoyISO } from '../fecha.js';
import { confirmar, avisar } from '../confirmar.js';
import Cargando from './Cargando.jsx';

const COLOR_ESTADO = { 'En Ejecución': 'var(--en-curso)', 'Trabajo Terminado': 'var(--listo)', 'Con Informe': 'var(--listo)', 'Pagada': 'var(--listo)', 'Reprogramar': 'var(--atencion)' };
const NOMBRE_DIA = { 1: 'LUN', 2: 'MAR', 3: 'MIÉ', 4: 'JUE', 5: 'VIE', 6: 'SÁB', 0: 'DOM' };

function horasDecimal(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    return h + (Number.isNaN(m) ? 0 : m) / 60;
}

function diasEntre(desdeISO, hastaISO) {
    const dias = [];
    const d = new Date(desdeISO + 'T12:00:00');
    const fin = new Date(hastaISO + 'T12:00:00');
    while (d <= fin) { dias.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
    return dias;
}

export default function S3Trabajo({ nav, asignacion, persona }) {
    const otId = asignacion?.otId;
    const [ot, setOt] = useState(null);
    const [semana, setSemana] = useState(null);
    const [borradores, setBorradores] = useState({});
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [motivoAbierto, setMotivoAbierto] = useState(null);
    const [motivoTexto, setMotivoTexto] = useState('');
    const [verInforme, setVerInforme] = useState(false);

    // Reprogramar / Replanificar — a nivel de OT completa, no por tarea (ver motivoAbierto
    // arriba, que es lo mismo pero por tarea individual). Solo esta pantalla (supervisor);
    // O2_MiDia/O3_TrabajoEnCurso (ejecutor) no lo tienen.
    const [accionEstado, setAccionEstado] = useState(null); // null | 'reprogramar' | 'replanificar'
    const [motivoEstado, setMotivoEstado] = useState('');
    const [fotoEstado, setFotoEstado] = useState('');
    const [subiendoFotoEstado, setSubiendoFotoEstado] = useState(false);
    const [enviandoEstado, setEnviandoEstado] = useState(false);
    const [errorEstado, setErrorEstado] = useState('');

    const cargar = () => obtenerOT(otId).then(setOt).catch((e) => setError(e.message));

    useEffect(() => {
        if (!otId) return;
        cargar();
        // Para detectar cruces con OT de OTRAS personas supervisadas (misma fuente que S2) —
        // solo cubre la semana en curso, igual que S2 (README §4: cálculo en el cliente).
        miSemana().then(setSemana).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otId]);

    // La barra superior se pinta de inmediato, sin esperar a que cargue la OT — al pasar de
    // una pantalla a otra debe quedar una barra visible, no una pantalla en blanco.
    const cabecera = (
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
            <button onClick={nav.volver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
            <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{ot?.numeroOT || '…'}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: ot ? (COLOR_ESTADO[ot.estado] || 'var(--texto-atenuado-1)') : 'var(--texto-atenuado-1)' }}>{ot?.estado || ''}</span>
        </header>
    );

    if (!otId) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                {cabecera}
                <div style={{ padding: 24 }}><p style={{ fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>Esta pantalla necesita una OT asociada.</p></div>
            </div>
        );
    }
    if (error) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                {cabecera}
                <div style={{ padding: 24 }}><p style={{ fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</p></div>
            </div>
        );
    }
    if (!ot) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                {cabecera}
                <Cargando />
            </div>
        );
    }

    if (verInforme) return <VistaInforme ot={ot} onVolver={() => setVerInforme(false)} />;

    // La OT quedó marcada "Reprogramar" — solo se puede ver, no editar, hasta que la oficina
    // le asigne una fecha nueva y vuelva a 'Programada' (TratamientoScreen.jsx, guardarPlanificacion).
    const bloqueada = ot.estado === 'Reprogramar';
    // "Trabajo finalizado" ya no debería seguir editable — a menos que se reabra (más abajo).
    // Antes de esto, la pantalla se quedaba igual de editable después de terminar la OT que
    // antes: se podía seguir tocando "Guardar lo ingresado"/casillas aunque ya estuviera
    // cerrada, sin ninguna pista de que el trabajo ya se dio por terminado.
    const terminada = ot.estado === 'Trabajo Terminado';
    const soloLectura = bloqueada || terminada;

    const tareas = ot.tareas || [];
    const resueltas = tareas.filter((t) => t.completada || t.motivoNoRealizada).length;
    const horasHechas = tareas.filter((t) => t.completada).reduce((a, t) => a + (Number(t.duracion) || 0), 0);
    const horasTotal = tareas.reduce((a, t) => a + (Number(t.duracion) || 0), 0);
    const fechas = [...new Set(tareas.map((t) => t.fecha).filter(Boolean))].sort();
    const dias = fechas.length ? diasEntre(fechas[0], fechas[fechas.length - 1]) : [];
    const totalUnidades = Math.max(dias.length, 1) * 10;
    const cruces = semana ? detectarCruces(semana.tareasSupervisadas || []) : [];
    const faltan = tareas.length - resueltas;
    const puedeTerminar = tareas.length > 0 && faltan === 0;
    const hoy = hoyISO();

    const guardarTarea = async (idx, cambios) => {
        if (soloLectura) return;
        const nuevasTareas = tareas.map((t, i) => (i === idx ? { ...t, ...cambios } : t));
        setGuardando(true);
        try { await actualizarOT(otId, { tareas: nuevasTareas }); await cargar(); } finally { setGuardando(false); }
    };

    // Toggle, no solo marcar: un supervisor que se equivoca al tocar la casilla debe poder
    // dejarla como estaba, no quedar atrapado en "realizada" para siempre.
    const toggleRealizada = (idx) => {
        const t = tareas[idx];
        if (t.completada) return guardarTarea(idx, { completada: false });
        if (t.motivoNoRealizada) return guardarTarea(idx, { motivoNoRealizada: '' });
        return guardarTarea(idx, { completada: true, motivoNoRealizada: '' });
    };

    const confirmarNoRealizada = async (idx) => {
        if (!motivoTexto.trim()) return;
        await guardarTarea(idx, { motivoNoRealizada: motivoTexto.trim(), completada: false });
        setMotivoAbierto(null); setMotivoTexto('');
    };

    const actualizarBorrador = (idx, campo, valor) => setBorradores((b) => ({ ...b, [idx]: { texto: '', fotos: [], ...b[idx], [campo]: valor } }));

    const agregarFotoBorrador = async (idx, archivo) => {
        try {
            const url = await subirFoto(archivo);
            setBorradores((b) => {
                const previo = b[idx] || { texto: '', fotos: [] };
                return { ...b, [idx]: { ...previo, fotos: [...previo.fotos, url] } };
            });
        } catch {
            avisar.error('No se pudo subir la foto — revisa la señal e intenta de nuevo.');
        }
    };

    const guardarLoIngresado = async () => {
        if (soloLectura) return;
        const conBorrador = Object.keys(borradores).filter((idx) => borradores[idx].texto?.trim() || borradores[idx].fotos?.length);
        if (conBorrador.length === 0) return;
        const ahora = new Date();
        const horaTexto = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
        const nuevasTareas = tareas.map((t, i) => {
            const b = borradores[i];
            if (!b || !(b.texto?.trim() || b.fotos?.length)) return t;
            return { ...t, registro: { texto: b.texto?.trim() || '', fotos: b.fotos || [], hora: horaTexto, autor: persona?.nombre || '' } };
        });
        setGuardando(true);
        try { await actualizarOT(otId, { tareas: nuevasTareas }); setBorradores({}); await cargar(); } finally { setGuardando(false); }
    };

    // Antes 'En Ejecución' solo se activaba solo al abrir O3 (la pantalla del ejecutor,
    // ver claveInicio en ese archivo) — si el supervisor gestiona la OT desde acá sin pasar
    // por O3 (por ejemplo, coordina el equipo pero no abre esa pantalla él mismo), la OT
    // podía quedar en 'Programada' aunque el trabajo ya hubiera arrancado en terreno. Sin
    // ese cambio de estado, ni el cliente (C3_EstadoTrabajo, erp-pwa-cliente) ni el
    // Planificador (Panel de control, escritorio) se enteraban de que ya empezó.
    const iniciarTrabajo = async () => {
        if (soloLectura) return;
        if (!(await confirmar('¿Marcar el trabajo como iniciado? El cliente y la oficina lo van a ver en ejecución.', { danger: false, textoConfirmar: 'Marcar en ejecución' }))) return;
        setGuardando(true);
        try { await accionOT(otId, { accion: 'iniciar' }); await cargar(); } finally { setGuardando(false); }
    };

    const terminarTrabajo = async () => {
        if (soloLectura) return;
        if (!(await confirmar('¿Marcar el trabajo como finalizado? Queda lista para que la oficina facture.', { danger: false, textoConfirmar: 'Marcar finalizado' }))) return;
        setGuardando(true);
        try { await accionOT(otId, { accion: 'terminar' }); await cargar(); } finally { setGuardando(false); }
    };

    const agregarFotoEstado = async (archivo) => {
        setSubiendoFotoEstado(true);
        try { setFotoEstado(await subirFoto(archivo)); }
        catch { avisar.error('No se pudo subir la foto — revisa la señal e intenta de nuevo.'); }
        finally { setSubiendoFotoEstado(false); }
    };

    const cancelarAccionEstado = () => { setAccionEstado(null); setMotivoEstado(''); setFotoEstado(''); setErrorEstado(''); };

    const confirmarAccionEstado = async () => {
        if (!motivoEstado.trim()) return;
        setEnviandoEstado(true); setErrorEstado('');
        try {
            await accionOT(otId, { accion: accionEstado, motivo: motivoEstado.trim(), foto: fotoEstado });
            // Reprogramar detiene la OT hasta que la oficina le asigne fecha nueva — no hay más
            // nada que hacer acá, se vuelve a "Mi semana" para que el supervisor vea de una que
            // quedó marcada (S2 ya la destaca en rojo, ver S2_MiSemanaSupervisor.jsx). Replanificar
            // en cambio sigue en curso, así que se queda en la pantalla como con cualquier otra acción.
            if (accionEstado === 'reprogramar') { nav.volver(); return; }
            cancelarAccionEstado();
            await cargar();
        } catch (e) {
            setErrorEstado(e.message);
        } finally {
            setEnviandoEstado(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {cabecera}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* El informe de evaluación es previo/independiente del ciclo de ejecución (no
                    bloquea tareas ni Guardar/Terminar — ver OT.js, informeEvaluacion.revision),
                    pero antes solo se veía en la lista de informes aparte (hoy S4_Solicitudes,
                    filtro "Con observaciones") — la propia OT no
                    daba ninguna pista de que la oficina lo rechazó. Se muestra acá arriba de
                    todo, apenas se entra a la OT. */}
                {ot.informeEvaluacion?.revision?.estado === 'ConObservaciones' && (
                    <div style={{ padding: '12px 18px', background: 'oklch(0.52 0.13 25 / .08)', borderLeft: '3px solid var(--detenido)' }}>
                        <div className="versalita" style={{ color: 'var(--detenido)' }}>Informe pendiente de corrección</div>
                        {ot.informeEvaluacion.revision.comentario && (
                            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--texto-secundario-2)' }}>{ot.informeEvaluacion.revision.comentario}</div>
                        )}
                        <button
                            className="boton-primario" style={{ width: 'auto', minHeight: 40, padding: '0 14px', fontSize: 13, marginTop: 10 }}
                            onClick={() => nav.ir('o5', { asignacion: { otId } })}
                        >Corregir informe</button>
                    </div>
                )}

                <div style={{ padding: '16px 18px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-fina)' }}>
                    <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>{ot.descripcion}</div>
                    <div style={{ marginTop: 6, fontSize: 13.5, color: 'var(--texto-secundario-2)' }}>{ot.solicitante}</div>
                    {ot.instruccionesTerreno && <div style={{ marginTop: 3, fontSize: 13.5, color: 'var(--texto-atenuado-3)' }}>{ot.instruccionesTerreno}</div>}
                </div>

                <div className="franja" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div>
                        <div className="versalita">Avance</div>
                        <div className="mono" style={{ marginTop: 4, fontSize: 17, fontWeight: 600 }}>{resueltas} de {tareas.length} tareas</div>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div className="versalita">Horas</div>
                        <div className="mono" style={{ marginTop: 4, fontSize: 17, fontWeight: 600 }}>{horasHechas} / {horasTotal} h</div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 6px' }}>
                    <span className="versalita">Tareas de la OT</span>
                    <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--texto-secundario-2)' }}>{dias.length} día{dias.length !== 1 ? 's' : ''} · {tareas.length} tarea{tareas.length !== 1 ? 's' : ''} · {horasTotal} h</span>
                </div>

                <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                    {dias.length > 0 && (
                        <div style={{ display: 'flex', padding: '0 18px 0 60px', borderBottom: '1px solid var(--linea-fina)' }}>
                            {dias.map((d) => (
                                <div key={d} style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '5px 0 6px', background: d === hoy ? '#f2f1ec' : 'none' }}>
                                    <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: d === hoy ? 'var(--texto-principal)' : 'var(--texto-atenuado-3)' }}>
                                        {NOMBRE_DIA[new Date(d + 'T12:00:00').getDay()]} {Number(d.slice(-2))}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    {tareas.map((t, idx) => (
                        <FilaTarea
                            key={t._id || idx} t={t} idx={idx} dias={dias} totalUnidades={totalUnidades} hoy={hoy}
                            otEnEjecucion={ot.estado === 'En Ejecución'}
                            cruce={cruces.find((c) => c.a.tareaId === String(t._id) || c.b.tareaId === String(t._id))}
                            borrador={borradores[idx]}
                            motivoAbierto={motivoAbierto === idx}
                            motivoTexto={motivoTexto}
                            guardando={guardando}
                            bloqueada={soloLectura}
                            onMarcarRealizada={() => toggleRealizada(idx)}
                            onAbrirMotivo={() => { setMotivoAbierto(idx); setMotivoTexto(''); }}
                            onCancelarMotivo={() => setMotivoAbierto(null)}
                            onCambiarMotivoTexto={setMotivoTexto}
                            onConfirmarMotivo={() => confirmarNoRealizada(idx)}
                            onCambiarTexto={(v) => actualizarBorrador(idx, 'texto', v)}
                            onAgregarFoto={(archivo) => agregarFotoBorrador(idx, archivo)}
                        />
                    ))}
                </div>

                {/* Se movió acá abajo (antes iba arriba, entre Avance y Tareas) — pedido
                    explícito del usuario: primero ver el plan completo de la OT, recién
                    después decidir si arrancar, reprogramar o replanificar. */}
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--linea-fina)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="versalita">Estado de la OT</span>
                        {ot.subEstado === 'Replanificar' && (
                            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--atencion)', textTransform: 'uppercase' }}>· Replanificar pendiente</span>
                        )}
                    </div>
                    {bloqueada ? (
                        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--detenido)' }}>
                            Esta OT quedó marcada para reprogramar — solo se puede ver hasta que la oficina le asigne una fecha nueva.
                        </div>
                    ) : terminada && accionEstado === null ? (
                        // Motivos para reabrir: falta agregar una foto/comentario a alguna tarea, o
                        // "Trabajo finalizado" se apretó por error — pedido explícito del usuario.
                        <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 12.5, color: 'var(--texto-secundario-2)', marginBottom: 8 }}>
                                Este trabajo ya se marcó como terminado. Si falta una foto o un comentario, o se cerró por error, podés reabrirlo.
                            </div>
                            <button className="boton-secundario" style={{ width: 'auto', minHeight: 40, padding: '0 14px', fontSize: 13 }} onClick={() => setAccionEstado('reabrir')}>Reabrir OT</button>
                        </div>
                    ) : !terminada && ot.estado === 'Programada' && accionEstado === null && (
                        <button
                            className="boton-primario" style={{ width: 'auto', minHeight: 40, padding: '0 14px', fontSize: 13, marginTop: 8, background: 'var(--en-curso)', borderColor: 'var(--en-curso)' }}
                            disabled={guardando} onClick={iniciarTrabajo}
                        >Marcar trabajo en ejecución</button>
                    )}
                    {!bloqueada && !terminada && accionEstado === null && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="boton-secundario" style={{ width: 'auto', minHeight: 40, padding: '0 12px', fontSize: 13 }} onClick={() => setAccionEstado('reprogramar')}>Reprogramar</button>
                            <button className="boton-secundario" style={{ width: 'auto', minHeight: 40, padding: '0 12px', fontSize: 13 }} onClick={() => setAccionEstado('replanificar')}>Replanificar</button>
                        </div>
                    )}
                    {!bloqueada && accionEstado !== null && (
                        <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 12.5, color: 'var(--texto-secundario-2)', marginBottom: 6 }}>
                                {accionEstado === 'reprogramar'
                                    ? 'La OT necesita una fecha nueva — la oficina la reprograma desde el Gantt.'
                                    : accionEstado === 'replanificar'
                                    ? 'La OT necesita más horas o materiales de lo cotizado — se avisa a la oficina para que prepare la extensión de la cotización.'
                                    : 'Se vuelve a dejar "En Ejecución" para poder corregir o completar lo que falte.'}
                            </div>
                            {errorEstado && <div style={{ fontSize: 12.5, color: 'var(--detenido)', marginBottom: 6 }}>{errorEstado}</div>}
                            <input
                                value={motivoEstado} onChange={(e) => setMotivoEstado(e.target.value)}
                                placeholder="Motivo (obligatorio)"
                                style={{ width: '100%', height: 40, padding: '0 10px', background: '#fff', border: '1px solid rgba(0,0,0,.20)', borderRadius: 'var(--radio)', fontSize: 14, boxSizing: 'border-box' }}
                            />
                            {accionEstado === 'replanificar' && (
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, height: 36, padding: '0 12px', background: '#fff', border: '1px solid rgba(0,0,0,.20)', borderRadius: 'var(--radio)', fontSize: 13, cursor: 'pointer' }}>
                                    {subiendoFotoEstado ? 'Subiendo…' : fotoEstado ? 'Foto agregada' : 'Agregar foto (opcional)'}
                                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) agregarFotoEstado(f); e.target.value = ''; }} />
                                </label>
                            )}
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button
                                    className="boton-primario" style={{ width: 'auto', minHeight: 40, padding: '0 14px', fontSize: 13 }}
                                    disabled={!motivoEstado.trim() || enviandoEstado} onClick={confirmarAccionEstado}
                                >{enviandoEstado ? 'Enviando…' : 'Confirmar'}</button>
                                <button className="boton-secundario" style={{ width: 'auto', minHeight: 40, padding: '0 14px', fontSize: 13 }} onClick={cancelarAccionEstado}>Cancelar</button>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ height: 16 }} />
            </div>

            <div className="pie-accion">
                {/* Una vez terminada, ya no tiene sentido seguir "guardando" ni volver a
                    "terminar" — la única acción disponible es Reabrir OT (arriba, en Estado
                    de la OT). Antes esta barra se quedaba igual de editable después de
                    terminar, sin ninguna pista de que el trabajo ya se dio por cerrado. */}
                {!terminada && <button className="boton-primario" disabled={guardando || soloLectura} onClick={guardarLoIngresado}>Guardar lo ingresado</button>}
                <button className="boton-secundario" onClick={() => setVerInforme(true)}>Ver informe</button>
                {!terminada && (
                    <button
                        className="boton-secundario"
                        disabled={!puedeTerminar || guardando || soloLectura}
                        onClick={terminarTrabajo}
                        style={puedeTerminar ? { background: 'var(--accion-primaria)', color: '#fff', borderColor: 'var(--accion-primaria)' } : {}}
                    >
                        Trabajo finalizado · informe final
                    </button>
                )}
                {!terminada && (
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--texto-atenuado-2)', textAlign: 'center' }}>
                        {puedeTerminar
                            ? 'Todas las tareas están marcadas. El informe final reúne cada tarea con lo que se hizo y sus fotos.'
                            : `Se habilita cuando las ${tareas.length} tareas estén marcadas — falta${faltan !== 1 ? 'n' : ''} ${faltan}.`}
                    </div>
                )}
            </div>
        </div>
    );
}

function FilaTarea({
    t, idx, dias, totalUnidades, hoy, otEnEjecucion, cruce, borrador, motivoAbierto, motivoTexto, guardando, bloqueada,
    onMarcarRealizada, onAbrirMotivo, onCancelarMotivo, onCambiarMotivoTexto, onConfirmarMotivo, onCambiarTexto, onAgregarFoto,
}) {
    const dayIndex = dias.indexOf(t.fecha);
    const horaIni = horasDecimal(t.horaInicio || t.hora) ?? 8;
    const duracion = Number(t.duracion) || 0;
    const noRealizada = !!t.motivoNoRealizada;
    const resuelta = t.completada || noRealizada;
    const enCurso = !resuelta && t.fecha === hoy && otEnEjecucion;

    let colorBg = '#f0efeb', colorBorde = '#c2c0b8'; // pendiente (futuro o sin resolver)
    if (t.completada || (t.fecha && t.fecha < hoy)) { colorBg = '#e6e4dd'; colorBorde = '#a3a29a'; } // cerrado
    if (enCurso) { colorBg = 'oklch(0.48 0.10 250 / .18)'; colorBorde = 'oklch(0.48 0.10 250)'; }

    const registro = t.registro?.texto || t.registro?.fotos?.length ? t.registro : null;

    return (
        <div style={{ display: 'flex', gap: 12, padding: '12px 18px 13px', borderBottom: '1px solid var(--linea-fina)' }}>
            <span style={{ flex: 'none', width: 30, height: 48, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 1 }}>
                <button
                    onClick={onMarcarRealizada}
                    disabled={guardando || bloqueada}
                    title={resuelta ? 'Volver a dejarla pendiente' : 'Marcar realizada'}
                    className="mono"
                    style={{
                        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: t.completada ? 'oklch(0.48 0.10 155 / .12)' : '#fff',
                        border: `1.5px solid ${t.completada ? 'oklch(0.48 0.10 155)' : noRealizada ? 'var(--atencion)' : 'rgba(0,0,0,.28)'}`,
                        color: t.completada ? 'oklch(0.42 0.10 155)' : noRealizada ? 'var(--atencion)' : 'transparent',
                        fontSize: 15, cursor: 'pointer', padding: 0,
                    }}
                >{t.completada ? '×' : noRealizada ? '–' : '×'}</button>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: t.completada ? 'var(--texto-atenuado-3)' : 'var(--texto-principal)', textDecoration: t.completada ? 'line-through' : 'none' }}>{t.descripcion}</span>
                    <span className="mono" style={{ flex: 'none', fontSize: 12, color: t.completada ? 'var(--texto-atenuado-3)' : 'var(--texto-principal)' }}>{t.horaInicio && t.horaFin ? `${t.horaInicio}–${t.horaFin}` : ''}</span>
                </span>
                <span style={{ display: 'block', marginTop: 3, fontSize: 13, color: noRealizada ? 'var(--atencion)' : 'var(--texto-secundario-2)' }}>
                    {(t.operarioNombre || []).join(', ')}{enCurso ? ' · en curso' : ''}{noRealizada ? ` · no realizada: ${t.motivoNoRealizada}` : ''}
                </span>

                {dayIndex >= 0 && (
                    <span style={{
                        display: 'block', marginTop: 8, position: 'relative', height: 22,
                        backgroundImage: 'linear-gradient(to right, rgba(0,0,0,.10) 1px, transparent 1px), linear-gradient(to right, rgba(0,0,0,.03) 1px, transparent 1px)',
                        backgroundSize: '20% 100%, 10% 100%',
                    }}>
                        {(() => {
                            const hoyIdx = dias.indexOf(hoy);
                            if (hoyIdx < 0) return null;
                            const ahora = new Date();
                            const horaAhora = ahora.getHours() + ahora.getMinutes() / 60;
                            if (horaAhora < 8 || horaAhora > 18) return null;
                            const left = ((hoyIdx * 10) + (horaAhora - 8)) / totalUnidades * 100;
                            return <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: 0, borderLeft: '2px solid rgba(28,29,27,.45)' }} />;
                        })()}
                        <span style={{
                            position: 'absolute', boxSizing: 'border-box',
                            left: `${((dayIndex * 10) + (horaIni - 8)) / totalUnidades * 100}%`,
                            width: `calc(${duracion / totalUnidades * 100}% - 1px)`, minWidth: 6, top: 0, height: 22,
                            background: colorBg, borderLeft: `3px solid ${colorBorde}`,
                        }} />
                        {cruce && (
                            <span style={{
                                position: 'absolute', boxSizing: 'border-box',
                                left: `${((dayIndex * 10) + (horaIni - 8)) / totalUnidades * 100}%`,
                                width: `${Math.max(duracion, 1) / totalUnidades * 100}%`, top: -2, height: 26,
                                border: '1.5px solid oklch(0.52 0.13 25)', zIndex: 1,
                            }} />
                        )}
                    </span>
                )}

                {registro ? (
                    <span style={{ display: 'flex', gap: 10, marginTop: 9, padding: '9px 10px', background: 'var(--fondo-pantalla)', borderLeft: '2px solid var(--deshabilitado-2)' }}>
                        {registro.fotos?.[0] && <img src={registro.fotos[0]} alt="" style={{ flex: 'none', width: 44, height: 34, objectFit: 'cover' }} />}
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.45, color: 'var(--texto-secundario-1)' }}>{registro.texto}</span>
                            <span className="mono" style={{ display: 'block', marginTop: 3, fontSize: 11.5, color: 'var(--texto-atenuado-3)' }}>{registro.hora} · {registro.fotos?.length || 0} foto{registro.fotos?.length === 1 ? '' : 's'}</span>
                        </span>
                    </span>
                ) : !bloqueada && (
                    // Antes exigía !resuelta acá — al marcar "completada" (onMarcarRealizada,
                    // más arriba) este bloque entero desaparecía, incluido lo que ya se había
                    // tecleado en el borrador (borrador?.texto/fotos). El dato seguía vivo en
                    // memoria (borradores[idx] no se toca al marcar completada), pero para el
                    // supervisor se veía como si se hubiera borrado. Marcar completada y
                    // describir qué se hizo son dos acciones independientes — no hay motivo
                    // para que una oculte a la otra.
                    <>
                        <span style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                            <input
                                value={borrador?.texto || ''} onChange={(e) => onCambiarTexto(e.target.value)} placeholder="Qué se hizo…"
                                style={{ flex: 1, minWidth: 0, height: 44, padding: '0 10px', background: '#fff', border: '1px solid rgba(0,0,0,.20)', borderRadius: 'var(--radio)', fontSize: 14 }}
                            />
                            <label style={{ flex: 'none', width: 78, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid rgba(0,0,0,.20)', borderRadius: 'var(--radio)', fontSize: 14, fontWeight: 600, color: 'var(--texto-secundario-1)', cursor: 'pointer' }}>
                                {borrador?.fotos?.length ? `${borrador.fotos.length} foto${borrador.fotos.length > 1 ? 's' : ''}` : 'Foto'}
                                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onAgregarFoto(f); e.target.value = ''; }} />
                            </label>
                        </span>
                        {motivoAbierto ? (
                            <span style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <input
                                    value={motivoTexto} onChange={(e) => onCambiarMotivoTexto(e.target.value)} placeholder="Motivo (ej. cliente canceló)"
                                    style={{ flex: 1, minWidth: 0, height: 40, padding: '0 10px', background: '#fff', border: '1px solid var(--atencion)', borderRadius: 'var(--radio)', fontSize: 13.5 }}
                                />
                                <button className="boton-secundario" style={{ width: 'auto', minHeight: 40, padding: '0 12px', fontSize: 13 }} disabled={!motivoTexto.trim() || guardando} onClick={onConfirmarMotivo}>Confirmar</button>
                                <button className="boton-secundario" style={{ width: 'auto', minHeight: 40, padding: '0 12px', fontSize: 13 }} onClick={onCancelarMotivo}>Cancelar</button>
                            </span>
                        ) : (
                            <button onClick={onAbrirMotivo} style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: 'var(--atencion)', textDecoration: 'underline', cursor: 'pointer' }}>
                                No se pudo realizar — agregar motivo
                            </button>
                        )}
                    </>
                )}
            </span>
        </div>
    );
}

// Compila cada tarea con lo que se hizo y sus fotos (README §5: eso es "el informe final").
// Fotos en miniatura, no a tamaño completo: la OT ya viene con todas las fotos cargadas
// desde obtenerOT (nada nuevo que pesar), pero pintar varias imágenes grandes a la vez sí
// puede sentirse lento en un teléfono en terreno — se mantienen chicas a propósito.
function VistaInforme({ ot, onVolver }) {
    const tareas = ot.tareas || [];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={onVolver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
                <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{ot.numeroOT}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--texto-atenuado-1)' }}>Informe</span>
            </header>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '16px 18px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-fina)' }}>
                    <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>{ot.descripcion}</div>
                    <div style={{ marginTop: 6, fontSize: 13.5, color: 'var(--texto-secundario-2)' }}>{ot.solicitante}</div>
                </div>
                {tareas.map((t, i) => (
                    <div key={t._id || i} style={{ padding: '13px 18px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-fina)' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600 }}>{t.descripcion}</span>
                            <span className="mono" style={{ flex: 'none', fontSize: 12, color: 'var(--texto-atenuado-1)' }}>{t.duracion} h</span>
                        </div>
                        <div style={{ marginTop: 3, fontSize: 13, color: 'var(--texto-secundario-2)' }}>{(t.operarioNombre || []).join(', ')}</div>
                        {t.completada && <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--listo)' }}>Realizada</div>}
                        {t.motivoNoRealizada && <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--atencion)' }}>No realizada: {t.motivoNoRealizada}</div>}
                        {!t.completada && !t.motivoNoRealizada && <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--texto-atenuado-3)' }}>Todavía pendiente</div>}
                        {(t.registro?.texto || t.registro?.fotos?.length > 0) && (
                            <div style={{ marginTop: 8 }}>
                                {t.registro.texto && <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--texto-secundario-1)' }}>{t.registro.texto}</div>}
                                {t.registro.fotos?.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                        {t.registro.fotos.map((f, fi) => (
                                            <img key={fi} src={f} alt="" loading="lazy" style={{ width: 70, height: 52, objectFit: 'cover' }} />
                                        ))}
                                    </div>
                                )}
                                <div className="mono" style={{ marginTop: 4, fontSize: 11.5, color: 'var(--texto-atenuado-3)' }}>
                                    {t.registro.hora}{t.registro.autor ? ` · ${t.registro.autor}` : ''}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                <div style={{ height: 18 }} />
            </div>
        </div>
    );
}
