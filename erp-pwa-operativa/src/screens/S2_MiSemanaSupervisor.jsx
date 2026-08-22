import { useEffect, useState } from 'react';
import { miSemana } from '../api.js';
import { detectarCruces, agruparPorOtYDia } from '../cruces.js';

const NOMBRE_DIA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const hoyISO = () => new Date().toISOString().slice(0, 10);
const fechaMono = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });

function horas(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    return h + (Number.isNaN(m) ? 0 : m) / 60;
}
const pctHora = (h) => `${h * (100 / 24)}%`;

// Alto de fila y posición de carril. La geometría original del prototipo (carriles de 42px
// cada 46px) se amplió a 60px de paso: el rótulo ahora muestra el número de OT completo y
// puede saltar de línea (pedido del usuario) en vez de recortarse con "…", así que cada
// carril necesita más aire vertical para no pisar el de al lado.
const laneTop = (i) => 6 + i * 60;
const rowHeight = (carriles) => (carriles > 0 ? 6 + carriles * 60 : 50);

function sumarDias(iso, delta) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
}

const CLAVE_AYUDA_VISTA = 'operativo.s2.ayudaDobleToqueVista';

export default function S2MiSemanaSupervisor({ nav }) {
    const [desde, setDesde] = useState(null);
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');
    // Gesto sin rótulo visible = gesto que nadie descubre (README §4): se muestra una vez y
    // no se vuelve a mostrar, con bandera en localStorage.
    const [mostrarAyuda, setMostrarAyuda] = useState(() => {
        try { return !localStorage.getItem(CLAVE_AYUDA_VISTA); } catch { return true; }
    });

    useEffect(() => {
        setDatos(null);
        miSemana(desde).then(setDatos).catch((e) => setError(e.message));
    }, [desde]);

    const entrarOT = (otId) => {
        try { localStorage.setItem(CLAVE_AYUDA_VISTA, '1'); } catch { /* privado/incognito: sin persistencia, no bloquea el uso */ }
        nav.ir('s3', { asignacion: { otId } });
    };

    // La barra superior se pinta de inmediato: al pasar de una pantalla a otra debe quedar
    // una barra visible, no una pantalla en blanco mientras carga el contenido. Los botones
    // de semana anterior/siguiente y el selector de fecha necesitan datos.dias, así que
    // quedan inertes (sin acción) hasta que la semana termine de cargar.
    const cabecera = (
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, height: 52, padding: '0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
            <button onClick={nav.volver} className="mono" style={{ flex: 'none', width: 40, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
            <span style={{ flex: 'none', fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap' }}>Mi semana</span>
            <span style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center' }}>
                <button onClick={() => datos && setDesde(sumarDias(datos.dias[0], -7))} disabled={!datos} className="mono" style={{ width: 40, height: 44, background: 'none', border: 'none', fontSize: 18, color: 'var(--texto-secundario-2)', cursor: datos ? 'pointer' : 'default' }}>‹</button>
                {/* Rótulo tapable: abre el selector de fecha nativo para ir directo a
                    cualquier semana, no solo semana anterior/siguiente de a una. */}
                <label style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 44, padding: '0 4px', cursor: datos ? 'pointer' : 'default' }}>
                    <span className="mono" style={{ fontSize: 13.5, whiteSpace: 'nowrap' }}>{datos ? `${fechaMono(datos.dias[0])} – ${fechaMono(datos.dias[6])}` : '…'}</span>
                    {datos && (
                        <input
                            type="date" value={datos.dias[0]} aria-label="Elegir semana"
                            onChange={(e) => e.target.value && setDesde(e.target.value)}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                        />
                    )}
                </label>
                <button onClick={() => datos && setDesde(sumarDias(datos.dias[0], 7))} disabled={!datos} className="mono" style={{ width: 40, height: 44, background: 'none', border: 'none', fontSize: 18, color: 'var(--texto-secundario-2)', cursor: datos ? 'pointer' : 'default' }}>›</button>
            </span>
        </header>
    );

    if (error) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div></div>;
    if (!datos) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}</div>;

    const tareas = datos.tareasSupervisadas || [];
    const grupos = agruparPorOtYDia(tareas);
    const cruces = detectarCruces(tareas);
    const totalHoras = grupos.reduce((a, g) => a + g.duracion, 0);
    const semanaActual = datos.dias.includes(hoyISO());
    const ahora = new Date();
    const horaAhora = ahora.getHours() + ahora.getMinutes() / 60;
    const cruceHoy = cruces.find((c) => c.fecha === hoyISO());

    const porDia = (dia) => grupos.filter((g) => g.fecha === dia).sort((a, b) => (horas(a.horaInicio) ?? 0) - (horas(b.horaInicio) ?? 0));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {cabecera}

            <div className="franja" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14.5, color: 'var(--texto-secundario-2)' }}>{new Set(grupos.map((g) => String(g.otId))).size} trabajos · {totalHoras} h</span>
                {semanaActual && <span className="mono" style={{ fontSize: 14 }}>{String(ahora.getHours()).padStart(2, '0')}:{String(ahora.getMinutes()).padStart(2, '0')}</span>}
                {cruceHoy && (
                    <span className="mono" style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 600, color: 'var(--detenido)' }}>
                        {NOMBRE_DIA[datos.dias.indexOf(hoyISO())]} · cruce
                    </span>
                )}
            </div>

            {mostrarAyuda && (
                <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: 'var(--en-curso)', color: '#fff' }}>
                    <span style={{ fontSize: 13.5 }}>Doble toque sobre una barra para entrar a esa OT.</span>
                    <button onClick={() => { try { localStorage.setItem(CLAVE_AYUDA_VISTA, '1'); } catch { /* sin persistencia en incógnito */ } setMostrarAyuda(false); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Entendido</button>
                </div>
            )}

            <div style={{ flex: 'none', display: 'flex', height: 30, alignItems: 'center', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
                <div style={{ width: 44, flex: 'none', borderRight: '1px solid var(--linea-fina)' }} />
                <div style={{ flex: 1, display: 'flex' }}>
                    {/* De 2 en 2 horas, no cada hora — más legible que 24 números apretados. */}
                    {Array.from({ length: 12 }, (_, i) => i * 2).map((h) => (
                        <div key={h} style={{
                            flex: 1, minWidth: 0, textAlign: 'center',
                            borderLeft: '1px solid var(--linea-zona)',
                            background: semanaActual && h === Math.floor(ahora.getHours() / 2) * 2 ? '#1c1d1b' : 'none',
                        }}>
                            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: semanaActual && h === Math.floor(ahora.getHours() / 2) * 2 ? '#fff' : 'var(--texto-atenuado-3)' }}>{h}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--superficie)' }}>
                <div style={{ position: 'relative' }}>
                    {semanaActual && (
                        <span style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${pctHora(horaAhora)} + 22px)`, width: 0, borderLeft: '2px solid rgba(28,29,27,.55)', zIndex: 0 }} />
                    )}
                    {datos.dias.slice(0, 5).map((dia, i) => (
                        <FilaDia key={dia} dia={dia} nombre={NOMBRE_DIA[i]} grupos={porDia(dia)} cruces={cruces.filter((c) => c.fecha === dia)} esHoy={dia === hoyISO()} onEntrar={entrarOT} />
                    ))}
                </div>
                {datos.dias.slice(5).map((dia, i) => (
                    <FilaFinde key={dia} dia={dia} nombre={NOMBRE_DIA[5 + i]} grupos={porDia(dia)} onEntrar={entrarOT} />
                ))}
            </div>
        </div>
    );
}

function FilaDia({ dia, nombre, grupos, cruces, esHoy, onEntrar }) {
    const alto = rowHeight(grupos.length);
    // Índice de carril de cada grupo (por orden ya de horaInicio, ver porDia): necesario
    // para saber a qué carriles corresponde cada cruce detectado.
    const indice = new Map(grupos.map((g, i) => [String(g.otId), i]));

    return (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--linea-zona)', background: esHoy ? '#f2f1ec' : 'none' }}>
            <div style={{ width: 44, flex: 'none', padding: '7px 0 0', textAlign: 'center', borderRight: '1px solid var(--linea-fina)', background: esHoy ? '#1c1d1b' : 'none' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', color: esHoy ? 'rgba(255,255,255,.62)' : 'var(--texto-atenuado-3)' }}>{nombre}</div>
                <div className="mono" style={{ marginTop: 2, fontSize: 17, fontWeight: esHoy ? 700 : 400, color: esHoy ? '#fff' : 'var(--texto-secundario-2)' }}>{Number(dia.slice(-2))}</div>
            </div>
            <div style={{
                flex: 1, minWidth: 0, position: 'relative', height: alto,
                backgroundImage: 'linear-gradient(to right, rgba(0,0,0,.075) 1px, transparent 1px), linear-gradient(to right, rgba(0,0,0,.032) 1px, transparent 1px)',
                backgroundSize: '12.5% 100%, 4.1667% 100%',
            }}>
                {grupos.map((g, i) => {
                    const hIni = horas(g.horaInicio) ?? 0;
                    const enCurso = g.estadoOT === 'En Ejecución' && esHoy;
                    return (
                        <span key={i}>
                            {/* Carril completo (README: "debería tomar todo el rectángulo de esta
                                OT") — la barra visible puede medir unos pocos px de ancho a 24h de
                                eje, así que el doble toque real se capta en todo el ancho del carril,
                                no solo sobre la barra angosta. */}
                            <span
                                onDoubleClick={() => onEntrar?.(g.otId)}
                                style={{ position: 'absolute', left: 0, width: '100%', top: laneTop(i), height: 42, cursor: onEntrar ? 'pointer' : 'default' }}
                            />
                            <span
                                style={{
                                    position: 'absolute', boxSizing: 'border-box', left: pctHora(hIni), width: `calc(${pctHora(g.duracion)} - 3px)`,
                                    top: laneTop(i), height: 42, pointerEvents: 'none',
                                    background: enCurso ? 'oklch(0.48 0.10 250 / .18)' : '#e6e4dd',
                                    borderLeft: `3px solid ${enCurso ? 'oklch(0.48 0.10 250)' : '#a3a29a'}`,
                                }} />
                            <span style={{
                                position: 'absolute', right: `calc(${pctHora(24 - hIni)} + 5px)`, top: laneTop(i), pointerEvents: 'none',
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, textAlign: 'right',
                                // Espacio real disponible a la izquierda de la barra (README §4). Ya no se
                                // recorta con "…": el número de OT va completo y la descripción puede
                                // saltar de línea (pedido del usuario) — por eso el carril se hizo más alto.
                                maxWidth: `calc(${pctHora(hIni)} - 8px)`,
                            }}>
                                <span className="mono" style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', color: enCurso ? 'var(--texto-principal)' : 'var(--texto-secundario-1)' }}>{g.numeroOT}</span>
                                {/* Máximo 2 líneas: sin este tope, una descripción larga en una barra
                                    angosta (hora temprana → poco ancho disponible) se sale del carril y
                                    pisa el de abajo — visto al probar con datos reales. */}
                                <span style={{
                                    fontSize: 13.5, fontWeight: 600, lineHeight: 1.25, color: enCurso ? 'var(--texto-principal)' : 'var(--texto-secundario-1)',
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>{g.descripcion}</span>
                            </span>
                        </span>
                    );
                })}
                {cruces.map((c, i) => {
                    const ini = Math.max(horas(c.a.horaInicio) ?? 0, horas(c.b.horaInicio) ?? 0);
                    const fin = Math.min(horas(c.a.horaFin) || 24, horas(c.b.horaFin) || 24);
                    const li = indice.get(String(c.a.otId)) ?? 0;
                    const lj = indice.get(String(c.b.otId)) ?? 0;
                    const top = laneTop(Math.min(li, lj)) - 2;
                    const bottom = laneTop(Math.max(li, lj)) + 42;
                    return (
                        <span key={i} style={{
                            position: 'absolute', boxSizing: 'border-box', left: pctHora(ini), width: pctHora(Math.max(fin - ini, 0.25)),
                            top, height: bottom - top, border: '1.5px solid oklch(0.52 0.13 25)', zIndex: 1,
                        }} />
                    );
                })}
            </div>
        </div>
    );
}

function FilaFinde({ dia, nombre, grupos, onEntrar }) {
    if (grupos.length === 0) {
        return (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--linea-zona)' }}>
                <div style={{ width: 44, flex: 'none', padding: '7px 0 0', textAlign: 'center', borderRight: '1px solid var(--linea-fina)' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--deshabilitado-1)' }}>{nombre}</div>
                    <div className="mono" style={{ marginTop: 2, fontSize: 17, color: 'var(--deshabilitado-2)' }}>{Number(dia.slice(-2))}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0, position: 'relative', height: 38, background: 'var(--fondo-pantalla)' }}>
                    <span style={{ position: 'absolute', left: 8, top: 12, fontSize: 13.5, color: 'var(--deshabilitado-1)' }}>Sin turno</span>
                </div>
            </div>
        );
    }
    return <FilaDia dia={dia} nombre={nombre} grupos={grupos} cruces={[]} esHoy={false} onEntrar={onEntrar} />;
}
