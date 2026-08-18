import { useState } from 'react';
import { crearSolicitud, getSesion } from '../api.js';

const URGENCIAS = ['Puede esperar', 'Esta semana', 'Detiene la producción'];

function fotoAThumb(archivo) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(archivo);
    });
}

export default function C6PedirServicio({ nav }) {
    const [paso, setPaso] = useState(1);
    const sesion = getSesion();
    const [form, setForm] = useState({
        descripcion: '', plazoEjecucionSugerido: '', adjuntos: '',
        empresaSolicitante: sesion.empresa || '', solicitante: '', correo: '', numero: '', direccion: '',
    });
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const [enviado, setEnviado] = useState(null);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const agregarFoto = async (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;
        set('adjuntos', await fotoAThumb(archivo));
    };

    const enviar = async () => {
        if (!form.empresaSolicitante || !form.solicitante || !form.descripcion) {
            setError('Complete empresa, nombre y descripción.'); return;
        }
        setEnviando(true); setError('');
        try {
            const d = await crearSolicitud(form);
            setEnviado(d);
        } catch (err) {
            setError(err.message);
        } finally {
            setEnviando(false);
        }
    };

    if (enviado) {
        return (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--fs-titulo)', fontWeight: 700 }}>Solicitud enviada</div>
                <div style={{ fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-atenuado-1)', marginTop: 8 }}>Guarde este número para consultar el estado:</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 16 }}>{enviado.numeroSolicitud}</div>
                <button className="boton-primario" style={{ marginTop: 24 }} onClick={() => nav.irRaiz('c1')}>Entendido</button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid var(--linea-zona)' }}>
                <button onClick={() => (paso === 1 ? nav.volver() : setPaso(1))} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8, marginLeft: -8 }} className="mono">‹</button>
                <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Pedir un servicio</span>
            </header>

            <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
                {paso === 1 ? (
                    <>
                        <label className="versalita">Descripción</label>
                        <textarea className="input-campo" style={{ minHeight: 120, marginTop: 6, resize: 'vertical' }}
                            value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)}
                            placeholder="Ej: se rompió la correa de la cinta transportadora en la línea 2" />

                        <div style={{ marginTop: 16 }} className="versalita">Urgencia</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                            {URGENCIAS.map((u) => (
                                <button key={u} className="boton-secundario" style={{ minHeight: 52, textAlign: 'left', paddingLeft: 14, borderColor: form.plazoEjecucionSugerido === u ? 'var(--texto-principal)' : 'var(--linea-zona)', fontWeight: form.plazoEjecucionSugerido === u ? 700 : 600 }}
                                    onClick={() => set('plazoEjecucionSugerido', u)}>
                                    <span className="mono" style={{ marginRight: 8 }}>{form.plazoEjecucionSugerido === u ? '×' : '·'}</span>{u}
                                </button>
                            ))}
                        </div>

                        <div style={{ marginTop: 16 }} className="versalita">Foto (opcional)</div>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 96, border: '1px dashed var(--linea-zona)', borderRadius: 'var(--radio)', marginTop: 6, cursor: 'pointer', overflow: 'hidden' }}>
                            {form.adjuntos ? <img src={form.adjuntos} alt="" style={{ height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)' }}>Agregar foto</span>}
                            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={agregarFoto} />
                        </label>
                    </>
                ) : (
                    <>
                        <Campo label="Empresa"><input className="input-campo" value={form.empresaSolicitante} onChange={(e) => set('empresaSolicitante', e.target.value)} /></Campo>
                        <Campo label="Su nombre"><input className="input-campo" value={form.solicitante} onChange={(e) => set('solicitante', e.target.value)} /></Campo>
                        <Campo label="Teléfono"><input className="input-campo" value={form.numero} onChange={(e) => set('numero', e.target.value)} inputMode="tel" /></Campo>
                        <Campo label="Correo"><input className="input-campo" type="email" value={form.correo} onChange={(e) => set('correo', e.target.value)} /></Campo>
                        <Campo label="Dirección"><input className="input-campo" value={form.direccion} onChange={(e) => set('direccion', e.target.value)} /></Campo>
                        {error && <div style={{ marginTop: 12, fontSize: 'var(--fs-secundario)', color: 'var(--detenido)' }}>{error}</div>}
                    </>
                )}
            </div>

            <div className="pie-accion">
                {paso === 1
                    ? <button className="boton-primario" onClick={() => setPaso(2)}>Siguiente: sus datos</button>
                    : <button className="boton-primario" disabled={enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</button>}
            </div>
        </div>
    );
}

function Campo({ label, children }) {
    return (
        <label style={{ display: 'block', marginTop: 14 }}>
            <span className="versalita">{label}</span>
            <div style={{ marginTop: 6 }}>{children}</div>
        </label>
    );
}
