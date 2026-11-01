import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { fijarSesion } from '../utils/sesion';
import { obtenerTaller } from '../utils/taller';
import MarcaTaller from '../components/MarcaTaller';
import AvisoDemo from '../components/AvisoDemo';

// El enlace de instalación de un taller nuevo trae los dos datos: `?taller=` (que
// utils/taller.js ya recordó y manda en cada llamada) y `?clave=`, la de un solo uso.
//
// Se lee UNA sola vez, al cargar el módulo, y no en cada render: `limpiarUrl` la borra de la
// barra de direcciones en cuanto la pantalla monta, así que una segunda lectura daría vacío.
const CLAVE_DEL_ENLACE = new URLSearchParams(window.location.search).get('clave') || '';

// Cuando la clave viene en el enlace, el cliente no tiene que verla ni escribirla: el campo
// no se muestra y la clave viaja igual en el envío. Un campo que ya está lleno y que él no
// puede corregir solo invita a borrarlo.
//
// Y de paso se saca de la barra de direcciones. Es una credencial: ahí queda a la vista de
// quien mire la pantalla, se va en el `Referer` de cualquier recurso externo y se cuela en
// una captura o en un link copiado. Dura un uso y 7 días, pero ninguna de las dos cosas la
// hace menos credencial. `?taller=` se conserva: eso es ruteo y hay que recordarlo.
function limpiarUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('clave')) return;
    url.searchParams.delete('clave');
    window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
}

// Son DOS claves distintas y hay que decir cuál. `SETUP_TOKEN` es del servidor y la sabe
// quien administra el producto; la del enlace es de un solo uso y le llegó al dueño de ese
// taller. Cuál corresponde lo dice el backend (`motivoClaveInstalacion`), que es el único
// que lo sabe: depende de si este taller es el por defecto o uno nuevo.
//
// Antes se adivinaba mirando si la URL traía `?clave=`, y eso fallaba justo en el caso más
// probable: el dueño de un taller nuevo que abre su enlace de ACCESO —el que no la trae— en
// vez del de instalación. Le decía que buscara un SETUP_TOKEN que para él no existe. El
// panel ya no ofrece ese enlace mientras el taller no esté instalado, pero el texto se queda:
// un enlace de acceso puede llegarle igual, reenviado o guardado de antes.
// La etiqueta también cambia, y no es cosmético: "Clave de instalación" suena a algo del
// servidor, que es justo lo que el dueño de un taller nuevo no tiene. Nombrar el enlace dice
// dónde buscarla. Esto se ve solo en el camino de respaldo —el enlace sin clave—, porque con
// la clave adentro el campo no se muestra.
function ETIQUETA_CLAVE(motivo) {
    return motivo === 'enlace' ? 'Clave del enlace' : 'Clave de instalación';
}

function AYUDA_CLAVE(motivo) {
    if (motivo === 'enlace') {
        return 'Es la clave del enlace de instalación que te mandaron, no una que elijas acá. '
            + 'Si no lo tienes a mano, pídela de nuevo: al reemitirlo, el anterior deja de servir.';
    }
    return 'La definiste como SETUP_TOKEN en el servidor.';
}

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

export default function InstalacionScreen({ API, requiereClaveInstalacion, motivoClaveInstalacion = 'setup', onListo, marca = null , entorno = null }) {
    const [nombre, setNombre] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [repetida, setRepetida] = useState('');
    const [claveInstalacion, setClaveInstalacion] = useState(CLAVE_DEL_ENLACE);
    const [error, setError] = useState('');
    const [enviando, setEnviando] = useState(false);

    // La clave ya está en el estado; de la barra de direcciones se va.
    useEffect(limpiarUrl, []);

    // Con la clave en el enlace no hay campo que mostrar. Y si esa clave resulta estar
    // vencida, tampoco hay nada que el cliente pueda escribir para arreglarlo: lo único que
    // sirve es un enlace nuevo, así que eso es lo que hay que decirle en vez de dejarlo
    // mirando un error sin salida.
    const claveOculta = requiereClaveInstalacion && !!CLAVE_DEL_ENLACE;

    const instalar = async (evento) => {
        evento.preventDefault();
        setError('');
        if (password !== repetida) return setError('Las dos claves no coinciden.');
        setEnviando(true);
        try {
            const { data } = await axios.post(`${API}/instalacion`, {
                nombre, email, password,
                ...(requiereClaveInstalacion ? { claveInstalacion } : {}),
                // Explícito además de la cabecera: lo que el backend mira para instalar tiene
                // que ser lo mismo que miró `/auth/yo` para ofrecer esta pantalla. Cuando no
                // coincidían, la pantalla preguntaba por un taller e instalaba en otro.
                ...(obtenerTaller() ? { taller: obtenerTaller() } : {}),
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
                <MarcaTaller marca={marca} estilo={styles.marca} />
                <AvisoDemo entorno={entorno} />
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

                    {requiereClaveInstalacion && !claveOculta && (
                        <label style={styles.campo}>
                            <span style={styles.etiqueta}>{ETIQUETA_CLAVE(motivoClaveInstalacion)}</span>
                            <input type="password" value={claveInstalacion} required
                                onChange={(e) => setClaveInstalacion(e.target.value)} style={styles.input} />
                            <span style={styles.ayudaChica}>{AYUDA_CLAVE(motivoClaveInstalacion)}</span>
                        </label>
                    )}

                    {error && (
                        <div style={styles.error}>
                            {error}
                            {claveOculta && (
                                <div style={styles.ayudaChica}>
                                    Si dice que el enlace venció, pídele uno nuevo a quien te lo mandó: desde
                                    acá no se puede arreglar.
                                </div>
                            )}
                        </div>
                    )}
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
