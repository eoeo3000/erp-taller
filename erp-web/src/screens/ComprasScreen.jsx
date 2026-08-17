import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

const COLOR_ESTADO_OC = {
    'Emitida': '#f39c12',
    'Aceptada por proveedor': '#3498db',
    'En tránsito': '#8e44ad',
    'Recibida': '#27ae60',
    'Pagada': '#16a085'
};

const proveedorVacio = { nombre: '', contacto: '', correo: '', telefono: '', tipoInsumo: '', rut: '' };

export default function ComprasScreen({ ots = [], suministros = [] }) {
    const { state: prefill } = useLocation();
    const [tab, setTab] = useState('ordenes');

    // --- Proveedores ---
    const [proveedores, setProveedores] = useState([]);
    const [modalProveedor, setModalProveedor] = useState(false);
    const [formProveedor, setFormProveedor] = useState(proveedorVacio);
    const [editandoProveedorId, setEditandoProveedorId] = useState(null);

    // --- Órdenes de Compra ---
    const [ordenes, setOrdenes] = useState([]);
    const [modalOC, setModalOC] = useState(false);
    const [formOC, setFormOC] = useState({ proveedorId: '', otId: '', items: [] });

    const cargarProveedores = useCallback(async () => {
        const { data } = await axios.get(`${API}/proveedores`);
        setProveedores(data);
    }, []);

    const cargarOrdenes = useCallback(async () => {
        const { data } = await axios.get(`${API}/ordenes-compra`);
        setOrdenes(data);
    }, []);

    useEffect(() => { cargarProveedores(); cargarOrdenes(); }, [cargarProveedores, cargarOrdenes]);

    // Prefill desde TratamientoScreen ("Generar OC" sobre un faltante de stock)
    useEffect(() => {
        if (!prefill?.otId) return;
        setTab('ordenes');
        setFormOC({
            proveedorId: '',
            otId: prefill.otId,
            items: [{
                suministroId: prefill.suministroId || '',
                descripcion: prefill.descripcion || '',
                cantidad: prefill.cantidad || 1,
                precioUnitario: prefill.precioUnitario || 0
            }]
        });
        setModalOC(true);
    }, [prefill]);

    // --- Proveedores: acciones ---
    const guardarProveedor = async () => {
        if (!formProveedor.nombre) return alert('El nombre es obligatorio');
        try {
            if (editandoProveedorId) {
                await axios.put(`${API}/proveedores/${editandoProveedorId}`, formProveedor);
            } else {
                await axios.post(`${API}/proveedores`, formProveedor);
            }
            setModalProveedor(false);
            setFormProveedor(proveedorVacio);
            setEditandoProveedorId(null);
            cargarProveedores();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al guardar el proveedor');
        }
    };

    const editarProveedor = (p) => {
        setFormProveedor(p);
        setEditandoProveedorId(p._id);
        setModalProveedor(true);
    };

    const eliminarProveedor = async (id) => {
        if (!window.confirm('¿Eliminar este proveedor?')) return;
        try {
            await axios.delete(`${API}/proveedores/${id}`);
            cargarProveedores();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al eliminar');
        }
    };

    // --- Órdenes de Compra: acciones ---
    const agregarItemOC = () => {
        setFormOC(f => ({ ...f, items: [...f.items, { suministroId: '', descripcion: '', cantidad: 1, precioUnitario: 0 }] }));
    };
    const actualizarItemOC = (idx, campo, valor) => {
        setFormOC(f => ({
            ...f,
            items: f.items.map((it, i) => {
                if (i !== idx) return it;
                if (campo === 'suministroId') {
                    const s = suministros.find(s => s._id === valor);
                    return { ...it, suministroId: valor, descripcion: s?.descripcion || it.descripcion, precioUnitario: s?.precio ?? it.precioUnitario };
                }
                return { ...it, [campo]: (campo === 'cantidad' || campo === 'precioUnitario') ? Number(valor) || 0 : valor };
            })
        }));
    };
    const eliminarItemOC = (idx) => setFormOC(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

    const totalFormOC = formOC.items.reduce((sum, it) => sum + (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0), 0);

    const guardarOC = async () => {
        if (!formOC.proveedorId || !formOC.otId) return alert('Selecciona proveedor y OT');
        if (formOC.items.length === 0) return alert('Agrega al menos un ítem');
        try {
            await axios.post(`${API}/ordenes-compra`, formOC);
            setModalOC(false);
            setFormOC({ proveedorId: '', otId: '', items: [] });
            cargarOrdenes();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al crear la orden de compra');
        }
    };

    const enviarOC = async (oc) => {
        try {
            await axios.post(`${API}/ordenes-compra/${oc._id}/enviar`);
            alert('✅ Orden de compra enviada al proveedor');
        } catch (err) {
            alert(err.response?.data?.error || 'Error al enviar');
        }
    };

    const recibirOC = async (oc) => {
        if (!window.confirm(`¿Confirmar recepción de ${oc.numeroOC}? Esto sumará el stock de cada ítem.`)) return;
        try {
            await axios.post(`${API}/ordenes-compra/${oc._id}/recibir`);
            cargarOrdenes();
            alert('✅ Recepción registrada, stock actualizado');
        } catch (err) {
            alert(err.response?.data?.error || 'Error al recibir');
        }
    };

    const marcarPagada = async (oc) => {
        try {
            await axios.put(`${API}/ordenes-compra/${oc._id}`, { estado: 'Pagada' });
            cargarOrdenes();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al actualizar');
        }
    };

    const eliminarOC = async (oc) => {
        if (!window.confirm(`¿Eliminar la orden de compra ${oc.numeroOC}?`)) return;
        try {
            await axios.delete(`${API}/ordenes-compra/${oc._id}`);
            cargarOrdenes();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al eliminar');
        }
    };

    return (
        <div style={s.container}>
            <h2 style={s.titulo}>🧾 Compras</h2>

            <div style={s.tabBar}>
                <button onClick={() => setTab('ordenes')} style={tab === 'ordenes' ? s.tabActivo : s.tab}>Órdenes de Compra</button>
                <button onClick={() => setTab('proveedores')} style={tab === 'proveedores' ? s.tabActivo : s.tab}>Proveedores</button>
            </div>

            {tab === 'ordenes' && (
                <div style={s.card}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                        <button onClick={() => setModalOC(true)} style={s.btnPrimario}>+ Nueva Orden de Compra</button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={s.tabla}>
                            <thead>
                                <tr style={s.filaHeader}>
                                    <th style={s.th}>N° OC</th>
                                    <th style={s.th}>Proveedor</th>
                                    <th style={s.th}>OT</th>
                                    <th style={s.th}>Total</th>
                                    <th style={s.th}>Estado</th>
                                    <th style={s.th}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ordenes.map(oc => {
                                    const ot = ots.find(o => String(o._id) === String(oc.otId));
                                    return (
                                        <tr key={oc._id} style={s.fila}>
                                            <td style={s.td}>{oc.numeroOC}</td>
                                            <td style={s.td}>{oc.proveedorId?.nombre || '—'}</td>
                                            <td style={s.td}>{ot?.numeroOT || '—'}</td>
                                            <td style={s.td}>{fmt(oc.total)}</td>
                                            <td style={s.td}>
                                                <span style={{ ...s.badge, backgroundColor: COLOR_ESTADO_OC[oc.estado] || '#95a5a6' }}>{oc.estado}</span>
                                            </td>
                                            <td style={{ ...s.td, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {oc.estado === 'Emitida' && <button onClick={() => enviarOC(oc)} style={s.btnAccion}>✉️ Enviar</button>}
                                                {['Emitida', 'Aceptada por proveedor', 'En tránsito'].includes(oc.estado) &&
                                                    <button onClick={() => recibirOC(oc)} style={{ ...s.btnAccion, backgroundColor: '#27ae60' }}>📦 Recibir</button>}
                                                {oc.estado === 'Recibida' && <button onClick={() => marcarPagada(oc)} style={{ ...s.btnAccion, backgroundColor: '#16a085' }}>💵 Pagada</button>}
                                                <button onClick={() => eliminarOC(oc)} style={{ ...s.btnAccion, backgroundColor: '#e74c3c' }}>🗑️</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {ordenes.length === 0 && (
                                    <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#999' }}>Sin órdenes de compra registradas.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'proveedores' && (
                <div style={s.card}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                        <button onClick={() => { setFormProveedor(proveedorVacio); setEditandoProveedorId(null); setModalProveedor(true); }} style={s.btnPrimario}>+ Nuevo Proveedor</button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={s.tabla}>
                            <thead>
                                <tr style={s.filaHeader}>
                                    <th style={s.th}>Nombre</th>
                                    <th style={s.th}>Contacto</th>
                                    <th style={s.th}>Correo</th>
                                    <th style={s.th}>Tipo de Insumo</th>
                                    <th style={s.th}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {proveedores.map(p => (
                                    <tr key={p._id} style={s.fila}>
                                        <td style={s.td}>{p.nombre}</td>
                                        <td style={s.td}>{p.contacto}</td>
                                        <td style={s.td}>{p.correo}</td>
                                        <td style={s.td}>{p.tipoInsumo}</td>
                                        <td style={{ ...s.td, display: 'flex', gap: '6px' }}>
                                            <button onClick={() => editarProveedor(p)} style={s.btnAccion}>✏️</button>
                                            <button onClick={() => eliminarProveedor(p._id)} style={{ ...s.btnAccion, backgroundColor: '#e74c3c' }}>🗑️</button>
                                        </td>
                                    </tr>
                                ))}
                                {proveedores.length === 0 && (
                                    <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#999' }}>Sin proveedores registrados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal Proveedor */}
            {modalProveedor && (
                <div style={s.overlay}>
                    <div style={s.modal}>
                        <div style={s.modalHeader}>
                            <h3>{editandoProveedorId ? 'Editar' : 'Nuevo'} Proveedor</h3>
                            <button onClick={() => setModalProveedor(false)} style={s.btnClose}>&times;</button>
                        </div>
                        <div style={s.modalBody}>
                            <label style={s.label}>Nombre *</label>
                            <input style={s.input} value={formProveedor.nombre} onChange={e => setFormProveedor({ ...formProveedor, nombre: e.target.value })} />
                            <label style={s.label}>Contacto</label>
                            <input style={s.input} value={formProveedor.contacto} onChange={e => setFormProveedor({ ...formProveedor, contacto: e.target.value })} />
                            <label style={s.label}>Correo</label>
                            <input type="email" style={s.input} value={formProveedor.correo} onChange={e => setFormProveedor({ ...formProveedor, correo: e.target.value })} />
                            <label style={s.label}>Teléfono</label>
                            <input style={s.input} value={formProveedor.telefono} onChange={e => setFormProveedor({ ...formProveedor, telefono: e.target.value })} />
                            <label style={s.label}>Tipo de Insumo</label>
                            <input style={s.input} value={formProveedor.tipoInsumo} onChange={e => setFormProveedor({ ...formProveedor, tipoInsumo: e.target.value })} />
                            <label style={s.label}>RUT</label>
                            <input style={s.input} value={formProveedor.rut} onChange={e => setFormProveedor({ ...formProveedor, rut: e.target.value })} />
                        </div>
                        <div style={s.modalFooter}>
                            <button onClick={() => setModalProveedor(false)} style={s.btnSecundario}>Cancelar</button>
                            <button onClick={guardarProveedor} style={s.btnPrimario}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Orden de Compra */}
            {modalOC && (
                <div style={s.overlay}>
                    <div style={{ ...s.modal, maxWidth: '640px' }}>
                        <div style={s.modalHeader}>
                            <h3>Nueva Orden de Compra</h3>
                            <button onClick={() => setModalOC(false)} style={s.btnClose}>&times;</button>
                        </div>
                        <div style={s.modalBody}>
                            <label style={s.label}>OT *</label>
                            <select style={s.input} value={formOC.otId} onChange={e => setFormOC({ ...formOC, otId: e.target.value })}>
                                <option value="">Seleccionar OT...</option>
                                {ots.map(o => <option key={o._id} value={o._id}>{o.numeroOT || o._id} — {o.solicitante}</option>)}
                            </select>

                            <label style={s.label}>Proveedor *</label>
                            <select style={s.input} value={formOC.proveedorId} onChange={e => setFormOC({ ...formOC, proveedorId: e.target.value })}>
                                <option value="">Seleccionar proveedor...</option>
                                {proveedores.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
                            </select>

                            <label style={s.label}>Ítems</label>
                            {formOC.items.map((it, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                                    <select style={{ ...s.input, flex: 2 }} value={it.suministroId} onChange={e => actualizarItemOC(idx, 'suministroId', e.target.value)}>
                                        <option value="">Insumo del catálogo (opcional)...</option>
                                        {suministros.map(su => <option key={su._id} value={su._id}>{su.codigo} — {su.descripcion}</option>)}
                                    </select>
                                    <input placeholder="Descripción" style={{ ...s.input, flex: 2 }} value={it.descripcion} onChange={e => actualizarItemOC(idx, 'descripcion', e.target.value)} />
                                    <input type="number" placeholder="Cant." style={{ ...s.input, flex: 1 }} value={it.cantidad} onChange={e => actualizarItemOC(idx, 'cantidad', e.target.value)} />
                                    <input type="number" placeholder="P. Unit." style={{ ...s.input, flex: 1 }} value={it.precioUnitario} onChange={e => actualizarItemOC(idx, 'precioUnitario', e.target.value)} />
                                    <button onClick={() => eliminarItemOC(idx)} style={{ ...s.btnAccion, backgroundColor: '#e74c3c' }}>🗑️</button>
                                </div>
                            ))}
                            <button onClick={agregarItemOC} style={s.btnSecundario}>+ Añadir Ítem</button>
                            <p style={{ textAlign: 'right', fontWeight: 'bold', marginTop: '12px' }}>Total: {fmt(totalFormOC)}</p>
                        </div>
                        <div style={s.modalFooter}>
                            <button onClick={() => setModalOC(false)} style={s.btnSecundario}>Cancelar</button>
                            <button onClick={guardarOC} style={s.btnPrimario}>Crear Orden de Compra</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const s = {
    container: { width: '100%', maxWidth: '1100px', margin: '0 auto', padding: 'clamp(10px, 3vw, 20px)', boxSizing: 'border-box' },
    titulo: { color: '#2c3e50', marginBottom: '16px' },
    tabBar: { display: 'flex', gap: '8px', marginBottom: '16px' },
    tab: { padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#eee', color: '#333', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
    tabActivo: { padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#2c3e50', color: 'white', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
    card: { background: 'white', borderRadius: '12px', padding: 'clamp(12px, 3vw, 20px)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' },
    tabla: { width: '100%', minWidth: '700px', borderCollapse: 'collapse' },
    filaHeader: { borderBottom: '2px solid #eee', textAlign: 'left', color: '#7f8c8d', fontSize: '13px' },
    fila: { borderBottom: '1px solid #f0f0f0' },
    th: { padding: '10px 8px' },
    td: { padding: '10px 8px', fontSize: '13px' },
    badge: { color: 'white', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' },
    btnPrimario: { padding: '10px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
    btnSecundario: { padding: '10px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' },
    btnAccion: { padding: '5px 10px', background: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' },
    modal: { background: 'white', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eee' },
    modalBody: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid #eee' },
    btnClose: { border: 'none', background: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' },
    label: { fontWeight: 'bold', fontSize: '13px', marginTop: '10px', color: '#4b5563' },
    input: { padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', width: '100%', boxSizing: 'border-box' }
};
