// Si este navegador ya vio la guía.
//
// En localStorage y no en sessionStorage: es una preferencia del navegador, no un secreto, y
// lo que se quiere evitar es que el aviso vuelva a aparecer cada mañana. Mismo criterio que
// utils/taller.js.
//
// Envuelto en try/catch porque en una ventana privada —o con el almacenamiento bloqueado—
// leer o escribir lanza. Que eso tumbe la app entera por un aviso de bienvenida sería
// desproporcionado: sin almacenamiento la guía se ofrece siempre, que es el lado seguro.
const CLAVE = 'erpTaller.guiaVista';

export function yaVioLaGuia() {
    try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; }
}

export function marcarGuiaVista() {
    try { localStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento, se vuelve a ofrecer */ }
}
