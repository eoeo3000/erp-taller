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
    const pagado = ot?.pago?.montoPagado || 0;
    const saldo = totalNeto - pagado;

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
                    {ot?.tareas?.length > 0 && <BloqueDoc titulo="Mano de obra" filas={ot.tareas.map((t) => [t.descripcion, `${t.duracion} h`])} />}
                    {ot?.componentes?.length > 0 && <BloqueDoc titulo="Materiales y equipos" filas={ot.componentes.map((c) => [c.nombre, CLP(c.subtotal)])} />}
                    {ot?.logistica?.length > 0 && <BloqueDoc titulo="Logística" filas={ot.logistica.map((l) => [l.descripcion, CLP(l.subtotal)])} />}
                    <div style={{ marginTop: 16, borderTop: '2px solid var(--texto-principal)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                        <span>Total</span><span className="mono">{CLP(totalNeto)}</span>
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
            {/* OT.tareas no trae un monto por tarea (la mano de obra no se itemiza en precio,
                solo en horas — igual que en la cotización de escritorio, PortalClienteScreen
                CotizacionView) — no hay una fila de "Mano de obra" con monto real que mostrar. */}
            {ot?.componentes?.map((c, i) => <FilaDetalle key={i} concepto={c.nombre} subtitulo={`${c.cantidad} un.`} monto={c.subtotal} />)}
            {ot?.logistica?.map((l, i) => <FilaDetalle key={i} concepto={l.descripcion} monto={l.subtotal} />)}
            <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: 'var(--fondo-pantalla)', fontWeight: 700 }}>
                <span>Total</span><span className="mono">{CLP(totalNeto)}</span>
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
