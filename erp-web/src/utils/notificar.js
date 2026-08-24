// Reemplazo de window.alert()/window.confirm() con el estilo del ERP (ver NotificacionesHost.jsx,
// montado una sola vez en App.jsx). Módulo imperativo con estado propio en vez de Context: es un
// utilitario de UI, no data de dominio (que en este proyecto vive toda en App.jsx y baja por
// props) — así se puede llamar desde cualquier handler sin pasar props por toda la cadena.
//
// `estado` se REEMPLAZA entero en cada cambio (nunca se mutan sus propiedades in-place): el host
// lee esto con useSyncExternalStore, que decide si re-renderizar comparando la referencia del
// snapshot con Object.is — si solo mutáramos estado.toasts/estado.confirm sin cambiar la
// referencia de `estado`, el host nunca se enteraría del cambio.
let idSeq = 0;
const listeners = new Set();
let estado = { toasts: [], confirm: null };

function emitir(cambios) {
    estado = { ...estado, ...cambios };
    listeners.forEach(fn => fn());
}

function agregarToast(tipo, mensaje) {
    const id = ++idSeq;
    emitir({ toasts: [...estado.toasts, { id, tipo, mensaje }] });
    const duracion = tipo === 'error' ? 7000 : 4000;
    setTimeout(() => quitarToast(id), duracion);
    return id;
}

function quitarToast(id) {
    emitir({ toasts: estado.toasts.filter(t => t.id !== id) });
}

export const notificar = {
    exito: (mensaje) => agregarToast('exito', mensaje),
    advertencia: (mensaje) => agregarToast('advertencia', mensaje),
    error: (mensaje) => agregarToast('error', mensaje),
};

// Reemplazo directo de window.confirm(mensaje) — Promise<boolean> en vez de bloquear el hilo.
// danger=true (default) pinta el botón de confirmar en rojo: la mayoría de los confirm() de
// este ERP son de borrado. Pasar { danger: false } para confirmaciones no destructivas.
export function confirmar(mensaje, { danger = true, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar' } = {}) {
    return new Promise((resolve) => {
        emitir({ confirm: { mensaje, danger, textoConfirmar, textoCancelar, resolve } });
    });
}

// A partir de acá, uso exclusivo de NotificacionesHost — no llamar desde pantallas.
export function _suscribirNotificaciones(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function _estadoNotificaciones() {
    return estado;
}
export function _resolverConfirm(valor) {
    if (estado.confirm) {
        estado.confirm.resolve(valor);
        emitir({ confirm: null });
    }
}
export function _quitarToast(id) {
    quitarToast(id);
}
