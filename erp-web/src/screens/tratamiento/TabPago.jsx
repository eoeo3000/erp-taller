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

// Se convierte a data-URI en el navegador (igual que las fotos del editor de informe en
// TratamientoScreen) — el backend lo guarda como archivo real en uploads/ recién al guardar
// (otController.actualizarOT), no hace falta un endpoint de subida aparte.
function archivoADataUri(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(archivo);
    });
}

// Bloque repetido para cada uno de los 3 documentos del flujo chileno de pago (Orden de
// Compra → Estado de Pago/EDP → Hoja de Entrada de Servicio/HES) — número + adjuntar archivo.
// Cualquiera de los dos lados (oficina acá, cliente desde Cuenta y Pago) puede completarlo.
function DocumentoPago({ titulo, numero, archivo, onNumero, onArchivo }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <span style={styles.etiqueta}>{titulo}</span>
            <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                <input className="campo-ed" style={{ ...styles.inputPlano, flex: 1 }} value={numero} onChange={e => onNumero(e.target.value)} placeholder="Número" />
                <label style={{ ...styles.btnSecundario, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    {archivo ? 'Reemplazar' : 'Adjuntar'}
                    <input
                        type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                        onChange={async e => { const f = e.target.files?.[0]; if (f) onArchivo(await archivoADataUri(f)); e.target.value = ''; }}
                    />
                </label>
                {archivo && (
                    <a href={archivo} target="_blank" rel="noreferrer" style={{ ...styles.btnSecundario, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Ver</a>
                )}
            </div>
        </div>
    );
}

export default function TabPago({
    pago, setPago, granTotal, guardarPago, anularPago, restaurarPago,
    ordenCompra, setOrdenCompra, ordenCompraArchivo, setOrdenCompraArchivo,
    estadoOT, informeFinal, enviarInformeFinal, enviandoInforme,
    verInformePDF, descargarInformePDF, abrirEditorInforme,
}) {
    // El informe (Solicitud + Informe Inicial + plan + lo reportado en terreno) solo tiene
    // sentido una vez terminado el trabajo — antes de eso no hay nada completo que mostrarle
    // al cliente. Ver plan/planificación con el usuario: el botón vive acá (Pago), no en
    // Ejecución, aunque el contenido se arma a partir de datos que sí viven ahí.
    const puedeEnviarInforme = ['Trabajo Terminado', 'Con Informe'].includes(estadoOT);

    // "Pagado" ya no es un selector manual (Pendiente/Parcial/Pagado) — se considera pagado
    // solo cuando los 3 documentos están completos, ver TratamientoScreen.documentosPagoCompletos
    // (mismo criterio, recalculado también en el backend). Acá solo se muestra el estado
    // guardado; el cálculo en vivo para decidir qué guardar vive en guardarPago.
    const pagado = pago.estado === 'Pagado' && !pago.anulado;

    return (
        <div style={{ maxWidth: 520, padding: 16 }}>
            {puedeEnviarInforme && (
                <div style={{ marginBottom: 16, padding: '10px 12px', background: t.barraFiltrosPie, borderLeft: `2px solid ${informeFinal?.enviado ? t.verde : t.acento}`, borderRadius: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: informeFinal?.enviado ? t.verde : t.textoPrincipal }}>
                        {informeFinal?.enviado ? 'Informe enviado' : 'Informe al cliente'}
                    </div>
                    {informeFinal?.enviado && (
                        <div style={{ fontSize: 11.5, color: t.textoSecundario2, marginTop: 4 }}>
                            El cliente ya puede ver el detalle completo de lo ejecutado en su Portal — {horasDesde(informeFinal.fechaEnvio)}.
                        </div>
                    )}
                    {!informeFinal?.enviado && (
                        <div style={{ fontSize: 11.5, color: t.textoSecundario2, marginTop: 4 }}>
                            Todavía no se compartió con el cliente el detalle de lo ejecutado (plan, comentarios y fotos de terreno).
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        <button onClick={abrirEditorInforme} style={styles.btnSecundario}>Editar informe</button>
                        <button onClick={verInformePDF} style={styles.btnSecundario}>Ver informe</button>
                        <button onClick={descargarInformePDF} style={styles.btnSecundario}>Descargar PDF</button>
                        {!informeFinal?.enviado && (
                            <button onClick={enviarInformeFinal} disabled={enviandoInforme} style={{ ...styles.btnPrimario, opacity: enviandoInforme ? .6 : 1 }}>
                                {enviandoInforme ? 'Enviando…' : 'Enviar informe al cliente'}
                            </button>
                        )}
                    </div>
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

            <div style={{ marginBottom: 14, padding: '10px 12px', background: t.barraFiltrosPie, borderLeft: `2px solid ${pagado ? t.verde : t.acento}`, borderRadius: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: pagado ? t.verde : t.textoPrincipal }}>
                    {pagado ? 'Pagado' : 'Pendiente'}
                </div>
                <div style={{ fontSize: 11.5, color: t.textoSecundario2, marginTop: 4 }}>
                    Se considera pagado cuando estén los 3 documentos: Orden de Compra, Estado de Pago y Hoja de Entrada de Servicio.
                </div>
            </div>

            <DocumentoPago
                titulo="Orden de Compra (OC)" numero={ordenCompra} archivo={ordenCompraArchivo}
                onNumero={setOrdenCompra} onArchivo={setOrdenCompraArchivo}
            />
            <DocumentoPago
                titulo="Estado de Pago (EDP)" numero={pago.estadoPago?.numero || ''} archivo={pago.estadoPago?.archivo || ''}
                onNumero={v => setPago(p => ({ ...p, estadoPago: { ...(p.estadoPago || {}), numero: v } }))}
                onArchivo={v => setPago(p => ({ ...p, estadoPago: { ...(p.estadoPago || {}), archivo: v } }))}
            />
            <DocumentoPago
                titulo="Hoja de Entrada de Servicio (HES)" numero={pago.hes?.numero || ''} archivo={pago.hes?.archivo || ''}
                onNumero={v => setPago(p => ({ ...p, hes: { ...(p.hes || {}), numero: v } }))}
                onArchivo={v => setPago(p => ({ ...p, hes: { ...(p.hes || {}), archivo: v } }))}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '8px 12px', alignItems: 'center', margin: '12px 0' }}>
                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>Monto pagado</span>
                <input type="number" className="campo-ed" style={styles.inputPlano} value={pago.montoPagado} onChange={e => setPago(p => ({ ...p, montoPagado: Number(e.target.value) }))} />
                <span style={{ fontSize: 11.5, color: t.textoSecundario3 }}>Fecha de pago</span>
                <input type="date" className="campo-ed" style={styles.inputPlano} value={pago.fechaPago} onChange={e => setPago(p => ({ ...p, fechaPago: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button onClick={guardarPago} style={styles.btnPrimario}>Guardar información de pago</button>
                {!pago.anulado && pago.estado === 'Pagado' && <button onClick={anularPago} style={{ ...styles.btnSecundario, color: t.rojo }}>Anular pago</button>}
                {pago.anulado && <button onClick={restaurarPago} style={styles.btnSecundario}>Restaurar pago</button>}
            </div>
        </div>
    );
}
