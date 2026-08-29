import { useState } from 'react';
import { responderCotizacion, responderExcepcion, cancelarSolicitud, editarDescripcionSolicitud } from '../api.js';

// Mismo corte que portalController.ESTADOS_OT_CANCELABLE (erp-backend) — duplicado acá
// porque no hay forma de compartir código entre apps. El cliente puede cancelar/editar el
// alcance hasta antes de que el trabajo empiece en terreno ('En Ejecución' en adelante).
const ESTADOS_OT_CANCELABLE = ['Tratada', 'Planificada', 'Programada', 'Reprogramar'];

// Mismo criterio y mismo límite que otController.cotizacionVencida/GanttScreen.cotizacionVencida
// (erp-backend, erp-web) — duplicado acá porque no hay forma de compartir código entre apps.
const HORAS_LIMITE_APROBACION_COTIZACION = 12;
const cotizacionVencida = (ot) => !!(
    ot?.cotizacion?.enviada && ot?.cotizacion?.respuestaCliente === 'Pendiente' && ot?.cotizacion?.fechaEnvio
    && (Date.now() - new Date(ot.cotizacion.fechaEnvio).getTime()) > HORAS_LIMITE_APROBACION_COTIZACION * 3600 * 1000
);

// Mismo idx/MAPA_ETAPA que ya usan DashboardScreen.jsx y TratamientoScreen.jsx en
// erp-web (duplicado ahí también, no importado de un módulo común — mismo criterio).
// Las etiquetas acá son la traducción a lenguaje de cliente de esas mismas 8 posiciones.
const ETAPAS_CLIENTE = [
    'Solicitud recibida', 'En evaluación', 'Presupuesto aceptado', 'Inicio programado',
    'En ejecución', 'Trabajo terminado', 'Informe entregado', 'Pagado',
];
const MAPA_ETAPA = {
    Tratada: 1, Planificada: 2, Programada: 3,
    'En Ejecución': 4, 'Trabajo Terminado': 5, 'Con Informe': 6, Pagada: 7,
};

// 'Aprobada'/'Rechazada' ya no son valores de OT.estado — un rechazo se detecta por
// cotizacion.respuestaCliente sin sacar a la OT de 'Planificada' (ver erp-backend/src/models/OT.js).
// solicitudEstado (Solicitud.estado) solo importa cuando todavía no hay OT: es lo único que
// distingue una solicitud cancelada de una recién recibida en ese punto.
function etapaInfo(ot, solicitudEstado) {
    if (!ot) {
        if (solicitudEstado === 'Cancelada') return { idx: 0, label: 'Solicitud cancelada', rechazada: true, porAprobar: false, reprogramando: false };
        return { idx: 0, label: ETAPAS_CLIENTE[0], rechazada: false, porAprobar: false, reprogramando: false };
    }
    // Cancelada es un flag encima del estado (OT.cancelada), no un valor de estado nuevo —
    // ot.estado se conserva tal cual iba (Tratada/Planificada/Programada/Reprogramar) para
    // que el recorrido siga mostrando hasta dónde había llegado antes de cancelarse.
    if (ot.cancelada?.activa) {
        const idx = ot.estado === 'Reprogramar' ? 3 : (MAPA_ETAPA[ot.estado] ?? 0);
        return { idx, label: 'Solicitud cancelada', rechazada: true, porAprobar: false, reprogramando: false };
    }
    if (ot.estado === 'Planificada' && ot.cotizacion?.enviada && ot.cotizacion?.respuestaCliente === 'Pendiente') {
        return { idx: 2, label: 'Cotización por aprobar', rechazada: false, porAprobar: true, reprogramando: false };
    }
    if (ot.estado === 'Planificada' && ot.cotizacion?.respuestaCliente === 'Rechazada') {
        return { idx: 2, label: 'Presupuesto rechazado', rechazada: true, porAprobar: false, reprogramando: false };
    }
    // 'Reprogramar' no está en MAPA_ETAPA (lo marca el supervisor desde S3, PWA Operativa,
    // cuando el trabajo necesita una fecha nueva) — sin este caso especial el timeline
    // saltaría de vuelta a "Solicitud recibida" (idx 0), un regreso confuso para el cliente.
    // Se mantiene en el punto donde ya iba (idx 3, "Visita programada").
    if (ot.estado === 'Reprogramar') {
        return { idx: 3, label: 'Coordinando nueva fecha', rechazada: false, porAprobar: false, reprogramando: true };
    }
    // 'Con Informe' (OT.estado) es un concepto interno del supervisor — un reporte de campo
    // agregado DESPUÉS de marcar el trabajo terminado (ver otController.aplicarAccionOT) — no
    // tiene relación con informeFinal.enviado (la oficina compartiendo el informe con el
    // cliente desde TabPago). Antes, MAPA_ETAPA['Con Informe']=6 hacía que el cliente viera
    // "Informe entregado" apenas el supervisor agregaba cualquier reporte, sin que la oficina
    // hubiera enviado nada — y al revés, un informe sí enviado con la OT todavía en 'Trabajo
    // Terminado' seguía mostrando solo "Trabajo terminado".
    if (['Trabajo Terminado', 'Con Informe'].includes(ot.estado)) {
        return ot.informeFinal?.enviado
            ? { idx: 6, label: 'Informe entregado', rechazada: false, porAprobar: false, reprogramando: false }
            : { idx: 5, label: 'Trabajo terminado', rechazada: false, porAprobar: false, reprogramando: false };
    }
    const idx = MAPA_ETAPA[ot.estado] ?? 0;
    return { idx, label: ETAPAS_CLIENTE[idx], rechazada: false, porAprobar: false, reprogramando: false };
}

const CLP = (n) => '$ ' + Math.round(n || 0).toLocaleString('es-CL');
const fmtLarga = (iso) => iso ? new Date((iso + '').split('T')[0] + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
const fmtCorta = (iso) => iso ? new Date((iso + '').split('T')[0] + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : '';

function lineaCliente(ot, solicitudEstado, motivoCancelacion) {
    if (!ot) {
        if (solicitudEstado === 'Cancelada') return 'Usted canceló esta solicitud.';
        return 'Su solicitud está siendo evaluada.';
    }
    if (ot.cancelada?.activa) return motivoCancelacion ? `Usted canceló esta solicitud: ${motivoCancelacion}` : 'Usted canceló esta solicitud.';
    if (ot.estado === 'Planificada' && ot.cotizacion?.enviada && ot.cotizacion?.respuestaCliente === 'Pendiente') {
        return 'Revise el detalle y responda a la cotización.';
    }
    if (ot.estado === 'Planificada' && ot.cotizacion?.respuestaCliente === 'Rechazada') return 'El presupuesto no fue aceptado.';
    if (ot.estado === 'Reprogramar') return 'Estamos coordinando una nueva fecha para su trabajo.';
    if (ot.estado === 'Programada') {
        const fecha = (ot.tareas || []).map((t) => t.fecha).filter(Boolean).sort()[0];
        return fecha ? `Nuestro equipo llega el ${fmtLarga(fecha)}.` : 'Su trabajo está programado.';
    }
    if (ot.estado === 'En Ejecución') return 'Nuestro equipo está trabajando en su solicitud.';
    if (['Trabajo Terminado', 'Con Informe'].includes(ot.estado)) {
        return ot.informeFinal?.enviado ? 'Ya puede ver y descargar el informe del trabajo realizado.' : 'El trabajo en terreno está terminado.';
    }
    if (ot.estado === 'Pagada') return 'Trabajo completado y pagado.';
    return 'En preparación.';
}

export default function C3EstadoTrabajo({ nav, trabajo: trabajoProp }) {
    const [trabajo, setTrabajo] = useState(trabajoProp);
    const [accion, setAccion] = useState(null); // null | 'aceptar' | 'rechazar'
    const [motivo, setMotivo] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');

    // Excepciones ("extensión de cotización") — puede haber más de una pendiente a la vez,
    // así que el estado va indexado por excepcionId en vez de una sola variable como arriba.
    const [accionExc, setAccionExc] = useState({});
    const [motivoExc, setMotivoExc] = useState({});
    const [enviandoExc, setEnviandoExc] = useState(null);
    const [errorExc, setErrorExc] = useState({});

    // Ver el detalle completo de lo pedido, editar el alcance, y cancelar — pedido explícito
    // del usuario: antes el cliente no tenía forma de ver ni tocar nada de su propia solicitud.
    const [verDetalle, setVerDetalle] = useState(false);
    const [editandoDescripcion, setEditandoDescripcion] = useState(false);
    const [descripcionEdit, setDescripcionEdit] = useState('');
    const [guardandoDescripcion, setGuardandoDescripcion] = useState(false);
    const [errorDescripcion, setErrorDescripcion] = useState('');
    const [cancelando, setCancelando] = useState(false);
    const [motivoCancelacion, setMotivoCancelacion] = useState('');
    const [enviandoCancelacion, setEnviandoCancelacion] = useState(false);
    const [errorCancelacion, setErrorCancelacion] = useState('');

    if (!trabajo) return null;
    const ot = trabajo.ot;
    const info = etapaInfo(ot, trabajo.estado);
    const color = info.rechazada ? 'var(--detenido)' : (info.porAprobar || info.reprogramando) ? 'var(--atencion)' : 'var(--en-curso)';
    const yaCancelada = ot ? !!ot.cancelada?.activa : trabajo.estado === 'Cancelada';
    const puedeCancelar = !yaCancelada && (ot ? ESTADOS_OT_CANCELABLE.includes(ot.estado) : trabajo.estado !== 'Rechazada');

    const responder = async (estado) => {
        setEnviando(true); setError('');
        try {
            const resultado = await responderCotizacion(ot._id, estado, estado === 'Rechazada' ? motivo : undefined);
            setTrabajo((t) => ({ ...t, ot: resultado.ot }));
            setAccion(null);
            setMotivo('');
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    const responderExc = async (excepcionId, estado) => {
        setEnviandoExc(excepcionId);
        setErrorExc((prev) => ({ ...prev, [excepcionId]: '' }));
        try {
            const resultado = await responderExcepcion(ot._id, excepcionId, estado, estado === 'Rechazada' ? motivoExc[excepcionId] : undefined);
            setTrabajo((t) => ({ ...t, ot: resultado.ot }));
            setAccionExc((prev) => ({ ...prev, [excepcionId]: null }));
            setMotivoExc((prev) => ({ ...prev, [excepcionId]: '' }));
        } catch (e) {
            setErrorExc((prev) => ({ ...prev, [excepcionId]: e.message }));
        } finally {
            setEnviandoExc(null);
        }
    };

    const abrirEdicionDescripcion = () => {
        setDescripcionEdit(trabajo.descripcion || '');
        setErrorDescripcion('');
        setEditandoDescripcion(true);
    };

    const guardarDescripcion = async () => {
        if (!descripcionEdit.trim()) { setErrorDescripcion('La descripción no puede quedar vacía.'); return; }
        setGuardandoDescripcion(true); setErrorDescripcion('');
        try {
            const resultado = await editarDescripcionSolicitud(trabajo._id, descripcionEdit.trim());
            setTrabajo((t) => ({ ...t, descripcion: descripcionEdit.trim(), ot: resultado.ot || t.ot }));
            setEditandoDescripcion(false);
        } catch (e) {
            setErrorDescripcion(e.message);
        } finally {
            setGuardandoDescripcion(false);
        }
    };

    const confirmarCancelacion = async () => {
        setEnviandoCancelacion(true); setErrorCancelacion('');
        try {
            const resultado = await cancelarSolicitud(trabajo._id, motivoCancelacion.trim());
            setTrabajo((t) => ({ ...t, estado: resultado.ot ? t.estado : 'Cancelada', ot: resultado.ot || t.ot }));
            setCancelando(false);
        } catch (e) {
            setErrorCancelacion(e.message);
        } finally {
            setEnviandoCancelacion(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }} className="mono">‹</button>
                <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{trabajo.numeroSolicitud || ot?.numeroOT}</span>
            </header>

            <div style={{ padding: 16 }}>
                {editandoDescripcion ? (
                    <div>
                        <textarea
                            className="input-campo"
                            value={descripcionEdit}
                            onChange={(e) => setDescripcionEdit(e.target.value)}
                            style={{ width: '100%', minHeight: 80, boxSizing: 'border-box', marginBottom: 8, resize: 'vertical' }}
                        />
                        {errorDescripcion && <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--detenido)', marginBottom: 8 }}>{errorDescripcion}</div>}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="boton-primario" disabled={guardandoDescripcion} onClick={guardarDescripcion}>{guardandoDescripcion ? 'Guardando…' : 'Guardar cambios'}</button>
                            <button className="boton-secundario" disabled={guardandoDescripcion} onClick={() => setEditandoDescripcion(false)}>Cancelar</button>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>{trabajo.descripcion}</div>
                        {puedeCancelar && (
                            <button onClick={abrirEdicionDescripcion} style={{ flex: 'none', background: 'none', border: 'none', padding: 0, fontSize: 'var(--fs-secundario)', color: 'var(--en-curso)', textDecoration: 'underline', cursor: 'pointer' }}>Editar</button>
                        )}
                    </div>
                )}
                <button onClick={() => setVerDetalle((v) => !v)} style={{ background: 'none', border: 'none', padding: 0, marginTop: 8, fontSize: 'var(--fs-secundario)', color: 'var(--en-curso)', textDecoration: 'underline', cursor: 'pointer' }}>
                    {verDetalle ? 'Ocultar detalle de la solicitud' : 'Ver detalle de la solicitud'}
                </button>
                {verDetalle && (
                    <div style={{ marginTop: 10, padding: 12, background: 'var(--fondo-pantalla)', borderRadius: 'var(--radio)' }}>
                        {[
                            ['Empresa', trabajo.empresaSolicitante],
                            ['Solicitante', trabajo.solicitante],
                            ['Correo', trabajo.correo],
                            ['Dirección', trabajo.direccion],
                            ['Origen', trabajo.origen],
                            ['Fecha de ejecución solicitada', fmtLarga(trabajo.fechaEjecucionSolicitada)],
                            ['Plazo sugerido', trabajo.plazoEjecucionSugerido],
                        ].filter(([, v]) => v).map(([label, valor]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', fontSize: 'var(--fs-secundario)' }}>
                                <span style={{ color: 'var(--texto-atenuado-1)' }}>{label}</span>
                                <span style={{ textAlign: 'right' }}>{valor}</span>
                            </div>
                        ))}
                        {trabajo.adjuntos && (
                            <div style={{ marginTop: 6 }}>
                                <a href={trabajo.adjuntos} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--fs-secundario)', color: 'var(--en-curso)' }}>Ver adjunto</a>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="franja">
                <div style={{ fontSize: 'var(--fs-titulo)', fontWeight: 700, color }}>{info.label}</div>
                <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-1)', marginTop: 4 }}>{lineaCliente(ot, trabajo.estado, ot?.cancelada?.motivo)}</div>
            </div>

            <div style={{ padding: '14px 16px 4px' }} className="versalita">Recorrido</div>
            <div>
                {ETAPAS_CLIENTE.map((label, i) => {
                    const cumplida = i < info.idx;
                    const esActual = i === info.idx;
                    const texto = info.rechazada && esActual ? 'Presupuesto rechazado'
                        : info.porAprobar && esActual ? 'Cotización por aprobar'
                        : info.reprogramando && esActual ? 'Coordinando nueva fecha'
                        : label;
                    return (
                        <div key={i} style={{
                            minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px',
                            background: esActual ? 'var(--fondo-pantalla)' : 'transparent',
                        }}>
                            <span className="mono" style={{ color: info.rechazada && esActual ? 'var(--detenido)' : cumplida || esActual ? 'var(--texto-principal)' : 'var(--deshabilitado-1)' }}>
                                {cumplida ? '×' : esActual ? '▪' : '·'}
                            </span>
                            <span style={{ flex: 1, fontSize: 'var(--fs-secundario)', fontWeight: esActual ? 700 : 400, color: info.rechazada && esActual ? 'var(--detenido)' : 'var(--texto-principal)' }}>
                                {texto}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* granTotal es neto — igual que TratamientoScreen (erp-web), el monto que
                realmente se aprueba/paga es con IVA. Mostrar solo el neto acá hacía que el
                cliente aprobara pensando un monto 19% más bajo del que después le llega a
                cobrar en Cuenta y pago (C5), que si aplicaba el 19%. */}
            {ot?.granTotal > 0 && (
                <div style={{ padding: 16 }}>
                    <div className="versalita">Presupuesto (con IVA)</div>
                    <div className="mono" style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{CLP(ot.granTotal * 1.19)}</div>
                    <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)', marginTop: 2 }}>Neto {CLP(ot.granTotal)} + IVA 19%</div>
                </div>
            )}

            {info.porAprobar && (
                <div style={{ padding: '0 16px 16px' }}>
                    <button
                        onClick={() => nav.ir('c5', { trabajo })}
                        style={{ background: 'none', border: 'none', padding: 0, marginBottom: 10, fontSize: 'var(--fs-secundario)', color: 'var(--en-curso)', textDecoration: 'underline', cursor: 'pointer' }}
                    >Ver detalle de la cotización</button>
                    {error && <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--detenido)', marginBottom: 8 }}>{error}</div>}
                    {cotizacionVencida(ot) && (
                        <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--atencion)', marginBottom: 8 }}>
                            Esta cotización venció (más de 12 h sin respuesta) — ya no se puede aceptar. Escriba a la oficina para que se la reenvíen.
                        </div>
                    )}
                    {accion === null && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            {!cotizacionVencida(ot) && <button className="boton-primario" disabled={enviando} onClick={() => setAccion('aceptar')}>Aceptar cotización</button>}
                            <button className="boton-secundario" disabled={enviando} onClick={() => setAccion('rechazar')}>Rechazar</button>
                        </div>
                    )}
                    {accion === 'aceptar' && (
                        <div>
                            <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-1)', marginBottom: 8 }}>
                                ¿Confirma? El trabajo quedará programado con las fechas indicadas.
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="boton-primario" disabled={enviando} onClick={() => responder('Aprobada')}>{enviando ? 'Enviando…' : 'Confirmar aceptación'}</button>
                                <button className="boton-secundario" disabled={enviando} onClick={() => setAccion(null)}>Cancelar</button>
                            </div>
                        </div>
                    )}
                    {accion === 'rechazar' && (
                        <div>
                            <textarea
                                className="input-campo"
                                placeholder="Motivo del rechazo (opcional)"
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                style={{ width: '100%', minHeight: 70, boxSizing: 'border-box', marginBottom: 8, resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="boton-primario" disabled={enviando} onClick={() => responder('Rechazada')}>{enviando ? 'Enviando…' : 'Confirmar rechazo'}</button>
                                <button className="boton-secundario" disabled={enviando} onClick={() => setAccion(null)}>Cancelar</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {(ot?.excepciones || []).filter((e) => e.estado === 'Enviada').map((e) => (
                <div key={e._id} style={{ padding: '0 16px 16px' }}>
                    <div className="versalita" style={{ marginBottom: 6 }}>Costo adicional</div>
                    <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-1)', marginBottom: 6 }}>{e.descripcion}</div>
                    <div className="mono" style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{CLP(e.montoExtra)}</div>
                    {errorExc[e._id] && <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--detenido)', marginBottom: 8 }}>{errorExc[e._id]}</div>}
                    {!accionExc[e._id] && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="boton-primario" disabled={enviandoExc === e._id} onClick={() => setAccionExc((a) => ({ ...a, [e._id]: 'aceptar' }))}>Aceptar</button>
                            <button className="boton-secundario" disabled={enviandoExc === e._id} onClick={() => setAccionExc((a) => ({ ...a, [e._id]: 'rechazar' }))}>Rechazar</button>
                        </div>
                    )}
                    {accionExc[e._id] === 'aceptar' && (
                        <div>
                            <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-1)', marginBottom: 8 }}>¿Confirma este costo adicional?</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="boton-primario" disabled={enviandoExc === e._id} onClick={() => responderExc(e._id, 'Aprobada')}>{enviandoExc === e._id ? 'Enviando…' : 'Confirmar'}</button>
                                <button className="boton-secundario" disabled={enviandoExc === e._id} onClick={() => setAccionExc((a) => ({ ...a, [e._id]: null }))}>Cancelar</button>
                            </div>
                        </div>
                    )}
                    {accionExc[e._id] === 'rechazar' && (
                        <div>
                            <textarea
                                className="input-campo"
                                placeholder="Motivo del rechazo (opcional)"
                                value={motivoExc[e._id] || ''}
                                onChange={(ev) => setMotivoExc((m) => ({ ...m, [e._id]: ev.target.value }))}
                                style={{ width: '100%', minHeight: 70, boxSizing: 'border-box', marginBottom: 8, resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="boton-primario" disabled={enviandoExc === e._id} onClick={() => responderExc(e._id, 'Rechazada')}>{enviandoExc === e._id ? 'Enviando…' : 'Confirmar rechazo'}</button>
                                <button className="boton-secundario" disabled={enviandoExc === e._id} onClick={() => setAccionExc((a) => ({ ...a, [e._id]: null }))}>Cancelar</button>
                            </div>
                        </div>
                    )}
                </div>
            ))}

            {puedeCancelar && (
                <div style={{ padding: '0 16px 16px' }}>
                    {!cancelando ? (
                        <button onClick={() => setCancelando(true)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 'var(--fs-secundario)', color: 'var(--detenido)', textDecoration: 'underline', cursor: 'pointer' }}>
                            Cancelar esta solicitud
                        </button>
                    ) : (
                        <div>
                            <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-1)', marginBottom: 8 }}>
                                ¿Confirma que quiere cancelar? Puede quedar sujeto a un cobro por el trabajo ya realizado hasta ahora (ej. una visita de evaluación).
                            </div>
                            <textarea
                                className="input-campo"
                                placeholder="Motivo (opcional)"
                                value={motivoCancelacion}
                                onChange={(e) => setMotivoCancelacion(e.target.value)}
                                style={{ width: '100%', minHeight: 70, boxSizing: 'border-box', marginBottom: 8, resize: 'vertical' }}
                            />
                            {errorCancelacion && <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--detenido)', marginBottom: 8 }}>{errorCancelacion}</div>}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="boton-primario" style={{ background: 'var(--detenido)', borderColor: 'var(--detenido)' }} disabled={enviandoCancelacion} onClick={confirmarCancelacion}>{enviandoCancelacion ? 'Enviando…' : 'Confirmar cancelación'}</button>
                                <button className="boton-secundario" disabled={enviandoCancelacion} onClick={() => setCancelando(false)}>Volver</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div style={{ flex: 1 }} />
            <div className="pie-accion" style={{ flexDirection: 'row' }}>
                {ot?.granTotal > 0 && <button className="boton-secundario" onClick={() => nav.ir('c5', { trabajo })}>Cuenta y pago</button>}
                {['En Ejecución', 'Trabajo Terminado', 'Con Informe'].includes(ot?.estado) && (
                    <button className="boton-secundario" onClick={() => nav.ir('c4', { trabajo })}>{ot?.informeFinal?.enviado ? 'Informe' : 'Avance'}</button>
                )}
            </div>
            <div className="pie-accion" style={{ borderTop: 'none', paddingTop: 0 }}>
                <a href="https://wa.me/56912345678" className="boton-primario" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                    Escribir a la oficina
                </a>
            </div>
        </div>
    );
}
