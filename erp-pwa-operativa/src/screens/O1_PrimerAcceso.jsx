import { useEffect, useState } from 'react';
import { whoami } from '../api.js';

const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Esta pantalla ahora se muestra en cada apertura (no solo la primera vez), así que el
// aviso de instalación deja de tener sentido una vez que la app YA corre instalada
// (display-mode: standalone) — mostrar "añádela a tu pantalla de inicio" dentro de la app
// que ya está en la pantalla de inicio confundiría más de lo que ayuda.
function corriendoInstalada() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function O1PrimerAcceso({ onEntrar }) {
    const [persona, setPersona] = useState(null);
    const [error, setError] = useState('');
    const [instalada] = useState(corriendoInstalada);

    useEffect(() => {
        whoami().then(setPersona).catch((e) => setError(e.message));
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <div style={{ flex: 1, padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-titulo)', fontWeight: 'var(--fw-titulo)', marginTop: 24 }}>
                    Hola{persona?.nombre ? `, ${persona.nombre}` : ''}
                </div>
                <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-atenuado-1)', marginTop: 4 }}>
                    Bienvenido a tu app de trabajo.
                </div>

                {error && <div style={{ marginTop: 16, fontSize: 'var(--fs-secundario)', color: 'var(--detenido)' }}>{error}</div>}

                {persona && (
                    <div style={{ marginTop: 20, border: '1px solid var(--linea-zona)', borderRadius: 'var(--radio)' }}>
                        <Fila etiqueta="Persona" valor={persona.nombre} />
                        <Fila etiqueta="Puesto" valor={persona.puesto || '—'} />
                        <Fila etiqueta="Emitido" valor={fmt(persona.fechaEmision)} ultima />
                    </div>
                )}

                {!instalada && (
                    <div style={{ marginTop: 20, background: 'var(--franja)', borderLeft: '2px solid var(--atencion)', padding: '12px 14px' }}>
                        <div style={{ fontSize: 'var(--fs-secundario)', fontWeight: 600 }}>Instala esta app</div>
                        <div style={{ fontSize: 'var(--fs-secundario)', color: 'var(--texto-secundario-2)', marginTop: 4 }}>
                            Menú del navegador → Añadir a pantalla de inicio.
                        </div>
                    </div>
                )}

                <p style={{ fontSize: 'var(--fs-cuerpo)', marginTop: 20, color: 'var(--texto-secundario-1)' }}>
                    Este link es tu acceso permanente. No caduca al terminar un trabajo y no necesitas clave.
                </p>
            </div>

            <div className="pie-accion">
                <button className="boton-primario" onClick={onEntrar}>Entrar a mi día</button>
                <div style={{ fontSize: 'var(--fs-linea-mono)', color: 'var(--texto-atenuado-2)', textAlign: 'center' }}>
                    Si pierdes el teléfono, avisa a la oficina para revocar este acceso.
                </div>
            </div>
        </div>
    );
}

function Fila({ etiqueta, valor, ultima }) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '10px 14px', minHeight: 44, alignItems: 'center',
            borderBottom: ultima ? 'none' : '1px solid var(--linea-fina)',
        }}>
            <span className="versalita">{etiqueta}</span>
            <span style={{ fontSize: 'var(--fs-secundario)', fontWeight: 600 }}>{valor}</span>
        </div>
    );
}
