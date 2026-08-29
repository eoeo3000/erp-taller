// Igual que erp-pwa-operativa/src/api.js: el entorno viaja en la URL, nunca en el header
// X-Entorno (CORRECCIONES.md punto 7) — esta app se abre fuera de la SPA.
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const CLAVE_TOKEN = 'cliente.token';
const CLAVE_ENTORNO = 'cliente.entorno';
const CLAVE_EMPRESA = 'cliente.empresa';

export function getSesion() {
    return {
        token: localStorage.getItem(CLAVE_TOKEN) || '',
        entorno: localStorage.getItem(CLAVE_ENTORNO) || 'produccion',
        empresa: localStorage.getItem(CLAVE_EMPRESA) || '',
    };
}

export function setSesion(token, entorno, empresa) {
    localStorage.setItem(CLAVE_TOKEN, token);
    localStorage.setItem(CLAVE_ENTORNO, entorno === 'demo' ? 'demo' : 'produccion');
    if (empresa) localStorage.setItem(CLAVE_EMPRESA, empresa);
}

export function cerrarSesion() {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_EMPRESA);
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

// POST /api/portal/acceso — { telefono, numeroSolicitud } (C1, segundo factor manual)
export function acceder(telefono, numeroSolicitud) {
    return pedir('/portal/acceso', { method: 'POST', body: JSON.stringify({ telefono, numeroSolicitud }) });
}

// GET /api/portal/mis-solicitudes?token= — reutiliza la sesión (llegada por C1 o por link)
export function misSolicitudes() {
    const { token } = getSesion();
    return pedir(`/portal/mis-solicitudes?token=${encodeURIComponent(token)}`);
}

// POST /api/portal/solicitud — mismo modelo Solicitud que IngresoScreen.jsx
export function crearSolicitud(datos) {
    return pedir('/portal/solicitud', { method: 'POST', body: JSON.stringify({ ...datos, origen: 'Portal' }) });
}

// POST /api/portal/ot/:id/responder?token= — aprobar/rechazar la cotización de un trabajo
export function responderCotizacion(otId, estado, motivoRechazo) {
    const { token } = getSesion();
    return pedir(`/portal/ot/${otId}/responder?token=${encodeURIComponent(token)}`, {
        method: 'POST', body: JSON.stringify({ estado, motivoRechazo }),
    });
}

// POST /api/portal/ot/:id/excepciones/:excepcionId/responder?token= — aprobar/rechazar una
// excepción ("extensión de cotización") de un trabajo
export function responderExcepcion(otId, excepcionId, estado, motivoRechazo) {
    const { token } = getSesion();
    return pedir(`/portal/ot/${otId}/excepciones/${excepcionId}/responder?token=${encodeURIComponent(token)}`, {
        method: 'POST', body: JSON.stringify({ estado, motivoRechazo }),
    });
}

// POST /api/portal/ot/:id/orden-compra?token= — el cliente carga su propio número de orden
// de compra (Cuenta y Pago, C5)
export function actualizarOrdenCompra(otId, ordenCompra) {
    const { token } = getSesion();
    return pedir(`/portal/ot/${otId}/orden-compra?token=${encodeURIComponent(token)}`, {
        method: 'POST', body: JSON.stringify({ ordenCompra }),
    });
}
