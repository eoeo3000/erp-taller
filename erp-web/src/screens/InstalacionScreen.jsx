import React, { useState } from 'react';
import axios from 'axios';
import { fijarSesion } from '../utils/sesion';

// Primera puesta en marcha. Aparece solo cuando la base no tiene ninguna cuenta con clave, y
// desaparece para siempre en cuanto se crea la primera (ver instalacionController). Es lo que
// evita tener que entrar al servidor a correr un script para arrancar.
const t = {
    superficie: '#ffffff',
    textoPrincipal: '#1a1a18',
    textoAtenuado2: '#75746e',
    textoAtenuado3: '#8a8981',
    bordeZona: 'rgba(0,0,0,.12)',
    bordeInput: 'rgba(0,0,0,.18)',
    acento: 'oklch(0.48 0.10 250)',
    error: 'oklch(0.52 0.13 25)',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};

export default function InstalacionScreen({ API, requiereClaveInstalacion, onListo }) {
    const [nombre, setNombre] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [repetida, setRepetida] = useState('');
    const [claveInstalacion, setClaveInstalacion] = useState('');
    const [error, setError] = useState('');
    const [enviando, setEnviando] = useState(false);

    const instalar = async (evento) => {
        evento.preventDefault();
        setError('');
        if (password !== repetida) return setError('Las dos claves no coinciden.');
        setEnviando(true);
        try {
            const { data } = await axios.post(`${API}/instalacion`, {
                nombre, email, password,
                ...(requiereClaveInstalacion ? { claveInstalacion } : {}),
            });
            // Entra de inmediato: acaba de elegir sus datos, pedirle que los escriba otra vez
            // en el login sería puro trámite.
            fijarSesion(data.token, data.usuario);
            onListo(data.usuario);
        } catch (e) {
            setError(e?.response?.data?.error || 'No se pudo completar la instalación.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div style={styles.raiz}>
            <div style={styles.tarjeta}>
                <div style={styles.marca}>Taller ERP</div>
                <form onSubmit={instalar} style={styles.form}>
                    <div style={styles.titulo}>Primera puesta en marcha</div>
                    <div style={styles.ayuda}>
                        Todavía no hay ninguna cuenta. Crea la del administrador: desde ella vas a poder
                        invitar al resto del equipo.
                    </div>

                    <label style={styles.campo}>
                        <span style={styles.etiqueta}>Nombre</span>
                        <input value={nombre} autoFocus required autoComplete="name"
                            onChange={(e) => setNombre(e.target.value)} style={styles.input} />
                    </label>
                    <label style={styles.campo}>
                        <span style={styles.etiqueta}>Correo</span>
                        <input type="email" value={email} required autoComplete="username"
                            onChange={(e) => setEmail(e.target.value)} style={styles.input} />
                    </label>
                    <label style={styles.campo}>
                        <span style={styles.etiqueta}>Clave</span>
                        <input type="password" value={password} required minLength={8} autoComplete="new-password"
                            onChange={(e) => setPassword(e.target.value)} style={styles.input} />
                    </label>
                    <label style={styles.campo}>
                        <span style={styles.etiqueta}>Repite la clave</span>
                        <input type="password" value={repetida} required minLength={8} autoComplete="new-password"
                            onChange={(e) => setRepetida(e.target.value)} style={styles.input} />
                    </label>
                    <div style={styles.ayudaChica}>Mínimo 8 caracteres.</div>

                    {requiereClaveInstalacion && (
                        <label style={styles.campo}>
                            <span style={styles.etiqueta}>Clave de instalación</span>
                            <input type="password" value={claveInstalacion} required
                                onChange={(e) => setClaveInstalacion(e.target.value)} style={styles.input} />
                            <span style={styles.ayudaChica}>La definiste como SETUP_TOKEN en el servidor.</span>
                        </label>
                    )}

                    {error && <div style={styles.error}>{error}</div>}
                    <button type="submit" disabled={enviando} style={styles.btnPrimario}>
                        {enviando ? 'Creando…' : 'Crear cuenta y entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
}

const styles = {
    raiz: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100dvh', width: '100%', padding: 16,
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
    titulo: { fontSize: 14, fontWeight: 700, letterSpacing: '-.01em' },
    ayuda: { fontSize: 11.5, color: t.textoAtenuado2, lineHeight: 1.5 },
    ayudaChica: { fontSize: 11, color: t.textoAtenuado3 },
    campo: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
    etiqueta: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 },
    input: {
        height: 30, minWidth: 0, padding: '0 9px', border: `1px solid ${t.bordeInput}`,
        background: t.superficie, fontFamily: 'inherit', fontSize: 12.5,
        color: t.textoPrincipal, outline: 'none', borderRadius: 2,
    },
    error: { padding: '7px 10px', background: 'rgba(0,0,0,.03)', borderLeft: `2px solid ${t.error}`, fontSize: 11.5, lineHeight: 1.45 },
    btnPrimario: {
        height: 32, marginTop: 2, background: t.acento, border: `1px solid ${t.acento}`, color: '#fff',
        fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi,
    },
};
