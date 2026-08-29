import { useEffect, useState } from 'react';
import axios from 'axios';
import { headerEntorno, headerApiKey } from '../utils/entorno';
import { confirmar } from '../utils/notificar';

// Mejora v3 #2 — "Bodega de tokens". Administración de accesos: tokens Cliente
// (SesionPortal, emitidos desde acá) y Operativo (Usuario, emitidos desde la ficha de
// Recursos — acá solo se listan y se pueden revocar/regenerar). Grillas y paleta según
// docs/rediseno/design_handoff_mejoras_v3/prototipo-mejoras-v3.dc.html, pantalla "tokens".
const t = {
    textoPrincipal: '#1a1a18', textoSecundario1: '#3a3a35', textoSecundario2: '#57564f',
    textoAtenuado1: '#75746e', textoAtenuado2: '#8a8981', textoAtenuado3: '#a3a29a',
    encabezadoTabla: '#f7f6f2', hairline: 'rgba(0,0,0,.07)', bordeZona: 'rgba(0,0,0,.12)',
    bordeInput: 'rgba(0,0,0,.22)', acento: 'oklch(0.48 0.10 250)', acentoHover: 'oklch(0.42 0.10 250)',
    verde: '#4c7a4c', rojo: '#a8412f', ambar: '#7a5a2f',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontMono: 'ui-monospace, Menlo, monospace',
};

const GRID_TOKENS = '170px 118px 1fr 104px 104px 92px 150px';

const seg = (activo) => ({
    height: 26, padding: '0 11px', background: activo ? '#1c1d1b' : '#fff',
    border: `1px solid ${activo ? '#1c1d1b' : 'rgba(0,0,0,.22)'}`, fontSize: 11,
    fontWeight: activo ? 700 : 400, color: activo ? '#fff' : t.textoSecundario2,
    cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi,
});

const fmtFecha = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const esHoy = d.toDateString() === new Date().toDateString();
    return esHoy ? `hoy ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtAcceso = (iso) => {
    if (!iso) return 'nunca';
    const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (dias === 0) return `hoy ${new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
    if (dias === 1) return 'ayer';
    if (dias < 30) return `hace ${dias} días`;
    return `hace ${Math.floor(dias / 30)} meses`;
};

export default function BodegaTokensScreen({ API }) {
    const [vista, setVista] = useState('activos');

    return (
        <div style={{ padding: '16px 20px', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Bodega de tokens</h1>
                <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>Administración de accesos: tokens emitidos y stock pre-generado para nuevos usuarios.</span>
            </div>
            <div style={{ display: 'flex', gap: 6, margin: '14px 0' }}>
                <button style={seg(vista === 'activos')} onClick={() => setVista('activos')}>Tokens activos</button>
                <button style={seg(vista === 'emitir')} onClick={() => setVista('emitir')}>Emitir acceso cliente</button>
                <button style={seg(vista === 'stock')} onClick={() => setVista('stock')}>Stock pre-generado</button>
            </div>
            {vista === 'activos' && <TokensActivos API={API} />}
            {vista === 'emitir' && <EmitirAccesoCliente API={API} />}
            {vista === 'stock' && <StockPreGenerado API={API} />}
        </div>
    );
}

const ETIQUETAS_ACCION = { revocar: 'Revocar', regenerar: 'Regenerar', reenviar: 'Reenviar', reactivar: 'Reactivar', eliminar: 'Eliminar' };
// Para 'operativo' (Usuario/Recurso), regenerar/reenviar ahora devuelven { correoEnviado,
// telefono, link } — si no hubo correo, el mensaje debe decir explícitamente que hay que
// mandarlo a mano (ver botón "Copiar link"/"WhatsApp" en TokensActivos), no dar a entender
// que ya se envió solo. Para 'cliente' se mantiene el mensaje de siempre (esa emisión sigue
// siendo solo por correo).
const MENSAJES_ACCION = {
    revocar: (tok) => `Acceso de ${tok.nombre} revocado.`,
    regenerar: (tok, resp) => tok.tipo === 'operativo'
        ? (resp?.correoEnviado ? `Token de ${tok.nombre} regenerado — el link anterior ya no sirve. Correo enviado a ${tok.correo}.` : `Token de ${tok.nombre} regenerado — el link anterior ya no sirve. Sin correo registrado: copiá el link de abajo para enviárselo a mano.`)
        : `Token de ${tok.nombre} regenerado — el link anterior ya no sirve. Correo reenviado a ${tok.correo || 'su casilla registrada'}.`,
    reenviar: (tok, resp) => tok.tipo === 'operativo'
        ? (resp?.correoEnviado ? `Nuevo link enviado por correo a ${tok.correo}.` : `Nuevo link generado — sin correo registrado: copiá el link de abajo para enviárselo a mano.`)
        : `Nuevo link enviado por correo a ${tok.correo || 'su casilla registrada'} (el token en claro no se guarda, así que reenviar equivale a regenerar).`,
    reactivar: (tok) => `Acceso de ${tok.nombre} reactivado.`,
    eliminar: (tok) => `Acceso de ${tok.nombre} eliminado — no queda registro de esta fila.`,
};

// wa.me: mismo patrón que enviarASupervisor (App.jsx) para la cotización — deep link plano,
// sin API de WhatsApp. limpiarTelefono saca todo lo que no sea dígito (wa.me no acepta '+'/espacios).
const linkWhatsApp = (telefono, texto) => `https://wa.me/${(telefono || '').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;

function TokensActivos({ API }) {
    const [tokens, setTokens] = useState(null);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState(null); // { tipo: 'ok'|'error', texto }
    // Cuando no hubo correo (Recurso sin email), el link solo se puede compartir a mano una
    // vez — el token en claro no se vuelve a mostrar después de esta respuesta (ver
    // usuarioController.js). { nombre, link, telefono }.
    const [avisoLink, setAvisoLink] = useState(null);
    const [procesando, setProcesando] = useState(null); // _id de la fila en curso

    const cargar = () => axios.get(`${API}/portal/sesiones`, { headers: { ...headerEntorno(), ...headerApiKey() } })
        .then(({ data }) => setTokens(data)).catch(e => setError(e.response?.data?.error || 'No se pudo cargar.'));

    useEffect(() => { cargar(); }, [API]);

    const accion = async (tok, tipoAccion) => {
        const base = tok.tipo === 'cliente' ? `${API}/portal/sesiones/${tok._id}` : `${API}/usuarios/${tok._id}`;
        const rutas = tok.tipo === 'cliente'
            ? { revocar: 'revocar', regenerar: 'regenerar', reenviar: 'reenviar', reactivar: 'reactivar' }
            : { revocar: 'revocar', regenerar: 'reemitir-token', reenviar: 'reemitir-token', reactivar: 'reactivar' };
        if (tipoAccion === 'revocar' && !(await confirmar(`¿Revocar el acceso de ${tok.nombre}?`))) return;
        // A diferencia de revocar (reversible con "Reactivar"), eliminar borra el registro
        // entero — sin vuelta atrás, ni rastro de fecha/hora/dispositivo de accesos pasados.
        if (tipoAccion === 'eliminar' && !(await confirmar(
            `¿Eliminar definitivamente el acceso de ${tok.nombre}? Se borra el registro completo, incluido el historial de accesos — a diferencia de Revocar, esto no se puede deshacer.`,
            { danger: true, textoConfirmar: 'Eliminar' },
        ))) return;
        setAviso(null);
        setAvisoLink(null);
        setProcesando(tok._id);
        try {
            if (tipoAccion === 'eliminar') {
                await axios.delete(base, { headers: { ...headerEntorno(), ...headerApiKey() } });
                setAviso({ tipo: 'ok', texto: MENSAJES_ACCION[tipoAccion](tok) });
            } else {
                const { data } = await axios.post(`${base}/${rutas[tipoAccion]}`, { correo: tok.correo }, { headers: { ...headerEntorno(), ...headerApiKey() } });
                setAviso({ tipo: 'ok', texto: MENSAJES_ACCION[tipoAccion](tok, data) });
                if (tok.tipo === 'operativo' && !data.correoEnviado && data.link) {
                    setAvisoLink({ nombre: tok.nombre, link: data.link, telefono: data.telefono });
                }
            }
            await cargar();
        } catch (e) {
            setAviso({ tipo: 'error', texto: e.response?.data?.error || 'No se pudo completar la acción.' });
        } finally {
            setProcesando(null);
        }
    };

    // Personal de Recursos con puesto de supervisor que todavía no tiene Usuario — emite
    // el token acá mismo, sin tener que ir a la ficha de Recursos.
    const emitirParaRecurso = async (tok) => {
        setAviso(null);
        setAvisoLink(null);
        setProcesando(tok._id);
        try {
            const { data } = await axios.post(`${API}/usuarios`, { nombre: tok.nombre, puesto: tok.puesto, rol: 'supervisor', recursoId: tok.recursoId }, { headers: { ...headerEntorno(), ...headerApiKey() } });
            setAviso({ tipo: 'ok', texto: `Acceso operativo emitido para ${tok.nombre}${data.correoEnviado ? ` — correo enviado a ${tok.correo}` : ' — sin correo registrado, copiá el link de abajo para enviárselo a mano'}.` });
            if (!data.correoEnviado && data.link) setAvisoLink({ nombre: tok.nombre, link: data.link, telefono: data.telefono });
            await cargar();
        } catch (e) {
            setAviso({ tipo: 'error', texto: e.response?.data?.error || 'No se pudo emitir el acceso.' });
        } finally {
            setProcesando(null);
        }
    };

    if (error) return <div style={{ fontSize: 12, color: t.rojo }}>{error}</div>;
    if (!tokens) return null;

    return (
        <div style={{ maxWidth: 1080 }}>
            {aviso && (
                <div style={{ marginBottom: avisoLink ? 0 : 8, padding: '7px 10px', fontSize: 11.5, color: aviso.tipo === 'ok' ? t.verde : t.rojo, background: aviso.tipo === 'ok' ? 'rgba(76,122,76,.08)' : 'rgba(168,65,47,.08)', border: `1px solid ${aviso.tipo === 'ok' ? t.verde : t.rojo}` }}>
                    {aviso.texto}
                </div>
            )}
            {avisoLink && (
                <div style={{ marginBottom: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, background: 'rgba(184,134,47,.08)', border: `1px solid ${t.ambar}` }}>
                    <span style={{ fontFamily: t.fontMono, color: t.textoSecundario2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>{avisoLink.link}</span>
                    <button
                        onClick={() => navigator.clipboard?.writeText(avisoLink.link)}
                        style={{ height: 22, padding: '0 8px', background: '#fff', border: `1px solid ${t.bordeInput}`, fontSize: 10.5, cursor: 'pointer', borderRadius: 2 }}
                    >Copiar link</button>
                    {avisoLink.telefono && (
                        <a
                            href={linkWhatsApp(avisoLink.telefono, `Hola ${avisoLink.nombre}, este es tu acceso a la app de trabajo: ${avisoLink.link}`)}
                            target="_blank" rel="noreferrer"
                            style={{ height: 22, padding: '0 8px', display: 'inline-flex', alignItems: 'center', background: '#fff', border: `1px solid ${t.bordeInput}`, fontSize: 10.5, color: t.textoSecundario2, textDecoration: 'none', borderRadius: 2 }}
                        >Enviar por WhatsApp</a>
                    )}
                    <span onClick={() => setAvisoLink(null)} style={{ marginLeft: 'auto', fontSize: 13, color: t.textoAtenuado2, cursor: 'pointer' }}>×</span>
                </div>
            )}
            <div style={{ background: '#fff', border: `1px solid ${t.bordeZona}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID_TOKENS, gap: 10, padding: '7px 12px', background: t.encabezadoTabla, borderBottom: `1px solid ${t.hairline}`, fontSize: 9.5, letterSpacing: '.09em', textTransform: 'uppercase', color: t.textoAtenuado2 }}>
                <span>Titular</span><span>Tipo · origen</span><span>Token</span><span>Emitido</span><span>Último acceso</span><span>Estado</span><span style={{ textAlign: 'right' }}>Acciones</span>
            </div>
            {tokens.length === 0 && <div style={{ padding: 16, fontSize: 12, color: t.textoAtenuado2 }}>Sin tokens todavía.</div>}
            {tokens.map(tok => {
                const accesoTexto = fmtAcceso(tok.ultimoAcceso);
                const accesoRojo = accesoTexto === 'nunca' || accesoTexto.includes('meses');
                const estFondo = tok.pendiente ? 'rgba(184,134,47,.13)' : tok.estadoDisplay === 'Activo' ? 'rgba(76,122,76,.13)' : tok.estadoDisplay === 'Revocado' ? 'rgba(168,65,47,.13)' : '#f0efeb';
                const estTono = tok.pendiente ? t.ambar : tok.estadoDisplay === 'Activo' ? t.verde : tok.estadoDisplay === 'Revocado' ? t.rojo : t.textoAtenuado1;
                const acciones = tok.estadoDisplay === 'Revocado' ? ['reactivar', 'eliminar'] : ['revocar', 'regenerar', 'reenviar', 'eliminar'];
                const enCurso = procesando === tok._id;
                return (
                    <div key={tok._id} style={{ display: 'grid', gridTemplateColumns: GRID_TOKENS, gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${t.hairline}` }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tok.nombre}</div>
                            <div style={{ fontSize: 10.5, color: t.textoAtenuado2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tok.correo || tok.telefono || <span style={{ color: t.rojo }}>Sin correo ni teléfono</span>}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: tok.tipo === 'cliente' ? t.ambar : t.acento }}>{tok.tipo}</div>
                            <div style={{ fontSize: 10.5, color: t.textoAtenuado2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tok.origen}</div>
                        </div>
                        <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textoSecundario2 }}>{tok.tokenPreview ? `t.${tok.tokenPreview}…` : '—'}</span>
                        <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textoAtenuado1 }}>{fmtFecha(tok.emitidoEn)}</span>
                        <span style={{ fontFamily: t.fontMono, fontSize: 11, color: accesoRojo ? t.rojo : t.textoAtenuado1 }}>{accesoTexto}</span>
                        <span style={{ justifySelf: 'start', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 2, background: estFondo, color: estTono }}>{tok.estadoDisplay}</span>
                        <div style={{ justifySelf: 'end', display: 'flex', gap: 4 }}>
                            {tok.pendiente ? (
                                // Sin correo NI teléfono en Recursos no hay forma de hacerle llegar
                                // el link a la persona (ver usuarioController.crear) — se deshabilita
                                // acá también para no hacer esperar el viaje al backend.
                                (() => {
                                    const sinContacto = !tok.correo && !tok.telefono;
                                    return (
                                        <button
                                            onClick={() => emitirParaRecurso(tok)} disabled={enCurso || sinContacto}
                                            title={sinContacto ? 'Agrega correo o teléfono en Recursos antes de emitir el acceso.' : ''}
                                            style={{ height: 23, padding: '0 8px', background: sinContacto ? '#fff' : t.acento, border: `1px solid ${sinContacto ? t.bordeInput : t.acento}`, fontSize: 10.5, fontWeight: 700, color: sinContacto ? t.textoAtenuado2 : '#fff', cursor: (enCurso || sinContacto) ? 'not-allowed' : 'pointer', borderRadius: 2, opacity: enCurso ? .6 : 1 }}
                                        >{enCurso ? '…' : 'Emitir acceso'}</button>
                                    );
                                })()
                            ) : acciones.map(a => (
                                <button key={a} onClick={() => accion(tok, a)} disabled={enCurso} style={{ height: 23, padding: '0 8px', background: '#fff', border: '1px solid rgba(0,0,0,.22)', fontSize: 10.5, color: (a === 'revocar' || a === 'eliminar') ? t.rojo : t.textoSecundario2, cursor: enCurso ? 'default' : 'pointer', borderRadius: 2, opacity: enCurso ? .5 : 1 }}>{enCurso ? '…' : ETIQUETAS_ACCION[a]}</button>
                            ))}
                        </div>
                    </div>
                );
            })}
            <div style={{ padding: '9px 12px', fontSize: 10.5, color: t.textoAtenuado2, lineHeight: 1.6 }}>
                Los tokens operativos se emiten desde la ficha de cada persona en Recursos. Los tokens cliente se emiten desde el contacto de la empresa en Clientes, al momento de habilitarle el portal. Un mismo contacto necesita un token por empresa. Cada acceso queda registrado con fecha, hora y dispositivo; al revocar se avisa por correo al titular.
            </div>
            </div>
        </div>
    );
}

function EmitirAccesoCliente({ API }) {
    const [clientes, setClientes] = useState([]);
    const [clienteId, setClienteId] = useState('');
    const [contactoId, setContactoId] = useState('');
    const [nuevoContacto, setNuevoContacto] = useState(false);
    const [nombreNuevo, setNombreNuevo] = useState('');
    const [correo, setCorreo] = useState('');
    const [fono, setFono] = useState('');
    const [alcance, setAlcance] = useState('empresa');
    const [aviso, setAviso] = useState('');
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        axios.get(`${API}/clientes`, { headers: { ...headerEntorno(), ...headerApiKey() } }).then(({ data }) => setClientes(data)).catch(() => {});
    }, [API]);

    const cliente = clientes.find(c => c._id === clienteId);
    const contacto = cliente?.contactos.find(c => c._id === contactoId);

    useEffect(() => {
        if (contacto) { setCorreo(contacto.correo || ''); setFono(contacto.telefono || ''); }
    }, [contactoId]);

    const emitir = async () => {
        if (!clienteId) return setAviso('Elige una empresa.');
        if (!nuevoContacto && !contactoId) return setAviso('Elige un contacto, o crea uno nuevo.');
        if (nuevoContacto && !nombreNuevo.trim()) return setAviso('Escribe el nombre del nuevo contacto.');
        setEnviando(true); setAviso('');
        try {
            const body = { clienteId, correo, telefono: fono, alcance, entorno: localStorage.getItem('erpTaller.entorno') || 'produccion' };
            if (nuevoContacto) body.nombreContacto = nombreNuevo; else body.contactoId = contactoId;
            const { data } = await axios.post(`${API}/portal/emitir-token`, body, { headers: { ...headerEntorno(), ...headerApiKey() } });
            setAviso(data.correoEnviado ? 'Acceso enviado por correo' : 'Acceso emitido (no se pudo enviar el correo, revisa la dirección)');
            setNuevoContacto(false); setNombreNuevo(''); setContactoId('');
        } catch (e) {
            setAviso(e.response?.data?.error || 'No se pudo emitir el acceso.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ width: 420, background: '#fff', border: `1px solid ${t.bordeZona}` }}>
                <div style={{ padding: '7px 12px', background: '#e4e2dc', borderBottom: '1px solid rgba(0,0,0,.14)', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700 }}>
                    Acceso cliente
                </div>
                <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '96px 1fr', gap: '9px 10px', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>Empresa</span>
                    <select value={clienteId} onChange={e => { setClienteId(e.target.value); setContactoId(''); setNuevoContacto(false); setAviso(''); }} style={campoStyle}>
                        <option value="">Selecciona…</option>
                        {clientes.map(c => <option key={c._id} value={c._id}>{c.empresa}</option>)}
                    </select>

                    <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>Contacto</span>
                    <select
                        value={nuevoContacto ? '__nuevo__' : contactoId}
                        onChange={e => { const v = e.target.value; setAviso(''); if (v === '__nuevo__') { setNuevoContacto(true); setContactoId(''); } else { setNuevoContacto(false); setContactoId(v); } }}
                        style={campoStyle} disabled={!clienteId}
                    >
                        <option value="">Selecciona…</option>
                        {cliente?.contactos.map(c => <option key={c._id} value={c._id}>{c.nombre}{c.cargo ? ` · ${c.cargo}` : ''}</option>)}
                        <option value="__nuevo__">+ Nuevo contacto</option>
                    </select>

                    {nuevoContacto && (
                        <>
                            <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>Nombre</span>
                            <input value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} style={campoStyle} />
                        </>
                    )}

                    <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>Correo</span>
                    <input value={correo} onChange={e => setCorreo(e.target.value)} style={campoStyle} />

                    <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>Teléfono</span>
                    <input value={fono} onChange={e => setFono(e.target.value)} placeholder="+56 9" style={{ ...campoStyle, fontFamily: t.fontMono }} />

                    <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>Ve</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button style={seg(alcance === 'empresa')} onClick={() => setAlcance('empresa')}>Toda la empresa</button>
                        <button style={seg(alcance === 'propias')} onClick={() => setAlcance('propias')}>Solo sus solicitudes</button>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 12px' }}>
                    <button onClick={emitir} disabled={enviando} style={{ height: 28, padding: '0 12px', background: t.acento, border: `1px solid ${t.acento}`, fontSize: 11.5, fontWeight: 700, color: '#fff', cursor: 'pointer', borderRadius: 2, opacity: enviando ? .7 : 1 }}>
                        {enviando ? 'Emitiendo…' : 'Emitir acceso al portal'}
                    </button>
                    <span style={{ fontSize: 11, color: aviso.startsWith('No') || aviso.includes('Elige') || aviso.includes('Escribe') ? t.rojo : t.verde }}>{aviso}</span>
                </div>
                <div style={{ padding: '0 12px 12px', fontSize: 10.5, color: t.textoAtenuado2, lineHeight: 1.6 }}>
                    Si el contacto no existe, se crea aquí mismo y queda guardado en la ficha de la empresa en Clientes.
                </div>
            </div>
        </div>
    );
}

function StockPreGenerado({ API }) {
    const [resumen, setResumen] = useState(null);
    const [cantidadCliente, setCantidadCliente] = useState('10');
    const [avisoCliente, setAvisoCliente] = useState('');

    const cargar = () => axios.get(`${API}/portal/stock-tokens`, { headers: { ...headerEntorno(), ...headerApiKey() } }).then(({ data }) => setResumen(data)).catch(() => {});
    useEffect(() => { cargar(); }, [API]);

    const generar = async () => {
        try {
            const { data } = await axios.post(`${API}/portal/sesiones/lote`, { cantidad: cantidadCliente }, { headers: { ...headerEntorno(), ...headerApiKey() } });
            setAvisoCliente(`${data.cantidad} tokens generados`);
            cargar();
        } catch (e) {
            setAvisoCliente(e.response?.data?.error || 'No se pudo generar el lote.');
        }
    };

    if (!resumen) return null;

    return (
        <div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 330, background: '#fff', border: `1px solid ${t.bordeZona}`, padding: 14 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 }}>Tokens operativos · supervisores y ejecutores</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                        <span style={{ fontFamily: t.fontMono, fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{resumen.operativo.disponibles}</span>
                        <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>disponibles sin asignar</span>
                    </div>
                    <div style={{ fontSize: 11, color: t.textoAtenuado1, marginTop: 8, lineHeight: 1.6 }}>Asignados este mes: {resumen.operativo.asignadosMes}<br />Vencen en 30 días: {resumen.operativo.vencenEn30Dias}</div>
                    <div style={{ fontSize: 10.5, color: t.textoAtenuado2, marginTop: 10 }}>Sin stock pre-generado: se emiten uno a uno desde la ficha del Recurso.</div>
                </div>
                <div style={{ width: 330, background: '#fff', border: `1px solid ${t.bordeZona}`, padding: 14 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 }}>Tokens cliente · portal de solicitudes</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                        <span style={{ fontFamily: t.fontMono, fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{resumen.cliente.disponibles}</span>
                        <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>disponibles sin asignar</span>
                    </div>
                    <div style={{ fontSize: 11, color: t.textoAtenuado1, marginTop: 8, lineHeight: 1.6 }}>Asignados este mes: {resumen.cliente.asignadosMes}<br />Vencen en 30 días: {resumen.cliente.vencenEn30Dias}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
                        <input value={cantidadCliente} onChange={e => setCantidadCliente(e.target.value)} style={{ width: 56, height: 27, padding: '0 7px', border: `1px solid ${t.bordeInput}`, background: '#fff', fontFamily: t.fontMono, fontSize: 11.5, borderRadius: 2, boxSizing: 'border-box' }} />
                        <button onClick={generar} style={{ height: 27, padding: '0 11px', background: '#1c1d1b', border: '1px solid #1c1d1b', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', borderRadius: 2 }}>Generar lote</button>
                        <span style={{ fontSize: 10.5, color: t.verde }}>{avisoCliente}</span>
                    </div>
                </div>
            </div>
            <div style={{ maxWidth: 1080, marginTop: 11, fontSize: 10.5, color: t.textoAtenuado2, lineHeight: 1.5 }}>
                Un token pre-generado vence solo a los {resumen.cliente.vigenciaLoteDias} días si nadie lo asigna.
            </div>
        </div>
    );
}

const campoStyle = {
    height: 26, minWidth: 0, padding: '0 7px', border: `1px solid ${t.bordeInput}`, background: '#fff',
    fontFamily: t.fontUi, fontSize: 11.5, color: t.textoPrincipal, outline: 'none', borderRadius: 2, boxSizing: 'border-box',
};
