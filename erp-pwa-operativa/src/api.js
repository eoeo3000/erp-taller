// Todas las llamadas llevan el entorno en la URL, nunca en el header X-Entorno: esta app
// se abre fuera de la SPA de escritorio y axios.defaults no existe aquí (ver
// docs/rediseno/design_handoff_panel_control/CORRECCIONES.md punto 7).
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const CLAVE_TOKEN = 'operativo.token';
const CLAVE_ENTORNO = 'operativo.entorno';

export function getSesion() {
    return {
        token: localStorage.getItem(CLAVE_TOKEN) || '',
        entorno: localStorage.getItem(CLAVE_ENTORNO) || 'produccion',
    };
}

export function setSesion(token, entorno) {
    localStorage.setItem(CLAVE_TOKEN, token);
    localStorage.setItem(CLAVE_ENTORNO, entorno === 'demo' ? 'demo' : 'produccion');
}

export function haySesion() {
    return !!getSesion().token;
}

function conEntorno(path) {
    const { entorno } = getSesion();
    const sep = path.includes('?') ? '&' : '?';
    return `${API}${path}${sep}entorno=${entorno}`;
}

async function pedir(path, opts = {}) {
    const resp = await fetch(conEntorno(path), {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Error ${resp.status}`);
    return data;
}

export function whoami() {
    const { token } = getSesion();
    return pedir(`/usuarios/whoami?token=${encodeURIComponent(token)}`);
}

export function miDia() {
    const { token } = getSesion();
    return pedir(`/asignaciones/mi-dia?token=${encodeURIComponent(token)}`);
}

export function miSemana() {
    const { token } = getSesion();
    return pedir(`/asignaciones/mi-semana?token=${encodeURIComponent(token)}`);
}

export function cerrarAsignacion(id, body = {}) {
    const { token } = getSesion();
    return pedir(`/asignaciones/${id}/cerrar?token=${encodeURIComponent(token)}`, {
        method: 'PUT', body: JSON.stringify(body),
    });
}

// Reutiliza la misma logica de acciones que ya usa el portal por token de OT
// (otController.aplicarAccionOT, ver otController.supervisorAccion) — no la duplica.
export function accionOT(otId, body) {
    const { token } = getSesion();
    return pedir(`/ots/${otId}/accion-movil?token=${encodeURIComponent(token)}`, {
        method: 'PUT', body: JSON.stringify(body),
    });
}

export function obtenerOT(otId) {
    return pedir(`/ots/${otId}`);
}

// Mismo endpoint generico que ya usa el resto de la app (App.jsx: actualizarOtGlobal) para
// actualizaciones parciales de la OT — no es una accion del portal por token, es edicion
// directa de campos (aca: marcar una tarea puntual como completada).
export function actualizarOT(otId, body) {
    return pedir(`/ots/${otId}`, { method: 'PUT', body: JSON.stringify(body) });
}
