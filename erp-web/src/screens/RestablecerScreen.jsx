import React, { useState } from 'react';
import axios from 'axios';

// Pantalla que abre el link del correo de recuperación (`/restablecer?token=...&entorno=...`,
// armado en erp-backend/src/controllers/authController.js). Es pública: quien llega acá es
// justamente alguien que no puede entrar.
const t = {
    superficie: '#ffffff',
    textoPrincipal: '#1a1a18',
    textoAtenuado2: '#75746e',
    textoAtenuado3: '#8a8981',
    bordeZona: 'rgba(0,0,0,.12)',
    bordeInput: 'rgba(0,0,0,.18)',
    acento: 'oklch(0.48 0.10 250)',
    error: 'oklch(0.52 0.13 25)',
    ok: 'oklch(0.48 0.10 155)',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

export default function RestablecerScreen({ API }) {
    const parametros = new URLSearchParams(window.location.search);
    const token = parametros.get('token') || '';
    // El entorno viaja en el link y NO se toma de localStorage: el correo pudo emitirse
    // desde demostración mientras este navegador tiene producción elegida. Se manda como
    // header porque resolverEntorno le da prioridad al header por sobre la query.
    const entorno = parametros.get('entorno') === 'demo' ? 'demo' : 'produccion';

    const [password, setPassword] = useState('');
    const [repetida, setRepetida] = useState('');
    const [error, setError] = useState('');
    const [listo, setListo] = useState(false);
    const [enviando, setEnviando] = useState(false);

    const guardar = async (evento) => {
        evento.preventDefault();
        setError('');
        if (password !== repetida) return setError('Las dos claves no coinciden.');
        setEnviando(true);
        try {
            await axios.post(`${API}/auth/restablecer`, { token, password }, { headers: { 'X-Entorno': entorno } });
            setListo(true);
        } catch (e) {
            setError(e?.response?.data?.error || 'No se pudo cambiar la clave.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div style={styles.raiz}>
            <div style={styles.tarjeta}>
                <div style={styles.marca}>Taller ERP</div>
                <div style={styles.form}>
                    <div style={styles.titulo}>Nueva clave</div>

                    {!token && <div style={styles.error}>Este link está incompleto. Pide uno nuevo desde "Olvidé mi clave".</div>}

                    {listo ? (
                        <>
                            <div style={styles.aviso}>
                                Tu clave quedó cambiada. Si tenías la app abierta en otro lado, esa sesión se cerró.
                            </div>
                            <a href="/" style={styles.btnPrimarioLink}>Ir a ingresar</a>
                        </>
                    ) : token && (
                        <form onSubmit={guardar} style={styles.form2}>
                            <label style={styles.campo}>
                                <span style={styles.etiqueta}>Clave nueva</span>
                                <input type="password" value={password} autoFocus required minLength={8} autoComplete="new-password"
                                    onChange={(e) => setPassword(e.target.value)} style={styles.input} />
                            </label>
                            <label style={styles.campo}>
                                <span style={styles.etiqueta}>Repite la clave</span>
                                <input type="password" value={repetida} required minLength={8} autoComplete="new-password"
                                    onChange={(e) => setRepetida(e.target.value)} style={styles.input} />
                            </label>
                            <div style={styles.ayudaChica}>Mínimo 8 caracteres.</div>
                            {error && <div style={styles.error}>{error}</div>}
                            <button type="submit" disabled={enviando} style={styles.btnPrimario}>
                                {enviando ? 'Guardando…' : 'Guardar'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

const styles = {
    raiz: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100dvh', width: '100%', padding: 16,
        background: '#eceae5', color: t.textoPrincipal, fontFamily: t.fontUi, fontSize: 13,
    },
    tarjeta: {
        width: '100%', maxWidth: 328, background: t.superficie,
        border: `1px solid ${t.bordeZona}`, borderRadius: 3, overflow: 'hidden',
        boxShadow: '0 8px 28px rgba(0,0,0,.10)',
    },
    marca: {
        padding: '13px 20px', background: '#1c1d1b', color: '#e8e7e3',
        fontSize: 12.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
    },
    form: { display: 'flex', flexDirection: 'column', gap: 11, padding: '20px' },
    form2: { display: 'contents' },
    titulo: { fontSize: 14, fontWeight: 700, letterSpacing: '-.01em' },
    ayudaChica: { fontSize: 11, color: t.textoAtenuado3 },
    campo: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
    etiqueta: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 },
    input: {
        height: 30, minWidth: 0, padding: '0 9px', border: `1px solid ${t.bordeInput}`,
        background: t.superficie, fontFamily: 'inherit', fontSize: 12.5,
        color: t.textoPrincipal, outline: 'none', borderRadius: 2,
    },
    error: { padding: '7px 10px', background: 'rgba(0,0,0,.03)', borderLeft: `2px solid ${t.error}`, fontSize: 11.5, lineHeight: 1.45 },
    aviso: { padding: '7px 10px', background: 'rgba(0,0,0,.03)', borderLeft: `2px solid ${t.ok}`, fontSize: 11.5, lineHeight: 1.45 },
    btnPrimario: {
        height: 32, marginTop: 2, background: t.acento, border: `1px solid ${t.acento}`, color: '#fff',
        fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi,
    },
    btnPrimarioLink: {
        height: 32, marginTop: 2, background: t.acento, border: `1px solid ${t.acento}`, color: '#fff',
        fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
    },
};
