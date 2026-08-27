// Extraído de TratamientoScreen.jsx — ver plan de robustecimiento, punto 6 (mismo criterio
// que TabTareas/TabEquiposMateriales). El botón "Terminar planificación" vive acá porque así
// estaba en el original (pestaña 3), aunque su condición (puedeTerminarPlanificacion) depende
// de datos de las pestañas 1 y 2 — se recibe ya calculada, no se recalcula acá.
import { t, styles, CLP } from './comunTratamiento';

const GRID_LOGISTICA = '96px 96px minmax(200px,1fr) 62px 96px 100px 140px 24px';
// Mismo problema y mismo fix que GRID_TAREAS_MIN_W (TabTareas.jsx).
const GRID_LOGISTICA_MIN_W = 96 + 96 + 200 + 62 + 96 + 100 + 140 + 24 + 7 * 8 + 32;

export default function TabSuministrosDirectos({
    logistica, suministrosDB, actualizarLogistica, agregarLogistica, eliminarLogistica,
    disponibilidadSuministro, soloLecturaPlanificacion,
    puedeTerminarPlanificacion, todasTareasCompletas, equiposHerramientasConCosto, informeEvaluacion,
    guardarPlanificacion, navigate, otIdParaOC,
}) {
    return (
        <div style={{ padding: '0 0 16px', ...(soloLecturaPlanificacion ? { pointerEvents: 'none', opacity: .6 } : {}) }}>
            <div style={{ ...styles.tablaHeader(GRID_LOGISTICA), minWidth: GRID_LOGISTICA_MIN_W }}>
                <span>Código</span><span>Patente</span><span>Descripción</span>
                <span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>Unitario</span>
                <span style={{ textAlign: 'right' }}>Subtotal</span><span>Stock</span><span />
            </div>
            {(logistica || []).map((l, idx) => {
                const codigo = l.codigo || l.unidad;
                const disponible = disponibilidadSuministro(codigo);
                const falta = disponible !== null && Number(l.cantidad) > disponible;
                return (
                    <div key={l._id || idx} style={{ ...styles.tablaFila(GRID_LOGISTICA), minWidth: GRID_LOGISTICA_MIN_W }}>
                        <input
                            list="lista-suministros-recursos" className="campo-ed" style={styles.inputCelda}
                            placeholder="Buscar código…" value={codigo || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                actualizarLogistica(idx, 'codigo', val);
                                actualizarLogistica(idx, 'unidad', val);
                                const match = (suministrosDB || []).find(s => s.codigo?.toLowerCase() === val.toLowerCase() || s.descripcion?.toLowerCase() === val.toLowerCase());
                                if (match) {
                                    actualizarLogistica(idx, 'codigo', match.codigo);
                                    actualizarLogistica(idx, 'descripcion', match.descripcion);
                                    actualizarLogistica(idx, 'precio', Number(match.precio) || 0);
                                }
                            }}
                        />
                        <input className="campo-ed" style={styles.inputCelda} value={l.patente || ''} onChange={e => actualizarLogistica(idx, 'patente', e.target.value)} />
                        <input className="campo-ed" style={styles.inputCelda} value={l.descripcion || ''} placeholder="Descripción del suministro" onChange={e => actualizarLogistica(idx, 'descripcion', e.target.value)} />
                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={l.cantidad || 1} onChange={e => actualizarLogistica(idx, 'cantidad', e.target.value)} />
                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={l.precio || 0} onChange={e => actualizarLogistica(idx, 'precio', e.target.value)} />
                        <span style={styles.celdaSubtotal}>{CLP((Number(l.cantidad) || 0) * (Number(l.precio) || 0))}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {disponible === null ? <span style={{ color: t.textoDeshabilitado, fontSize: 11 }}>—</span> : (
                                <span style={{ fontSize: 11, fontWeight: 600, color: falta ? t.rojo : t.verde }}>{falta ? `falta ${Number(l.cantidad) - disponible}` : disponible}</span>
                            )}
                            {falta && (
                                <button
                                    title="Generar Orden de Compra para cubrir el faltante"
                                    onClick={() => navigate('/compras', { state: { otId: otIdParaOC, suministroId: (suministrosDB || []).find(s => s.codigo === codigo)?._id || '', descripcion: l.descripcion, cantidad: Number(l.cantidad) - disponible, precioUnitario: Number(l.precio) || 0 } })}
                                    style={styles.btnOC}
                                >Generar OC</button>
                            )}
                        </span>
                        <span onClick={() => eliminarLogistica(idx)} style={styles.xFila}>×</span>
                    </div>
                );
            })}
            <div style={{ padding: '8px 16px' }}>
                <button onClick={agregarLogistica} style={styles.btnAgregar}>Agregar suministro</button>
            </div>
            <div style={{ ...styles.continuarWrap, justifyContent: 'space-between' }}>
                {puedeTerminarPlanificacion
                    ? <span style={{ fontSize: 11.5, color: t.verde, fontWeight: 600 }}>Tareas, equipos y suministros definidos</span>
                    : <span style={{ fontSize: 11.5, color: t.rojo, fontWeight: 600 }}>
                        {!todasTareasCompletas ? 'Completa descripción, puesto, responsable, horas, fecha, hora y $/hora de todas las tareas'
                            : !equiposHerramientasConCosto ? 'Todo equipo o herramienta debe tener un costo mayor a $0'
                                : 'El informe inicial tiene observaciones sin resolver'}
                    </span>}
                <button
                    onClick={() => guardarPlanificacion('Planificada')}
                    disabled={!puedeTerminarPlanificacion}
                    title={
                        !todasTareasCompletas ? 'Completa descripción, puesto, responsable, horas, fecha, hora y $/hora de todas las tareas'
                            : !equiposHerramientasConCosto ? 'Todo equipo o herramienta debe tener un costo mayor a $0'
                                : informeEvaluacion.revision?.estado === 'ConObservaciones' ? 'El informe inicial tiene observaciones sin resolver'
                                    : ''
                    }
                    style={{ ...styles.btnPrimario, opacity: puedeTerminarPlanificacion ? 1 : .5 }}
                >Terminar planificación</button>
            </div>
        </div>
    );
}
