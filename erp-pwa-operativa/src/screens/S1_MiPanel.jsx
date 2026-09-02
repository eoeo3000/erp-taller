import { useEffect, useState } from 'react';
import { miPanel, miSemana, misInformes } from '../api.js';
import { detectarCruces, agruparPorOtYDia } from '../cruces.js';
import Cargando from './Cargando.jsx';

const fechaMono = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
const rangoSemana = (dias) => dias ? `${fechaMono(dias[0])} – ${fechaMono(dias[6]).split(' ')[0]}` : '';
const hoyMono = () => new Date().toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });

export default function S1MiPanel({ nav }) {
    const [panel, setPanel] = useState(null);
    const [semana, setSemana] = useState(null);
    const [informes, setInformes] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        miPanel().then(setPanel).catch((e) => setError(e.message));
        miSemana().then(setSemana).catch(() => {});
        // miPanel no trae ni los enviados del mes ni cuáles volvieron "con observaciones" —
        // eso solo está en misInformes, y es justo lo que la entrada de Solicitudes necesita
        // para avisar de una corrección pendiente sin obligar a entrar a mirar.
        misInformes().then(setInformes).catch(() => {});
    }, []);

    const enviados = informes?.enviados || [];
    const conObservaciones = enviados.filter((e) => e.revision?.estado === 'ConObservaciones');
    // Lo que efectivamente le queda por hacer al supervisor: lo que puede tomar, lo que ya es
    // suyo y no ha enviado, y lo que la oficina le devolvió con observaciones. Lo enviado y lo
    // ejecutado son consulta, no cuentan acá (van igual en la segunda línea de la entrada).
    const porHacer = (panel?.solicitudesSinInforme.count || 0) + (panel?.informesMiosSinEnviar.count || 0) + conObservaciones.length;

    const grupos = semana ? agruparPorOtYDia(semana.tareasSupervisadas || []) : [];
    const cruces = semana ? detectarCruces(semana.tareasSupervisadas || []) : [];
    const trabajosVivos = new Set(grupos.map((g) => String(g.otId))).size;
    const personas = new Set((semana?.tareasSupervisadas || []).flatMap((t) => t.operarioId || [])).size;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {/* La cabecera se pinta de inmediato, sin esperar a panel: al pasar de una
                pantalla a otra debe quedar una barra visible, no una pantalla en blanco
                mientras carga el contenido. */}
            <div style={{ flex: 'none', padding: '14px 18px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 'var(--fs-titulo)', fontWeight: 'var(--fw-titulo)' }}>{panel?.usuario.nombre || '…'}</span>
                    <span style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)' }}>{panel?.usuario.puesto || ''}</span>
                    <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--texto-atenuado-1)' }}>{hoyMono()}</span>
                </div>
            </div>

            {error && <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div>}
            {!error && !panel && <Cargando />}
            {!error && panel && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '15px 18px 6px' }}><span className="versalita">Por dónde entrar</span></div>
                <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                    <Entrada
                        conteo={trabajosVivos} borde="var(--texto-principal)"
                        titulo="Mi semana"
                        lineas={[`${rangoSemana(semana?.dias)}${personas ? ` · ${personas} persona${personas > 1 ? 's' : ''}` : ''}`]}
                        extra={cruces.length > 0 ? `${cruces.length} cruce${cruces.length > 1 ? 's' : ''}` : null}
                        colorExtra="var(--detenido)"
                        onClick={() => nav.ir('s2')}
                    />
                    <Entrada
                        conteo={panel.hoyEnTerreno.count} borde="var(--en-curso)"
                        titulo="Hoy en terreno"
                        lineas={panel.hoyEnTerreno.contexto.length ? panel.hoyEnTerreno.contexto : ['Sin trabajos en terreno hoy']}
                        colorUltima={panel.hoyEnTerreno.contexto.some((c) => c.includes('no inicia')) ? 'var(--detenido)' : 'var(--texto-secundario-2)'}
                        // S3 (Trabajo) todavía no tiene un listado propio de "OT de hoy" — con más de
                        // una OT activa, esto entra a la primera; ir a las demás queda para cuando
                        // exista esa pantalla intermedia.
                        onClick={panel.hoyEnTerreno.items?.[0] ? () => nav.ir('s3', { asignacion: { otId: panel.hoyEnTerreno.items[0].otId } }) : null}
                    />
                    {/* Una sola entrada para todo el ciclo de la solicitud — antes eran cuatro
                        ("sin informe inicial", "míos sin enviar", "enviados este mes",
                        "ejecutadas"), y la misma solicitud saltaba de un acceso a otro según
                        en qué punto estuviera. Los cuatro cortes siguen existiendo, ahora como
                        filtros dentro de S4_Solicitudes. */}
                    <Entrada
                        conteo={porHacer} borde={conObservaciones.length > 0 ? 'var(--detenido)' : 'var(--atencion)'}
                        titulo="Solicitudes"
                        lineas={[
                            `${panel.solicitudesSinInforme.count} sin informe inicial · ${panel.informesMiosSinEnviar.count} asignadas a mí`,
                            `${enviados.length} enviadas este mes · ${panel.solicitudesEjecutadas.count} ejecutadas`,
                        ]}
                        colorUltima="var(--texto-atenuado-3)"
                        extra={conObservaciones.length > 0 ? `${conObservaciones.length} con observaciones por corregir` : null}
                        colorExtra="var(--detenido)"
                        onClick={() => nav.ir('s4')}
                        ultima
                    />
                </div>

                <div style={{ padding: '18px 18px 6px' }}><span className="versalita">Seguridad y equipo</span></div>
                <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 68, padding: '13px 18px', borderBottom: '1px solid var(--linea-fina)' }}>
                        <span style={{ width: 26, height: 26, flex: 'none', background: COLOR_DEL_MES.oklch, border: '1px solid rgba(0,0,0,.25)' }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Color del mes · {COLOR_DEL_MES.nombre}</span>
                            <span style={{ display: 'block', marginTop: 3, fontSize: 13.5, lineHeight: 1.45, color: 'var(--texto-secundario-2)' }}>
                                Lo revisado este mes lleva cinta de ese color; otro color queda fuera de servicio.
                            </span>
                        </span>
                    </div>
                    {/* Sin fuente de dato real todavía (no hay colección de reflexiones de seguridad ni
                        registro de asistencia por charla) — se deja como placeholder honesto, no se
                        inventa contenido. Necesita la misma definición previa que el chat interno. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 68, padding: '13px 18px', borderBottom: '1px solid var(--linea-fina)' }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Reflexión de seguridad</span>
                            <span style={{ display: 'block', marginTop: 3, fontSize: 13.5, color: 'var(--texto-atenuado-2)' }}>Sin definir todavía — pendiente de decisión, igual que el chat</span>
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 68, padding: '13px 18px' }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Chat interno</span>
                            <span style={{ display: 'block', marginTop: 3, fontSize: 13.5, color: 'var(--texto-atenuado-2)' }}>Pendiente de definir (hilo por OT o por persona) — enlace inactivo por ahora</span>
                        </span>
                    </div>
                </div>

                <div style={{ height: 18 }} />
            </div>
            )}
        </div>
    );
}

// Dato de configuración, no calculado (README §3) — sin colección propia todavía.
const COLOR_DEL_MES = { nombre: 'amarillo', oklch: 'oklch(0.82 0.16 95)' };

function Entrada({ conteo, borde, titulo, lineas, extra, colorExtra, colorUltima, colorConteo, ultima, onClick }) {
    return (
        <div
            onClick={onClick || undefined}
            style={{
                display: 'flex', alignItems: 'center', gap: 14, minHeight: 72, padding: '13px 18px',
                borderBottom: ultima ? 'none' : '1px solid var(--linea-fina)', borderLeft: `3px solid ${borde}`,
                cursor: onClick ? 'pointer' : 'default',
            }}>
            <span className="mono" style={{ fontSize: 21, fontWeight: 600, width: 26, color: colorConteo || 'var(--texto-principal)' }}>{conteo}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>{titulo}</span>
                {lineas.map((l, i) => (
                    <span key={i} style={{ display: 'block', marginTop: i === 0 ? 3 : 2, fontSize: 13.5, color: colorUltima && i === lineas.length - 1 ? colorUltima : 'var(--texto-secundario-2)' }}>{l}</span>
                ))}
                {extra && <span style={{ display: 'block', marginTop: 2, fontSize: 13.5, color: colorExtra || 'var(--texto-secundario-2)' }}>{extra}</span>}
            </span>
            {onClick && <span className="mono" style={{ fontSize: 18, color: 'var(--deshabilitado-1)' }}>›</span>}
        </div>
    );
}
