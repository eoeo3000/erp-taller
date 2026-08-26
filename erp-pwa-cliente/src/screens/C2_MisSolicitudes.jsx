import { useEffect, useState } from 'react';
import { misSolicitudes, getSesion, cerrarSesion } from '../api.js';

const CLP = (n) => '$ ' + Math.round(n || 0).toLocaleString('es-CL');
const fmt = (iso) => iso ? new Date((iso + '').split('T')[0] + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : '';

const COLOR = { activo: 'var(--en-curso)', pago: 'var(--atencion)', cerrado: 'var(--listo)', rechazado: 'var(--detenido)', neutro: 'var(--deshabilitado-1)' };

// 'Aprobada'/'Rechazada' ya no son valores de OT.estado — un rechazo se detecta por
// cotizacion.respuestaCliente sin sacar a la OT de 'Planificada' (ver erp-backend/src/models/OT.js).
function clasificar(t) {
    const ot = t.ot;
    if (!ot) return { grupo: 'en_curso', color: COLOR.activo, linea: 'En evaluación' };
    if (ot.estado === 'Planificada' && ot.cotizacion?.enviada && ot.cotizacion?.respuestaCliente === 'Pendiente') {
        return { grupo: 'por_aprobar', color: COLOR.pago, linea: 'Cotización lista — requiere tu aprobación' };
    }
    // Excepción ("extensión de cotización") pendiente — puede pasar con la OT en cualquier
    // estado (típicamente 'En Ejecución'), no solo 'Planificada' como la cotización inicial.
    if (ot.excepciones?.some((e) => e.estado === 'Enviada')) {
        return { grupo: 'por_aprobar', color: COLOR.pago, linea: 'Costo adicional — requiere tu aprobación' };
    }
    if (ot.estado === 'Planificada' && ot.cotizacion?.respuestaCliente === 'Rechazada') {
        return { grupo: 'cerradas', color: COLOR.rechazado, linea: 'Presupuesto no aceptado' };
    }
    if (['Tratada', 'Planificada'].includes(ot.estado)) return { grupo: 'en_curso', color: COLOR.activo, linea: 'Presupuesto en preparación' };
    if (ot.estado === 'Programada') {
        const fecha = (ot.tareas || []).map((tt) => tt.fecha).filter(Boolean).sort()[0];
        return { grupo: 'en_curso', color: COLOR.activo, linea: fecha ? `Llegamos el ${fmt(fecha)}` : 'Programado' };
    }
    if (ot.estado === 'En Ejecución') {
        const total = (ot.tareas || []).length;
        const ok = (ot.tareas || []).filter((tt) => tt.completada).length;
        return { grupo: 'en_curso', color: COLOR.activo, linea: 'En ejecución', avance: total ? ok / total : 0 };
    }
    if (['Trabajo Terminado', 'Con Informe'].includes(ot.estado)) {
        const saldo = (ot.granTotal || 0) - (ot.pago?.montoPagado || 0);
        return { grupo: 'por_pagar', color: COLOR.pago, linea: `Saldo ${CLP(saldo)}` };
    }
    if (ot.estado === 'Pagada') {
        return { grupo: 'cerradas', color: COLOR.cerrado, linea: `${CLP(ot.granTotal)} · ${fmt(t.fechaCreacion)}` };
    }
    return { grupo: 'en_curso', color: COLOR.neutro, linea: ot.estado };
}

const CHIPS = [
    { id: 'todas', label: 'Todas' },
    { id: 'por_aprobar', label: 'Por aprobar' },
    { id: 'en_curso', label: 'En curso' },
    { id: 'por_pagar', label: 'Por pagar' },
    { id: 'cerradas', label: 'Cerradas' },
];

export default function C2MisSolicitudes({ nav }) {
    const [datos, setDatos] = useState(null);
    const [filtro, setFiltro] = useState('todas');
    const [error, setError] = useState('');
    const sesion = getSesion();

    useEffect(() => {
        misSolicitudes().then(setDatos).catch((e) => setError(e.message));
    }, []);

    if (error) return <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div>;
    if (!datos) return null;

    const trabajos = datos.trabajos.map((t) => ({ ...t, clasif: clasificar(t) }));
    const conteos = { todas: trabajos.length };
    for (const c of CHIPS.slice(1)) conteos[c.id] = trabajos.filter((t) => t.clasif.grupo === c.id).length;
    const visibles = filtro === 'todas' ? trabajos : trabajos.filter((t) => t.clasif.grupo === filtro);

    const salir = () => { cerrarSesion(); nav.irRaiz('c1'); };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ padding: '14px 16px', borderBottom: '1px solid var(--linea-zona)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 700 }}>{datos.empresaSolicitante || sesion.empresa}</div>
                </div>
                <button onClick={salir} style={{ background: 'none', border: 'none', color: 'var(--texto-atenuado-1)', fontSize: 'var(--fs-secundario)', cursor: 'pointer' }}>Salir</button>
            </header>

            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 16px', flexWrap: 'nowrap' }}>
                {CHIPS.map((c) => (
                    <button
                        key={c.id} onClick={() => setFiltro(c.id)}
                        style={{
                            flex: 'none', padding: '6px 12px', borderRadius: 20, border: '1px solid var(--linea-zona)',
                            background: filtro === c.id ? 'var(--accion-primaria)' : 'var(--superficie)',
                            color: filtro === c.id ? '#fff' : 'var(--texto-principal)',
                            fontSize: 'var(--fs-secundario)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                    >
                        {c.label} {conteos[c.id]}
                    </button>
                ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {visibles.length === 0 && <div style={{ padding: 24, color: 'var(--texto-atenuado-1)', fontSize: 'var(--fs-cuerpo)' }}>Sin trabajos en esta categoría.</div>}
                {visibles.map((t) => (
                    <button
                        key={t._id} onClick={() => nav.ir('c3', { trabajo: t })}
                        style={{
                            display: 'flex', width: '100%', minHeight: 96, border: 'none', borderBottom: '1px solid var(--linea-fina)',
                            background: 'var(--superficie)', cursor: 'pointer', textAlign: 'left', padding: 0,
                        }}
                    >
                        <div className="barra-estado" style={{ background: t.clasif.color }} />
                        <div style={{ flex: 1, padding: '12px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span className="mono" style={{ fontSize: 'var(--fs-linea-mono)' }}>{t.numeroSolicitud || t.ot?.numeroOT}</span>
                                <span className="mono" style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-1)' }}>{fmt(t.fechaCreacion)}</span>
                            </div>
                            <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 4 }}>{t.descripcion}</div>
                            <div style={{ fontSize: 'var(--fs-secundario)', color: t.clasif.color, marginTop: 4 }}>{t.clasif.linea}</div>
                            {t.clasif.avance != null && (
                                <div style={{ height: 3, background: 'var(--linea-zona)', marginTop: 8 }}>
                                    <div style={{ height: 3, width: `${Math.round(t.clasif.avance * 100)}%`, background: 'var(--en-curso)' }} />
                                </div>
                            )}
                        </div>
                    </button>
                ))}
            </div>

            <div className="pie-accion">
                <button className="boton-secundario" onClick={() => nav.ir('c6')}>Pedir un servicio nuevo</button>
            </div>
        </div>
    );
}
