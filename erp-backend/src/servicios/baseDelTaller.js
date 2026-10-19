// De dónde sale la base de datos de un taller nuevo.
//
// El backend ya conoce su propia cadena de conexión, así que no hay ninguna razón para que
// quien da de alta un cliente tenga que pegar otra: se deriva de `MONGO_URI` cambiándole el
// nombre de la base. Eso elimina el paso más peligroso del alta —copiar y pegar una cadena a
// mano, donde un error deja a dos clientes compartiendo datos— y de paso el único que
// obligaba a salir del panel.
//
// Se puede seguir pasando una `mongoUri` explícita: es el caso de §9.1, mover a un cliente
// que creció a su propio clúster. La derivación es la comodidad, no la única vía.
const { esSlugValido } = require('../config/talleres');

// Nombres de base que Mongo no acepta, más los que acá significan otra cosa.
const PROHIBIDOS = /[\/\\. "$*<>:|?]/;
const LARGO_MAXIMO = 63;

// `new URL()` no sirve para todas: una cadena `mongodb://a:27017,b:27017/base` con varios
// hosts —un replica set escrito a mano— no parsea. Por eso se corta a mano, que además deja
// la cadena intacta salvo el tramo que se quiere cambiar.
//
// La base va entre el final de la autoridad (lo que sigue al `@`, o al `//` si no hay
// credenciales) y el `?` de los parámetros. Los parámetros se conservan enteros: ahí viven
// `retryWrites`, `w=majority` y `appName`, y perderlos cambiaría cómo se conecta.
function conOtraBase(cadena, nombreBase) {
    const original = String(cadena || '').trim();
    if (!original) throw new Error('No hay MONGO_URI en el servidor: no se puede derivar la base de un taller nuevo.');

    const corteQuery = original.indexOf('?');
    const cuerpo = corteQuery === -1 ? original : original.slice(0, corteQuery);
    const query = corteQuery === -1 ? '' : original.slice(corteQuery);

    const arroba = cuerpo.indexOf('@');
    const dobleBarra = cuerpo.indexOf('//');
    const inicioAutoridad = arroba !== -1 ? arroba + 1 : (dobleBarra !== -1 ? dobleBarra + 2 : 0);
    const corteBase = cuerpo.indexOf('/', inicioAutoridad);
    const hasta = corteBase === -1 ? cuerpo : cuerpo.slice(0, corteBase);

    return `${hasta}/${nombreBase}${query}`;
}

function nombreDeBaseValido(nombre) {
    const limpio = String(nombre || '').trim();
    if (!limpio || limpio.length > LARGO_MAXIMO) return false;
    return !PROHIBIDOS.test(limpio);
}

// El identificador a partir del nombre que escribió quien da de alta: "Taller López" →
// "taller-lopez". Los acentos se reducen a su letra base en vez de borrarse, porque borrarlos
// convertiría "Montaña" en "montaa".
function slugDesdeNombre(nombre) {
    return String(nombre || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .replace(/-+$/, '');
}

// La cadena de conexión para un taller nuevo, derivada de la del servidor.
function uriParaTaller(slug, uriDelServidor = process.env.MONGO_URI) {
    if (!esSlugValido(slug)) throw new Error(`Identificador inválido: "${slug}"`);
    if (!nombreDeBaseValido(slug)) throw new Error(`"${slug}" no sirve como nombre de base de datos`);
    return conOtraBase(uriDelServidor, slug);
}

module.exports = { uriParaTaller, conOtraBase, slugDesdeNombre, nombreDeBaseValido };
