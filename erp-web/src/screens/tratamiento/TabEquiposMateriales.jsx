// Extraído de TratamientoScreen.jsx — ver plan de robustecimiento, punto 6 (mismo criterio
// que TabTareas: el estado sigue en TratamientoScreen, esto solo saca el renderizado).
import { t, styles, CLP } from './comunTratamiento';

const GRID_MATERIALES = '104px 128px minmax(200px,1fr) 62px 96px 100px 100px 24px';
// Mismo problema y mismo fix que GRID_TAREAS_MIN_W (TabTareas.jsx): sin minWidth explícito,
// el fondo de header/filas no cubre las columnas que quedan fuera del ancho disponible.
const GRID_MATERIALES_MIN_W = 104 + 128 + 200 + 62 + 96 + 100 + 100 + 24 + 7 * 8 + 32;

export default function TabEquiposMateriales({
    componentes, componentesDB, actualizarComponente, agregarComponente, eliminarComponente,
    disponibilidadEquipo, soloLecturaPlanificacion, setTabActiva,
}) {
    return (
        <div style={{ padding: '0 0 16px', ...(soloLecturaPlanificacion ? { pointerEvents: 'none', opacity: .6 } : {}) }}>
            <div style={{ ...styles.tablaHeader(GRID_MATERIALES), minWidth: GRID_MATERIALES_MIN_W }}>
                <span>Tipo</span><span>Código</span><span>Descripción</span>
                <span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>Unitario</span>
                <span style={{ textAlign: 'right' }}>Subtotal</span><span>Disponibilidad</span><span />
            </div>
            {componentes.map((c, idx) => {
                const estado = disponibilidadEquipo(c);
                const ok = estado === 'Disponible';
                return (
                    <div key={c.id || idx} style={{ ...styles.tablaFila(GRID_MATERIALES), minWidth: GRID_MATERIALES_MIN_W }}>
                        <input className="campo-ed" style={styles.inputCelda} placeholder="Tipo" value={c.tipo || ''} onChange={e => actualizarComponente(idx, 'tipo', e.target.value)} />
                        <input className="campo-ed" style={styles.inputCelda} value={c.codigo || ''} onChange={e => actualizarComponente(idx, 'codigo', e.target.value)} />
                        <input
                            list="lista-componentes-recursos" className="campo-ed" style={styles.inputCelda}
                            placeholder="Escribe para buscar…" value={c.descripcion || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                actualizarComponente(idx, 'descripcion', val);
                                if (val.length < 2) return;
                                const match = (componentesDB || []).find(db => {
                                    const nombreLimpio = db.nombre ? db.nombre.trim() : '';
                                    const formatoCompleto = db.tipo ? `${nombreLimpio} (${db.tipo})` : nombreLimpio;
                                    return val === nombreLimpio || val === formatoCompleto;
                                });
                                if (match) setTimeout(() => {
                                    actualizarComponente(idx, 'descripcion', match.nombre);
                                    actualizarComponente(idx, 'tipo', match.tipo || 'Equipo');
                                    actualizarComponente(idx, 'codigo', match.codigo || 'REF');
                                    actualizarComponente(idx, 'precio', match.precio || 0);
                                    // Referencia real al catálogo, en paralelo al código de texto —
                                    // ver plan de robustecimiento, punto 7.
                                    actualizarComponente(idx, 'catalogoId', match._id);
                                }, 50);
                            }}
                        />
                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={c.cantidad} onChange={e => actualizarComponente(idx, 'cantidad', e.target.value)} />
                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={c.precio} onChange={e => actualizarComponente(idx, 'precio', e.target.value)} />
                        <span style={styles.celdaSubtotal}>{CLP((Number(c.cantidad) || 0) * (Number(c.precio) || 0))}</span>
                        <span>{!estado ? <span style={{ color: t.textoDeshabilitado, fontSize: 11 }}>—</span> : <span style={{ fontSize: 11, fontWeight: 600, color: ok ? t.verde : t.rojo }}>{estado}</span>}</span>
                        <span onClick={() => eliminarComponente(idx)} style={styles.xFila}>×</span>
                    </div>
                );
            })}
            <div style={{ padding: '8px 16px' }}>
                <button onClick={agregarComponente} style={styles.btnAgregar}>Agregar componente</button>
            </div>
            <div style={styles.continuarWrap}><button onClick={() => setTabActiva('Logistica')} style={styles.btnSecundario}>Continuar: Suministros directos →</button></div>
        </div>
    );
}
