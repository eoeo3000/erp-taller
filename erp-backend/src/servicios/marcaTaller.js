// La marca de cada taller: el nombre que su app muestra y el logo que sale en la cotización.
//
// Vive en la BASE DE CONTROL, junto al resto de la ficha del cliente, y no en la base del
// taller. Tres razones:
//   - La edita quien administra el producto desde el panel, que es el único que hoy tiene
//     dónde apretar. Un taller todavía no tiene pantalla de configuración.
//   - El registro en memoria (config/conexiones.js) ya se refresca cada minuto, así que
//     `GET /auth/yo` puede devolverla sin un viaje extra a Mongo. Si viviera en la base del
//     taller habría que ir a buscarla en cada arranque del SPA, y eso son 600-800ms acá.
//   - La pantalla de ingreso tiene que mostrarla ANTES de que alguien entre: en ese momento
//     no hay sesión y lo único que se sabe del taller es su slug.
//
// --- Por qué el nombre de la marca NO es `Taller.nombre` ---
//
// `nombre` es cómo quien administra llama a ese cliente en el panel ("Taller principal", que
// se anotó solo al encender la base de control). `marca.nombre` es lo que lee la gente del
// taller en su propia app. Si fueran el mismo campo, desplegar esto habría cambiado el
// encabezado de la app de "Taller ERP" a "Taller principal" sin que nadie lo pidiera. Vacío
// significa "la app usa su nombre de siempre", así que esto no cambia nada hasta que alguien
// lo escriba.
//
// --- Por qué el logo se guarda como data URI y no en el bucket ---
//
// Los archivos de R2 todavía no están separados por taller (etapa 5), así que un logo por
// cliente en el bucket compartido es justo lo que esa etapa viene a ordenar. Y el destino
// del logo es `jsPDF.addImage`, que solo acepta un data URI: guardarlo ya en esa forma
// evita que el navegador tenga que ir a buscarlo y convertirlo antes de armar cada
// cotización. El precio es el tope de abajo, que es lo que impide que esto crezca sin
// control dentro de un documento de Mongo.

// Tope del texto guardado, no del archivo original: el panel reduce la imagen antes de
// mandarla (ver panel.html). 150 KB de data URI son ~110 KB de imagen, de sobra para un logo
// de 600px — y el tope existe porque la ficha del taller viaja en cada respuesta del panel y
// la marca viaja en cada arranque del SPA.
const LARGO_MAXIMO_LOGO = 150 * 1024;

// PNG y JPEG, los dos que jsPDF inserta sin plugins adicionales. WEBP y AVIF quedan afuera a
// propósito: el navegador los muestra, así que el logo se vería bien en el panel y en la app
// y recién fallaría al generar la cotización — el peor momento para enterarse.
const TIPOS_ACEPTADOS = ['image/png', 'image/jpeg'];

const PREFIJO = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

// Devuelve el data URI limpio, o lanza con el motivo. Cadena vacía = quitar el logo, que es
// una operación legítima y no un error (principio de vuelta atrás: poner un logo se deshace).
function normalizarLogo(valor) {
    const texto = String(valor ?? '').trim();
    if (!texto) return '';

    const partes = PREFIJO.exec(texto);
    if (!partes) {
        throw new Error('El logo tiene que venir como data URI base64 de una imagen (data:image/png;base64,…).');
    }
    const [, tipo] = partes;
    if (!TIPOS_ACEPTADOS.includes(tipo)) {
        throw new Error(`Formato no soportado: ${tipo}. Tiene que ser PNG o JPEG, los que entiende el generador de la cotización.`);
    }
    if (texto.length > LARGO_MAXIMO_LOGO) {
        throw new Error(`El logo pesa demasiado (${Math.round(texto.length / 1024)} KB, el tope son ${Math.round(LARGO_MAXIMO_LOGO / 1024)} KB).`);
    }
    return texto;
}

// Lo que sale por la API y lo que recuerda el registro en memoria. Siempre las dos claves,
// nunca `undefined`: así quien la consume no tiene que preguntar si el objeto existe.
function marcaPublica(marca) {
    return {
        nombre: String(marca?.nombre || '').trim(),
        logo: String(marca?.logo || ''),
    };
}

module.exports = { normalizarLogo, marcaPublica, LARGO_MAXIMO_LOGO, TIPOS_ACEPTADOS };
