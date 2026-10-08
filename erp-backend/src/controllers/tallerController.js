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
const { conexionDeControl, refrescarRegistro, hayBaseDeControl } = require('../config/conexiones');
const { esSlugValido, TALLER_PRINCIPAL } = require('../config/talleres');
const { comparaSegura } = require('../utils/claveCompartida');
const getTaller = require('../models/Taller');

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
        // Que la instancia que lo creó lo sepa de inmediato, sin esperar el refresco.
        await refrescarRegistro();
        res.ok({ taller: publico(creado) }, 201);
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

// Para las pruebas y para quien lea esto buscando qué se expone.
exports.publico = publico;
exports.TALLER_PRINCIPAL = TALLER_PRINCIPAL;
