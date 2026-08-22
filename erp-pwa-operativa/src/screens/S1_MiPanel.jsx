import { useEffect, useState } from 'react';
import { miPanel, miSemana } from '../api.js';
import { detectarCruces, agruparPorOtYDia } from '../cruces.js';

const fechaMono = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
const rangoSemana = (dias) => dias ? `${fechaMono(dias[0])} – ${fechaMono(dias[6]).split(' ')[0]}` : '';
const hoyMono = () => new Date().toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });

export default function S1MiPanel({ nav }) {
    const [panel, setPanel] = useState(null);
    const [semana, setSemana] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        miPanel().then(setPanel).catch((e) => setError(e.message));
        miSemana().then(setSemana).catch(() => {});
    }, []);

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
            {!error && !panel && null}
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
                    <Entrada
                        conteo={panel.solicitudesSinInforme.count} borde="var(--atencion)"
                        titulo="Solicitudes sin informe inicial"
                        lineas={['sin supervisor · puedo asignármelas']}
                        extra={panel.solicitudesSinInforme.diasMasAntigua != null ? `la más antigua lleva ${panel.solicitudesSinInforme.diasMasAntigua} día(s)` : null}
                        colorExtra="var(--atencion)"
                        onClick={() => nav.ir('s4')}
                    />
                    <Entrada
                        conteo={panel.informesMiosSinEnviar.count} borde="var(--detenido)"
                        titulo="Informes iniciales míos sin enviar"
                        lineas={['pendientes de completar y enviar']}
                        extra={panel.informesMiosSinEnviar.diasMasAntigua != null ? `${panel.informesMiosSinEnviar.numeroMasAntigua || 'el más antiguo'} lleva ${panel.informesMiosSinEnviar.diasMasAntigua} día(s)` : null}
                        colorExtra="var(--detenido)"
                        onClick={() => nav.ir('s5')}
                    />
                    <Entrada
                        conteo={panel.solicitudesEjecutadas.count} borde="var(--deshabilitado-2)" colorConteo="var(--texto-secundario-2)"
                        titulo="Solicitudes ejecutadas"
                        lineas={['solo para revisar · últimos 30 días']}
                        colorUltima="var(--texto-atenuado-3)"
                        onClick={() => nav.ir('s6')}
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
