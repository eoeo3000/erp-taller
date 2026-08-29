// Extraído de TratamientoScreen.jsx — ver plan de robustecimiento, punto 6.
import { t, fmtFecha } from './comunTratamiento';

const filaAnte = { display: 'grid', gridTemplateColumns: '132px 1fr', gap: 8, padding: '7px 0', borderBottom: `1px solid ${t.hairlineFila}` };
const etiquetaAnte = { fontSize: '11px', color: t.textoAtenuado2 };
const valorAnte = { fontSize: '11.5px', color: t.textoPrincipal };
const controlAnte = { height: 26, border: '1px solid rgba(0,0,0,.22)', borderRadius: 2, padding: '0 8px', fontSize: '11.5px', fontFamily: t.fontUi, width: '100%', boxSizing: 'border-box', background: '#fff' };

function FilaAntecedente({ etiqueta, valor, negrita }) {
    return (
        <div style={filaAnte}>
            <span style={etiquetaAnte}>{etiqueta}</span>
            <span style={{ ...valorAnte, fontWeight: negrita ? 600 : 400 }}>{valor ?? '—'}</span>
        </div>
    );
}

// Pestaña Antecedentes: solicitud de origen (solo lectura) + asignación de la OT (editable),
// incluida la asignación del supervisor a cargo — independiente del responsable de cada
// tarea (tareas[].operarioNombre). Ver docs/rediseno/design_handoff_panel_control.
export default function TabAntecedentes({ cargando, antecedentes, form, onCampo, onGuardar, guardando, aviso, soloLectura }) {
    if (cargando || !antecedentes) {
        return (
            <div style={{ padding: 16 }}>
                {[1, 2, 3].map(i => (
                    <div key={i} style={{ height: 26, background: '#eeece7', borderRadius: 2, marginBottom: 10, maxWidth: 420 }} />
                ))}
            </div>
        );
    }

    const { solicitud, ot, candidatos } = antecedentes;
    const PRIORIDADES = ['Baja', 'Normal', 'Urgente'];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px,100%), 1fr))' }}>
            {/* Columna izquierda — Solicitud de origen (solo lectura) */}
            <div style={{ padding: 16, borderRight: `1px solid rgba(0,0,0,.08)` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: t.textoPrincipal }}>Solicitud de origen</span>
                    <span style={{ fontFamily: t.fontMono, fontSize: '11px', color: t.textoAtenuado1 }}>{solicitud.numero || '—'}</span>
                </div>

                <FilaAntecedente etiqueta="Empresa solicitante" valor={solicitud.empresa} negrita />
                <FilaAntecedente etiqueta="Solicitante" valor={solicitud.solicitante} />
                <FilaAntecedente etiqueta="Teléfono" valor={solicitud.telefono} />
                <FilaAntecedente etiqueta="Fecha de solicitud" valor={fmtFecha(solicitud.fechaSolicitud)} />
                <FilaAntecedente etiqueta="Origen" valor={solicitud.origen} />
                <FilaAntecedente etiqueta="Faena / dirección" valor={solicitud.direccion} />
                <FilaAntecedente etiqueta="Ejecución solicitada" valor={fmtFecha(solicitud.fechaEjecucionSolicitada)} />
                <div style={{ ...filaAnte, borderBottom: 'none' }}>
                    <span style={etiquetaAnte}>Adjuntos</span>
                    {solicitud.adjuntos?.length ? (
                        <span style={valorAnte}>
                            {solicitud.adjuntos.map((a, i) => (
                                <a key={i} href={a} target="_blank" rel="noreferrer" style={{ color: t.acento, textDecoration: 'none' }}>
                                    {a.split('/').pop()}
                                </a>
                            ))}
                        </span>
                    ) : <span style={{ ...valorAnte, color: t.textoDeshabilitado }}>Sin adjuntos</span>}
                </div>

                <div style={{ marginTop: 12, background: '#f7f6f2', border: '1px solid rgba(0,0,0,.08)', borderRadius: 2, padding: 10 }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: t.textoAtenuado2, marginBottom: 4 }}>Descripción del cliente</div>
                    <div style={{ fontSize: '11.5px', color: t.textoPrincipal, lineHeight: 1.55 }}>{solicitud.descripcion || '—'}</div>
                </div>
            </div>

            {/* Columna derecha — Datos de la orden de trabajo (editable) */}
            <div style={{ padding: 16 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: t.textoPrincipal, marginBottom: 10 }}>Datos de la orden de trabajo</div>

                <div style={{ display: 'grid', gridTemplateColumns: '132px 1fr', gap: '10px 12px', alignItems: 'center' }}>
                    <span style={etiquetaAnte}>N° de OT</span>
                    <span style={{ ...valorAnte, fontFamily: t.fontMono }}>{ot.numero || 'Se asigna al guardar'}</span>

                    <span style={etiquetaAnte}>Fecha de creación</span>
                    <span style={{ ...valorAnte, fontFamily: t.fontMono }}>{fmtFecha(ot.fechaCreacion)}</span>

                    <span style={etiquetaAnte}>Supervisor a cargo</span>
                    <select
                        style={controlAnte} disabled={soloLectura}
                        value={form.supervisorId} onChange={e => onCampo('supervisorId', e.target.value)}
                    >
                        <option value="">Sin asignar</option>
                        {candidatos.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.puesto}</option>)}
                    </select>

                    <span style={etiquetaAnte}>Fecha de ejecución</span>
                    <input
                        style={{ ...controlAnte, fontFamily: t.fontMono }} disabled={soloLectura}
                        placeholder="dd-mm-aaaa" value={form.fechaEjecucion}
                        onChange={e => onCampo('fechaEjecucion', e.target.value)}
                    />

                    <span style={etiquetaAnte}>Prioridad</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {PRIORIDADES.map(p => (
                            <button
                                key={p} type="button" disabled={soloLectura}
                                onClick={() => onCampo('prioridad', p)}
                                style={{
                                    flex: 1, height: 26, border: '1px solid rgba(0,0,0,.22)', borderRadius: 2,
                                    background: form.prioridad === p ? '#1c1d1b' : '#fff',
                                    color: form.prioridad === p ? '#fff' : t.textoPrincipal,
                                    fontWeight: form.prioridad === p ? 700 : 400, fontSize: '11px', cursor: soloLectura ? 'default' : 'pointer',
                                }}
                            >
                                {p}
                            </button>
                        ))}
                    </div>

                    <span style={{ ...etiquetaAnte, alignSelf: 'start', marginTop: 4 }}>Instrucciones</span>
                    <textarea
                        style={{ ...controlAnte, height: 'auto', minHeight: 58, padding: 8, resize: 'vertical' }} disabled={soloLectura}
                        placeholder="Indicaciones para el supervisor en terreno"
                        value={form.instruccionesTerreno}
                        onChange={e => onCampo('instruccionesTerreno', e.target.value)}
                    />
                </div>

                {!soloLectura && (
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            onClick={onGuardar} disabled={guardando}
                            style={{
                                height: 28, padding: '0 14px', background: t.acento, color: '#fff', fontWeight: 700,
                                fontSize: '11.5px', border: 'none', borderRadius: 2, cursor: guardando ? 'default' : 'pointer',
                                opacity: guardando ? .7 : 1,
                            }}
                        >
                            {guardando ? 'Guardando…' : 'Guardar y asignar'}
                        </button>
                        {aviso && (
                            <span style={{ fontSize: '11px', color: aviso.tipo === 'ok' ? '#4c7a4c' : t.rojo }}>{aviso.texto}</span>
                        )}
                    </div>
                )}
                {soloLectura && (
                    <div style={{ marginTop: 14, fontSize: '11px', color: t.textoAtenuado2 }}>
                        La OT está pagada — Antecedentes queda en solo lectura.
                    </div>
                )}

                <p style={{ fontSize: '10.5px', color: t.textoAtenuado3, marginTop: 14, lineHeight: 1.5 }}>
                    Al asignar, la OT aparece en la agenda del supervisor y en su aplicación de terreno.
                    Las tareas individuales mantienen su propio responsable.
                </p>
            </div>
        </div>
    );
}
