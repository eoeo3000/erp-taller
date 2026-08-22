import { useState } from 'react';
import { sugerirTiposTrabajo } from '../motorSugerencia.js';
import { generarSegmentos } from '../motorTexto.js';
import { recalcularTexto, deshacerEdicionManual } from '../hallazgos.js';
import { subirFoto } from '../api.js';

// Formulario adaptativo de un hallazgo — docs/plan-formulario-adaptativo.md §5/§11. Pensado
// para uso táctil en terreno: cada valor del texto es un objetivo táctil propio que abre una
// hoja inferior (nunca un menú angosto pegado al punto tocado), las opciones son casillas de
// toque (nunca un <select multiple> nativo), y el buscador no autocompleta de forma agresiva.
export default function EditorHallazgo({ hallazgo: hallazgoInicial, tiposTrabajo, condicionesEntorno, onGuardar, onEliminar, onCancelar }) {
    const [hallazgo, setHallazgo] = useState(hallazgoInicial);
    const [busqueda, setBusqueda] = useState('');
    const [hojaAbierta, setHojaAbierta] = useState(null); // campo completo (clave, tipoDato, opciones, etiqueta)
    const [subiendoFoto, setSubiendoFoto] = useState(false);

    const tipoElegido = tiposTrabajo.find((t) => String(t._id) === String(hallazgo.tipoTrabajoId));
    const sugerencias = !tipoElegido && busqueda.trim() ? sugerirTiposTrabajo(busqueda, tiposTrabajo) : [];
    const segmentos = tipoElegido ? generarSegmentos(tipoElegido.plantillaTexto, hallazgo.valores) : [];
    const condicionesDisponibles = condicionesEntorno.filter((c) => !(tipoElegido?.condicionesNoAplicables || []).includes(c._id));

    const elegirTipo = (tipo) => {
        setHallazgo(recalcularTexto({ ...hallazgo, tipoTrabajoId: tipo._id, valores: {} }, tipo));
        setBusqueda('');
    };
    const cambiarTipo = () => setHallazgo((h) => recalcularTexto({ ...h, tipoTrabajoId: null, valores: {} }, null));
    const cambiarValor = (clave, valor) => setHallazgo((h) => recalcularTexto({ ...h, valores: { ...h.valores, [clave]: valor } }, tipoElegido));
    const editarTextoLibre = (nuevoTexto) => setHallazgo((h) => ({ ...h, textoDescriptivo: nuevoTexto, textoEditadoManualmente: true }));
    const onDeshacer = () => setHallazgo(deshacerEdicionManual);

    const toggleCondicion = (id) => setHallazgo((h) => {
        const actual = h.condicionesEntorno || [];
        return { ...h, condicionesEntorno: actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id] };
    });

    const agregarFotoLibre = async (archivo) => {
        setSubiendoFoto(true);
        try {
            const url = await subirFoto(archivo);
            setHallazgo((h) => ({ ...h, fotos: [...(h.fotos || []), url] }));
        } catch {
            window.alert('No se pudo subir la foto — revisa la señal e intenta de nuevo.');
        } finally { setSubiendoFoto(false); }
    };

    const agregarFotoDeCampo = async (clave, archivo) => {
        setSubiendoFoto(true);
        try {
            const url = await subirFoto(archivo);
            cambiarValor(clave, url);
        } catch {
            window.alert('No se pudo subir la foto — revisa la señal e intenta de nuevo.');
        } finally { setSubiendoFoto(false); }
    };

    const abrirSelectorDeCampo = (clave) => {
        const campo = tipoElegido?.campos.find((c) => c.clave === clave);
        if (campo && (campo.tipoDato === 'seleccionUnica' || campo.tipoDato === 'seleccionMultiple')) setHojaAbierta(campo);
    };

    return (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!tipoElegido && (
                <div>
                    <input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="¿Qué observaste? (ej: cambiar cañería de 4 pulgadas)"
                        style={{ width: '100%', height: 48, padding: '0 12px', fontSize: 16, border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)' }}
                    />
                    {sugerencias.length > 0 && (
                        <div style={{ marginTop: 8, border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)' }}>
                            {sugerencias.map(({ tipo }) => (
                                <button
                                    key={tipo._id}
                                    onClick={() => elegirTipo(tipo)}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 52, padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--linea-fina)', fontSize: 15, cursor: 'pointer' }}
                                >
                                    {tipo.nombre}
                                </button>
                            ))}
                        </div>
                    )}
                    {busqueda.trim() && sugerencias.length === 0 && (
                        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--texto-atenuado-1)' }}>
                            Sin coincidencias en el catálogo — puedes seguir en texto libre más abajo.
                        </div>
                    )}
                    <textarea
                        value={hallazgo.textoDescriptivo}
                        onChange={(e) => editarTextoLibre(e.target.value)}
                        placeholder="Describe lo que observaste, en texto libre"
                        style={{ width: '100%', minHeight: 90, marginTop: 12, padding: 10, fontSize: 15, border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                </div>
            )}

            {tipoElegido && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 17, fontWeight: 700 }}>{tipoElegido.nombre}</span>
                        <button onClick={cambiarTipo} style={{ background: 'none', border: 'none', color: 'var(--en-curso)', fontSize: 14, cursor: 'pointer' }}>Cambiar tipo</button>
                    </div>

                    <div style={{ padding: 12, background: 'var(--franja)', borderRadius: 'var(--radio)', fontSize: 15, lineHeight: 1.7 }}>
                        {!hallazgo.textoEditadoManualmente ? segmentos.map((s, i) => (s.tipo === 'texto' ? (
                            <span key={i}>{s.contenido}</span>
                        ) : (
                            <span
                                key={i}
                                onClick={() => abrirSelectorDeCampo(s.clave)}
                                style={{
                                    display: 'inline-block', padding: '4px 8px', margin: '2px 1px', minHeight: 32,
                                    background: s.pendiente ? '#fff' : 'var(--superficie)',
                                    border: `1.5px solid ${s.pendiente ? 'var(--atencion)' : 'var(--en-curso)'}`,
                                    borderRadius: 'var(--radio)', fontWeight: 600, cursor: 'pointer',
                                    color: s.pendiente ? 'var(--atencion)' : 'var(--texto-principal)',
                                }}
                            >
                                {s.contenido}
                            </span>
                        ))) : (
                            <textarea
                                value={hallazgo.textoDescriptivo}
                                onChange={(e) => editarTextoLibre(e.target.value)}
                                style={{ width: '100%', minHeight: 90, padding: 10, fontSize: 15, border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)', fontFamily: 'inherit', resize: 'vertical', background: '#fff' }}
                            />
                        )}
                    </div>
                    {hallazgo.textoEditadoManualmente ? (
                        <button onClick={onDeshacer} className="boton-secundario">Deshacer edición</button>
                    ) : (
                        <button onClick={() => editarTextoLibre(hallazgo.textoDescriptivo)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--texto-atenuado-1)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>
                            Editar el texto libremente
                        </button>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[...tipoElegido.campos].sort((a, b) => a.orden - b.orden).map((campo) => (
                            <CampoDinamico
                                key={campo.clave}
                                campo={campo}
                                valor={hallazgo.valores[campo.clave]}
                                onCambiar={(v) => cambiarValor(campo.clave, v)}
                                onSubirFoto={(archivo) => agregarFotoDeCampo(campo.clave, archivo)}
                                subiendo={subiendoFoto}
                            />
                        ))}
                    </div>

                    {condicionesDisponibles.length > 0 && (
                        <div>
                            <div className="versalita" style={{ marginBottom: 6 }}>Condiciones de entorno</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {condicionesDisponibles.map((c) => {
                                    const marcada = (hallazgo.condicionesEntorno || []).includes(c._id);
                                    return (
                                        <button key={c._id} onClick={() => toggleCondicion(c._id)} className="boton-secundario" style={{ minHeight: 48, textAlign: 'left', paddingLeft: 14, borderColor: marcada ? 'var(--texto-principal)' : 'var(--linea-zona)' }}>
                                            <span className="mono" style={{ marginRight: 8 }}>{marcada ? '×' : '·'}</span>{c.nombre}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}

            <div>
                <div className="versalita" style={{ marginBottom: 6 }}>Fotos</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {(hallazgo.fotos || []).map((f, i) => <img key={i} src={f} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 'var(--radio)' }} />)}
                    <label className="boton-secundario" style={{ width: 78, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13 }}>
                        {subiendoFoto ? '…' : 'Foto'}
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) agregarFotoLibre(f); e.target.value = ''; }} />
                    </label>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => onGuardar(hallazgo)} className="boton-primario" style={{ flex: 1 }} disabled={!hallazgo.textoDescriptivo?.trim()}>Guardar hallazgo</button>
                <button onClick={onCancelar} className="boton-secundario" style={{ width: 110 }}>Cancelar</button>
            </div>
            {onEliminar && (
                <button onClick={onEliminar} style={{ background: 'none', border: 'none', color: 'var(--detenido)', fontSize: 14, cursor: 'pointer', padding: 8 }}>Eliminar este hallazgo</button>
            )}

            {hojaAbierta && (
                <HojaSelector
                    campo={hojaAbierta}
                    valorActual={hallazgo.valores[hojaAbierta.clave]}
                    onElegir={(v) => {
                        cambiarValor(hojaAbierta.clave, v);
                        if (hojaAbierta.tipoDato !== 'seleccionMultiple') setHojaAbierta(null);
                    }}
                    onCerrar={() => setHojaAbierta(null)}
                />
            )}
        </div>
    );
}

function CampoDinamico({ campo, valor, onCambiar, onSubirFoto, subiendo }) {
    if (campo.tipoDato === 'foto') {
        return (
            <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{campo.etiqueta}</div>
                {valor ? (
                    <img src={valor} alt="" style={{ width: 100, height: 75, objectFit: 'cover', borderRadius: 'var(--radio)' }} />
                ) : (
                    <label className="boton-secundario" style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        {subiendo ? 'Subiendo…' : 'Tomar foto'}
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onSubirFoto(f); e.target.value = ''; }} />
                    </label>
                )}
            </div>
        );
    }
    if (campo.tipoDato === 'seleccionUnica' || campo.tipoDato === 'seleccionMultiple') {
        const seleccionados = campo.tipoDato === 'seleccionMultiple' ? (valor || []) : (valor ? [valor] : []);
        return (
            <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{campo.etiqueta}{campo.obligatorio ? ' *' : ''}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {campo.opciones.map((op) => {
                        const marcada = seleccionados.includes(op);
                        return (
                            <button
                                key={op}
                                onClick={() => onCambiar(campo.tipoDato === 'seleccionMultiple' ? (marcada ? seleccionados.filter((x) => x !== op) : [...seleccionados, op]) : op)}
                                style={{
                                    minHeight: 44, padding: '0 14px', border: `1.5px solid ${marcada ? 'var(--texto-principal)' : 'var(--linea-zona)'}`,
                                    background: marcada ? 'var(--texto-principal)' : '#fff', color: marcada ? '#fff' : 'var(--texto-principal)',
                                    borderRadius: 'var(--radio)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                {op}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{campo.etiqueta}{campo.obligatorio ? ' *' : ''}</span>
            <input
                type={campo.tipoDato === 'numero' ? 'number' : campo.tipoDato === 'fecha' ? 'date' : 'text'}
                value={valor || ''}
                onChange={(e) => onCambiar(e.target.value)}
                style={{ height: 44, padding: '0 12px', fontSize: 15, border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)' }}
            />
        </label>
    );
}

// Hoja inferior — mismo patrón ya usado en esta PWA para elegir semana (S2) o agendar una
// visita (S4): nunca un menú angosto pegado al punto exacto donde se tocó.
function HojaSelector({ campo, valorActual, onElegir, onCerrar }) {
    const esMultiple = campo.tipoDato === 'seleccionMultiple';
    const seleccionados = esMultiple ? (valorActual || []) : (valorActual ? [valorActual] : []);
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={onCerrar}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '70vh', overflowY: 'auto', background: '#fff', borderRadius: '8px 8px 0 0', padding: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{campo.etiqueta}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {campo.opciones.map((op) => {
                        const marcada = seleccionados.includes(op);
                        return (
                            <button
                                key={op}
                                onClick={() => onElegir(esMultiple ? (marcada ? seleccionados.filter((x) => x !== op) : [...seleccionados, op]) : op)}
                                className="boton-secundario"
                                style={{ minHeight: 52, textAlign: 'left', paddingLeft: 14, borderColor: marcada ? 'var(--texto-principal)' : 'var(--linea-zona)' }}
                            >
                                <span className="mono" style={{ marginRight: 8 }}>{marcada ? '×' : '·'}</span>{op}
                            </button>
                        );
                    })}
                </div>
                {esMultiple && <button onClick={onCerrar} className="boton-primario" style={{ marginTop: 12 }}>Listo</button>}
            </div>
        </div>
    );
}
