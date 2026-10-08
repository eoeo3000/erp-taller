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
const { conexionDeControl, refrescarRegistro, hayBaseDeControl, obtenerConexion } = require('../config/conexiones');
const { esSlugValido, TALLER_PRINCIPAL } = require('../config/talleres');
const { comparaSegura } = require('../utils/claveCompartida');
const { generarToken, hashToken } = require('../utils/tokens');
const { SPA_URL } = require('../config/urls');
const getTaller = require('../models/Taller');
const getUsuario = require('../models/Usuario');
const { hayCuentasDeEscritorio } = require('./instalacionController');

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
        const slug = String(req.body?.slug || '').trim().toLowerCase();
        const nombre = String(req.body?.nombre || '').trim();
        const mongoUri = String(req.body?.mongoUri || '').trim();

        if (!esSlugValido(slug)) {
            return res.fail(400, 'El identificador tiene que ser de 2 a 40 caracteres: minúsculas, números y guiones. Sin puntos: el punto separa el prefijo del token de sesión.');
        }
        if (!nombre) return res.fail(400, 'Falta el nombre del taller');
        if (!mongoUri) return res.fail(400, 'Falta la base de datos del taller (mongoUri)');

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
