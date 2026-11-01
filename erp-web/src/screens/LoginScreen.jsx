import React, { useState } from 'react';
import axios from 'axios';
import { fijarSesion } from '../utils/sesion';
import MarcaTaller from '../components/MarcaTaller';
import AvisoDemo from '../components/AvisoDemo';
import { obtenerTaller, olvidarTaller } from '../utils/taller';

// Pantalla de acceso de la app de escritorio. Hasta que existió, se entraba con solo la URL
// — y esta es la app que tiene finanzas, contabilidad y los datos de todos los clientes.
// Las dos PWAs no pasan por acá: siguen entrando con su token por persona, sin clave.
//
// Mismos tokens visuales que el resto del rediseño (ver §2 del handoff de Panel de control).
const t = {
    fondoMain: '#f6f5f2',
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

export default function LoginScreen({ API, onIngreso, marca = null , entorno = null }) {
    // 'acceso' | 'recuperar' | 'cambiar' (clave inicial que hay que reemplazar sí o sí)
    const [vista, setVista] = useState('acceso');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordNueva, setPasswordNueva] = useState('');
    const [passwordRepetida, setPasswordRepetida] = useState('');
    const [usuarioPendiente, setUsuarioPendiente] = useState(null);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const [enviando, setEnviando] = useState(false);

    const mensajeDeError = (e, porDefecto) => e?.response?.data?.error || porDefecto;

    // A qué taller apunta ESTE navegador. Se lee una vez al montar: lo único que lo cambia es
    // el botón de abajo, que recarga.
    const [tallerApuntado] = useState(obtenerTaller);

    // La salida de un callejón sin salida real. Entrar ocurre sin sesión, así que el taller
    // sale de la pista guardada (ver utils/taller.js). Quien administra varios clientes abre
    // el enlace de uno y este navegador queda apuntando ahí: al volver al suyo, su correo se
    // busca en la base del otro y el backend responde «Correo o clave incorrectos» — correcto
    // de su lado, porque distinguirlo diría qué correos existen en qué cliente, pero describe
    // mal lo que pasó. La clave estaba bien; la base no.
    //
    // `fijarSesion` corrige la pista al entrar, pero eso es DESPUÉS de entrar, que es
    // justamente lo que acá no se puede hacer. Por eso la salida tiene que estar en esta
    // pantalla. Solo se ofrece tras un error: mostrarlo siempre invitaría a tocarlo a quien
    // no tiene ningún problema.
    const salirDelTaller = () => {
        olvidarTaller();
        window.location.href = window.location.pathname;
    };

    const entrar = async (evento) => {
        evento.preventDefault();
        setError(''); setAviso(''); setEnviando(true);
        try {
            const { data } = await axios.post(`${API}/auth/login`, { email, password });
            fijarSesion(data.token, data.usuario);
            // La cuenta creada por scripts/crearAdmin.js viene marcada para cambiar la clave:
            // la inicial la eligió quien corrió el script, no quien va a usar la cuenta.
            if (data.usuario?.debeCambiarPassword) {
                setUsuarioPendiente(data.usuario);
                setVista('cambiar');
            } else {
                onIngreso(data.usuario);
            }
        } catch (e) {
            setError(mensajeDeError(e, 'No se pudo conectar con el servidor.'));
        } finally {
            setEnviando(false);
        }
    };

    const pedirRecuperacion = async (evento) => {
        evento.preventDefault();
        setError(''); setAviso(''); setEnviando(true);
        try {
            const { data } = await axios.post(`${API}/auth/recuperar`, { email });
            // El backend responde lo mismo exista o no la cuenta, para que esto no sirva
            // para averiguar qué correos están registrados.
            setAviso(data.mensaje || 'Si el correo está registrado, te llegará un mensaje con las instrucciones.');
        } catch (e) {
            setError(mensajeDeError(e, 'No se pudo enviar el correo.'));
        } finally {
            setEnviando(false);
        }
    };

    const cambiarClaveInicial = async (evento) => {
        evento.preventDefault();
        setError('');
        if (passwordNueva !== passwordRepetida) return setError('Las dos claves nuevas no coinciden.');
        setEnviando(true);
        try {
            await axios.post(`${API}/auth/cambiar-password`, { passwordActual: password, passwordNueva });
            onIngreso({ ...usuarioPendiente, debeCambiarPassword: false });
        } catch (e) {
            setError(mensajeDeError(e, 'No se pudo cambiar la clave.'));
        } finally {
            setEnviando(false);
        }
    };

    const irA = (destino) => { setVista(destino); setError(''); setAviso(''); };

    return (
        <div style={styles.raiz}>
            <div style={styles.tarjeta}>
                <MarcaTaller marca={marca} estilo={styles.marca} />
                <AvisoDemo entorno={entorno} />

                {vista === 'acceso' && (
                    <form onSubmit={entrar} style={styles.form}>
                        <div style={styles.titulo}>Ingresar</div>
                        <label style={styles.campo}>
                            <span style={styles.etiqueta}>Correo</span>
                            <input type="email" value={email} autoFocus required autoComplete="username"
                                onChange={(e) => setEmail(e.target.value)} style={styles.input} />
                        </label>
                        <label style={styles.campo}>
                            <span style={styles.etiqueta}>Clave</span>
                            <input type="password" value={password} required autoComplete="current-password"
                                onChange={(e) => setPassword(e.target.value)} style={styles.input} />
                        </label>
                        {error && (
                            <div style={styles.error}>
                                {error}
                                {tallerApuntado && (
                                    <div style={styles.pista}>
                                        Este navegador está entrando al taller «{tallerApuntado}». Si tu cuenta
                                        es de otro, la clave correcta igual va a fallar: se busca en la base
                                        equivocada.
                                        <button type="button" onClick={salirDelTaller} style={styles.btnPista}>
                                            Entrar a otro taller
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <button type="submit" disabled={enviando} style={styles.btnPrimario}>
                            {enviando ? 'Entrando…' : 'Entrar'}
                        </button>
                        <button type="button" onClick={() => irA('recuperar')} style={styles.btnTexto}>
                            Olvidé mi clave
                        </button>
                    </form>
                )}

                {vista === 'recuperar' && (
                    <form onSubmit={pedirRecuperacion} style={styles.form}>
                        <div style={styles.titulo}>Recuperar clave</div>
                        <div style={styles.ayuda}>
                            Te enviamos un link para poner una clave nueva. Vence en una hora y sirve una sola vez.
                        </div>
                        <label style={styles.campo}>
                            <span style={styles.etiqueta}>Correo</span>
                            <input type="email" value={email} autoFocus required autoComplete="username"
                                onChange={(e) => setEmail(e.target.value)} style={styles.input} />
                        </label>
                        {error && <div style={styles.error}>{error}</div>}
                        {aviso && <div style={styles.aviso}>{aviso}</div>}
                        <button type="submit" disabled={enviando} style={styles.btnPrimario}>
                            {enviando ? 'Enviando…' : 'Enviar el link'}
                        </button>
                        <button type="button" onClick={() => irA('acceso')} style={styles.btnTexto}>
                            Volver
                        </button>
                    </form>
                )}

                {vista === 'cambiar' && (
                    <form onSubmit={cambiarClaveInicial} style={styles.form}>
                        <div style={styles.titulo}>Elige tu clave</div>
                        <div style={styles.ayuda}>
                            Estás entrando con una clave inicial. Antes de seguir, pon una que solo conozcas tú.
                        </div>
                        <label style={styles.campo}>
                            <span style={styles.etiqueta}>Clave nueva</span>
                            <input type="password" value={passwordNueva} autoFocus required minLength={8} autoComplete="new-password"
                                onChange={(e) => setPasswordNueva(e.target.value)} style={styles.input} />
                        </label>
                        <label style={styles.campo}>
                            <span style={styles.etiqueta}>Repite la clave nueva</span>
                            <input type="password" value={passwordRepetida} required minLength={8} autoComplete="new-password"
                                onChange={(e) => setPasswordRepetida(e.target.value)} style={styles.input} />
                        </label>
                        <div style={styles.ayudaChica}>Mínimo 8 caracteres.</div>
                        {error && <div style={styles.error}>{error}</div>}
                        <button type="submit" disabled={enviando} style={styles.btnPrimario}>
                            {enviando ? 'Guardando…' : 'Guardar y entrar'}
                        </button>
                    </form>
                )}
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
    pista: { marginTop: 7, paddingTop: 7, borderTop: '1px solid rgba(0,0,0,.09)', fontSize: 11, lineHeight: 1.45, color: t.textoAtenuado2 },
    btnPista: {
        display: 'block', marginTop: 5, padding: 0, border: 'none', background: 'none',
        color: t.acento, fontSize: 11, fontWeight: 700, cursor: 'pointer',
        fontFamily: 'inherit', textDecoration: 'underline',
    },
    error: { padding: '7px 10px', background: 'rgba(0,0,0,.03)', borderLeft: `2px solid ${t.error}`, fontSize: 11.5, lineHeight: 1.45 },
    aviso: { padding: '7px 10px', background: 'rgba(0,0,0,.03)', borderLeft: `2px solid ${t.ok}`, fontSize: 11.5, lineHeight: 1.45 },
    btnPrimario: {
        height: 32, marginTop: 2, background: t.acento, border: `1px solid ${t.acento}`, color: '#fff',
        fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi,
    },
    btnTexto: {
        height: 24, background: 'transparent', border: 'none', color: t.textoAtenuado2,
        fontSize: 11.5, cursor: 'pointer', fontFamily: t.fontUi, textDecoration: 'underline',
    },
};
