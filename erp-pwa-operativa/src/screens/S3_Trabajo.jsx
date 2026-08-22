import { useEffect, useState } from 'react';
import { obtenerOT, actualizarOT, accionOT, miSemana } from '../api.js';
import { detectarCruces } from '../cruces.js';

// Misma compresión que ya usa O4_ReporteTerreno (previsualizarFoto en otController.supervisorPortal).
function comprimirFoto(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 1200;
                let w = img.width, h = img.height;
                if (w > MAX) { h = Math.round((h * MAX) / w); w = MAX; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(archivo);
    });
}

const COLOR_ESTADO = { 'En Ejecución': 'var(--en-curso)', 'Trabajo Terminado': 'var(--listo)', 'Con Informe': 'var(--listo)', 'Pagada': 'var(--listo)' };
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

const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function S3Trabajo({ nav, asignacion, persona }) {
    const otId = asignacion?.otId;
    const [ot, setOt] = useState(null);
    const [semana, setSemana] = useState(null);
    const [borradores, setBorradores] = useState({});
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [motivoAbierto, setMotivoAbierto] = useState(null);
    const [motivoTexto, setMotivoTexto] = useState('');

    const cargar = () => obtenerOT(otId).then(setOt).catch((e) => setError(e.message));

    useEffect(() => {
        if (!otId) return;
        cargar();
        // Para detectar cruces con OT de OTRAS personas supervisadas (misma fuente que S2) —
        // solo cubre la semana en curso, igual que S2 (README §4: cálculo en el cliente).
        miSemana().then(setSemana).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otId]);

    if (!otId) return <Mensaje texto="Esta pantalla necesita una OT asociada." nav={nav} />;
    if (error) return <Mensaje texto={error} nav={nav} />;
    if (!ot) return null;

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
        const nuevasTareas = tareas.map((t, i) => (i === idx ? { ...t, ...cambios } : t));
        setGuardando(true);
        try { await actualizarOT(otId, { tareas: nuevasTareas }); await cargar(); } finally { setGuardando(false); }
    };

    const marcarRealizada = (idx) => guardarTarea(idx, { completada: true, motivoNoRealizada: '' });

    const confirmarNoRealizada = async (idx) => {
        if (!motivoTexto.trim()) return;
        await guardarTarea(idx, { motivoNoRealizada: motivoTexto.trim(), completada: false });
        setMotivoAbierto(null); setMotivoTexto('');
    };

    const actualizarBorrador = (idx, campo, valor) => setBorradores((b) => ({ ...b, [idx]: { texto: '', fotos: [], ...b[idx], [campo]: valor } }));

    const agregarFotoBorrador = async (idx, archivo) => {
        const b64 = await comprimirFoto(archivo);
        setBorradores((b) => {
            const previo = b[idx] || { texto: '', fotos: [] };
            return { ...b, [idx]: { ...previo, fotos: [...previo.fotos, b64] } };
        });
    };

    const guardarLoIngresado = async () => {
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

    const terminarTrabajo = async () => {
        if (!window.confirm('¿Marcar el trabajo como finalizado? Queda lista para que la oficina facture.')) return;
        setGuardando(true);
        try { await accionOT(otId, { accion: 'terminar' }); await cargar(); } finally { setGuardando(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
                <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{ot.numeroOT}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: COLOR_ESTADO[ot.estado] || 'var(--texto-atenuado-1)' }}>{ot.estado}</span>
            </header>

            <div style={{ flex: 1, overflowY: 'auto' }}>
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
                            onMarcarRealizada={() => marcarRealizada(idx)}
                            onAbrirMotivo={() => { setMotivoAbierto(idx); setMotivoTexto(''); }}
                            onCancelarMotivo={() => setMotivoAbierto(null)}
                            onCambiarMotivoTexto={setMotivoTexto}
                            onConfirmarMotivo={() => confirmarNoRealizada(idx)}
                            onCambiarTexto={(v) => actualizarBorrador(idx, 'texto', v)}
                            onAgregarFoto={(archivo) => agregarFotoBorrador(idx, archivo)}
                        />
                    ))}
                </div>

                <div style={{ height: 16 }} />
            </div>

            <div className="pie-accion">
                <button className="boton-primario" disabled={guardando} onClick={guardarLoIngresado}>Guardar lo ingresado</button>
                <button className="boton-secundario" disabled title="Todavía no está definido qué muestra esta pantalla">Ver informe</button>
                <button
                    className="boton-secundario"
                    disabled={!puedeTerminar || guardando}
                    onClick={terminarTrabajo}
                    style={puedeTerminar ? { background: 'var(--accion-primaria)', color: '#fff', borderColor: 'var(--accion-primaria)' } : {}}
                >
                    Trabajo finalizado · informe final
                </button>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--texto-atenuado-2)', textAlign: 'center' }}>
                    {puedeTerminar
                        ? 'Todas las tareas están marcadas. El informe final reúne cada tarea con lo que se hizo y sus fotos.'
                        : `Se habilita cuando las ${tareas.length} tareas estén marcadas — falta${faltan !== 1 ? 'n' : ''} ${faltan}.`}
                </div>
            </div>
        </div>
    );
}

function FilaTarea({
    t, idx, dias, totalUnidades, hoy, otEnEjecucion, cruce, borrador, motivoAbierto, motivoTexto, guardando,
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
                    disabled={resuelta || guardando}
                    className="mono"
                    style={{
                        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: t.completada ? 'oklch(0.48 0.10 155 / .12)' : '#fff',
                        border: `1.5px solid ${t.completada ? 'oklch(0.48 0.10 155)' : noRealizada ? 'var(--atencion)' : 'rgba(0,0,0,.28)'}`,
                        color: t.completada ? 'oklch(0.42 0.10 155)' : noRealizada ? 'var(--atencion)' : 'transparent',
                        fontSize: 15, cursor: resuelta ? 'default' : 'pointer', padding: 0,
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
                ) : !resuelta && (
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

function Mensaje({ texto, nav }) {
    return (
        <div style={{ padding: 24 }}>
            <p style={{ fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{texto}</p>
            <button className="boton-secundario" onClick={nav.volver}>Volver</button>
        </div>
    );
}
