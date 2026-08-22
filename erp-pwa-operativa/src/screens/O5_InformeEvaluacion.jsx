import { useEffect, useState } from 'react';
import { obtenerOT, actualizarOT, cerrarAsignacion, subirFoto, obtenerTiposTrabajo, obtenerCondicionesEntorno } from '../api.js';
import { nuevoHallazgo, guardarHallazgoEnInforme, eliminarHallazgoDeInforme } from '../hallazgos.js';
import EditorHallazgo from './EditorHallazgo.jsx';

// Los cuatro pasos cualitativos siguen el modelo existente OT.informeEvaluacion
// (erp-backend/src/models/OT.js): condicionesSitio, riesgos, metodologia, recursosObservados.
// El handoff solo ilustra el paso de Riesgos (paso 2) — para 1/3/4 no hay maqueta, así que se
// resolvieron como un textarea simple, la opción más chica y consistente con el resto del
// sistema. "hallazgos" es el paso nuevo del formulario adaptativo (plan §10).
const RIESGOS_COMUNES = ['Trabajo en altura', 'Espacio confinado', 'Energía eléctrica', 'Manejo de cargas'];
const PASOS = ['condicionesSitio', 'riesgos', 'metodologia', 'recursosObservados', 'hallazgos'];
const TITULOS = { condicionesSitio: 'Condiciones del sitio', riesgos: 'Riesgos', metodologia: 'Metodología', recursosObservados: 'Recursos observados', hallazgos: 'Hallazgos' };

export default function O5InformeEvaluacion({ nav, asignacion }) {
    // El _id de la Solicitud es también el que va a tener la OT una vez creada (mismo
    // upsert que ya usa otController.actualizarOT) — por eso alcanza con un solo id para
    // leer y guardar, exista o no la OT todavía. otId es el respaldo para cuando la
    // asignación ya apunta a una OT real (por ejemplo, una segunda visita).
    const targetId = asignacion?.otId || asignacion?.solicitudId;
    const [ot, setOt] = useState(null);
    const [paso, setPaso] = useState(0);
    const [informe, setInforme] = useState({ condicionesSitio: '', riesgos: '', metodologia: '', recursosObservados: '', fotos: [], hallazgos: [], tareas: [] });
    const [riesgosSeleccionados, setRiesgosSeleccionados] = useState([]);
    const [otroRiesgo, setOtroRiesgo] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [tiposTrabajo, setTiposTrabajo] = useState([]);
    const [condicionesEntorno, setCondicionesEntorno] = useState([]);
    const [editandoHallazgo, setEditandoHallazgo] = useState(null); // null = lista; objeto = editor abierto

    useEffect(() => {
        if (!targetId) return;
        obtenerOT(targetId).then((o) => {
            setOt(o);
            if (o.informeEvaluacion) setInforme((i) => ({ ...i, ...o.informeEvaluacion, fotos: o.informeEvaluacion.fotos || [], hallazgos: o.informeEvaluacion.hallazgos || [], tareas: o.informeEvaluacion.tareas || [] }));
        }).catch(() => setOt({})); // primera visita: la OT todavía no existe, se crea al guardar
        obtenerTiposTrabajo().then(setTiposTrabajo).catch(() => {});
        obtenerCondicionesEntorno().then(setCondicionesEntorno).catch(() => {});
    }, [targetId]);

    if (!targetId) {
        return (
            <div style={{ padding: 24 }}>
                <p style={{ fontSize: 'var(--fs-cuerpo)' }}>Esta visita todavía no tiene una solicitud u OT asociada — avisa a la oficina antes de levantar el informe.</p>
                <button className="boton-secundario" onClick={nav.volver}>Volver</button>
            </div>
        );
    }
    if (!ot) return null;

    // Los hallazgos se guardan de inmediato (no esperan al "Siguiente"/"Guardar y salir" del
    // asistente) — cada uno es su propia unidad de trabajo, mismo criterio que "sin
    // automatismo, sin bloqueo" del plan §9. Declaradas antes del return de "editandoHallazgo"
    // porque ese bloque ya las referencia.
    const guardarHallazgo = async (hallazgoEditado) => {
        const nuevo = guardarHallazgoEnInforme(informe, hallazgoEditado);
        setGuardando(true);
        try {
            await actualizarOT(targetId, { informeEvaluacion: nuevo });
            setInforme(nuevo);
            setEditandoHallazgo(null);
        } catch {
            window.alert('No se pudo guardar el hallazgo — revisa la señal e intenta de nuevo.');
        } finally { setGuardando(false); }
    };

    const eliminarHallazgo = async (hallazgoId) => {
        if (!window.confirm('¿Eliminar este hallazgo?')) return;
        const nuevo = eliminarHallazgoDeInforme(informe, hallazgoId);
        setGuardando(true);
        try {
            await actualizarOT(targetId, { informeEvaluacion: nuevo });
            setInforme(nuevo);
            setEditandoHallazgo(null);
        } finally { setGuardando(false); }
    };

    if (editandoHallazgo) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <header style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => setEditandoHallazgo(null)} className="mono" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }}>‹</button>
                    <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Hallazgo</span>
                </header>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <EditorHallazgo
                        hallazgo={editandoHallazgo}
                        tiposTrabajo={tiposTrabajo}
                        condicionesEntorno={condicionesEntorno}
                        onGuardar={guardarHallazgo}
                        onEliminar={editandoHallazgo._id ? () => eliminarHallazgo(editandoHallazgo._id) : null}
                        onCancelar={() => setEditandoHallazgo(null)}
                    />
                </div>
            </div>
        );
    }

    const toggleRiesgo = (r) => setRiesgosSeleccionados((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));

    const agregarFotoSitio = async (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;
        e.target.value = '';
        try {
            const url = await subirFoto(archivo);
            setInforme((i) => ({ ...i, fotos: [...i.fotos, url] }));
        } catch {
            window.alert('No se pudo subir la foto — revisa la señal e intenta de nuevo.');
        }
    };

    const guardar = async (avanzar) => {
        setGuardando(true);
        const riesgosTexto = [...riesgosSeleccionados, otroRiesgo].filter(Boolean).join(', ') || informe.riesgos;
        const completo = paso === PASOS.length - 1;
        const nuevo = { ...informe, riesgos: riesgosTexto, completo };
        try {
            await actualizarOT(targetId, { informeEvaluacion: nuevo });
            setInforme(nuevo);
            // Último paso: se marca la Asignacion como completada para que S5 · Mis informes
            // la mueva de "pendientes" a "enviados este mes" — si esto falla no se bloquea el
            // guardado del informe en sí, que ya quedó persistido en la línea de arriba.
            if (completo && asignacion?._id) await cerrarAsignacion(asignacion._id).catch(() => {});
            if (avanzar && paso < PASOS.length - 1) setPaso(paso + 1);
            else if (avanzar) nav.volver();
        } finally { setGuardando(false); }
    };

    const campo = PASOS[paso];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ padding: '10px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Informe de evaluación</span>
                    <span className="mono" style={{ fontSize: 'var(--fs-linea-mono)' }}>{paso + 1} / {PASOS.length}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    {PASOS.map((_, i) => (
                        <div key={i} style={{ flex: 1, height: 3, background: i <= paso ? 'var(--en-curso)' : 'var(--linea-zona)' }} />
                    ))}
                </div>
            </header>

            <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
                <div className="versalita" style={{ marginBottom: 10 }}>{TITULOS[campo]}</div>

                {campo === 'riesgos' ? (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {RIESGOS_COMUNES.map((r) => (
                                <button key={r} className="boton-secundario" style={{ minHeight: 52, textAlign: 'left', paddingLeft: 14 }} onClick={() => toggleRiesgo(r)}>
                                    <span className="mono" style={{ marginRight: 8 }}>{riesgosSeleccionados.includes(r) ? '×' : '·'}</span>{r}
                                </button>
                            ))}
                        </div>
                        <input
                            value={otroRiesgo} onChange={(e) => setOtroRiesgo(e.target.value)} placeholder="Otro riesgo"
                            style={{ width: '100%', marginTop: 12, padding: 12, fontSize: 'var(--fs-cuerpo)', border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)' }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                            {informe.fotos.map((f, i) => <img key={i} src={f} alt="" style={{ width: 76, height: 60, objectFit: 'cover', borderRadius: 'var(--radio)' }} />)}
                            <label className="boton-secundario" style={{ width: 76, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13 }}>
                                Agregar
                                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={agregarFotoSitio} />
                            </label>
                        </div>
                    </>
                ) : campo === 'hallazgos' ? (
                    <div>
                        {(informe.hallazgos || []).length === 0 && (
                            <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)', marginBottom: 12 }}>
                                Sin hallazgos todavía. Agrega uno por cada cosa distinta que observaste.
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(informe.hallazgos || []).map((h) => {
                                const tipo = tiposTrabajo.find((t) => String(t._id) === String(h.tipoTrabajoId));
                                return (
                                    <button key={h._id} onClick={() => setEditandoHallazgo(h)} className="boton-secundario" style={{ textAlign: 'left', minHeight: 64, padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700 }}>
                                            {tipo?.nombre || 'Sin tipo de trabajo'}
                                            {h.casoNoCubierto && <span style={{ color: 'var(--atencion)', fontWeight: 600 }}> · para revisar</span>}
                                        </span>
                                        <span style={{ fontSize: 13, color: 'var(--texto-secundario-2)' }}>{h.textoDescriptivo || '(sin texto)'}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button className="boton-primario" style={{ marginTop: 14 }} onClick={() => setEditandoHallazgo(nuevoHallazgo())}>+ Agregar hallazgo</button>
                    </div>
                ) : (
                    <textarea
                        value={informe[campo] || ''}
                        onChange={(e) => setInforme((i) => ({ ...i, [campo]: e.target.value }))}
                        style={{ width: '100%', minHeight: 160, padding: 12, fontSize: 'var(--fs-cuerpo)', border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                )}
            </div>

            <div className="pie-accion" style={{ flexDirection: 'row' }}>
                <button className="boton-secundario" style={{ width: 120 }} disabled={paso === 0 || guardando} onClick={() => setPaso(paso - 1)}>Atrás</button>
                <button className="boton-primario" disabled={guardando} onClick={() => guardar(true)}>
                    {paso === PASOS.length - 1 ? 'Guardar y salir' : 'Siguiente'}
                </button>
            </div>
        </div>
    );
}
