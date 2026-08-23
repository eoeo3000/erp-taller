import { useState, useRef } from 'react';
import { sugerirTiposTrabajo } from '../utils/motorSugerencia.js';
import { generarSegmentos } from '../utils/motorTexto.js';
import { recalcularTexto, deshacerEdicionManual } from '../utils/hallazgos.js';
import { subirFoto } from '../utils/fotos.js';

// Versión de escritorio del formulario adaptativo — docs/plan-formulario-adaptativo.md §5/§6/§10,
// rediseño "lienzo en blanco": un solo cuadro donde se escribe, sin buscador separado ni lista
// de campos aparte (misma lógica que erp-pwa-operativa/src/screens/EditorHallazgo.jsx — solo
// cambia el envoltorio visual: menú centrado en vez de hoja inferior, ver §11). Componente
// CONTROLADO (hallazgo + onCambiar), sin guardar/cancelar propios — quien lo use manda esos
// botones. Condiciones de entorno, tipo de equipo, riesgos, materiales, etc. son listas
// transversales compartidas por casi todos los tipos (prop `catalogosTransversales`), no un
// campo propio de cada tipo — se resuelven vía `resolverCampo`. Nota: hoy ninguna pantalla lo
// monta (TratamientoScreen pasó a resumen de solo lectura); se mantiene actualizado por si se
// reactiva. Paleta duplicada de los tokens `t` de TratamientoScreen.jsx — evita un import
// circular (TratamientoScreen ya importa este componente si se reactiva).

// Resuelve la clave de un segmento contra los campos propios del tipo elegido; si no está
// ahí, contra el catálogo transversal. `condicionesNoAplicables` del tipo excluye valores
// solo para la lista 'condicionesEntorno'.
function resolverCampo(clave, tipoElegido, catalogoPorClave) {
    const propio = tipoElegido?.campos.find((c) => c.clave === clave);
    if (propio) return propio;
    const catalogo = catalogoPorClave.get(clave);
    if (!catalogo) return null;
    const excluidas = clave === 'condicionesEntorno' ? new Set(tipoElegido?.condicionesNoAplicables || []) : null;
    const valores = excluidas ? catalogo.valores.filter((v) => !excluidas.has(v.valor)) : catalogo.valores;
    return {
        clave,
        etiqueta: catalogo.descripcion || clave,
        tipoDato: catalogo.seleccion === 'multiple' ? 'seleccionMultiple' : 'seleccionUnica',
        opciones: valores.map((v) => v.valor),
        categorias: valores, // {valor, categoria} — solo tareasSecundarias trae categoría real
    };
}
const t = {
    superficie: '#ffffff', fondo: '#f6f5f2',
    textoPrincipal: '#1a1a18', textoSecundario2: '#4a4a44',
    textoAtenuado1: '#6b6a63', textoAtenuado2: '#75746e', textoAtenuado3: '#8a8981',
    bordeZona: 'rgba(0,0,0,.18)', hairline: 'rgba(0,0,0,.10)',
    acento: 'oklch(0.48 0.10 250)', ambar: 'oklch(0.55 0.11 65)', rojo: 'oklch(0.52 0.13 25)',
};

const estiloInput = { width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${t.bordeZona}`, borderRadius: 2, fontFamily: 'inherit' };
const estiloBotonSecundario = { padding: '7px 12px', fontSize: 12.5, fontWeight: 600, border: `1px solid ${t.bordeZona}`, background: '#fff', color: t.textoPrincipal, borderRadius: 2, cursor: 'pointer' };
const estiloBotonPrimario = { padding: '8px 16px', fontSize: 12.5, fontWeight: 700, border: 'none', background: t.textoPrincipal, color: '#fff', borderRadius: 2, cursor: 'pointer' };

export default function EditorHallazgo({ hallazgo, onCambiar, tiposTrabajo, apiBase, catalogosTransversales = [] }) {
    const [menuAbierto, setMenuAbierto] = useState(null); // campo completo (clave, tipoDato, opciones, etiqueta)
    const [subiendoFoto, setSubiendoFoto] = useState(false);

    const tipoElegido = tiposTrabajo.find((tp) => String(tp._id) === String(hallazgo.tipoTrabajoId));
    const catalogoPorClave = new Map(catalogosTransversales.map((c) => [c.clave, c]));
    const sugerencias = !tipoElegido && hallazgo.textoDescriptivo?.trim() ? sugerirTiposTrabajo(hallazgo.textoDescriptivo, tiposTrabajo) : [];
    const segmentos = tipoElegido ? generarSegmentos(tipoElegido.plantillaTexto, hallazgo.valores) : [];

    const escribir = (texto) => onCambiar({ ...hallazgo, textoDescriptivo: texto });
    // Sugerencias premarcadas (plan §6): tareasSecundarias/materiales/riesgos vienen ya
    // llenas al elegir el tipo — quien completa el informe confirma o descarta, no parte de cero.
    const elegirTipo = (tipo) => {
        const valoresIniciales = {};
        for (const s of (tipo.sugerencias || [])) {
            (valoresIniciales[s.lista] ||= []).push(s.valor);
        }
        onCambiar(recalcularTexto({ ...hallazgo, tipoTrabajoId: tipo._id, valores: valoresIniciales }, tipo));
    };
    const cambiarTipo = () => onCambiar(recalcularTexto({ ...hallazgo, tipoTrabajoId: null, valores: {} }, null));
    const cambiarValor = (clave, valor) => onCambiar(recalcularTexto({ ...hallazgo, valores: { ...hallazgo.valores, [clave]: valor } }, tipoElegido));
    const editarTextoLibre = (nuevoTexto) => onCambiar({ ...hallazgo, textoDescriptivo: nuevoTexto, textoEditadoManualmente: true });
    const onDeshacer = () => onCambiar(deshacerEdicionManual(hallazgo));

    const agregarFotoLibre = async (archivo) => {
        setSubiendoFoto(true);
        try {
            const url = await subirFoto(archivo, apiBase);
            onCambiar({ ...hallazgo, fotos: [...(hallazgo.fotos || []), url] });
        } catch {
            alert('No se pudo subir la foto — intenta de nuevo.');
        } finally { setSubiendoFoto(false); }
    };

    const agregarFotoDeCampo = async (clave, archivo) => {
        setSubiendoFoto(true);
        try {
            const url = await subirFoto(archivo, apiBase);
            cambiarValor(clave, url);
        } catch {
            alert('No se pudo subir la foto — intenta de nuevo.');
        } finally { setSubiendoFoto(false); }
    };

    // Cada espacio en blanco se llena tocándolo, sea cual sea su tipo de dato — "foto" abre el
    // selector de archivo directo (sin menú intermedio), el resto abre MenuSelector.
    const tocarSegmento = (clave, refInputFoto) => {
        const campo = resolverCampo(clave, tipoElegido, catalogoPorClave);
        if (!campo) return;
        if (campo.tipoDato === 'foto') { refInputFoto?.click(); return; }
        setMenuAbierto(campo);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!tipoElegido && (
                <div style={{ position: 'relative' }}>
                    <textarea
                        value={hallazgo.textoDescriptivo}
                        onChange={(e) => escribir(e.target.value)}
                        placeholder="¿Qué se observó? (ej: cambiar cañería de 4 pulgadas)"
                        style={{ ...estiloInput, minHeight: 120, resize: 'vertical' }}
                    />
                    {sugerencias.length > 0 && (
                        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: '#fff', border: `1px solid ${t.bordeZona}`, borderRadius: 2, boxShadow: '0 4px 14px rgba(0,0,0,.12)', zIndex: 20 }}>
                            {sugerencias.map(({ tipo }) => (
                                <button
                                    key={tipo._id}
                                    onClick={() => elegirTipo(tipo)}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: `1px solid ${t.hairline}`, fontSize: 12.5, cursor: 'pointer' }}
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
                        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{tipoElegido.nombre}</span>
                        <button onClick={cambiarTipo} style={{ background: 'none', border: 'none', color: t.acento, fontSize: 12, cursor: 'pointer' }}>Cambiar tipo</button>
                    </div>

                    <div style={{ padding: 10, background: t.fondo, borderRadius: 2, fontSize: 13, lineHeight: 1.6, border: `1px solid ${t.hairline}` }}>
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
                                style={{ ...estiloInput, minHeight: 70, resize: 'vertical', background: '#fff' }}
                            />
                        )}
                    </div>
                    {hallazgo.textoEditadoManualmente ? (
                        <button onClick={onDeshacer} style={{ ...estiloBotonSecundario, alignSelf: 'flex-start' }}>Deshacer edición</button>
                    ) : (
                        <button onClick={() => editarTextoLibre(hallazgo.textoDescriptivo)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: t.textoAtenuado1, fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer' }}>
                            Editar el texto libremente
                        </button>
                    )}
                </>
            )}

            <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: t.textoAtenuado2, marginBottom: 5 }}>Fotos</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {(hallazgo.fotos || []).map((f, i) => <img key={i} src={f} alt="" style={{ width: 60, height: 45, objectFit: 'cover', borderRadius: 2 }} />)}
                    <label style={{ ...estiloBotonSecundario, cursor: 'pointer' }}>
                        {subiendoFoto ? '…' : '+ Foto'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) agregarFotoLibre(f); e.target.value = ''; }} />
                    </label>
                </div>
            </div>

            {menuAbierto && (
                <MenuSelector
                    campo={menuAbierto}
                    valorActual={hallazgo.valores[menuAbierto.clave]}
                    onElegir={(v) => {
                        cambiarValor(menuAbierto.clave, v);
                        if (menuAbierto.tipoDato !== 'seleccionMultiple') setMenuAbierto(null);
                    }}
                    onCerrar={() => setMenuAbierto(null)}
                />
            )}
        </div>
    );
}

// Un espacio en blanco dentro del párrafo — mismo objetivo de clic sea cual sea su tipo de
// dato. "foto" lleva su propio <input type=file> oculto (se activa haciendo clic en el
// segmento, sin pasar por MenuSelector); el resto delega en onTocar.
function SegmentoCampo({ segmento, campo, onTocar, onSubirFoto, subiendo }) {
    const inputFoto = useRef(null);
    const esFoto = campo?.tipoDato === 'foto';
    return (
        <span
            onClick={() => onTocar(inputFoto.current)}
            style={{
                display: 'inline-block', padding: '0 1px',
                minWidth: segmento.pendiente ? 36 : 0,
                borderBottom: `2px solid ${segmento.pendiente ? t.ambar : t.acento}`,
                fontWeight: 600, cursor: 'pointer',
                color: segmento.pendiente ? t.ambar : t.textoPrincipal,
            }}
        >
            {/* Pendiente: solo el subrayado hace de espacio en blanco — el "___" de contenido
                (utils/motorTexto.js, usado también para el texto final guardado) sumado al
                subrayado se veía como doble línea. */}
            {subiendo ? '…' : (segmento.pendiente ? ' ' : segmento.contenido)}
            {esFoto && (
                <input
                    ref={inputFoto}
                    type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onSubirFoto(f); e.target.value = ''; }}
                />
            )}
        </span>
    );
}

// Menú simple anclado al centro — cubre todos los tipos de dato menos "foto" (esa abre el
// selector de archivo directo desde el propio segmento).
function MenuSelector({ campo, valorActual, onElegir, onCerrar }) {
    const [borrador, setBorrador] = useState(valorActual || '');
    const esMultiple = campo.tipoDato === 'seleccionMultiple';
    const esEleccion = campo.tipoDato === 'seleccionUnica' || esMultiple;
    const seleccionados = esMultiple ? (valorActual || []) : (valorActual ? [valorActual] : []);

    // Solo 'tareasSecundarias' trae categoría real (Desmontaje/Traslado/Taller/Montaje/Ajuste
    // y verificación, plan §6) — se agrupa con subtítulos; el resto se ve como lista plana.
    const agrupado = campo.categorias?.some((v) => v.categoria);
    const grupos = agrupado
        ? Object.values(campo.categorias.reduce((acc, v) => {
            const cat = v.categoria || 'Otros';
            (acc[cat] ||= { categoria: cat, opciones: [] }).opciones.push(v.valor);
            return acc;
        }, {}))
        : [{ categoria: null, opciones: campo.opciones }];

    const OpcionBoton = ({ op }) => {
        const marcada = seleccionados.includes(op);
        return (
            <button
                onClick={() => onElegir(esMultiple ? (marcada ? seleccionados.filter((x) => x !== op) : [...seleccionados, op]) : op)}
                style={{ ...estiloBotonSecundario, textAlign: 'left', borderColor: marcada ? t.textoPrincipal : t.bordeZona }}
            >
                {marcada ? '× ' : '· '}{op}
            </button>
        );
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCerrar}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 320, maxHeight: '70vh', overflowY: 'auto', background: '#fff', borderRadius: 3, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{campo.etiqueta}</div>
                {esEleccion ? (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {grupos.map((g) => (
                                <div key={g.categoria || 'todas'}>
                                    {g.categoria && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: t.textoAtenuado2, margin: '8px 0 4px' }}>{g.categoria}</div>}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {g.opciones.map((op) => <OpcionBoton key={op} op={op} />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {esMultiple && <button onClick={onCerrar} style={{ ...estiloBotonPrimario, marginTop: 10, width: '100%' }}>Listo</button>}
                    </>
                ) : (
                    <>
                        <input
                            autoFocus
                            type={campo.tipoDato === 'numero' ? 'number' : campo.tipoDato === 'fecha' ? 'date' : 'text'}
                            value={borrador}
                            onChange={(e) => setBorrador(e.target.value)}
                            style={estiloInput}
                        />
                        <button onClick={() => onElegir(borrador)} style={{ ...estiloBotonPrimario, marginTop: 10, width: '100%' }}>Listo</button>
                    </>
                )}
            </div>
        </div>
    );
}
