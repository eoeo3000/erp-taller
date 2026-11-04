// Qué puede hacer cada cuenta de escritorio. **Una sola definición.**
//
// Hasta acá el campo `rol` existía, viajaba en `req.usuario`, en `GET /auth/yo` y en la lista
// de cuentas, y no decidía nada: `cuentasController.invitar` escribía `rol: 'administrador'` a
// mano, así que **toda cuenta invitada al escritorio veía todo** — contabilidad, finanzas, y la
// pestaña desde donde se invita a más gente. Esconder Finanzas y Contabilidad del menú tampoco
// protegía nada: seguían respondiendo a cualquiera con sesión que escribiera la URL.
//
// --- El criterio, en una frase ---
//
// **Administración es lo que da o quita acceso a personas, la plata del taller, y las
// operaciones masivas.** Todo lo demás —recibir solicitudes, armar y programar OTs CON SUS
// PRECIOS, los catálogos que las alimentan, comprar, hablar con los clientes— es operación.
//
// Que quien arma una OT vea los precios lo decidió el dueño del producto: los costos viven
// dentro de la pantalla donde se arma (`TratamientoScreen`), y separarlos habría obligado a
// partir esa pantalla en dos para resolver un problema que hoy nadie tiene.
//
// --- Lo que NO es ---
//
// No es autorización por recurso: alguien de operación ve todas las OT del taller, no solo
// las suyas. Y los roles de terreno (`supervisor`, `ejecutor`) no se cruzan con estos: deciden
// qué pantallas ve la PWA Operativa, no qué puede tocar alguien en el escritorio.

// Los roles con los que se puede invitar a alguien al escritorio.
const ROLES_DE_OFICINA = ['administrador', 'operacion'];

// **Con el menor privilegio**, a propósito. Se usa cuando la invitación no trae rol: el caso es
// un SPA viejo —desplegado antes que este backend— que no sabe mandarlo. Fallar hacia
// «administrador» le regalaría todo a cualquiera invitado en esa ventana; fallar hacia
// «operación» solo obliga a subirle el rol después con Editar, que deja rastro en la bitácora.
const ROL_AL_INVITAR_POR_OMISION = 'operacion';

const ETIQUETAS = { administrador: 'Administración', operacion: 'Operación' };

function esAdministrador(usuario) {
    return usuario?.rol === 'administrador';
}

module.exports = { ROLES_DE_OFICINA, ROL_AL_INVITAR_POR_OMISION, ETIQUETAS, esAdministrador };
