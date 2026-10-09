// El concepto de "taller" (el cliente que arrienda el sistema), primera etapa.
//
// Hoy hay UN taller y este archivo es casi una constante. Existe igual, y desde ahora,
// porque es donde la etapa 2 va a poner el registro de verdad (la base de control con la
// colección `Taller`) sin tener que tocar nada más: todo el resto del código ya va a estar
// preguntando por acá. Ver docs/multi-taller.md.
//
// **La regla que sostiene todo esto**: el taller NUNCA se resuelve desde algo que mande el
// cliente. Ni del header `X-Entorno`, ni de `?entorno=`, ni del subdominio. Sale de la
// sesión. El prefijo del token de sesión (ver utils/tokens.js) es la única excepción, y no
// es una excepción de verdad: solo elige en qué base buscar el token, y el token igual tiene
// que existir ahí. Inventarse un prefijo lleva a una base donde tu token no está — o sea, a
// un 401, no a los datos de otro.

// Identificador del único taller que existe hoy. Es también el prefijo de los tokens de
// sesión nuevos y el valor que llevan los `Usuario.tallerId` creados desde ahora.
const TALLER_PRINCIPAL = 'principal';

// Minúsculas, números y guiones. Sin puntos: el punto es el separador del prefijo en el
// token de sesión, así que permitirlo acá haría ambigua la división.
const SLUG_VALIDO = /^[a-z0-9-]{2,40}$/;

function esSlugValido(slug) {
    return SLUG_VALIDO.test(String(slug || ''));
}

// `resolverTaller` vivía acá en la etapa 1, cuando conocía un solo taller. Desde la etapa 2
// el registro de verdad está en config/conexiones.js —es quien lo carga de la base de
// control y lo mantiene en memoria— y la función se mudó ahí. Dejar una copia acá sería
// tener dos respuestas para "¿existe este taller?", y una de las dos se iba a quedar atrás:
// de hecho se quedó. Durante dos etapas esta decía que no a todo lo que no fuera
// `principal`, así que un token con el prefijo de otro taller caía en la base del principal
// y a esa persona la dejaba afuera sin un solo error.

// El taller a usar cuando no hay ninguna pista: una request sin sesión (las PWAs, el portal
// del cliente) o una sesión emitida antes de que los tokens llevaran prefijo.
function tallerPorDefecto() {
    return TALLER_PRINCIPAL;
}

module.exports = { TALLER_PRINCIPAL, esSlugValido, tallerPorDefecto };
