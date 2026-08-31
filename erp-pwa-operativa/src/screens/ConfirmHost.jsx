import { useSyncExternalStore } from 'react';
import { _suscribir, _estado, _resolverConfirm, _quitarToast } from '../confirmar.js';

// Host de confirmación + toasts (ver confirmar.js), montado una sola vez en App.jsx —
// reemplazo con el estilo de la app para window.alert()/window.confirm().
export default function ConfirmHost() {
    const snap = useSyncExternalStore(_suscribir, _estado);

    return (
        <>
            {snap.toasts.length > 0 && (
                <div style={s.pilaToasts}>
                    {snap.toasts.map((toast) => (
                        <div key={toast.id} style={{ ...s.toast, borderLeftColor: toast.tipo === 'error' ? 'var(--detenido)' : 'var(--listo)' }}>
                            <span style={s.toastTexto}>{toast.mensaje}</span>
                            <span onClick={() => _quitarToast(toast.id)} style={s.toastCerrar}>×</span>
                        </div>
                    ))}
                </div>
            )}

            {snap.confirm && (
                <div style={s.overlay}>
                    <div style={s.modal}>
                        <div style={s.cuerpo}>{snap.confirm.mensaje}</div>
                        <div style={s.pie}>
                            {/* .boton-secundario/.boton-primario traen width:100% (pensadas para
                                pie-accion, un botón por fila) — acá van dos lado a lado. */}
                            <button className="boton-secundario" style={{ width: 'auto', flex: 1, minHeight: 44 }} onClick={() => _resolverConfirm(false)}>{snap.confirm.textoCancelar}</button>
                            <button
                                className="boton-primario"
                                style={{ width: 'auto', flex: 1, height: 44, ...(snap.confirm.danger ? { background: 'var(--detenido)' } : {}) }}
                                onClick={() => _resolverConfirm(true)}
                            >{snap.confirm.textoConfirmar}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

const s = {
    pilaToasts: {
        position: 'fixed', top: 12, left: 12, right: 12, zIndex: 10000,
        display: 'flex', flexDirection: 'column', gap: 8,
    },
    toast: {
        display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--superficie)',
        borderLeft: '3px solid transparent', borderRadius: 'var(--radio)', padding: '10px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,.16)', fontSize: 'var(--fs-secundario)',
        color: 'var(--texto-principal)', lineHeight: 1.4,
    },
    toastTexto: { flex: 1, minWidth: 0 },
    toastCerrar: { flex: 'none', cursor: 'pointer', color: 'var(--texto-secundario-1)', fontSize: 16, lineHeight: 1 },

    overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: 10001, padding: 20,
    },
    modal: {
        background: 'var(--superficie)', borderRadius: 'var(--radio)', width: '100%', maxWidth: 360,
        boxShadow: '0 8px 24px rgba(0,0,0,.2)',
    },
    cuerpo: { padding: 18, fontSize: 'var(--fs-cuerpo)', color: 'var(--texto-principal)', lineHeight: 1.5 },
    pie: { display: 'flex', gap: 8, padding: '0 16px 16px' },
};
