// Extraído de TratamientoScreen.jsx — ver plan de robustecimiento, punto 6. El estado
// (tareas, etc.) sigue viviendo en TratamientoScreen: esta pestaña solo saca el renderizado,
// recibe todo por props. No es como TabAntecedentes/TabDocumentosPdf (esas no dependían de
// datos de otras pestañas) — acá granTotal/puedeTerminarPlanificacion/etc. sí cruzan tareas
// con componentes/logistica/informeEvaluacion, así que el estado no se puede repartir por
// pestaña sin romper esos cálculos compartidos. Se recibe tanto `actualizarTarea` (updates
// de un solo campo) como `setTareas` (updates de varios campos a la vez, ej. puesto +
// valorHora juntos) — juntarlos en una sola llamada de actualizarTarea encadenada perdería
// el primer cambio por el closure obsoleto de `tareas` dentro de actualizarTarea.
import { t, styles, CLP } from './comunTratamiento';

// Grilla fija de esta tabla (README §6 del handoff de rediseño).
const GRID_TAREAS = 'minmax(200px,1fr) 160px 118px 132px 52px 68px 62px 84px 96px 40px';
// Ancho mínimo real de una fila (suma de columnas fijas + mínimo de la 1ra + gaps + padding
// lateral) — sin esto, el fondo de header/filas no cubre el ancho scrolleable (ver
// GRID_MATERIALES_MIN_W/GRID_LOGISTICA_MIN_W en las pestañas hermanas, mismo problema).
const GRID_TAREAS_MIN_W = 200 + 160 + 118 + 132 + 52 + 68 + 62 + 84 + 96 + 40 + 9 * 8 + 32;

// Mejora "Metodología por tarea": la fila edita solo la primera línea de desarrollo; el
// resto del texto (parágrafos siguientes, escritos desde el panel expandido) se conserva.
const primeraLinea = (texto) => (texto || '').split('\n')[0];
const conPrimeraLineaReemplazada = (texto, nuevaPrimera) => {
    const resto = (texto || '').split('\n').slice(1).join('\n');
    return resto ? `${nuevaPrimera}\n${resto}` : nuevaPrimera;
};

export default function TabTareas({
    tareas, setTareas, actualizarTarea, agregarTarea, eliminarTarea,
    tareaExpandida, setTareaExpandida,
    puestosDB, recursos, soloLecturaPlanificacion, setTabActiva,
}) {
    return (
        // pointerEvents/opacity (no fieldset+disabled): varios controles de esta pestaña son
        // <span onClick> (los "×" de eliminar, el backspace del responsable), no
        // <input>/<button> reales, así que disabled de un fieldset no los habría bloqueado.
        // Se frena TODO el bloque en cambio.
        <div style={{ padding: '0 0 16px', ...(soloLecturaPlanificacion ? { pointerEvents: 'none', opacity: .6 } : {}) }}>
            {/* En pantallas angostas GRID_TAREAS (min ~1100px) no cabe: sin minWidth el
                div display:grid no crece más allá del ancho disponible aunque sus columnas
                lo exijan (el excedente queda como "ink overflow", scrolleable vía .contenido
                pero sin fondo pintado detrás) — ver docs/bugs-conocidos.md B3 y
                GRID_TAREAS_MIN_W más arriba. El scroll horizontal lo sigue manejando
                .contenido (mismo panel que el vertical), no un contenedor propio. */}
            <div style={{ ...styles.tablaHeader(GRID_TAREAS), minWidth: GRID_TAREAS_MIN_W }}>
                <span>Descripción</span><span>Desarrollo / metodología</span><span>Puesto</span><span>Responsable</span>
                <span style={{ textAlign: 'right' }}>Hrs</span><span style={{ textAlign: 'right' }}>Fecha</span>
                <span style={{ textAlign: 'right' }}>Hora</span><span style={{ textAlign: 'right' }}>$/hora</span>
                <span style={{ textAlign: 'right' }}>Subtotal</span><span />
            </div>
            {tareas.map((tt, idx) => {
                const horas = Number(tt.duracion) || 0;
                const precioHora = Number(tt.valorHora) || 0;
                const personas = Array.isArray(tt.operarioId) ? tt.operarioId.length : 0;
                const sub = horas * precioHora * (personas > 0 ? personas : 1);
                const idKey = tt._id || tt.id || `tarea-${idx}`;
                const tieneDesarrollo = !!(tt.desarrollo || '').trim();
                return (
                    <div key={idKey}>
                    <div style={{ ...styles.tablaFila(GRID_TAREAS), minWidth: GRID_TAREAS_MIN_W }}>
                        <input className="campo-ed" style={styles.inputCelda} value={tt.descripcion} onChange={e => actualizarTarea(idx, 'descripcion', e.target.value)} />
                        <input
                            className="campo-ed" style={styles.inputCelda}
                            value={primeraLinea(tt.desarrollo)}
                            placeholder="Sin desarrollo"
                            onFocus={() => setTareaExpandida(idKey)}
                            onChange={e => actualizarTarea(idx, 'desarrollo', conPrimeraLineaReemplazada(tt.desarrollo, e.target.value))}
                        />
                        <select className="campo-ed" style={styles.inputCelda} value={tt.puesto} onChange={(e) => {
                            const nombreSeleccionado = e.target.value;
                            const puestoEncontrado = puestosDB.find(p => p.nombre === nombreSeleccionado);
                            setTareas(prev => prev.map((tarea, i) => i === idx ? { ...tarea, puesto: nombreSeleccionado, ...(puestoEncontrado ? { valorHora: puestoEncontrado.costoHora } : {}) } : tarea));
                        }}>
                            <option value="">—</option>
                            {puestosDB.map(p => <option key={p._id} value={p.nombre}>{p.nombre}</option>)}
                        </select>
                        <div
                            style={styles.celdaResponsable}
                            tabIndex="0"
                            onKeyDown={(e) => {
                                if (e.key === 'Backspace' && (tt.operarioId || []).length > 0) {
                                    const nuevosIds = tt.operarioId.slice(0, -1);
                                    const nuevosNombres = (tt.operarioNombre || []).slice(0, -1);
                                    setTareas(prev => prev.map((tarea, i) => i === idx ? { ...tarea, operarioId: nuevosIds, operarioNombre: nuevosNombres } : tarea));
                                }
                            }}
                        >
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {Array.isArray(tt.operarioNombre) && tt.operarioNombre.length > 0 ? tt.operarioNombre.join(', ') : <span style={{ color: t.textoDeshabilitado }}>Sin asignar</span>}
                            </span>
                            <select
                                style={styles.selectInvisible}
                                value=""
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (!val) return;
                                    const recurso = recursos.find(r => String(r._id) === String(val));
                                    if (!recurso) return;
                                    const idsActuales = (tt.operarioId || []).filter(Boolean);
                                    const nombresActuales = (tt.operarioNombre || []).filter(n => n && n !== 'Sin asignar');
                                    if (idsActuales.includes(val)) return;
                                    setTareas(prev => prev.map((tarea, i) => i === idx ? { ...tarea, operarioId: [...idsActuales, val], operarioNombre: [...nombresActuales, recurso.nombre] } : tarea));
                                }}
                            >
                                <option value="">+</option>
                                {recursos.map(r => <option key={r._id} value={r._id}>{r.nombre}</option>)}
                            </select>
                        </div>
                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={tt.duracion} onChange={e => actualizarTarea(idx, 'duracion', e.target.value)} />
                        <input type="date" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={tt.fecha} onChange={e => actualizarTarea(idx, 'fecha', e.target.value)} />
                        <input type="time" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={tt.hora} onChange={e => actualizarTarea(idx, 'hora', e.target.value)} />
                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={tt.valorHora || ''} onChange={e => actualizarTarea(idx, 'valorHora', e.target.value)} />
                        <span style={styles.celdaSubtotal}>{CLP(sub)}</span>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                            {!tieneDesarrollo && <span title="Sin desarrollo definido" style={{ width: 6, height: 6, borderRadius: '50%', background: t.rojo, flex: 'none' }} />}
                            <span onClick={() => eliminarTarea(idx)} style={styles.xFila}>×</span>
                        </span>
                    </div>
                    {tareaExpandida === idKey && (
                        <div style={{ background: '#f7f6f2', padding: '10px 16px 14px', borderBottom: `1px solid ${t.hairlineFila}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: t.textoSecundario1 }}>
                                    Desarrollo extendido · {tt.descripcion || 'Tarea sin nombre'}
                                </span>
                                <span onClick={() => setTareaExpandida(null)} style={{ fontSize: 11, color: t.acento, cursor: 'pointer' }}>Contraer</span>
                            </div>
                            <textarea
                                className="campo-ed"
                                style={{ width: '100%', minHeight: 90, boxSizing: 'border-box', padding: 8, fontFamily: 'inherit', fontSize: 12, color: t.textoPrincipal, borderRadius: 2, resize: 'vertical' }}
                                value={tt.desarrollo || ''}
                                onChange={e => actualizarTarea(idx, 'desarrollo', e.target.value)}
                                autoFocus
                            />
                        </div>
                    )}
                    </div>
                );
            })}
            <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={agregarTarea} style={styles.btnAgregar}>Agregar tarea</button>
                {tareas.length > 0 && (
                    <span style={{ fontSize: 11, color: t.textoAtenuado2 }}>
                        {tareas.filter(tt => (tt.desarrollo || '').trim()).length} de {tareas.length} tareas con desarrollo definido
                    </span>
                )}
            </div>
            <div style={styles.continuarWrap}><button onClick={() => setTabActiva('componentes')} style={styles.btnSecundario}>Continuar: Equipos y materiales →</button></div>
        </div>
    );
}
