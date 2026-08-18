import { useState } from 'react';
import { acceder, setSesion } from '../api.js';

export default function C1Acceso({ nav }) {
    const [telefono, setTelefono] = useState('');
    const [numeroSolicitud, setNumeroSolicitud] = useState('');
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);

    const entrar = async (e) => {
        e.preventDefault();
        setError(''); setCargando(true);
        try {
            const d = await acceder(telefono, numeroSolicitud);
            setSesion(d.token, localStorage.getItem('cliente.entorno') || 'produccion', d.empresaSolicitante);
            nav.irRaiz('c2');
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    };

    return (
        <form onSubmit={entrar} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <div style={{ flex: 1, padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-titulo)', fontWeight: 'var(--fw-titulo)', marginTop: 24 }}>Mis trabajos</div>
                <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)', marginTop: 4 }}>
                    Ingrese su teléfono y el número de una de sus solicitudes.
                </div>

                <div style={{ marginTop: 24, background: '#eef4fb', borderLeft: '2px solid var(--en-curso)', padding: '10px 14px', fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-1)' }}>
                    Si llegó desde un link de WhatsApp o correo, ya está identificado y entra directo al listado.
                </div>

                <label style={{ display: 'block', marginTop: 20 }}>
                    <span className="versalita">Teléfono</span>
                    <input className="input-campo" style={{ marginTop: 6 }} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+56 9 …" inputMode="tel" />
                </label>
                <label style={{ display: 'block', marginTop: 14 }}>
                    <span className="versalita">N° de solicitud</span>
                    <input className="input-campo" style={{ marginTop: 6 }} value={numeroSolicitud} onChange={(e) => setNumeroSolicitud(e.target.value)} placeholder="SOL-2026-0001" />
                </label>

                {error && <div style={{ marginTop: 14, fontSize: 'var(--fs-secundario)', color: 'var(--detenido)' }}>{error}</div>}
            </div>

            <div className="pie-accion">
                <button type="submit" className="boton-primario" disabled={cargando}>{cargando ? 'Verificando…' : 'Ver mis trabajos'}</button>
                <button type="button" className="boton-secundario" onClick={() => nav.ir('c6')}>Pedir un servicio nuevo</button>
            </div>
        </form>
    );
}
