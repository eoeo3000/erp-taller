import { useEffect, useState } from 'react';
import axios from 'axios';
import { headerEntorno } from '../utils/entorno';

// Mejora v3 #4 — vista interna del planificador, en Operación bajo Programación (confirmado
// con el usuario). No se expone en la PWA operativa. Grilla y colores según
// docs/rediseno/design_handoff_mejoras_v3/prototipo-mejoras-v3.dc.html, pantalla "tablero".
const t = {
    textoPrincipal: '#1a1a18', textoSecundario2: '#57564f', textoAtenuado1: '#75746e', textoAtenuado2: '#8a8981', textoAtenuado3: '#a3a29a',
    bordeZona: 'rgba(0,0,0,.12)', hairline: 'rgba(0,0,0,.07)', franja: '#f7f6f2',
    acento: 'oklch(0.48 0.10 250)', rojo: '#a8412f', ambar: '#b8862f',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontMono: 'ui-monospace, Menlo, monospace',
};
const GRID = '184px repeat(6,1fr) 96px';
const PERIODOS = [['semana', 'Esta semana'], ['mes', 'Este mes'], ['trimestre', 'Trimestre']];

export default function TableroSupervisoresScreen({ API }) {
    const [periodo, setPeriodo] = useState('semana');
    const [datos, setDatos] = useState(null);

    useEffect(() => {
        axios.get(`${API}/asignaciones/tablero-supervisores`, { params: { periodo }, headers: headerEntorno() })
            .then(({ data }) => setDatos(data)).catch(() => setDatos({ supervisores: [] }));
    }, [API, periodo]);

    return (
        <div style={{ padding: '16px 20px', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Tablero de supervisores</h1>
            <div style={{ fontSize: 11, color: t.textoAtenuado1, marginBottom: 14 }}>Evaluaciones, ejecuciones e informes de cada supervisor.</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11 }}>
                {PERIODOS.map(([p, label]) => (
                    <button key={p} onClick={() => setPeriodo(p)} style={{
                        height: 26, padding: '0 11px', background: periodo === p ? '#1c1d1b' : '#fff',
                        border: `1px solid ${periodo === p ? '#1c1d1b' : 'rgba(0,0,0,.22)'}`, fontSize: 11,
                        fontWeight: periodo === p ? 700 : 400, color: periodo === p ? '#fff' : t.textoSecundario2,
                        cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi,
                    }}>{label}</button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: t.textoAtenuado2 }}>Vista interna del planificador. Los supervisores no la ven.</span>
            </div>

            {!datos ? null : (
                <div style={{ maxWidth: 1100, background: '#fff', border: `1px solid ${t.bordeZona}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '7px 12px', background: t.franja, borderBottom: `1px solid ${t.hairline}`, fontSize: 9.5, letterSpacing: '.09em', textTransform: 'uppercase', color: t.textoAtenuado2 }}>
                        <span>Supervisor</span>
                        <span style={{ textAlign: 'center' }}>Eval. pend.</span><span style={{ textAlign: 'center' }}>Eval. curso</span>
                        <span style={{ textAlign: 'center' }}>Ejec. pend.</span><span style={{ textAlign: 'center' }}>Ejec. curso</span>
                        <span style={{ textAlign: 'center' }}>Completadas</span><span style={{ textAlign: 'center' }}>Inf. atrasados</span>
                        <span style={{ textAlign: 'right' }}>Carga</span>
                    </div>
                    {datos.supervisores.length === 0 && <div style={{ padding: 16, fontSize: 12, color: t.textoAtenuado2 }}>Sin personal con puesto de supervisor.</div>}
                    {datos.supervisores.map(s => {
                        const cargaTono = s.cargaPct > 100 ? t.rojo : s.cargaPct > 80 ? t.ambar : t.acento;
                        return (
                            <div key={s.recursoId} style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '9px 12px', borderBottom: `1px solid ${t.hairline}` }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>{s.nombre}</div>
                                    <div style={{ fontSize: 10.5, color: t.textoAtenuado2 }}>{s.puesto}</div>
                                </div>
                                <span style={{ textAlign: 'center', fontFamily: t.fontMono, fontSize: 12 }}>{s.evalPend}</span>
                                <span style={{ textAlign: 'center', fontFamily: t.fontMono, fontSize: 12 }}>{s.evalCurso}</span>
                                <span style={{ textAlign: 'center', fontFamily: t.fontMono, fontSize: 12 }}>{s.ejecPend}</span>
                                <span style={{ textAlign: 'center', fontFamily: t.fontMono, fontSize: 12 }}>{s.ejecCurso}</span>
                                <span style={{ textAlign: 'center', fontFamily: t.fontMono, fontSize: 12, color: t.textoAtenuado1 }}>{s.completadas}</span>
                                <span style={{ justifySelf: 'center', fontFamily: t.fontMono, fontSize: 12, fontWeight: s.informesAtrasados > 0 ? 700 : 400, color: s.informesAtrasados > 0 ? t.rojo : t.textoAtenuado3 }}>{s.informesAtrasados}</span>
                                <div style={{ justifySelf: 'end', width: 88 }}>
                                    <div style={{ height: 6, background: '#eceae5', borderRadius: 1, overflow: 'hidden' }}><div style={{ height: 6, width: `${s.cargaPct}%`, background: cargaTono }} /></div>
                                    <div style={{ fontSize: 10, color: t.textoAtenuado2, textAlign: 'right', marginTop: 3 }}>{s.cargaPct}%</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
