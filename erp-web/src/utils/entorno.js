import axios from 'axios';

// En qué base está trabajando esta pestaña: la real del taller, o la de demostración.
//
// Se propaga como `X-Entorno` por axios.defaults, así ninguna llamada existente necesita
// tocarse. Las que usan `fetch()` nativo sí incluyen `headerEntorno()` a mano.
//
// --- Por qué la demo vive en sessionStorage y NO en localStorage ---
//
// Esto estaba en localStorage, que es del ORIGEN y no de la pestaña: una vez elegida la
// demo, el navegador entero quedaba en demo —todas las pestañas, y al día siguiente
// también—. Es exactamente la trampa que ya costó caro con la pista del taller, y acá pegó
// peor, porque **la demo tiene su propia base**:
//
//   - Recuperar la clave buscaba el correo en la base de demostración, donde esa cuenta no
//     existe, y el log decía «ninguna cuenta con ese correo» — que se lee igual que «no
//     existe en ninguna parte».
//   - `GET /auth/yo` contra la demo, que no tiene cuentas de escritorio, responde
//     `requiereInstalacion`. O sea que la app decía **«todavía no hay ninguna cuenta»** y
//     ofrecía crear un administrador, a alguien cuyo taller llevaba meses operando. Visto en
//     producción.
//
// En sessionStorage la demo dura lo que dura la pestaña. Cerrarla la deja fuera de ahí sin
// que nadie tenga que acordarse de volver, y producción es lo que pasa cuando no se hizo
// nada — que es como tiene que ser el valor por omisión de algo así.
//
// --- Y por qué se entra por un link y no por un selector ---
//
// El selector vivía dentro de Importar/Exportar, en la app del cliente. La demo es la
// herramienta de quien ARRIENDA el sistema, para mostrarlo sin riesgo; la gente del taller
// no tiene ningún motivo para ir ahí y sí muchas formas de llegar sin querer. Ahora se entra
// con `?entorno=demo` en la dirección, que es algo que hay que escribir a propósito.
const CLAVE = 'erpTaller.entorno';

// Todas las lecturas y escrituras van envueltas: en una ventana privada —o con el
// almacenamiento bloqueado— tocar `sessionStorage` lanza. Este módulo se importa al arrancar
// el SPA, así que ahí lo que se vería no es un aviso sino una pantalla en blanco.
function leer() {
    try { return sessionStorage.getItem(CLAVE) || ''; } catch { return ''; }
}

function escribir(valor) {
    try {
        if (valor === 'demo') sessionStorage.setItem(CLAVE, 'demo');
        else sessionStorage.removeItem(CLAVE);
    } catch { /* sin almacenamiento, vale solo para esta carga */ }
}

// La pista del link, leída UNA sola vez al cargar el módulo y borrada de la barra de
// direcciones — igual que la clave de instalación. Si quedara en la URL, recargar o
// compartir el link volvería a meter a esa pestaña en la demo sin pedirlo. Se conserva
// `?taller=`, que es ruteo y hay que recordarlo.
function tomarPistaDelLink() {
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('entorno') !== 'demo') return;
        escribir('demo');
        url.searchParams.delete('entorno');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch { /* sin window (pruebas de lógica pura): no hay link del que leer */ }
}

// Un navegador que quedó en demo ANTES de este cambio tiene la marca vieja en localStorage,
// y como el selector ya no existe no habría forma de salir: la app seguiría abriendo la base
// de demostración para siempre, diciendo que no hay cuentas. Se borra al arrancar, una vez.
function olvidarLaMarcaVieja() {
    try { localStorage.removeItem(CLAVE); } catch { /* nada que limpiar */ }
}

export function obtenerEntorno() {
    return leer() === 'demo' ? 'demo' : 'produccion';
}

export function fijarEntorno(valor) {
    escribir(valor);
    axios.defaults.headers.common['X-Entorno'] = obtenerEntorno();
}

export function headerEntorno() {
    return { 'X-Entorno': obtenerEntorno() };
}

// Se ejecuta una sola vez al importar el módulo (import en App.jsx, antes de cualquier
// llamada), dejando el header por defecto listo para todas las llamadas axios de la app.
olvidarLaMarcaVieja();
tomarPistaDelLink();
axios.defaults.headers.common['X-Entorno'] = obtenerEntorno();

// Clave compartida para las rutas de escritura de mayor riesgo (OT, contabilidad,
// recursos/puestos/calendarios) — ver plan de robustecimiento, punto 4. Vive en el build del
// SPA (VITE_API_KEY, definida en erp-web/.env): no es autenticación real por persona, protege
// contra acceso casual/directo a la API, no contra alguien que ya usa la app desde el
// navegador. Si VITE_API_KEY no está definida, el header sale vacío y el backend permite el
// paso igual (ver middlewares/apiKey.js) — así el gate solo se activa cuando se configura
// explícitamente en ambos lados, sin romper la app para quien no la haya configurado.
export function headerApiKey() {
    return { 'X-Api-Key': import.meta.env.VITE_API_KEY || '' };
}

axios.defaults.headers.common['X-Api-Key'] = import.meta.env.VITE_API_KEY || '';
