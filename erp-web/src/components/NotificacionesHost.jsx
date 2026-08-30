import { useSyncExternalStore } from 'react';
import { _suscribirNotificaciones, _estadoNotificaciones, _resolverConfirm, _quitarToast } from '../utils/notificar';

// Mismos tokens que ya usan TratamientoScreen/GanttScreen/DashboardScreen (valores oklch
// idénticos entre las tres, solo cambia el nombre de la propiedad) — se reutilizan literales
// acá porque este host vive fuera de esas pantallas, montado una sola vez en App.jsx.
const t = {
    superficie: '#ffffff',
    textoPrincipal: '#1a1a18',
    textoSecundario1: '#3a3a35',
    bordeZona: 'rgba(0,0,0,.12)',
    hairlineBloque: 'rgba(0,0,0,.10)',
    acento: 'oklch(0.48 0.10 250)',
    exito: 'oklch(0.48 0.10 155)',
    advertencia: 'oklch(0.55 0.11 65)',
    error: 'oklch(0.52 0.13 25)',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
};
const COLOR_TOAST = { exito: t.exito, advertencia: t.advertencia, error: t.error };

// Host de notificaciones (toasts + modal de confirmación), montado una sola vez en App.jsx —
// reemplazo con el estilo del ERP para window.alert()/window.confirm(), llamado desde
// cualquier pantalla vía src/utils/notificar.js.
export default function NotificacionesHost() {
    const snap = useSyncExternalStore(_suscribirNotificaciones, _estadoNotificaciones);

    return (
        <>
            {snap.toasts.length > 0 && (
                <div style={styles.pilaToasts}>
                    {snap.toasts.map(toast => (
                        <div key={toast.id} style={{ ...styles.toast, borderLeftColor: COLOR_TOAST[toast.tipo] }}>
                            <span style={styles.toastTexto}>{toast.mensaje}</span>
                            <span onClick={() => _quitarToast(toast.id)} style={styles.toastCerrar}>×</span>
                        </div>
                    ))}
                </div>
            )}

            {snap.confirm && (
                <div style={styles.overlay}>
                    <div style={styles.modal}>
                        <div style={styles.modalHeader}>
                            <span style={styles.modalTitulo}>Confirmar</span>
                        </div>
                        <div style={styles.modalCuerpo}>{snap.confirm.mensaje}</div>
                        <div style={styles.modalFooter}>
                            <button onClick={() => _resolverConfirm(false)} style={styles.btnSecundario}>{snap.confirm.textoCancelar}</button>
                            <button
                                onClick={() => _resolverConfirm(true)}
                                style={{ ...styles.btnPrimario, ...(snap.confirm.danger ? { background: t.error, borderColor: t.error } : {}) }}
                            >{snap.confirm.textoConfirmar}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

const styles = {
    pilaToasts: {
        position: 'fixed', top: 16, right: 16, zIndex: 10000,
        display: 'flex', flexDirection: 'column', gap: 8, width: 320, maxWidth: 'calc(100vw - 32px)',
    },
    toast: {
        display: 'flex', alignItems: 'flex-start', gap: 8, background: t.superficie,
        borderLeft: '3px solid transparent', borderRadius: 2, padding: '10px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,.14)', fontFamily: t.fontUi, fontSize: 12.5,
        color: t.textoPrincipal, lineHeight: 1.4,
    },
    toastTexto: { flex: 1, minWidth: 0 },
    toastCerrar: { flex: 'none', cursor: 'pointer', color: t.textoSecundario1, fontSize: 14, lineHeight: 1 },

    overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: 10001,
    },
    modal: { background: t.superficie, borderRadius: 2, width: 380, boxShadow: '0 8px 24px rgba(0,0,0,.14)', fontFamily: t.fontUi },
    modalHeader: { padding: '10px 16px', borderBottom: `1px solid ${t.hairlineBloque}` },
    modalTitulo: { fontSize: 12.5, fontWeight: 700, color: t.textoPrincipal },
    modalCuerpo: { padding: 16, fontSize: 13, color: t.textoSecundario1, lineHeight: 1.5 },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: `1px solid ${t.hairlineBloque}` },
    btnPrimario: { height: 30, padding: '0 14px', background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    btnSecundario: { height: 27, padding: '0 12px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 12, color: '#262622', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },
};
