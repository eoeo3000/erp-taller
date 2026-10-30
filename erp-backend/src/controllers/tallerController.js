// El registro de talleres: el panel de quien arrienda el sistema, no el de un taller.
//
// Etapa 2 de docs/multi-taller.md. Acá se anota un cliente nuevo, se lo suspende y se lo
// reactiva. **Crear la base de ese cliente y su primera cuenta es la etapa 3** (la pantalla
// de instalación); esto solo lo registra.
//
// Control de acceso: `PANEL_TOKEN`, y SIN ella la ruta responde 503. Mismo criterio que
// /api/respaldos y por el mismo motivo: estas rutas nacen hoy, así que dejarlas abiertas por
// omisión no conservaría un estado anterior, regalaría la lista de todos los clientes y la
// capacidad de suspenderlos. No usa `requiereSesion` porque no la llama una persona con
// sesión en el SPA de un taller: la llama quien administra el producto.
const { conexionDeControl, refrescarRegistro, hayBaseDeControl, obtenerConexion, conexionDisponible } = require('../config/conexiones');
const { esSlugValido, TALLER_PRINCIPAL } = require('../config/talleres');
const { comparaSegura } = require('../utils/claveCompartida');
const { generarToken, hashToken } = require('../utils/tokens');
const { SPA_URL } = require('../config/urls');
const getTaller = require('../models/Taller');
const getUsuario = require('../models/Usuario');
const { metricasDeTaller, almacenamientoDeTaller, tamanoDeBase, diasSinUsar } = require('../servicios/metricasTaller');
const { uso, topeDeBases, topeDeArchivos, AL_PASAR_BASE, AL_PASAR_ARCHIVOS } = require('../servicios/limites');
const almacenamiento = require('../config/almacenamiento');
const { uriParaTaller, slugDesdeNombre } = require('../servicios/baseDelTaller');
const { normalizarLogo, marcaPublica } = require('../servicios/marcaTaller');
const { hayCuentasDeEscritorio } = require('./instalacionController');
const { listarCuentas } = require('../servicios/buscarCuenta');

// Cuánto vive el enlace de instalación. Siete días y no una hora: el alta de un cliente no es
// un trámite de un rato — se le manda el link al dueño del taller y puede sentarse a hacerlo
// el lunes. Que venza igual es lo que impide que un link viejo, reenviado o archivado, siga
// sirviendo meses después.
const DIAS_VALIDEZ_INSTALACION = 7;

// Emite un enlace nuevo y PISA el anterior: el viejo deja de servir en el acto. Es el mismo
// criterio que reemitir la invitación de una cuenta de oficina al corregirle el correo —
// emitir otro sin matar el anterior sería dejar dos llaves dando vueltas.
//
// Devuelve el token EN CLARO una sola vez. En la base queda solo su hash, así que si se
// pierde no se recupera: se reemite.
async function emitirInstalacion(taller) {
    const token = generarToken();
    taller.instalacionHash = hashToken(token);
    taller.instalacionExpira = new Date(Date.now() + DIAS_VALIDEZ_INSTALACION * 24 * 60 * 60 * 1000);
    await taller.save();
    return {
        url: `${SPA_URL}/instalar?taller=${encodeURIComponent(taller.slug)}&clave=${token}`,
        expira: taller.instalacionExpira,
    };
}

function autorizar(req, res) {
    if (!hayBaseDeControl()) {
        res.fail(503, 'No hay base de control configurada: falta MONGO_URI_CONTROL en el servidor.');
        return false;
    }
    if (!String(process.env.PANEL_TOKEN || '').trim()) {
        res.fail(503, 'El registro de talleres no está configurado: falta PANEL_TOKEN en el servidor.');
        return false;
    }
    if (!comparaSegura(process.env.PANEL_TOKEN, req.get('X-Panel-Token'))) {
        res.fail(401, 'Clave de panel incorrecta');
        return false;
    }
    return true;
}

// Lo que sale por la API. **`mongoUri` nunca**: lleva usuario y clave de Mongo, y quien mira
// el panel no necesita verla para nada. Esta función es el único lugar que arma la respuesta,
// así que agregar un campo al modelo no lo expone por accidente.
function publico(t) {
    return {
        slug: t.slug,
        nombre: t.nombre,
        estado: t.estado,
        plan: t.plan || '',
        fechaAlta: t.fechaAlta,
        fechaBaja: t.fechaBaja || null,
        // El nombre que muestra su app y su logo. No es un secreto —se los ve cualquiera que
        // abra la app de ese taller— y el panel los necesita enteros para mostrar lo que hay
        // hoy antes de cambiarlo. El logo va capado en servicios/marcaTaller.js: sin ese tope
        // esta respuesta crecería un archivo por cliente.
        marca: marcaPublica(t.marca),
    };
}

// GET /api/talleres
exports.listar = async (req, res) => {
    if (!autorizar(req, res)) return;
    try {
        const Taller = getTaller(conexionDeControl());
        const filas = await Taller.find().sort({ fechaAlta: 1 }).lean();
        res.ok({ talleres: filas.map(publico) });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// POST /api/talleres — { slug, nombre, mongoUri, plan? }
exports.crear = async (req, res) => {
    if (!autorizar(req, res)) return;
    try {
        const nombre = String(req.body?.nombre || '').trim();
        if (!nombre) return res.fail(400, 'Falta el nombre del taller');

        // El identificador se deriva del nombre si no lo mandan. Así dar de alta un cliente
        // es escribir "Taller López" y nada más.
        const slug = String(req.body?.slug || slugDesdeNombre(nombre)).trim().toLowerCase();
        if (!esSlugValido(slug)) {
            return res.fail(400, 'El identificador tiene que ser de 2 a 40 caracteres: minúsculas, números y guiones. Sin puntos: el punto separa el prefijo del token de sesión.');
        }

        // Y la base se deriva de la del propio servidor, cambiándole el nombre. Pegar una
        // cadena de conexión a mano era el paso más peligroso del alta: un error de copiado
        // deja a dos clientes compartiendo datos. Se puede mandar una explícita igual — es el
        // caso de mover a un cliente que creció a su propio clúster (§9.1).
        let mongoUri;
        try {
            mongoUri = String(req.body?.mongoUri || '').trim() || uriParaTaller(slug);
        } catch (error) {
            return res.fail(400, error.message);
        }

        const Taller = getTaller(conexionDeControl());
        if (await Taller.findOne({ slug })) return res.fail(409, `Ya existe un taller con el identificador "${slug}"`);

        // Dos talleres apuntando a la misma base es la forma más directa de que un cliente
        // vea los datos de otro — justo lo que toda esta arquitectura existe para impedir.
        // Se comprueba acá porque un error de copiar y pegar al dar de alta es exactamente
        // como pasaría.
        if (await Taller.findOne({ mongoUri })) {
            return res.fail(409, 'Esa base de datos ya es de otro taller. Dos talleres en la misma base se verían los datos entre ellos.');
        }
        if (mongoUri === String(process.env.MONGO_URI_CONTROL || '').trim()) {
            return res.fail(409, 'Esa es la base de control, no puede ser además la de un taller.');
        }

        const creado = await Taller.create({ slug, nombre, mongoUri, plan: String(req.body?.plan || '').trim() });
        // Que la instancia que lo creó lo sepa de inmediato, sin esperar el refresco — y
        // ANTES de emitir el enlace, porque instalar necesita poder abrir esa base.
        await refrescarRegistro();
        const instalacion = await emitirInstalacion(creado);
        // El enlace viaja UNA vez, acá. Después solo queda su hash: si se pierde, se reemite.
        res.ok({ taller: publico(creado), instalacion }, 201);
    } catch (error) {
        res.fail(500, error.message);
    }
};

// PATCH /api/talleres/:slug — { estado?, nombre?, plan? }
//
// Suspender y reactivar son la misma puerta en los dos sentidos (principio de vuelta atrás):
// suspender corta el acceso al instante y reactivar lo devuelve, sin que se pierda nada en
// el camino. 'baja' además sella la fecha, que es la que va a contar los plazos de §9.4.
exports.actualizar = async (req, res) => {
    if (!autorizar(req, res)) return;
    try {
        const slug = String(req.params.slug || '').trim().toLowerCase();
        const Taller = getTaller(conexionDeControl());
        const taller = await Taller.findOne({ slug });
        if (!taller) return res.fail(404, `No existe el taller "${slug}"`);

        if (req.body?.nombre !== undefined) {
            const nombre = String(req.body.nombre).trim();
            if (!nombre) return res.fail(400, 'El nombre no puede quedar vacío');
            taller.nombre = nombre;
        }
        if (req.body?.plan !== undefined) taller.plan = String(req.body.plan).trim();

        // La marca se manda entera o por partes: `{ marca: { nombre } }` cambia el nombre y
        // deja el logo como está. Es lo que permite que el panel tenga dos controles
        // separados sin que uno pise lo del otro.
        if (req.body?.marca !== undefined) {
            const marca = req.body.marca || {};
            // `taller.marca` puede no existir en una ficha anterior a este campo.
            if (!taller.marca) taller.marca = {};
            if (marca.nombre !== undefined) taller.marca.nombre = String(marca.nombre).trim();
            if (marca.logo !== undefined) {
                // Cadena vacía quita el logo: poner uno se tiene que poder deshacer, igual
                // que todo lo demás (docs/principio-vuelta-atras.md). El motivo del rechazo
                // se devuelve tal cual porque es lo único que explica qué archivo sirve.
                try {
                    taller.marca.logo = normalizarLogo(marca.logo);
                } catch (error) {
                    return res.fail(400, error.message);
                }
            }
        }

        if (req.body?.estado !== undefined) {
            const estado = String(req.body.estado).trim();
            if (!['activo', 'suspendido', 'baja'].includes(estado)) {
                return res.fail(400, 'Estado inválido: activo, suspendido o baja');
            }
            // Mismo principio que "nadie puede revocarse a sí mismo" en las cuentas de
            // oficina: dejar el sistema sin ningún taller activo no deja a nadie entrar a
            // arreglarlo, ni siquiera por esta misma ruta.
            if (estado !== 'activo' && taller.estado === 'activo') {
                const otrosActivos = await Taller.countDocuments({ estado: 'activo', slug: { $ne: slug } });
                if (otrosActivos === 0) {
                    return res.fail(409, 'Es el único taller activo: suspenderlo dejaría el sistema sin nadie que pueda entrar.');
                }
            }
            taller.estado = estado;
            // La fecha se sella al pasar a baja y se borra al volver: si quedara escrita, una
            // baja deshecha seguiría contando sus plazos de borrado por detrás.
            taller.fechaBaja = estado === 'baja' ? new Date() : null;
        }

        await taller.save();
        await refrescarRegistro();
        res.ok({ taller: publico(taller) });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// GET /api/talleres/metricas — lo que alimenta el panel.
//
// Va aparte de `listar` y no mezclado con él: listar lee una sola colección de la base de
// control y es instantáneo, mientras esto abre la base de CADA taller y cuenta. Con diez
// clientes son diez idas a Mongo, y acá una sola tarda 600-800ms. Mezclarlas habría hecho
// lento el listado para siempre por una pantalla que se mira de vez en cuando.
//
// Los talleres se consultan en paralelo y cada uno con su propio tope de espera: una base
// caída tiene que salir marcada en la lista, no colgar la lista entera. Enterarse de eso es
// justamente para lo que existe el panel.
exports.metricas = async (req, res) => {
    if (!autorizar(req, res)) return;
    try {
        const Taller = getTaller(conexionDeControl());
        const talleres = await Taller.find().sort({ fechaAlta: 1 }).lean();

        const filas = await Promise.all(talleres.map(async (t) => {
            const base = publico(t);
            // Un taller suspendido o de baja no obtiene conexión —el corte vive en el
            // registro— así que ni se intenta: no es que su base esté caída.
            if (t.estado !== 'activo') {
                return { ...base, medible: false, motivo: `Está ${t.estado}`, baseResponde: null };
            }
            // Las dos mediciones son independientes y van en paralelo: la base de un
            // taller puede estar caída con su bucket intacto, y al revés. Que una falle no
            // puede borrar el dato de la otra — de hecho, los archivos y el último respaldo
            // de un cliente cuya base no responde son justo lo que se quiere mirar en ese
            // momento.
            const [datos, almacen] = await Promise.all([
                (async () => metricasDeTaller(obtenerConexion('produccion', t.slug)))()
                    .catch((error) => ({ medible: false, motivo: error.message, baseResponde: false })),
                almacenamientoDeTaller(t.slug, 'produccion'),
            ]);
            return {
                medible: true,
                ...base,
                ...datos,
                diasSinUsar: diasSinUsar(datos.ultimaActividad),
                archivos: almacen.archivos,
                respaldo: almacen.respaldo,
                errorAlmacen: almacen.error,
            };
        }));

        // Los archivos que quedaron en la raíz del bucket, del formato anterior a la etapa
        // 5. Mientras existan, la cuenta de archivos de cada taller está incompleta — y un
        // número incompleto que se ve completo es peor que ninguno, así que el panel lo
        // dice. Se van con scripts/migrarArchivosPorTaller.js.
        let sinSeparar = { cantidad: 0, bytes: 0, error: null };
        try {
            const sueltos = await almacenamiento.listarSueltos();
            sinSeparar.cantidad = sueltos.length;
            sinSeparar.bytes = sueltos.reduce((a, r) => a + (r.tamano || 0), 0);
        } catch (error) {
            sinSeparar.error = error.message;
        }

        res.ok({
            talleres: filas,
            // El host del SPA lo sabe el servidor, no la página: el panel arma con esto el
            // link de acceso de cada cliente sin tener que repetirlo escrito a mano, que es
            // como se desactualiza el día que cambie.
            spaUrl: SPA_URL,
            sinSeparar,
            totales: await totalesDeUso(filas, sinSeparar),
        });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// El uso de TODO contra los techos del plan contratado, que es lo que no se puede deducir
// mirando fila por fila: los límites de Atlas y de R2 son del clúster y del bucket
// enteros, no de cada cliente. Un taller en verde no dice nada si entre todos ya se llenó.
//
// Mide y no corta — ver servicios/limites.js, donde está escrito por qué.
async function totalesDeUso(filas, sinSeparar) {
    const bytesTalleres = filas.reduce((a, f) => a + (f.bytesBase || 0), 0);
    const archivosTalleres = filas.reduce((a, f) => a + (f.archivos?.bytes || 0), 0);

    // La base de control y la demo también viven en el clúster y también ocupan. Dejarlas
    // afuera daría un total que se ve bien y no lo es.
    const otrasBases = { control: null, demo: null, error: null };
    try {
        const control = conexionDeControl();
        if (control) otrasBases.control = await tamanoDeBase(control);
    } catch (error) { otrasBases.error = error.message; }
    try {
        if (conexionDisponible('demo')) otrasBases.demo = await tamanoDeBase(obtenerConexion('demo'));
    } catch (error) { otrasBases.error = otrasBases.error || error.message; }

    // Lo mismo del lado del bucket: los respaldos y los archivos de la demo ocupan igual.
    const otrosArchivos = { respaldos: null, demo: null, error: null };
    try {
        otrosArchivos.respaldos = (await almacenamiento.medir('respaldos')).bytes;
        otrosArchivos.demo = (await almacenamiento.medir(almacenamiento.CARPETA_DEMO)).bytes;
    } catch (error) { otrosArchivos.error = error.message; }

    const bases = bytesTalleres + (otrasBases.control || 0) + (otrasBases.demo || 0);
    const archivos = archivosTalleres + (sinSeparar.bytes || 0)
        + (otrosArchivos.respaldos || 0) + (otrosArchivos.demo || 0);

    return {
        bases: { ...uso(bases, topeDeBases(), AL_PASAR_BASE), talleres: bytesTalleres, ...otrasBases },
        archivos: { ...uso(archivos, topeDeArchivos(), AL_PASAR_ARCHIVOS), talleres: archivosTalleres, sinSeparar: sinSeparar.bytes || 0, ...otrosArchivos },
    };
}

// GET /api/talleres/cuentas?texto=&taller= — quiénes pueden entrar, y a qué taller.
//
// Existe por una pregunta de soporte que no se podía contestar sin entrar a la Shell del
// servidor: «¿esta persona tiene cuenta, y en cuál de mis clientes?». El log de la
// recuperación dice en qué taller buscó, pero no puede decir dónde SÍ está — y las dos
// salidas son distintas: invitarla, o mandarle el enlace `?taller=` de su taller.
//
// --- Dónde está el límite, y por qué este lado de la raya ---
//
// Quien administra NO puede entrar a mirar los datos de un cliente: sus OT, sus precios, sus
// solicitudes. Eso es una propiedad del diseño y no cambia acá. Lo que esto muestra es quién
// puede entrar, que es infraestructura —la misma que ya se ve en la Shell con las
// credenciales del servidor en la mano— y lo que hace falta para sostener a un cliente.
//
// Igual **ensancha lo que vale `PANEL_TOKEN`**: antes, perderla exponía nombres de clientes,
// contadores y la marca; ahora expone también la lista de correos de la gente de cada taller,
// que son datos personales de terceros. Esa es la razón de las tres reglas de abajo, y la
// razón por la que esto no se parece en nada a una exportación.
//
//   - Nunca sale `passwordHash`, `token` ni `resetHash`. El `token` de la PWA entra a la app
//     sin clave: publicarlo acá sería regalar accesos para ahorrar un clic.
//   - Solo cuentas CON correo. Un `Usuario` con solo `token` es alguien de terreno, no tiene
//     cuenta de oficina, y meterlo haría que esta lista no signifique nada.
//   - Un taller caído no corta la consulta, pero la respuesta dice cuál falló: contestar
//     «no está» con una base sin revisar manda a invitar una cuenta que ya existe.
exports.cuentas = async (req, res) => {
    if (!autorizar(req, res)) return;
    try {
        const texto = String(req.query?.texto || '').trim();
        const soloTaller = String(req.query?.taller || '').trim().toLowerCase();

        const Taller = getTaller(conexionDeControl());
        const fichas = await Taller.find().sort({ fechaAlta: 1 }).lean();

        const talleres = [];
        const sinBase = [];
        for (const t of fichas) {
            if (soloTaller && t.slug !== soloTaller) continue;
            // Un taller suspendido o de baja no obtiene conexión, y eso se decide en el
            // registro. Se nombra aparte en vez de omitirlo en silencio: una cuenta puede
            // estar justamente ahí, y creer que se revisó todo sería lo peor que podría pasar.
            try {
                talleres.push({ slug: t.slug, conexion: obtenerConexion('produccion', t.slug) });
            } catch (error) {
                sinBase.push({ taller: t.slug, error: error.message });
            }
        }

        const { cuentas, fallidos } = await listarCuentas({ texto, talleres, getUsuario });
        res.ok({ texto, cuentas, fallidos: [...fallidos, ...sinBase], revisados: talleres.map((t) => t.slug) });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// POST /api/talleres/:slug/instalacion — reemitir el enlace de instalación.
//
// Hace falta porque el enlace se muestra una sola vez: si el correo se perdió o se mandó a la
// persona equivocada, esto emite otro y mata el anterior. Lo que NO hace es servir para
// entrar a un taller que ya opera: si ya tiene cuentas de escritorio, la instalación terminó
// y no se vuelve a abrir — esa ventana se cierra sola, sin un interruptor que alguien pueda
// dejar encendido.
exports.reemitirInstalacion = async (req, res) => {
    if (!autorizar(req, res)) return;
    try {
        const slug = String(req.params.slug || '').trim().toLowerCase();
        const Taller = getTaller(conexionDeControl());
        const taller = await Taller.findOne({ slug });
        if (!taller) return res.fail(404, `No existe el taller "${slug}"`);

        if (await hayCuentasDeEscritorio(getUsuario(obtenerConexion('produccion', slug)))) {
            return res.fail(409, `El taller "${slug}" ya está instalado: tiene cuentas que pueden entrar. Para sumar a alguien se invita desde la app.`);
        }

        res.ok({ taller: publico(taller), instalacion: await emitirInstalacion(taller) });
    } catch (error) {
        res.fail(500, error.message);
    }
};

// Para las pruebas y para quien lea esto buscando qué se expone.
exports.publico = publico;
exports.DIAS_VALIDEZ_INSTALACION = DIAS_VALIDEZ_INSTALACION;
exports.TALLER_PRINCIPAL = TALLER_PRINCIPAL;
