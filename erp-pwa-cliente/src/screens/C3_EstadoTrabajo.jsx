// Mismo idx/MAPA_ETAPA que ya usan DashboardScreen.jsx y TratamientoScreen.jsx en
// erp-web (duplicado ahí también, no importado de un módulo común — mismo criterio).
// Las etiquetas acá son la traducción a lenguaje de cliente de esas mismas 8 posiciones.
const ETAPAS_CLIENTE = [
    'Solicitud recibida', 'En evaluación', 'Presupuesto aceptado', 'Visita programada',
    'En ejecución', 'Trabajo terminado', 'Informe entregado', 'Pagado',
];
const MAPA_ETAPA = {
    Tratada: 1, Planificada: 2, Programada: 3,
    'En Ejecución': 4, 'Trabajo Terminado': 5, 'Con Informe': 6, Pagada: 7,
};

// 'Aprobada'/'Rechazada' ya no son valores de OT.estado — un rechazo se detecta por
// cotizacion.respuestaCliente sin sacar a la OT de 'Planificada' (ver erp-backend/src/models/OT.js).
function etapaInfo(ot) {
    if (!ot) return { idx: 0, label: ETAPAS_CLIENTE[0], rechazada: false };
    if (ot.estado === 'Planificada' && ot.cotizacion?.respuestaCliente === 'Rechazada') {
        return { idx: 2, label: 'Presupuesto rechazado', rechazada: true };
    }
    const idx = MAPA_ETAPA[ot.estado] ?? 0;
    return { idx, label: ETAPAS_CLIENTE[idx], rechazada: false };
}

const CLP = (n) => '$ ' + Math.round(n || 0).toLocaleString('es-CL');
const fmtLarga = (iso) => iso ? new Date((iso + '').split('T')[0] + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
const fmtCorta = (iso) => iso ? new Date((iso + '').split('T')[0] + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : '';

function lineaCliente(ot) {
    if (!ot) return 'Su solicitud está siendo evaluada.';
    if (ot.estado === 'Planificada' && ot.cotizacion?.respuestaCliente === 'Rechazada') return 'El presupuesto no fue aceptado.';
    if (ot.estado === 'Programada') {
        const fecha = (ot.tareas || []).map((t) => t.fecha).filter(Boolean).sort()[0];
        return fecha ? `Nuestro equipo llega el ${fmtLarga(fecha)}.` : 'Su trabajo está programado.';
    }
    if (ot.estado === 'En Ejecución') return 'Nuestro equipo está trabajando en su solicitud.';
    if (['Trabajo Terminado', 'Con Informe'].includes(ot.estado)) return 'El trabajo en terreno está terminado.';
    if (ot.estado === 'Pagada') return 'Trabajo completado y pagado.';
    return 'En preparación.';
}

export default function C3EstadoTrabajo({ nav, trabajo }) {
    if (!trabajo) return null;
    const ot = trabajo.ot;
    const info = etapaInfo(ot);
    const color = info.rechazada ? 'var(--detenido)' : 'var(--en-curso)';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }} className="mono">‹</button>
                <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{trabajo.numeroSolicitud || ot?.numeroOT}</span>
            </header>

            <div style={{ padding: 16 }}>
                <div style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>{trabajo.descripcion}</div>
            </div>

            <div className="franja">
                <div style={{ fontSize: 'var(--fs-titulo)', fontWeight: 700, color }}>{info.label}</div>
                <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-1)', marginTop: 4 }}>{lineaCliente(ot)}</div>
            </div>

            <div style={{ padding: '14px 16px 4px' }} className="versalita">Recorrido</div>
            <div>
                {ETAPAS_CLIENTE.map((label, i) => {
                    const cumplida = i < info.idx;
                    const esActual = i === info.idx;
                    const texto = info.rechazada && esActual ? 'Presupuesto rechazado' : label;
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

            {ot?.granTotal > 0 && (
                <div style={{ padding: 16 }}>
                    <div className="versalita">Presupuesto</div>
                    <div className="mono" style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{CLP(ot.granTotal)}</div>
                </div>
            )}

            <div style={{ flex: 1 }} />
            <div className="pie-accion" style={{ flexDirection: 'row' }}>
                {ot?.granTotal > 0 && <button className="boton-secundario" onClick={() => nav.ir('c5', { trabajo })}>Cuenta y pago</button>}
                {['En Ejecución', 'Trabajo Terminado', 'Con Informe'].includes(ot?.estado) && (
                    <button className="boton-secundario" onClick={() => nav.ir('c4', { trabajo })}>Avance</button>
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
