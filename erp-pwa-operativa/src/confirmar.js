// Reemplazo de window.confirm()/window.alert() con el estilo de la app (ver ConfirmHost.jsx,
// montado una sola vez en App.jsx) — antes esta PWA no tenía ningún sistema propio de avisos,
// las confirmaciones ("Marcar trabajo en ejecución", "Trabajo finalizado") y los alerts (falla
// al subir una foto) salían con el diálogo nativo del navegador, sin ningún estilo de la app.
// Mismo patrón imperativo que erp-web/src/utils/notificar.js: módulo con estado propio, no
// Context, para poder llamarlo desde cualquier handler sin pasar props por toda la cadena.
let idSeq = 0;
const listeners = new Set();
let estado = { toasts: [], confirm: null };

function emitir(cambios) {
    estado = { ...estado, ...cambios };
    listeners.forEach((fn) => fn());
}

function agregarToast(tipo, mensaje) {
    const id = ++idSeq;
    emitir({ toasts: [...estado.toasts, { id, tipo, mensaje }] });
    setTimeout(() => quitarToast(id), tipo === 'error' ? 6000 : 3500);
    return id;
}

function quitarToast(id) {
    emitir({ toasts: estado.toasts.filter((t) => t.id !== id) });
}

// Reemplazo de window.alert(mensaje) — no bloquea, se ve y se cierra solo.
export const avisar = {
    exito: (mensaje) => agregarToast('exito', mensaje),
    error: (mensaje) => agregarToast('error', mensaje),
};

// Reemplazo de window.confirm(mensaje) — Promise<boolean> en vez de bloquear el hilo.
// danger=true (default) pinta el botón de confirmar en rojo — pasar { danger: false } para
// confirmaciones no destructivas (ej. "Marcar trabajo en ejecución").
export function confirmar(mensaje, { danger = true, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar' } = {}) {
    return new Promise((resolve) => {
        emitir({ confirm: { mensaje, danger, textoConfirmar, textoCancelar, resolve } });
    });
}

// A partir de acá, uso exclusivo de ConfirmHost — no llamar desde pantallas.
export function _suscribir(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function _estado() {
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
