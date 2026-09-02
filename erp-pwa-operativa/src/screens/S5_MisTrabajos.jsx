import { useEffect, useState } from 'react';
import { misTrabajos } from '../api.js';
import { hoyISO } from '../fecha.js';
import Cargando from './Cargando.jsx';

// Reemplaza la entrada "Hoy en terreno" del panel, que solo mostraba el día de hoy: para saber
// qué venía después había que entrar a "Mi semana" e ir pasando semana por semana, sin ver
// nunca cuánto trabajo hay en total. Acá está todo lo asignado por ejecutar, con un filtro por
// día de hoy y uno por cada semana QUE TIENE trabajo (las vacías no se listan, no aportan), y
// desde cada semana se puede saltar a Mi semana parada en ella.
const NOMBRE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (iso) => {
    const [, mm, dd] = iso.split('-');
    return `${Number(dd)} ${NOMBRE_MES[Number(mm) - 1]}`;
};
const NOMBRE_DIA = { 1: 'lun', 2: 'mar', 3: 'mié', 4: 'jue', 5: 'vie', 6: 'sáb', 0: 'dom' };
const diaDe = (iso) => NOMBRE_DIA[new Date(`${iso}T12:00:00`).getDay()];

function sumarDias(iso, delta) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lunesDe(iso) {
    const d = new Date(`${iso}T12:00:00`);
    const dia = d.getDay();
    return sumarDias(iso, dia === 0 ? -6 : 1 - dia);
}

const COLOR_ESTADO = { 'En Ejecución': 'var(--en-curso)' };

export default function S5MisTrabajos({ nav }) {
    const [trabajos, setTrabajos] = useState(null);
    const [error, setError] = useState('');
    const [filtroElegido, setFiltroElegido] = useState(null);

    useEffect(() => { misTrabajos().then((d) => setTrabajos(d.trabajos)).catch((e) => setError(e.message)); }, []);

    const hoy = hoyISO();
    const lunesActual = lunesDe(hoy);

    // La barra superior se pinta de inmediato: al pasar de una pantalla a otra debe quedar
    // una barra visible, no una pantalla en blanco mientras carga el contenido.
    const cabecera = (
        <header style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px 0 8px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-zona)' }}>
            <button onClick={nav.volver} className="mono" style={{ width: 44, height: 44, background: 'none', border: 'none', fontSize: 20, color: 'var(--texto-secundario-2)', cursor: 'pointer' }}>‹</button>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Mis trabajos</span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--texto-atenuado-1)' }}>
                {trabajos ? `${trabajos.length} por ejecutar` : ''}
            </span>
        </header>
    );

    if (error) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--detenido)' }}>{error}</div></div>;
    if (!trabajos) return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{cabecera}<Cargando /></div>;

    // Un trabajo de varios días puede caer en más de una semana: cuenta en cada una de ellas,
    // que es lo que hace falta para saber cuánto hay esa semana. Los que no tienen ninguna
    // fecha van a su propio grupo — si no, quedaban asignados pero invisibles en todas las vistas.
    const porSemana = new Map();
    const sinFecha = [];
    for (const t of trabajos) {
        if (!t.fechas?.length) { sinFecha.push(t); continue; }
        for (const lunes of new Set(t.fechas.map(lunesDe))) {
            if (!porSemana.has(lunes)) porSemana.set(lunes, []);
            porSemana.get(lunes).push(t);
        }
    }
    const semanas = [...porSemana.keys()].sort();
    const deHoy = trabajos.filter((t) => (t.fechas || []).includes(hoy));

    const etiquetaSemana = (lunes) => {
        if (lunes === lunesActual) return 'Esta semana';
        if (lunes === sumarDias(lunesActual, 7)) return 'Próxima';
        return `${fechaCorta(lunes)} – ${fechaCorta(sumarDias(lunes, 6))}`;
    };

    const filtros = [
        { id: 'hoy', etiqueta: 'Hoy', conteo: deHoy.length },
        ...semanas.map((lunes) => ({ id: lunes, etiqueta: etiquetaSemana(lunes), conteo: porSemana.get(lunes).length, lunes })),
        ...(sinFecha.length ? [{ id: 'sin-fecha', etiqueta: 'Sin fecha', conteo: sinFecha.length }] : []),
    ];

    // Se abre en el día de hoy si hay algo; si no, en la primera semana con trabajo — entrar a
    // una lista vacía cuando sí hay trabajo más adelante es la queja que originó esta pantalla.
    const filtro = filtroElegido
        || (deHoy.length ? 'hoy' : semanas.find((l) => l >= lunesActual) || semanas[0] || (sinFecha.length ? 'sin-fecha' : 'hoy'));
    const filtroActual = filtros.find((f) => f.id === filtro) || filtros[0];
    const lunesDelFiltro = filtroActual?.lunes || null;

    const lista = filtro === 'hoy' ? deHoy
        : filtro === 'sin-fecha' ? sinFecha
            : (porSemana.get(filtro) || []);

    // Qué días de los que se están mirando toca este trabajo — con el filtro de hoy alcanza la
    // hora; en una semana importa qué días de esa semana ocupa, no toda su lista de fechas.
    const detalleFechas = (t) => {
        if (filtro === 'sin-fecha') return 'Sin fecha asignada';
        if (filtro === 'hoy') return `hoy${t.horaInicio ? ` ${t.horaInicio}` : ''} · ${t.horas} h`;
        const enLaSemana = (t.fechas || []).filter((f) => lunesDe(f) === filtro);
        const dias = enLaSemana.map((f) => `${diaDe(f)} ${Number(f.slice(-2))}`).join(', ');
        return `${dias}${t.horaInicio && enLaSemana.includes(t.fechas[0]) ? ` · ${t.horaInicio}` : ''} · ${t.horas} h`;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {cabecera}

            {/* Scroll horizontal: la cantidad de chips depende de en cuántas semanas haya
                trabajo, así que no se puede contar con que entren todos a lo ancho. */}
            <div style={{ flex: 'none', display: 'flex', gap: 8, padding: '10px 14px', background: 'var(--superficie)', borderBottom: '1px solid var(--linea-fina)', overflowX: 'auto' }}>
                {filtros.map((f) => {
                    const activo = f.id === filtro;
                    return (
                        <button
                            key={f.id}
                            onClick={() => setFiltroElegido(f.id)}
                            style={{
                                flex: 'none', minHeight: 40, padding: '0 12px', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
                                background: activo ? 'var(--accion-primaria)' : 'var(--superficie)',
                                color: activo ? 'var(--accion-primaria-texto)' : 'var(--texto-secundario-1)',
                                border: `1px solid ${activo ? 'var(--accion-primaria)' : 'rgba(0,0,0,.18)'}`,
                                fontSize: 13.5, fontWeight: 600,
                            }}
                        >
                            {f.etiqueta}
                            <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, opacity: activo ? 1 : (f.conteo > 0 ? 1 : .45) }}>{f.conteo}</span>
                        </button>
                    );
                })}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {trabajos.length === 0 ? (
                    <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>
                        No tienes trabajos asignados por ejecutar. Aparecen acá cuando la oficina programa una OT contigo a cargo.
                    </div>
                ) : (
                    <>
                        {lunesDelFiltro && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px 8px' }}>
                                <span className="versalita">{fechaCorta(lunesDelFiltro)} – {fechaCorta(sumarDias(lunesDelFiltro, 6))}</span>
                                <button
                                    onClick={() => nav.ir('s2', { desde: lunesDelFiltro })}
                                    style={{ marginLeft: 'auto', minHeight: 36, padding: '0 12px', background: 'var(--superficie)', border: '1px solid rgba(0,0,0,.18)', borderRadius: 'var(--radio)', fontSize: 13, fontWeight: 600, color: 'var(--texto-secundario-1)', cursor: 'pointer' }}
                                >Ver la semana día a día ›</button>
                            </div>
                        )}

                        {lista.length === 0 ? (
                            <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>
                                {filtro === 'hoy' ? 'Hoy no tienes trabajo en terreno.' : 'Nada en este tramo.'}
                            </div>
                        ) : (
                            <div style={{ background: 'var(--superficie)', borderTop: '1px solid var(--linea-fina)', borderBottom: '1px solid var(--linea-fina)' }}>
                                {lista.map((t, i) => (
                                    <div
                                        key={t.otId} onClick={() => nav.ir('s3', { asignacion: { otId: t.otId } })}
                                        style={{
                                            display: 'flex', gap: 12, padding: '13px 18px', cursor: 'pointer',
                                            borderBottom: i === lista.length - 1 ? 'none' : '1px solid var(--linea-fina)',
                                            borderLeft: `3px solid ${COLOR_ESTADO[t.estado] || 'transparent'}`,
                                        }}
                                    >
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{t.descripcion}</span>
                                            <span style={{ display: 'block', marginTop: 3, fontSize: 13, color: 'var(--texto-secundario-2)' }}>
                                                {t.numeroOT} · {t.solicitante}
                                            </span>
                                            <span className="mono" style={{ display: 'block', marginTop: 6, fontSize: 12.5, color: t.estado === 'En Ejecución' ? 'var(--en-curso)' : 'var(--texto-atenuado-1)' }}>
                                                {detalleFechas(t)}{t.estado === 'En Ejecución' ? ' · en ejecución' : ''}
                                            </span>
                                        </span>
                                        <span className="mono" style={{ alignSelf: 'center', fontSize: 18, color: 'var(--deshabilitado-1)' }}>›</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                <div style={{ height: 18 }} />
            </div>
        </div>
    );
}
