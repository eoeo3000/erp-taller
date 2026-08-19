import { useEffect, useState } from 'react';
import axios from 'axios';
import { headerEntorno } from '../utils/entorno';

// Módulo Clientes (base para la mejora v3 #2, "Emisión de acceso cliente"): antes de esto
// no existía ninguna colección de empresas/contactos, solo texto libre repetido en cada
// Solicitud/OT. poblarDesdeSolicitudes arma el catálogo inicial una sola vez.
const t = {
    textoPrincipal: '#1a1a18', textoSecundario2: '#57564f', textoAtenuado1: '#75746e', textoAtenuado2: '#8a8981',
    bordeZona: 'rgba(0,0,0,.12)', bordeInput: 'rgba(0,0,0,.22)', hairline: 'rgba(0,0,0,.07)',
    acento: 'oklch(0.48 0.10 250)', verde: '#4c7a4c', rojo: '#a8412f',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontMono: 'ui-monospace, Menlo, monospace',
};
const campoStyle = { height: 26, minWidth: 0, padding: '0 7px', border: `1px solid ${t.bordeInput}`, background: '#fff', fontFamily: t.fontUi, fontSize: 11.5, color: t.textoPrincipal, outline: 'none', borderRadius: 2, boxSizing: 'border-box', width: '100%' };

export default function ClientesScreen({ API }) {
    const [clientes, setClientes] = useState([]);
    const [seleccionado, setSeleccionado] = useState(null);
    const [nuevaEmpresa, setNuevaEmpresa] = useState('');
    const [poblando, setPoblando] = useState(false);

    const cargar = () => axios.get(`${API}/clientes`, { headers: headerEntorno() }).then(({ data }) => {
        setClientes(data);
        if (seleccionado) setSeleccionado(data.find(c => c._id === seleccionado._id) || null);
    }).catch(() => {});

    useEffect(() => { cargar(); }, [API]);

    const crearEmpresa = async () => {
        if (!nuevaEmpresa.trim()) return;
        const { data } = await axios.post(`${API}/clientes`, { empresa: nuevaEmpresa.trim() }, { headers: headerEntorno() });
        setNuevaEmpresa('');
        await cargar();
        setSeleccionado(data);
    };

    const poblar = async () => {
        setPoblando(true);
        try {
            const { data } = await axios.post(`${API}/clientes/poblar-desde-solicitudes`, {}, { headers: headerEntorno() });
            alert(`${data.empresasCreadas} empresas creadas, ${data.empresasActualizadas} actualizadas.`);
            cargar();
        } finally {
            setPoblando(false);
        }
    };

    return (
        <div style={{ display: 'flex', height: '100%' }}>
            <aside style={{ width: 260, borderRight: `1px solid ${t.bordeZona}`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '14px 14px 10px' }}>
                    <h1 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Clientes</h1>
                    <div style={{ fontSize: 10.5, color: t.textoAtenuado1, marginTop: 4 }}>Empresas y contactos para emitir acceso al portal.</div>
                </div>
                <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6 }}>
                    <input value={nuevaEmpresa} onChange={e => setNuevaEmpresa(e.target.value)} placeholder="Nueva empresa" style={campoStyle} onKeyDown={e => e.key === 'Enter' && crearEmpresa()} />
                    <button onClick={crearEmpresa} style={{ ...botonSecundario, flex: 'none' }}>+</button>
                </div>
                <div style={{ padding: '0 14px 10px' }}>
                    <button onClick={poblar} disabled={poblando} style={{ ...botonSecundario, width: '100%' }}>{poblando ? 'Poblando…' : 'Poblar desde solicitudes'}</button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', borderTop: `1px solid ${t.hairline}` }}>
                    {clientes.map(c => (
                        <div key={c._id} onClick={() => setSeleccionado(c)} style={{ padding: '9px 14px', borderBottom: `1px solid ${t.hairline}`, cursor: 'pointer', background: seleccionado?._id === c._id ? '#f0efeb' : 'transparent' }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{c.empresa}</div>
                            <div style={{ fontSize: 10.5, color: t.textoAtenuado2 }}>{c.contactos.length} contacto{c.contactos.length === 1 ? '' : 's'}</div>
                        </div>
                    ))}
                </div>
            </aside>
            <main style={{ flex: 1, overflow: 'auto', padding: 20 }}>
                {!seleccionado ? (
                    <div style={{ fontSize: 12, color: t.textoAtenuado2 }}>Selecciona una empresa.</div>
                ) : (
                    <FichaCliente key={seleccionado._id} cliente={seleccionado} API={API} onCambio={cargar} />
                )}
            </main>
        </div>
    );
}

function FichaCliente({ cliente, API, onCambio }) {
    const [contactos, setContactos] = useState(cliente.contactos);
    const [nuevo, setNuevo] = useState({ nombre: '', correo: '', telefono: '', cargo: '' });
    const [avisoPorContacto, setAvisoPorContacto] = useState({});
    // Edición de la empresa (nombre/dirección) y de contactos existentes — antes solo se
    // podía agregar o borrar, no corregir un dato mal escrito.
    const [empresa, setEmpresa] = useState(cliente.empresa);
    const [direccion, setDireccion] = useState(cliente.direccion || '');
    const [avisoEmpresa, setAvisoEmpresa] = useState('');
    const [avisoContactos, setAvisoContactos] = useState('');
    const contactosCambiaron = JSON.stringify(contactos) !== JSON.stringify(cliente.contactos);
    const empresaCambio = empresa !== cliente.empresa || direccion !== (cliente.direccion || '');

    const guardarEmpresa = async () => {
        if (!empresa.trim()) { setAvisoEmpresa('El nombre de la empresa no puede quedar vacío.'); return; }
        await axios.put(`${API}/clientes/${cliente._id}`, { empresa: empresa.trim(), direccion }, { headers: headerEntorno() });
        setAvisoEmpresa('Guardado.');
        onCambio();
    };

    const guardarContactos = async (lista) => {
        setContactos(lista);
        await axios.put(`${API}/clientes/${cliente._id}`, { contactos: lista }, { headers: headerEntorno() });
        setAvisoContactos('Guardado.');
        onCambio();
    };

    const editarContacto = (idx, campo, valor) => {
        setAvisoContactos('');
        setContactos(prev => prev.map((c, i) => i === idx ? { ...c, [campo]: valor } : c));
    };

    const agregarContacto = () => {
        if (!nuevo.nombre.trim()) return;
        guardarContactos([...contactos, nuevo]);
        setNuevo({ nombre: '', correo: '', telefono: '', cargo: '' });
    };

    const eliminarContacto = (idx) => {
        if (!window.confirm('¿Quitar este contacto?')) return;
        guardarContactos(contactos.filter((_, i) => i !== idx));
    };

    const emitirAcceso = async (contacto) => {
        setAvisoPorContacto(a => ({ ...a, [contacto._id]: 'Emitiendo…' }));
        try {
            const { data } = await axios.post(`${API}/portal/emitir-token`, {
                clienteId: cliente._id, contactoId: contacto._id, alcance: 'empresa',
                entorno: localStorage.getItem('erpTaller.entorno') || 'produccion',
            }, { headers: headerEntorno() });
            setAvisoPorContacto(a => ({ ...a, [contacto._id]: data.correoEnviado ? 'Acceso enviado por correo' : 'Emitido, sin correo' }));
        } catch (e) {
            setAvisoPorContacto(a => ({ ...a, [contacto._id]: e.response?.data?.error || 'Error al emitir' }));
        }
    };

    return (
        <div style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado2, marginBottom: 6 }}>Empresa</div>
            <div style={{ background: '#fff', border: `1px solid ${t.bordeZona}`, padding: 12, marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 9, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>Nombre</span>
                    <input value={empresa} onChange={e => { setEmpresa(e.target.value); setAvisoEmpresa(''); }} style={{ ...campoStyle, fontSize: 13, fontWeight: 600 }} />
                    <span style={{ fontSize: 11, color: t.textoAtenuado1 }}>Dirección</span>
                    <input value={direccion} onChange={e => { setDireccion(e.target.value); setAvisoEmpresa(''); }} style={campoStyle} placeholder="Faena / dirección" />
                </div>
                {empresaCambio && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                        <button onClick={guardarEmpresa} style={{ ...botonSecundario, background: t.acento, borderColor: t.acento, color: '#fff', fontWeight: 700 }}>Guardar cambios</button>
                        <span style={{ fontSize: 10.5, color: t.textoAtenuado2 }}>Hay cambios sin guardar</span>
                    </div>
                )}
                {!empresaCambio && avisoEmpresa && <div style={{ fontSize: 10.5, color: t.verde, marginTop: 8 }}>{avisoEmpresa}</div>}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado2 }}>Contactos</span>
                {contactosCambiaron && <span style={{ fontSize: 10.5, color: t.textoAtenuado2 }}>Hay cambios sin guardar</span>}
            </div>
            <div style={{ background: '#fff', border: `1px solid ${t.bordeZona}` }}>
                {contactos.map((c, i) => (
                    <div key={c._id || i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 130px auto auto', gap: 8, alignItems: 'center', padding: '8px 10px', borderBottom: `1px solid ${t.hairline}` }}>
                        <input value={c.nombre} onChange={e => editarContacto(i, 'nombre', e.target.value)} placeholder="Nombre" style={campoStyle} />
                        <input value={c.cargo || ''} onChange={e => editarContacto(i, 'cargo', e.target.value)} placeholder="Cargo" style={campoStyle} />
                        <input value={c.correo || ''} onChange={e => editarContacto(i, 'correo', e.target.value)} placeholder="Correo" style={campoStyle} />
                        <input value={c.telefono || ''} onChange={e => editarContacto(i, 'telefono', e.target.value)} placeholder="+56 9" style={{ ...campoStyle, fontFamily: t.fontMono }} />
                        <button onClick={() => emitirAcceso(c)} disabled={!c._id} title={!c._id ? 'Guarda el contacto primero' : ''} style={botonSecundario}>Emitir acceso</button
                        ><span onClick={() => eliminarContacto(i)} style={{ fontFamily: t.fontMono, fontSize: 13, color: '#c9c7c0', cursor: 'pointer', textAlign: 'center' }}>×</span>
                        {avisoPorContacto[c._id] && (
                            <div style={{ gridColumn: '1 / -1', fontSize: 10.5, color: t.verde }}>{avisoPorContacto[c._id]}</div>
                        )}
                    </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 130px auto auto', gap: 8, alignItems: 'center', padding: '8px 10px' }}>
                    <input placeholder="Nombre" value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} style={campoStyle} />
                    <input placeholder="Cargo" value={nuevo.cargo} onChange={e => setNuevo(n => ({ ...n, cargo: e.target.value }))} style={campoStyle} />
                    <input placeholder="Correo" value={nuevo.correo} onChange={e => setNuevo(n => ({ ...n, correo: e.target.value }))} style={campoStyle} />
                    <input placeholder="+56 9" value={nuevo.telefono} onChange={e => setNuevo(n => ({ ...n, telefono: e.target.value }))} style={{ ...campoStyle, fontFamily: t.fontMono }} />
                    <button onClick={agregarContacto} style={{ ...botonSecundario, gridColumn: 'span 2' }}>Agregar contacto</button>
                </div>
                <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => guardarContactos(contactos)} disabled={!contactosCambiaron} style={{ ...botonSecundario, background: contactosCambiaron ? t.acento : '#fff', borderColor: contactosCambiaron ? t.acento : t.bordeInput, color: contactosCambiaron ? '#fff' : t.textoAtenuado2, fontWeight: 700 }}>Guardar cambios de contactos</button>
                    {!contactosCambiaron && avisoContactos && <span style={{ fontSize: 10.5, color: t.verde }}>{avisoContactos}</span>}
                </div>
            </div>
        </div>
    );
}

const botonSecundario = { height: 26, padding: '0 10px', background: '#fff', border: `1px solid ${t.bordeInput}`, fontSize: 11, color: t.textoSecundario2, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi };
