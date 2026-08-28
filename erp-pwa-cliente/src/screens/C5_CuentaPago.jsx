import { useState } from 'react';

const CLP = (n) => '$ ' + Math.round(n || 0).toLocaleString('es-CL');

// "Documentos" en el handoff pide dos filas con Ver PDF, pero hoy solo existe una fuente
// real de documento por OT: la cotización (el resto del sistema tampoco genera un PDF
// server-side, TratamientoScreen arma el suyo con jspdf al vuelo). En vez de inventar un
// segundo documento que no existe, se deja una sola fila real; ver reporte de esta fase.
export default function C5CuentaPago({ nav, trabajo }) {
    const [verCotizacion, setVerCotizacion] = useState(false);
    if (!trabajo) return null;
    const ot = trabajo.ot;

    const totalNeto = ot?.granTotal || 0;
    const iva = totalNeto * 0.19;
    const totalBruto = totalNeto + iva;
    const pagado = ot?.pago?.montoPagado || 0;
    // Antes restaba pagado del NETO — igual que TratamientoScreen.TabPago (erp-web), lo que
    // realmente se cobra/paga es el total CON IVA. Con el cálculo viejo, el saldo pendiente
    // que veía el cliente acá quedaba 19% más bajo que lo que la oficina espera cobrar.
    const saldo = totalBruto - pagado;

    if (verCotizacion) {
        return (
            <div style={{ minHeight: '100vh' }}>
                <div className="no-imprimir" style={{ display: 'flex', gap: 8, padding: 16 }}>
                    <button className="boton-secundario" onClick={() => setVerCotizacion(false)}>‹ Volver</button>
                    <button className="boton-primario" style={{ width: 'auto', padding: '0 20px' }} onClick={() => window.print()}>Imprimir / Guardar PDF</button>
                </div>
                <div style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>Cotización — {ot?.numeroOT}</div>
                    <div style={{ fontSize: 14, color: 'var(--texto-atenuado-1)', marginTop: 4 }}>{trabajo.empresaSolicitante}</div>
                    {ot?.tareas?.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-atenuado-2)' }}>
                                <span>Mano de obra</span><span className="mono">{CLP(ot.totalManoObra)}</span>
                            </div>
                            {ot.tareas.map((t, i) => (
                                <div key={i} style={{ padding: '4px 0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                                        <span>{t.descripcion}</span><span className="mono">{t.duracion} h</span>
                                    </div>
                                    {/* El "cómo": la metodología planificada por tarea, para que el cliente
                                        vea con qué está de acuerdo antes de aprobar (otPublica ahora la expone). */}
                                    {(t.desarrollo || '').trim() && (
                                        <div style={{ fontSize: 12, color: 'var(--texto-atenuado-1)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{t.desarrollo}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {ot?.componentes?.length > 0 && <BloqueDoc titulo="Materiales y equipos" filas={ot.componentes.map((c) => [c.descripcion, CLP(c.subtotal)])} />}
                    {ot?.logistica?.length > 0 && <BloqueDoc titulo="Suministros directos" filas={ot.logistica.map((l) => [l.descripcion, CLP(l.subtotal)])} />}
                    <div style={{ marginTop: 16, borderTop: `1px solid var(--linea-zona)`, paddingTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                            <span>Total neto</span><span className="mono">{CLP(totalNeto)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--texto-atenuado-1)', marginTop: 3 }}>
                            <span>IVA 19%</span><span className="mono">{CLP(iva)}</span>
                        </div>
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '2px solid var(--texto-principal)', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                            <span>Total con IVA</span><span className="mono">{CLP(totalBruto)}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }} className="mono">‹</button>
                <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Cuenta y pago</span>
            </header>

            <div className="franja">
                <div className="versalita">Saldo pendiente</div>
                <div className="mono" style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>{CLP(saldo)}</div>
                {pagado > 0 && <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-2)', marginTop: 4 }}>Anticipo pagado: {CLP(pagado)}</div>}
            </div>

            <div style={{ padding: '14px 16px 4px' }} className="versalita">Detalle</div>
            {/* OT.tareas no trae un monto por tarea (la tarifa por hora es interna, no se le
                manda al cliente — ver otController.otPublica) — pero sí el agregado
                totalManoObra, calculado en el backend, así que la mano de obra queda visible
                como un solo monto en vez de invisible dentro del total. */}
            {ot?.totalManoObra > 0 && <FilaDetalle concepto="Mano de obra" monto={ot.totalManoObra} />}
            {ot?.componentes?.map((c, i) => <FilaDetalle key={i} concepto={c.descripcion} subtitulo={`${c.cantidad} un.`} monto={c.subtotal} />)}
            {ot?.logistica?.map((l, i) => <FilaDetalle key={i} concepto={l.descripcion} monto={l.subtotal} />)}
            <div style={{ padding: '10px 16px', background: 'var(--fondo-pantalla)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-secundario)' }}>
                    <span>Total neto</span><span className="mono">{CLP(totalNeto)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)', marginTop: 3 }}>
                    <span>IVA 19%</span><span className="mono">{CLP(iva)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 6 }}>
                    <span>Total con IVA</span><span className="mono">{CLP(totalBruto)}</span>
                </div>
            </div>

            <div style={{ padding: '14px 16px 4px' }} className="versalita">Documentos</div>
            <button onClick={() => setVerCotizacion(true)} style={{ minHeight: 56, display: 'flex', alignItems: 'center', padding: '0 16px', border: 'none', borderBottom: '1px solid var(--linea-fina)', background: 'var(--superficie)', color: 'var(--en-curso)', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                Ver PDF — Cotización {ot?.numeroOT}
            </button>

            <div style={{ flex: 1 }} />

            <div className="pie-accion">
                <div className="versalita">Datos para transferir</div>
                <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-1)' }}>
                    Se envían junto con la cotización. Ante dudas, escriba a la oficina.
                </div>
                <div style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-2)', marginTop: 4 }}>
                    No se cobra en línea. El pago se registra en la oficina al recibir la transferencia.
                </div>
            </div>
        </div>
    );
}

function FilaDetalle({ concepto, subtitulo, monto }) {
    if (monto == null) return null;
    return (
        <div style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--linea-fina)' }}>
            <div>
                <div style={{ fontSize: 'var(--fs-secundario)' }}>{concepto}</div>
                {subtitulo && <div style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-1)' }}>{subtitulo}</div>}
            </div>
            <span className="mono" style={{ fontSize: 'var(--fs-secundario)' }}>{CLP(monto)}</span>
        </div>
    );
}

function BloqueDoc({ titulo, filas }) {
    return (
        <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-atenuado-2)' }}>{titulo}</div>
            {filas.map(([a, b], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13.5 }}>
                    <span>{a}</span><span className="mono">{b}</span>
                </div>
            ))}
        </div>
    );
}
