import { useState, useRef } from 'react';
import { sugerirTiposTrabajo } from '../motorSugerencia.js';
import { generarSegmentos } from '../motorTexto.js';
import { recalcularTexto, deshacerEdicionManual } from '../hallazgos.js';
import { subirFoto } from '../api.js';

// Formulario adaptativo de un hallazgo — docs/plan-formulario-adaptativo.md §5/§11, rediseño
// "lienzo en blanco": un solo cuadro donde se escribe, sin buscador separado ni lista de
// campos aparte. Componente CONTROLADO (hallazgo + onCambiar) a propósito: no tiene guardar/
// cancelar propios — la pantalla que lo usa (O5) es la que manda esos botones abajo, este
// componente es solo el cuadro y sus fotos/condiciones.
export default function EditorHallazgo({ hallazgo, onCambiar, tiposTrabajo, condicionesEntorno }) {
    const [hojaAbierta, setHojaAbierta] = useState(null); // campo completo (clave, tipoDato, opciones, etiqueta)
    const [subiendoFoto, setSubiendoFoto] = useState(false);

    const tipoElegido = tiposTrabajo.find((t) => String(t._id) === String(hallazgo.tipoTrabajoId));
    const sugerencias = !tipoElegido && hallazgo.textoDescriptivo?.trim() ? sugerirTiposTrabajo(hallazgo.textoDescriptivo, tiposTrabajo) : [];
    const segmentos = tipoElegido ? generarSegmentos(tipoElegido.plantillaTexto, hallazgo.valores) : [];
    const condicionesDisponibles = condicionesEntorno.filter((c) => !(tipoElegido?.condicionesNoAplicables || []).includes(c._id));

    const escribir = (texto) => onCambiar({ ...hallazgo, textoDescriptivo: texto });
    const elegirTipo = (tipo) => onCambiar(recalcularTexto({ ...hallazgo, tipoTrabajoId: tipo._id, valores: {} }, tipo));
    const cambiarTipo = () => onCambiar(recalcularTexto({ ...hallazgo, tipoTrabajoId: null, valores: {} }, null));
    const cambiarValor = (clave, valor) => onCambiar(recalcularTexto({ ...hallazgo, valores: { ...hallazgo.valores, [clave]: valor } }, tipoElegido));
    const editarTextoLibre = (nuevoTexto) => onCambiar({ ...hallazgo, textoDescriptivo: nuevoTexto, textoEditadoManualmente: true });
    const onDeshacer = () => onCambiar(deshacerEdicionManual(hallazgo));

    const toggleCondicion = (id) => {
        const actual = hallazgo.condicionesEntorno || [];
        onCambiar({ ...hallazgo, condicionesEntorno: actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id] });
    };

    const agregarFotoLibre = async (archivo) => {
        setSubiendoFoto(true);
        try {
            const url = await subirFoto(archivo);
            onCambiar({ ...hallazgo, fotos: [...(hallazgo.fotos || []), url] });
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

    // Cada espacio en blanco se llena tocándolo, sea cual sea su tipo de dato — "foto" abre la
    // cámara directo (sin hoja intermedia), el resto abre una hoja inferior (nunca un menú
    // angosto pegado al punto tocado, ver §11).
    const tocarSegmento = (clave, refInputFoto) => {
        const campo = tipoElegido?.campos.find((c) => c.clave === clave);
        if (!campo) return;
        if (campo.tipoDato === 'foto') { refInputFoto?.click(); return; }
        setHojaAbierta(campo);
    };

    return (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!tipoElegido && (
                <div style={{ position: 'relative' }}>
                    <textarea
                        value={hallazgo.textoDescriptivo}
                        onChange={(e) => escribir(e.target.value)}
                        placeholder="¿Qué observaste? (ej: cambiar cañería de 4 pulgadas)"
                        style={{ width: '100%', minHeight: 140, padding: 12, fontSize: 16, border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    {sugerencias.length > 0 && (
                        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)', boxShadow: '0 4px 14px rgba(0,0,0,.12)', zIndex: 20 }}>
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
                            <SegmentoCampo
                                key={i}
                                segmento={s}
                                campo={tipoElegido.campos.find((c) => c.clave === s.clave)}
                                onTocar={(refInputFoto) => tocarSegmento(s.clave, refInputFoto)}
                                onSubirFoto={(archivo) => agregarFotoDeCampo(s.clave, archivo)}
                                subiendo={subiendoFoto}
                            />
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

            {hojaAbierta && (
                <HojaCampo
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

// Un espacio en blanco dentro del párrafo — mismo objetivo táctil sea cual sea su tipo de
// dato. "foto" lleva su propio <input type=file> oculto (se activa tocando el segmento, sin
// pasar por la hoja inferior); el resto delega en onTocar (abre HojaCampo).
function SegmentoCampo({ segmento, campo, onTocar, onSubirFoto, subiendo }) {
    const inputFoto = useRef(null);
    const esFoto = campo?.tipoDato === 'foto';
    return (
        <span
            onClick={() => onTocar(inputFoto.current)}
            style={{
                display: 'inline-block', padding: '4px 8px', margin: '2px 1px', minHeight: 32,
                background: segmento.pendiente ? '#fff' : 'var(--superficie)',
                border: `1.5px solid ${segmento.pendiente ? 'var(--atencion)' : 'var(--en-curso)'}`,
                borderRadius: 'var(--radio)', fontWeight: 600, cursor: 'pointer',
                color: segmento.pendiente ? 'var(--atencion)' : 'var(--texto-principal)',
            }}
        >
            {subiendo ? 'Subiendo…' : segmento.contenido}
            {esFoto && (
                <input
                    ref={inputFoto}
                    type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onSubirFoto(f); e.target.value = ''; }}
                />
            )}
        </span>
    );
}

// Hoja inferior — mismo patrón ya usado en esta PWA para elegir semana (S2) o agendar una
// visita (S4): nunca un menú angosto pegado al punto tocado. Cubre todos los tipos de dato
// menos "foto" (esa abre la cámara directo desde el propio segmento).
function HojaCampo({ campo, valorActual, onElegir, onCerrar }) {
    const [borrador, setBorrador] = useState(valorActual || '');
    const esMultiple = campo.tipoDato === 'seleccionMultiple';
    const esEleccion = campo.tipoDato === 'seleccionUnica' || esMultiple;
    const seleccionados = esMultiple ? (valorActual || []) : (valorActual ? [valorActual] : []);
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={onCerrar}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '70vh', overflowY: 'auto', background: '#fff', borderRadius: '8px 8px 0 0', padding: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{campo.etiqueta}</div>
                {esEleccion ? (
                    <>
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
                    </>
                ) : (
                    <>
                        <input
                            autoFocus
                            type={campo.tipoDato === 'numero' ? 'number' : campo.tipoDato === 'fecha' ? 'date' : 'text'}
                            value={borrador}
                            onChange={(e) => setBorrador(e.target.value)}
                            style={{ width: '100%', height: 48, padding: '0 12px', fontSize: 16, border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)' }}
                        />
                        <button onClick={() => onElegir(borrador)} className="boton-primario" style={{ marginTop: 12, width: '100%' }}>Listo</button>
                    </>
                )}
            </div>
        </div>
    );
}
