import { useEffect, useState } from 'react';
import { obtenerOT, actualizarOT, cerrarAsignacion, obtenerTiposTrabajo, obtenerCondicionesEntorno } from '../api.js';
import { nuevoHallazgo, guardarHallazgoEnInforme, eliminarHallazgoDeInforme } from '../hallazgos.js';
import EditorHallazgo from './EditorHallazgo.jsx';

// El informe de evaluación ES la lista de hallazgos — sin pasos previos (condiciones del
// sitio/riesgos/metodología/recursos observados se retiraron a pedido explícito: esos campos
// quedan sin uso en OT.informeEvaluacion de acá en adelante, sin tocar el esquema ni las OT ya
// creadas con ellos). "+ Agregar hallazgo" abre el mismo editor de lienzo en blanco de
// siempre; no hay Atrás/Siguiente porque no hay nada más que recorrer.
export default function O5InformeEvaluacion({ nav, asignacion }) {
    // El _id de la Solicitud es también el que va a tener la OT una vez creada (mismo
    // upsert que ya usa otController.actualizarOT) — por eso alcanza con un solo id para
    // leer y guardar, exista o no la OT todavía. otId es el respaldo para cuando la
    // asignación ya apunta a una OT real (por ejemplo, una segunda visita).
    const targetId = asignacion?.otId || asignacion?.solicitudId;
    const [ot, setOt] = useState(null);
    const [informe, setInforme] = useState({ hallazgos: [], tareas: [], fotos: [], completo: false });
    const [guardando, setGuardando] = useState(false);
    const [tiposTrabajo, setTiposTrabajo] = useState([]);
    const [condicionesEntorno, setCondicionesEntorno] = useState([]);
    const [editandoHallazgo, setEditandoHallazgo] = useState(null); // null = lista; objeto = editor abierto

    useEffect(() => {
        if (!targetId) return;
        obtenerOT(targetId).then((o) => {
            setOt(o);
            if (o.informeEvaluacion) setInforme((i) => ({ ...i, ...o.informeEvaluacion, hallazgos: o.informeEvaluacion.hallazgos || [], tareas: o.informeEvaluacion.tareas || [], fotos: o.informeEvaluacion.fotos || [] }));
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

    // Los hallazgos se guardan de inmediato (no esperan a "Guardar y salir") — cada uno es su
    // propia unidad de trabajo, mismo criterio que "sin automatismo, sin bloqueo" del plan §9.
    // Declaradas antes del return de "editandoHallazgo" porque ese bloque ya las referencia.
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

    const terminarInforme = async () => {
        setGuardando(true);
        const nuevo = { ...informe, completo: true };
        try {
            await actualizarOT(targetId, { informeEvaluacion: nuevo });
            setInforme(nuevo);
            // Se marca la Asignacion como completada para que S5 · Mis informes la mueva de
            // "pendientes" a "enviados este mes" — si esto falla no se bloquea el guardado del
            // informe en sí, que ya quedó persistido en la línea de arriba.
            if (asignacion?._id) await cerrarAsignacion(asignacion._id).catch(() => {});
            nav.volver();
        } finally { setGuardando(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ padding: '10px 16px' }}>
                <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Informe</span>
            </header>

            <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
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

            <div className="pie-accion" style={{ flexDirection: 'row' }}>
                <button className="boton-secundario" style={{ width: 120 }} disabled={guardando} onClick={nav.volver}>Volver</button>
                <button className="boton-primario" disabled={guardando} onClick={terminarInforme}>Guardar y salir</button>
            </div>
        </div>
    );
}
