// Compresión y ancho máximo de las fotos: no se reprocesan acá. Las fotos ya llegan
// comprimidas desde el origen — O3/O4 (PWA Operativa) y el portal por token
// (otController.supervisorPortal, previsualizarFoto) recomprimen a un ancho máximo de
// 1200px y calidad JPEG .75 antes de guardarlas en OT.reportes[]. Esta pantalla solo las
// muestra a ancho completo de tarjeta (ver spec: "foto de 190px de alto a ancho completo"),
// sin volver a tocar el archivo — sería recomprimir una imagen ya comprimida sin necesidad.
const fmtHora = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

export default function C4AvanceFotos({ nav, trabajo }) {
    if (!trabajo) return null;
    const ot = trabajo.ot;
    const reportes = [...(ot?.reportes || [])].reverse();
    const total = (ot?.tareas || []).length;
    const listas = (ot?.tareas || []).filter((t) => t.completada).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }} className="mono">‹</button>
                <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Avance</span>
            </header>

            <div className="franja">
                <div style={{ fontSize: 'var(--fs-secundario)', fontWeight: 600 }}>
                    {ot?.estado === 'En Ejecución' ? 'En ejecución' : ot?.estado} · {listas} de {total} tareas listas
                </div>
                <div style={{ height: 4, background: 'var(--linea-zona)', marginTop: 8 }}>
                    <div style={{ height: 4, width: total ? `${Math.round((listas / total) * 100)}%` : '0%', background: 'var(--en-curso)' }} />
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {reportes.length === 0 && <div style={{ padding: 24, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)' }}>Todavía no hay reportes de terreno.</div>}
                {reportes.map((r, i) => (
                    <div key={i} style={{ borderBottom: '1px solid var(--linea-fina)', padding: '14px 16px' }}>
                        <div className="mono" style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-1)' }}>
                            {fmtHora(r.fecha)}{r.usuario ? ` · ${r.usuario}` : ''}
                        </div>
                        {r.foto && <img src={r.foto} alt="" style={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 'var(--radio)', marginTop: 8 }} />}
                        {r.comentario && <div style={{ fontSize: 14.5, marginTop: 8 }}>{r.comentario}</div>}
                    </div>
                ))}
            </div>

            <div style={{ padding: '14px 16px', fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-2)' }}>
                Las fotos las sube el equipo en terreno. Se publican al momento, sin edición.
            </div>
        </div>
    );
}
