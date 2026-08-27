// Extraído de TratamientoScreen.jsx — ver plan de robustecimiento, punto 6.
import { useState } from 'react';
import { t, styles } from './comunTratamiento';

// Mejora v3 #5 — Carpeta de OT: documento interno consolidado (informe de evaluación,
// tareas y metodología, recursos, cotización, informes de ejecución, OC), no se envía al
// cliente. Se regenera bajo demanda en vez de guardar el PDF en la OT (evitar blobs
// grandes en Mongo, sin storage de archivos configurado en el proyecto) — solo queda el
// registro de cuándo se generó, quién y con qué secciones (OT.carpetaOT).
function construirIndiceCarpeta({ otSeleccionada, tareas, componentes }) {
    const tareasConDesarrollo = tareas.filter(tt => (tt.desarrollo || '').trim()).length;
    const reportes = otSeleccionada.reportes || [];
    const fotosReportes = reportes.filter(r => r.foto).length;
    const ocs = otSeleccionada.ordenesCompra || [];
    return [
        { k: 'evaluacion', label: 'Informe de evaluación', activo: !!otSeleccionada.informeEvaluacion?.completo,
            detalle: otSeleccionada.informeEvaluacion?.fecha ? `Visita del ${otSeleccionada.informeEvaluacion.fecha} · ${otSeleccionada.informeEvaluacion.fotos?.length || 0} fotos` : 'Sin informe de evaluación',
            resumen: 'Diagnóstico en faena, mediciones y registro fotográfico del estado inicial.', pags: otSeleccionada.informeEvaluacion?.completo ? 2 : 0 },
        { k: 'tareas', label: 'Tareas y metodología', activo: tareas.length > 0,
            detalle: `${tareasConDesarrollo} de ${tareas.length} tareas con desarrollo definido`,
            resumen: 'Alcance comprometido y cómo se ejecutó cada tarea.', pags: Math.max(1, Math.ceil(tareas.length / 4)) },
        { k: 'recursos', label: 'Recursos asignados', activo: tareas.length > 0 || componentes.length > 0,
            detalle: 'Personal, equipos y materiales', resumen: 'Personal, horas hombre, equipos y materiales consumidos.', pags: 1 },
        { k: 'cotizacion', label: 'Cotización aprobada', activo: ['Programada', 'En Ejecución', 'Trabajo Terminado', 'Con Informe', 'Pagada'].includes(otSeleccionada.estado),
            detalle: `${otSeleccionada.numeroOT || 'Sin OT'} · ${otSeleccionada.estado}`, resumen: 'Desglose comercial y condiciones aceptadas por el cliente.', pags: 1 },
        { k: 'ejecucion', label: 'Informes de ejecución', activo: reportes.length > 0,
            detalle: `${reportes.length} informes de terreno · ${fotosReportes} fotos`, resumen: 'Avance por jornada, desviaciones y respaldo fotográfico.', pags: Math.max(1, Math.ceil(reportes.length / 2)) },
        { k: 'ocs', label: 'Órdenes de compra', activo: ocs.length > 0,
            detalle: `${ocs.length} OC a proveedores`, resumen: 'Compras asociadas a la OT con proveedor y monto.', pags: ocs.length > 0 ? 1 : 0 },
    ];
}

export default function TabDocumentosPdf({ otSeleccionada, tareas, componentes, antecedentes, onGenerar }) {
    const indiceCompleto = construirIndiceCarpeta({ otSeleccionada, tareas, componentes });
    const [marcados, setMarcados] = useState(() => Object.fromEntries(indiceCompleto.map(it => [it.k, it.activo])));
    const [generadoPor, setGeneradoPor] = useState('');
    const [aviso, setAviso] = useState('');

    const seleccionados = indiceCompleto.filter(it => marcados[it.k]);
    const totalPags = 1 + seleccionados.reduce((a, it) => a + it.pags, 0); // +1 portada

    const generar = () => {
        if (!generadoPor.trim()) { setAviso('Escribe quién genera la carpeta.'); return; }
        onGenerar(seleccionados, generadoPor.trim(), totalPags);
        setAviso(`Carpeta generada: OT-${otSeleccionada.numeroOT || 'nueva'}-carpeta.pdf`);
    };

    return (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', padding: 16 }}>
            <div style={{ width: 300, flex: 'none', background: t.superficie, border: `1px solid ${t.bordeZona}` }}>
                <div style={{ padding: '9px 12px', background: t.encabezadoTabla, borderBottom: `1px solid ${t.hairlineBloque}`, fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3 }}>Contenido de la carpeta</div>
                {indiceCompleto.map(it => (
                    <label key={it.k} style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 9, alignItems: 'center', padding: '9px 12px', borderBottom: `1px solid ${t.hairlineFila}`, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!marcados[it.k]} onChange={() => { setMarcados(m => ({ ...m, [it.k]: !m[it.k] })); setAviso(''); }} style={{ width: 14, height: 14 }} />
                        <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600 }}>{it.label}</span>
                            <span style={{ display: 'block', fontSize: 10.5, color: t.textoAtenuado3 }}>{it.detalle}</span>
                        </span>
                        <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.textoDeshabilitado }}>{it.pags} p</span>
                    </label>
                ))}
                <div style={{ padding: 11 }}>
                    <div style={{ fontSize: 10.5, color: t.textoAtenuado3, lineHeight: 1.5, marginBottom: 8 }}>Documento interno. No se envía al cliente.</div>
                    <input placeholder="Generado por" value={generadoPor} onChange={e => { setGeneradoPor(e.target.value); setAviso(''); }} style={{ ...styles.inputPlano, marginBottom: 8, border: `1px solid ${t.bordeInput}` }} />
                    <button onClick={generar} style={{ ...styles.btnPrimario, width: '100%' }}>Generar carpeta de OT</button>
                    <div style={{ fontSize: 10.5, color: aviso.startsWith('Carpeta') ? t.verde : t.rojo, marginTop: 7, minHeight: 14 }}>{aviso}</div>
                </div>
            </div>

            <div style={{ width: 600, maxWidth: '100%', background: '#fff', border: `1px solid ${t.bordeZona}`, padding: '28px 32px', boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
                <div style={{ borderBottom: '2px solid #1c1d1b', paddingBottom: 9 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '.13em', textTransform: 'uppercase', color: t.textoAtenuado3 }}>Carpeta de orden de trabajo</div>
                    <div style={{ fontSize: 19, fontWeight: 700, marginTop: 3 }}>{otSeleccionada.numeroOT || 'Sin número'}</div>
                    <div style={{ fontSize: 11, color: t.textoAtenuado1, marginTop: 2 }}>
                        {otSeleccionada.solicitante || 'Cliente'} · {antecedentes?.solicitud?.direccion || 'Sin faena registrada'} · Supervisor {antecedentes?.ot?.supervisor?.nombre || 'sin asignar'}
                    </div>
                </div>
                {seleccionados.length === 0 && <div style={{ padding: '16px 0', fontSize: 11.5, color: t.textoAtenuado3 }}>Marca al menos una sección para ver el índice.</div>}
                {seleccionados.map((it, i) => (
                    <div key={it.k} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 46px', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: `1px solid ${t.hairlineFila}` }}>
                        <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textoDeshabilitado }}>{String(i + 1).padStart(2, '0')}</span>
                        <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{it.label}</span>
                            <span style={{ display: 'block', fontSize: 11, color: t.textoAtenuado1, lineHeight: 1.5 }}>{it.resumen}</span>
                        </span>
                        <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.textoDeshabilitado, textAlign: 'right' }}>{it.pags} p</span>
                    </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 10.5, color: t.textoAtenuado3 }}>
                    <span>{generadoPor ? `Generado el ${new Date().toLocaleDateString('es-CL')} por ${generadoPor}` : 'Sin generar todavía'}</span>
                    <span style={{ fontFamily: t.fontMono }}>{totalPags} páginas</span>
                </div>
            </div>
        </div>
    );
}
