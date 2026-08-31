import { useState, Fragment } from 'react';
import { actualizarOrdenCompra, actualizarEdp, actualizarHes } from '../api.js';

// Se convierte a data-URI en el navegador — el backend lo guarda como archivo real recién al
// guardar (portalController.actualizarOrdenCompra/actualizarEdp/actualizarHes), no hace falta
// un endpoint de subida aparte. Mismo criterio que TabPago.jsx en erp-web (duplicado acá
// porque no hay forma de compartir código entre erp-web y las PWA).
function archivoADataUri(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(archivo);
    });
}

// Bloque repetido para cada uno de los 3 documentos del flujo chileno de pago (Orden de
// Compra → Estado de Pago/EDP → Hoja de Entrada de Servicio/HES) — número + adjuntar archivo +
// guardar. La oficina también puede completarlos desde su lado (TabPago, erp-web).
function BloqueDocumento({ titulo, estado, setEstado, onGuardar }) {
    return (
        <div style={{ marginBottom: 18 }}>
            <div className="versalita" style={{ marginBottom: 6 }}>{titulo}</div>
            <input
                className="input-campo"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
                value={estado.numero}
                onChange={(e) => setEstado((s) => ({ ...s, numero: e.target.value, guardado: false }))}
                placeholder="Número"
            />
            {estado.error && <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--detenido)', marginBottom: 8 }}>{estado.error}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label className="boton-secundario" style={{ width: 'auto', padding: '0 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                    {estado.archivo ? 'Reemplazar archivo' : 'Adjuntar archivo'}
                    <input
                        type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                        onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                                const dataUri = await archivoADataUri(f);
                                setEstado((s) => ({ ...s, archivo: dataUri, guardado: false }));
                            }
                            e.target.value = '';
                        }}
                    />
                </label>
                {estado.archivo && (
                    <a href={estado.archivo} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--fs-secundario)', color: 'var(--en-curso)' }}>Ver archivo</a>
                )}
                <button className="boton-secundario" style={{ width: 'auto', padding: '0 20px' }} disabled={estado.guardando} onClick={onGuardar}>
                    {estado.guardando ? 'Guardando…' : 'Guardar'}
                </button>
                {estado.guardado && <span style={{ fontSize: 'var(--fs-secundario)', color: 'var(--listo)' }}>Guardado</span>}
            </div>
        </div>
    );
}

const CLP = (n) => '$ ' + Math.round(n || 0).toLocaleString('es-CL');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtCortaGuion = (fechaStr) => {
    if (!fechaStr) return '';
    const [, mm, dd] = fechaStr.split('-');
    return `${dd} ${MESES[parseInt(mm, 10) - 1]}`;
};

// Mismo cálculo que TratamientoScreen.diasPlanificados (erp-web) — duplicado acá porque no
// hay forma de compartir código entre erp-web y las PWA (mismo criterio que otros duplicados
// del repo, ver utils/motorSugerencia.js en erp-web). Rango de días entre la primera y la
// última tarea con fecha, para armar la misma grilla de Cronograma que ve el escritorio.
function diasPlanificadosDe(tareas) {
    const conFecha = (tareas || []).filter((t) => t.fecha);
    if (!conFecha.length) return [];
    const fechasMs = conFecha.map((t) => new Date(t.fecha).getTime());
    const inicioMs = Math.min(...fechasMs);
    const finMs = Math.max(...fechasMs);
    const dias = [];
    let actual = new Date(inicioMs);
    const fin = new Date(finMs);
    while (actual <= fin) {
        dias.push(actual.toISOString().split('T')[0]);
        actual.setDate(actual.getDate() + 1);
    }
    return dias;
}

const ETIQUETAS_CONDICIONES = [
    ['validez', 'Validez'], ['plazoPago', 'Plazo de pago'], ['formaPago', 'Forma de pago'],
    ['garantia', 'Garantía'], ['plazoEjecucion', 'Plazo de ejecución'], ['noIncluye', 'No incluye'],
];

// "Documentos" en el handoff pide dos filas con Ver PDF, pero hoy solo existe una fuente
// real de documento por OT: la cotización (el resto del sistema tampoco genera un PDF
// server-side, TratamientoScreen arma el suyo con jspdf al vuelo). En vez de inventar un
// segundo documento que no existe, se deja una sola fila real; ver reporte de esta fase.
//
// La vista "Ver PDF" replica las mismas secciones que TratamientoScreen (erp-web) — Tareas
// (qué/con quién/cuándo/cómo), Equipos y materiales, Suministros directos, Cronograma y
// Condiciones comerciales — para que el cliente vea exactamente lo mismo que se cotizó en
// el escritorio, no un resumen recortado.
export default function C5CuentaPago({ nav, trabajo: trabajoProp }) {
    const [verCotizacion, setVerCotizacion] = useState(false);
    const [trabajo, setTrabajo] = useState(trabajoProp);
    const [oc, setOc] = useState({ numero: trabajoProp?.ot?.ordenCompra || '', archivo: trabajoProp?.ot?.ordenCompraArchivo || '', guardando: false, guardado: false, error: '' });
    const [edp, setEdp] = useState({ numero: trabajoProp?.ot?.pago?.estadoPago?.numero || '', archivo: trabajoProp?.ot?.pago?.estadoPago?.archivo || '', guardando: false, guardado: false, error: '' });
    const [hes, setHes] = useState({ numero: trabajoProp?.ot?.pago?.hes?.numero || '', archivo: trabajoProp?.ot?.pago?.hes?.archivo || '', guardando: false, guardado: false, error: '' });
    if (!trabajo) return null;
    const ot = trabajo.ot;

    const guardarDocumento = async (estado, setEstado, accion) => {
        setEstado((s) => ({ ...s, guardando: true, error: '', guardado: false }));
        try {
            const resultado = await accion(ot._id, estado.numero, estado.archivo);
            setTrabajo((t) => ({ ...t, ot: resultado.ot }));
            setEstado((s) => ({ ...s, guardando: false, guardado: true }));
        } catch (e) {
            setEstado((s) => ({ ...s, guardando: false, error: e.message }));
        }
    };

    const totalNeto = ot?.granTotal || 0;
    const iva = totalNeto * 0.19;
    const totalBruto = totalNeto + iva;
    const pagado = ot?.pago?.montoPagado || 0;
    // Antes restaba pagado del NETO — igual que TratamientoScreen.TabPago (erp-web), lo que
    // realmente se cobra/paga es el total CON IVA. Con el cálculo viejo, el saldo pendiente
    // que veía el cliente acá quedaba 19% más bajo que lo que la oficina espera cobrar.
    const saldo = totalBruto - pagado;

    if (verCotizacion) {
        const dias = diasPlanificadosDe(ot?.tareas);
        const condiciones = ot?.condicionesComerciales;
        const hayCondiciones = condiciones && ETIQUETAS_CONDICIONES.some(([campo]) => (condiciones[campo] || '').trim());

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
                        <div style={{ marginTop: 18, overflowX: 'auto' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-atenuado-2)' }}>Tareas — qué, con quién, cuándo y cómo</div>
                            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', marginTop: 6 }}>
                                <thead>
                                    <tr>
                                        <ThDoc>Tarea</ThDoc><ThDoc>Puesto</ThDoc><ThDoc>Responsables</ThDoc>
                                        <ThDoc>Fecha</ThDoc><ThDoc>Hora</ThDoc><ThDoc alinDerecha>Hrs</ThDoc>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ot.tareas.map((t, i) => (
                                        <Fragment key={i}>
                                            <tr>
                                                <TdDoc>{t.descripcion || '—'}</TdDoc>
                                                <TdDoc>{t.puesto || '—'}</TdDoc>
                                                <TdDoc>{(t.operarioNombre || []).join(', ') || '—'}</TdDoc>
                                                <TdDoc>{t.fecha ? fmtCortaGuion(t.fecha) : '—'}</TdDoc>
                                                <TdDoc>{t.hora || '—'}</TdDoc>
                                                <TdDoc alinDerecha>{t.duracion || 0}</TdDoc>
                                            </tr>
                                            {(t.desarrollo || '').trim() && (
                                                <tr>
                                                    <td colSpan={6} style={{ ...estiloTd, color: 'var(--texto-atenuado-1)', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                                                        Metodología: {t.desarrollo}
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {ot?.componentes?.length > 0 && (
                        <TablaDoc
                            titulo="Equipos y materiales"
                            columnas={['Descripción', 'Tipo', 'Cant.', 'Unitario', 'Subtotal']}
                            filas={ot.componentes.map((c) => [c.descripcion || '—', c.tipo || '—', c.cantidad || 0, CLP(c.precio || 0), CLP(c.subtotal)])}
                        />
                    )}

                    {ot?.logistica?.length > 0 && (
                        <TablaDoc
                            titulo="Suministros directos"
                            columnas={['Descripción', 'Cant.', 'Unitario', 'Subtotal']}
                            filas={ot.logistica.map((l) => [l.descripcion || '—', l.cantidad || 0, CLP(l.precio || 0), CLP(l.subtotal)])}
                        />
                    )}

                    {dias.length > 0 && (
                        <div style={{ marginTop: 18, overflowX: 'auto' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-atenuado-2)' }}>Cronograma</div>
                            {/* Tarea/Responsables con ancho tope + elipsis — antes sin límite, con
                                varios responsables en una tarea empujaban las columnas de días
                                bien afuera de pantalla (pedido explícito del usuario: "el
                                cronograma se desborda con los responsables"). El nombre completo
                                sigue disponible en la tabla de Tareas más arriba. */}
                            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', marginTop: 6, tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: 110 }} /><col style={{ width: 90 }} />
                                    {dias.map((dia) => <col key={dia} />)}
                                </colgroup>
                                <thead>
                                    <tr>
                                        <ThDoc>Tarea</ThDoc><ThDoc>Responsables</ThDoc>
                                        {dias.map((dia) => <ThDoc key={dia}>{fmtCortaGuion(dia)}</ThDoc>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {ot.tareas.map((t, i) => (
                                        <tr key={i}>
                                            <TdDoc style={estiloTruncado}>{t.descripcion}</TdDoc>
                                            <TdDoc style={estiloTruncado}>{(t.operarioNombre || []).join(', ') || '—'}</TdDoc>
                                            {dias.map((dia) => (
                                                <td key={dia} style={{ ...estiloTd, textAlign: 'center' }}>
                                                    {t.fecha === dia && (
                                                        <span className="mono" style={{ background: 'var(--en-curso)', color: '#fff', borderRadius: 2, padding: '2px 4px', fontSize: 10.5 }}>{t.hora}</span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {hayCondiciones && (
                        <div style={{ marginTop: 18 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-atenuado-2)' }}>Condiciones comerciales</div>
                            {ETIQUETAS_CONDICIONES.filter(([campo]) => (condiciones[campo] || '').trim()).map(([campo, label]) => (
                                <div key={campo} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, padding: '4px 0', fontSize: 13 }}>
                                    <span style={{ color: 'var(--texto-atenuado-1)' }}>{label}</span>
                                    <span>{condiciones[campo]}</span>
                                </div>
                            ))}
                        </div>
                    )}

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

            <div style={{ padding: '14px 16px' }}>
                <div className="versalita" style={{ marginBottom: 4 }}>Documentos de pago</div>
                <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-1)', marginBottom: 14 }}>
                    Con estos 3 documentos completos el pago queda registrado — la oficina también puede completarlos por su cuenta.
                </div>
                <BloqueDocumento titulo="Orden de Compra (OC)" estado={oc} setEstado={setOc} onGuardar={() => guardarDocumento(oc, setOc, actualizarOrdenCompra)} />
                <BloqueDocumento titulo="Estado de Pago (EDP)" estado={edp} setEstado={setEdp} onGuardar={() => guardarDocumento(edp, setEdp, actualizarEdp)} />
                <BloqueDocumento titulo="Hoja de Entrada de Servicio (HES)" estado={hes} setEstado={setHes} onGuardar={() => guardarDocumento(hes, setHes, actualizarHes)} />
            </div>

            <div style={{ padding: '14px 16px 4px' }} className="versalita">Detalle</div>
            {/* OT.tareas no trae un monto por tarea (la tarifa por hora es interna, no se le
                manda al cliente — ver otController.otPublica) — pero sí el agregado
                totalManoObra, calculado en el backend, así que la mano de obra queda visible
                como un solo monto en vez de invisible dentro del total. */}
            {ot?.totalManoObra > 0 && <FilaDetalle concepto="Mano de obra" monto={ot.totalManoObra} />}
            {ot?.componentes?.map((c, i) => <FilaDetalle key={i} concepto={c.descripcion} subtitulo={`${c.cantidad} un.`} monto={c.subtotal} />)}
            {ot?.logistica?.map((l, i) => <FilaDetalle key={i} concepto={l.descripcion} subtitulo={`${l.cantidad} un.`} monto={l.subtotal} />)}
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

const estiloTd = { padding: '5px 8px', borderBottom: '1px solid var(--linea-fina)', whiteSpace: 'nowrap' };
const estiloTh = { ...estiloTd, textAlign: 'left', fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', color: 'var(--texto-atenuado-2)', background: 'var(--fondo-pantalla)' };
// Solo para Tarea/Responsables del Cronograma — corta con "…" en vez de empujar las columnas
// de días fuera de pantalla (ver tableLayout:'fixed' + colgroup en esa tabla).
const estiloTruncado = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function ThDoc({ children, alinDerecha }) {
    return <th style={{ ...estiloTh, textAlign: alinDerecha ? 'right' : 'left' }}>{children}</th>;
}
function TdDoc({ children, alinDerecha, style }) {
    return <td style={{ ...estiloTd, textAlign: alinDerecha ? 'right' : 'left', ...style }}>{children}</td>;
}

function TablaDoc({ titulo, columnas, filas }) {
    return (
        <div style={{ marginTop: 18, overflowX: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-atenuado-2)' }}>{titulo}</div>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', marginTop: 6 }}>
                <thead>
                    <tr>{columnas.map((c, i) => <ThDoc key={c} alinDerecha={i > 0}>{c}</ThDoc>)}</tr>
                </thead>
                <tbody>
                    {filas.map((fila, i) => (
                        <tr key={i}>{fila.map((valor, j) => <TdDoc key={j} alinDerecha={j > 0}>{valor}</TdDoc>)}</tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
