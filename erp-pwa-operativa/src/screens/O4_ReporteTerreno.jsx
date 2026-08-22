import { useState } from 'react';
import { accionOT, subirDataURL } from '../api.js';
import { encolarReporte } from '../db.js';

// La foto se mantiene como data: URI SOLO en memoria/IndexedDB (para la vista previa y la
// cola sin señal); recién al enviar (o al reintentar, ver App.jsx) se sube como archivo
// real y se manda la URL — nunca queda un base64 guardado en el documento de la OT (una
// sola foto de 256KB así hacía que cualquier consulta de esa OT tardara varios segundos,
// visto en producción).
function comprimirFoto(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 1200;
                let w = img.width, h = img.height;
                if (w > MAX) { h = Math.round((h * MAX) / w); w = MAX; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(archivo);
    });
}

const MAX_COMENTARIO = 400;

export default function O4ReporteTerreno({ nav, asignacion }) {
    const [fotos, setFotos] = useState([]);
    const [comentario, setComentario] = useState('');
    const [tipo, setTipo] = useState('normal');
    const [enviando, setEnviando] = useState(false);
    const [avisoCola, setAvisoCola] = useState(false);
    const otId = asignacion?.otId;

    const agregarFoto = async (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;
        const b64 = await comprimirFoto(archivo);
        setFotos((f) => [...f, b64]);
        e.target.value = '';
    };

    const guardarYEnviar = async () => {
        if (!comentario.trim() && fotos.length === 0) return;
        setEnviando(true);
        const comentarioFinal = tipo === 'decision' ? `[Requiere decisión de la oficina] ${comentario}` : comentario;
        try {
            // Se sube recién acá, no al tomar la foto: si falla (sin señal), el data: URI
            // todavía en memoria es justo lo que hay que encolar para reintentar después.
            const fotoUrl = fotos[0] ? await subirDataURL(fotos[0]) : '';
            await accionOT(otId, { accion: 'reporte', comentario: comentarioFinal, foto: fotoUrl });
            nav.volver();
        } catch {
            await encolarReporte({ otId, comentario: comentarioFinal, foto: fotos[0] || '' });
            setAvisoCola(true);
            setTimeout(() => nav.volver(), 1200);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={nav.volver} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }} className="mono">‹</button>
                <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Reporte de terreno</span>
            </header>

            <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
                <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: 220, border: '1px dashed var(--linea-zona)', borderRadius: 'var(--radio)', cursor: 'pointer',
                }}>
                    <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Tomar foto</span>
                    <span style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)', marginTop: 4 }}>o elegir de la galería</span>
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={agregarFoto} />
                </label>

                {fotos.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                        {fotos.map((f, i) => <img key={i} src={f} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 'var(--radio)' }} />)}
                        <span className="mono" style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-1)' }}>{fotos.length}</span>
                    </div>
                )}

                <textarea
                    value={comentario}
                    maxLength={MAX_COMENTARIO}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Describe el avance..."
                    style={{
                        width: '100%', minHeight: 120, marginTop: 16, padding: 12, fontSize: 'var(--fs-cuerpo)',
                        border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)', fontFamily: 'inherit', resize: 'vertical',
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-1)' }}>Se ve en el portal del cliente</span>
                    <span className="mono" style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-1)' }}>{comentario.length} / {MAX_COMENTARIO}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                    <OpcionRadio label="Avance normal" activo={tipo === 'normal'} onClick={() => setTipo('normal')} />
                    <OpcionRadio label="Requiere decisión de la oficina" activo={tipo === 'decision'} onClick={() => setTipo('decision')} />
                </div>
            </div>

            <div className="pie-accion">
                {(avisoCola || !navigator.onLine) && (
                    <div style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--atencion)', fontWeight: 600 }}>
                        El reporte queda en el teléfono y se envía solo al recuperar conexión.
                    </div>
                )}
                <button className="boton-primario" disabled={enviando} onClick={guardarYEnviar}>
                    {enviando ? 'Guardando…' : 'Guardar y enviar'}
                </button>
            </div>
        </div>
    );
}

function OpcionRadio({ label, activo, onClick }) {
    return (
        <button
            onClick={onClick}
            className="boton-secundario"
            style={{
                minHeight: 52, textAlign: 'left', paddingLeft: 14,
                borderColor: activo ? 'var(--texto-principal)' : 'var(--linea-zona)',
                fontWeight: activo ? 700 : 600,
            }}
        >
            <span className="mono" style={{ marginRight: 8 }}>{activo ? '×' : '·'}</span>{label}
        </button>
    );
}
