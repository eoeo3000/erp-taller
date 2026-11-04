// Qué ve cada cuenta de escritorio. Espejo de erp-backend/src/config/roles.js.
//
// **El que protege es el backend**, que responde 403. Esto existe para que la pantalla no le
// ofrezca a nadie un menú que lo lleva a un error: si este archivo y el del backend se
// separaran, lo peor que pasa es que alguien de operación vea una entrada que termina en
// «solo para administración» — nunca que vea algo que no debe. Por eso no hay un paquete
// compartido entre las dos apps solo para esto: el proyecto no tiene uno y no lo justificaría.
//
// El criterio: administración es lo que da o quita acceso a personas, la plata del taller y
// lo masivo. Todo lo demás, incluidos los PRECIOS dentro de una OT, es operación.

export const ROLES_DE_OFICINA = [
    { id: 'operacion', nombre: 'Operación', detalle: 'Arma, programa y cotiza OTs. No ve finanzas ni contabilidad, y no da accesos.' },
    { id: 'administrador', nombre: 'Administración', detalle: 'Todo lo anterior, más finanzas, contabilidad, importar datos y dar o quitar accesos.' },
];

// Las pantallas que son solo de administración. Bodega de tokens está acá entera porque sus
// dos pestañas dan o quitan acceso —de terreno y de oficina—.
export const RUTAS_DE_ADMINISTRACION = ['/tokens', '/importexport', '/finanzas', '/contabilidad'];

// Sin usuario solo se llega con el login todavía apagado en el backend, y ahí todo el mundo
// veía todo: mismo rollout que el gate del backend, así desplegar no esconde nada a nadie.
export function esAdministracion(usuario) {
    if (!usuario) return true;
    return usuario.rol === 'administrador';
}

export function puedeVer(usuario, ruta) {
    return esAdministracion(usuario) || !RUTAS_DE_ADMINISTRACION.includes(ruta);
}

export function nombreDelRol(id) {
    return ROLES_DE_OFICINA.find((r) => r.id === id)?.nombre || id;
}
