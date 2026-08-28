// Extraído de TratamientoScreen.jsx — ver plan de robustecimiento, punto 6 (mismo criterio
// que las pestañas hermanas). `granTotal` se recibe ya calculado — depende de tareas +
// componentes + logistica, que viven en TratamientoScreen.
import { t, styles, CLP } from './comunTratamiento';

// Solo informativo (confirmado con el usuario) — sin vencimiento ni acción automática, a
// diferencia del plazo de 12h de la cotización.
function horasDesde(iso) {
    if (!iso) return '';
    const horas = (Date.now() - new Date(iso).getTime()) / 3600000;
    if (horas < 1) return 'hace menos de 1 hora';
    if (horas < 24) return `hace ${Math.floor(horas)} h`;
    return `hace ${Math.floor(horas / 24)} día${Math.floor(horas / 24) === 1 ? '' : 's'}`;
}

export default function TabPago({
    pago, setPago, granTotal, guardarPago, anularPago, restaurarPago,
    estadoOT, informeFinal, enviarInformeFinal, enviandoInforme,
}) {
    // El informe (Solicitud + Informe Inicial + plan + lo reportado en terreno) solo tiene
    // sentido una vez terminado el trabajo — antes de eso no hay nada completo que mostrarle
    // al cliente. Ver plan/planificación con el usuario: el botón vive acá (Pago), no en
    // Ejecución, aunque el contenido se arma a partir de datos que sí viven ahí.
    const puedeEnviarInforme = ['Trabajo Terminado', 'Con Informe'].includes(estadoOT);
    return (
        <div style={{ maxWidth: 520, padding: 16 }}>
            {puedeEnviarInforme && (
                <div style={{ marginBottom: 16, padding: '10px 12px', background: t.barraFiltrosPie, borderLeft: `2px solid ${informeFinal?.enviado ? t.verde : t.acento}`, borderRadius: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: informeFinal?.enviado ? t.verde : t.textoPrincipal }}>
                        {informeFinal?.enviado ? 'Informe enviado' : 'Informe al cliente'}
                    </div>
                    {informeFinal?.enviado ? (
                        <div style={{ fontSize: 11.5, color: t.textoSecundario2, marginTop: 4 }}>
                            El cliente ya puede ver el detalle completo de lo ejecutado en su Portal — {horasDesde(informeFinal.fechaEnvio)}.
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: 11.5, color: t.textoSecundario2, marginTop: 4, marginBottom: 8 }}>
                                Todavía no se compartió con el cliente el detalle de lo ejecutado (plan, comentarios y fotos de terreno).
                            </div>
                            <button onClick={enviarInformeFinal} disabled={enviandoInforme} style={{ ...styles.btnSecundario, opacity: enviandoInforme ? .6 : 1 }}>
                                {enviandoInforme ? 'Enviando…' : 'Enviar informe al cliente'}
                            </button>
                        </>
                    )}
                </div>
            )}
            <div style={styles.tituloSub}>Registro de pago</div>
            {pago.anulado && (
                <div style={{ background: t.barraFiltrosPie, borderLeft: `2px solid ${t.rojo}`, padding: '8px 10px', marginBottom: 12, fontSize: 11.5 }}>
                    <div style={{ fontWeight: 700, color: t.rojo }}>Pago anulado</div>
                    <div style={{ color: t.textoSecundario1 }}>
                        {pago.fechaAnulacion && <>Fecha: <strong>{pago.fechaAnulacion}</strong> — </>}
                        {pago.motivoAnulacion ? <>Motivo: <strong>{pago.motivoAnulacion}</strong></> : 'Sin motivo registrado'}
                    </div>
                </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                {[
                    { label: 'Total cotizado', valor: CLP(granTotal * 1.19), nota: 'con IVA' },
                    { label: 'Monto pagado', valor: CLP(pago.montoPagado), nota: '' },
                    { label: 'Saldo pendiente', valor: CLP(Math.max(0, granTotal * 1.19 - Number(pago.montoPagado || 0))), nota: '' },
                ].map(k => (
                    <div key={k.label} style={{ background: t.barraFiltrosPie, padding: 10, textAlign: 'center', borderRadius: 2 }}>
                        <div style={{ fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: t.textoAtenuado3 }}>{k.label}</div>
                        <div style={{ fontFamily: t.fontMono, fontSize: 16, fontWeight: 700, marginTop: 4 }}>{k.valor}</div>
                    </div>
                ))}
            </div>
            <div style={{ marginBottom: 12, display: 'flex', gap: 2 }}>
                {['Pendiente', 'Parcial', 'Pagado'].map(e => (
                    <button key={e} onClick={() => setPago(p => ({ ...p, estado: e }))} style={pago.estado === e ? styles.chipActivo : styles.chip}>{pago.estado === e ? '▪ ' : ''}{e}</button>
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '8px 12px', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>Monto pagado</span>
                <input type="number" className="campo-ed" style={styles.inputPlano} value={pago.montoPagado} onChange={e => setPago(p => ({ ...p, montoPagado: Number(e.target.value) }))} />
                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>Fecha de pago</span>
                <input type="date" className="campo-ed" style={styles.inputPlano} value={pago.fechaPago} onChange={e => setPago(p => ({ ...p, fechaPago: e.target.value }))} />
                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>Método</span>
                <select className="campo-ed" style={styles.inputPlano} value={pago.metodoPago} onChange={e => setPago(p => ({ ...p, metodoPago: e.target.value }))}>
                    {['Transferencia', 'Efectivo', 'Cheque', 'Débito', 'Crédito', 'Otro'].map(m => <option key={m}>{m}</option>)}
                </select>
                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>N° referencia</span>
                <input className="campo-ed" style={styles.inputPlano} value={pago.referencia} onChange={e => setPago(p => ({ ...p, referencia: e.target.value }))} placeholder="Ej: TRF-20260817-001" />
            </div>
            <label style={styles.campoLabel}>
                <span style={styles.etiqueta}>Notas</span>
                <textarea className="campo-ed" style={{ ...styles.inputPlano, minHeight: 60 }} value={pago.notas} onChange={e => setPago(p => ({ ...p, notas: e.target.value }))} />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button onClick={guardarPago} style={styles.btnPrimario}>Guardar información de pago</button>
                {!pago.anulado && pago.estado !== 'Pendiente' && <button onClick={anularPago} style={{ ...styles.btnSecundario, color: t.rojo }}>Anular pago</button>}
                {pago.anulado && <button onClick={restaurarPago} style={styles.btnSecundario}>Restaurar pago</button>}
            </div>
        </div>
    );
}
