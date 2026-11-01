// Usuarios de la PWA Operativa (supervisor/ejecutor) — ver docs/estrategia-movil.md §7.1
// y docs/rediseno/design_handoff_pwa_movil/README.md §7.
// El entorno de estas rutas viaja por header o por ?entorno= en la query (resolverEntorno,
// ver CORRECCIONES.md punto 7) — las PWA se abren fuera de la SPA y nunca envían el header.
const crypto = require('crypto');
const getUsuario = require('../models/Usuario');
const getRecurso = require('../models/Recurso');
const transporter = require('../config/mailer');
const { PWA_OPERATIVA_URL } = require('../config/urls');
const { resolverUsuarioPorToken } = require('../middlewares/identidad');
const { conPrefijo, tokenMovilDeLaRequest } = require('../utils/tokens');
const { tallerPorDefecto } = require('../config/talleres');

function generarToken() {
    return crypto.randomBytes(20).toString('hex');
}

// El link apunta a PWA_OPERATIVA_URL (su propio host, ver config/urls.js) — NO a este
// backend. Antes usaba `${API_URL}/operativo`, un bug real: la PWA Operativa es un Render
// Static Site aparte, ese path nunca existió en el backend (ver base:'/' en su vite.config).
// El token en claro nunca se vuelve a mostrar después de esta respuesta (listar() lo oculta
// con select('-token')) — devolver el link acá es la ÚNICA oportunidad de entregarlo si no
// hay correo para mandarlo solo. Sin esto, un Recurso sin correo quedaba con un token creado
// pero irrecuperable: nadie podía compartírselo por ningún otro medio.
// El token sale con el prefijo de su taller delante (`rivas.a3f9…`). El prefijo es RUTEO,
// no parte del secreto: le dice al backend en qué base buscar a esta persona antes de poder
// buscarla, igual que en el token de sesión del escritorio. Sin él, el acceso de alguien de
// un taller que no es el principal se buscaría en la base del principal y esa persona no
// podría entrar nunca (etapa 4 de docs/multi-taller.md).
//
// En la base se guarda el token PELADO; el prefijo se agrega acá, al entregarlo.
function armarLink(usuario, entorno) {
    const taller = usuario.tallerId || tallerPorDefecto();
    return `${PWA_OPERATIVA_URL}/?token=${conPrefijo(taller, usuario.token)}&entorno=${entorno}`;
}

async function enviarCorreoToken(usuario, recurso, link) {
    if (!recurso?.email) return false; // sin Recurso o sin correo, no hay a quién avisar
    await transporter.sendMail({
        from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
        to: recurso.email,
        subject: `Tu acceso a ${usuario.nombre} quedó listo`,
        text: `Hola ${usuario.nombre},\n\n`
            + `Este es tu acceso a la app de trabajo. El link es tu acceso permanente: no caduca al terminar un trabajo y no necesitas clave.\n\n`
            + `${link}\n\n`
            + `Si pierdes el teléfono, avisa a la oficina para que revoquen este acceso.`,
    });
    return true;
}

// POST /api/usuarios — crear usuario y emitir su primer token
exports.crear = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Recurso = getRecurso(req.db);
    try {
        const { nombre, puesto, rol, recursoId } = req.body;
        if (!nombre || !rol) return res.status(400).json({ error: 'nombre y rol son requeridos' });
        if (!['supervisor', 'ejecutor'].includes(rol)) return res.status(400).json({ error: "rol debe ser 'supervisor' o 'ejecutor'" });

        const recurso = recursoId ? await Recurso.findById(recursoId) : null;
        // Sin correo NI teléfono no hay forma de hacerle llegar el link a la persona (ver
        // armarLink más arriba) — pedido explícito del usuario: uno de los dos es obligatorio.
        if (recursoId && !recurso?.email && !recurso?.telefono) {
            return res.status(400).json({ error: 'Este integrante no tiene correo ni teléfono registrado en Recursos — agrega al menos uno antes de emitir el acceso.' });
        }

        const usuario = await Usuario.create({
            nombre, puesto: puesto || '', rol,
            recursoId: recursoId || undefined,
            token: generarToken(),
            // De qué taller es esta persona. Faltaba: las cuentas de oficina ya lo
            // guardaban (cuentasController, instalacionController) y las de la PWA no, así
            // que un acceso de terreno emitido en un taller nuevo quedaba sin dueño y la
            // comprobación de pertenencia lo habría dado por del taller por defecto.
            tallerId: req.taller || tallerPorDefecto(),
        });

        if (recursoId) await Recurso.findByIdAndUpdate(recursoId, { usuarioId: usuario._id });

        const link = armarLink(usuario, req.entorno);
        let correoEnviado = false;
        try {
            correoEnviado = await enviarCorreoToken(usuario, recurso, link);
        } catch (eCorreo) {
            console.warn('[usuarios] no se pudo enviar el correo de acceso:', eCorreo.message);
        }

        res.status(201).json({ ...usuario.toObject(), link, correoEnviado, telefono: recurso?.telefono || '' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// GET /api/usuarios/whoami?token=&entorno= — la propia PWA Operativa, para la ficha de O1
exports.whoami = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        // Por la definición única (middlewares/identidad.js) y no por un `findOne` propio:
        // ahí viven el descarte del token vacío —sin él, `{ token: null }` hace match con
        // las cuentas de oficina, que no tienen el campo—, el prefijo del taller y la
        // comprobación de que la persona pertenezca al taller cuya base se abrió.
        const usuario = await resolverUsuarioPorToken(Usuario, tokenMovilDeLaRequest(req), req.taller);
        if (!usuario) return res.status(403).json({ error: 'Token inválido o revocado' });
        // recursoId viaja para que el informe de evaluación pueda registrar a QUIÉN se le
        // atribuye el levantamiento por id y no solo por nombre — así el escritorio puede
        // comparar contra OT.supervisorId sin depender de que los nombres de Usuario y Recurso
        // estén escritos igual (ver O5_InformeEvaluacion / pestaña Informe inicial).
        res.json({ nombre: usuario.nombre, puesto: usuario.puesto, rol: usuario.rol, recursoId: usuario.recursoId || null, fechaEmision: usuario.fechaEmision });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/usuarios — listado para el planificador (vía SPA)
// Los accesos de TERRENO, que es lo que administra esta pantalla (Bodega de tokens).
//
// Antes era un `find()` pelado, o sea **todos** los `Usuario` — y como `Usuario` es la única
// tabla de personas, ahí salían listadas también las cuentas de oficina, cada una con su
// botón «Eliminar» apuntando a `DELETE /api/usuarios/:id`. Ese fue el camino por el que un
// taller borró todas sus cuentas y quedó afuera de su propia app.
//
// El filtro es «no tiene correo» y no «tiene token», a propósito: una cuenta de oficina se
// define por su correo (es con lo que entra), mientras que una persona de terreno podría
// quedar sin token por un momento —entre revocar y reemitir— y desaparecer de la lista
// justo cuando hay que arreglarla. En Mongo `{ email: null }` también hace match con los
// documentos que NO tienen el campo, que es el caso de todas las de terreno.
// Las cuentas de oficina se administran en su propia pestaña, contra /api/cuentas.
exports.listar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuarios = await Usuario.find({ email: { $in: [null, ''] } })
            .select('-token').sort({ createdAt: -1 });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/usuarios/:id/reemitir-token — invalida el token anterior y reenvía el correo
exports.reemitirToken = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Recurso = getRecurso(req.db);
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        const recurso = usuario.recursoId ? await Recurso.findById(usuario.recursoId) : null;
        if (usuario.recursoId && !recurso?.email && !recurso?.telefono) {
            return res.status(400).json({ error: 'Este integrante no tiene correo ni teléfono registrado en Recursos — agrega al menos uno antes de reemitir el acceso.' });
        }

        usuario.token = generarToken();
        usuario.fechaEmision = new Date();
        usuario.estado = 'activo';
        await usuario.save();

        const link = armarLink(usuario, req.entorno);
        let correoEnviado = false;
        try {
            correoEnviado = await enviarCorreoToken(usuario, recurso, link);
        } catch (eCorreo) {
            console.warn('[usuarios] no se pudo enviar el correo de reemisión:', eCorreo.message);
        }

        res.json({ mensaje: 'Token reemitido', usuario, link, correoEnviado, telefono: recurso?.telefono || '' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/usuarios/:id/revocar — el token deja de servir de inmediato
exports.revocar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuario = await Usuario.findByIdAndUpdate(req.params.id, { estado: 'revocado' }, { new: true });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ mensaje: 'Acceso revocado', usuario });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/usuarios/:id/reactivar — vuelve a habilitar con el MISMO token (no lo cambia;
// para eso está reemitir-token). Cubre "un revocado ofrece Reactivar" en Tokens activos.
exports.reactivar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    try {
        const usuario = await Usuario.findByIdAndUpdate(req.params.id, { estado: 'activo' }, { new: true }).select('-token');
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ mensaje: 'Acceso reactivado', usuario });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// DELETE /api/usuarios/:id — borra el registro entero (Bodega de tokens, botón "Eliminar").
// A diferencia de revocar (invalida el token pero conserva el registro para auditoría), esto
// lo saca por completo de la tabla — pensado para limpiar pruebas/duplicados, no como
// reemplazo de revocar en el uso normal. Limpia Recurso.usuarioId para no dejar una
// referencia colgando (mismo criterio que la limpieza en cascada al eliminar una OT).
//
// También limpia las Asignacion de este usuarioId — si no, un supervisor con un informe
// inicial tomado y sin enviar quedaba con esa Asignacion huérfana: un token nuevo (con un
// _id distinto) nunca la vuelve a ver como propia, y la solicitud tampoco reaparece en la
// bandeja compartida "Sin informe inicial" (esa vista excluye cualquier solicitud que ya
// tenga una Asignacion, sin fijarse si el usuarioId sigue existiendo). Borrar la Asignacion
// no pierde el trabajo ya cargado: los hallazgos viven en OT.informeEvaluacion, no en la
// Asignacion — esto solo libera la "reserva" de vuelta al pool compartido. Mismo criterio
// que otController.eliminarOT limpiando Asignacion al borrar una OT.
// Borrar el registro de una persona. **Irreversible**, al revés que revocar.
//
// Esto no tenía ninguna guarda y costó caro: desde la pestaña «Cuentas de oficina» de Bodega
// de tokens se borraron todas las cuentas de un taller en producción. Consecuencias, las
// tres en el mismo clic:
//
//   1. Como `Usuario` es la única tabla de personas, el borrado no distinguía una cuenta de
//      oficina (correo + clave) de un token de terreno.
//   2. Al irse la última cuenta con clave, `GET /auth/yo` volvió a responder
//      `requiereInstalacion`: el taller quedó afuera de su propia app y con la ventana de
//      instalación reabierta. Es exactamente el escenario por el que el panel no ofrece
//      borrar (ver servicios/cuentasDeTaller.js).
//   3. Se borraban en cascada las `Asignacion` de esa persona — o sea el registro de qué
//      trabajo había hecho, que no estaba en ninguna otra parte.
//
// Las tres guardas de abajo cortan antes de tocar nada. Ninguna tiene «forzar»: para todos
// esos casos la respuesta correcta es **revocar**, que deja a la persona sin entrar, se
// deshace con reactivar y conserva su historial.
exports.eliminar = async (req, res) => {
    const Usuario = getUsuario(req.db);
    const Recurso = getRecurso(req.db);
    const Asignacion = require('../models/Asignacion')(req.db);
    try {
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        // 1. Una cuenta de oficina no se borra desde acá, y en realidad no se borra desde
        //    ningún lado. Esta pantalla administra los accesos de terreno; que las dos cosas
        //    vivan en la misma tabla es un detalle de implementación que no puede traducirse
        //    en que un botón de una sirva para destruir la otra.
        if (usuario.email) {
            return res.status(409).json({
                error: 'Esa es una cuenta de oficina (entra con correo y clave), no un acceso de terreno.'
                    + ' Para quitarle el acceso usa Revocar en «Cuentas de oficina»: se deshace y conserva su historial.',
            });
        }

        // 2. Si tiene trabajo registrado, borrarla se lleva ese trabajo. El número va en el
        //    mensaje: «tiene asignaciones» no deja decidir, «tiene 34» sí.
        const asignaciones = await Asignacion.countDocuments({ usuarioId: usuario._id });
        if (asignaciones > 0) {
            return res.status(409).json({
                error: `${usuario.nombre || 'Esa persona'} tiene ${asignaciones} asignación(es) de trabajo registradas.`
                    + ' Borrarla se las lleva también, y eso no se deshace. Usa Revocar: le quita el acceso al instante'
                    + ' y el historial queda.',
            });
        }

        await Usuario.deleteOne({ _id: usuario._id });
        if (usuario.recursoId) await Recurso.updateOne({ _id: usuario.recursoId }, { usuarioId: null });
        // Ya no hay `deleteMany` de asignaciones: con la guarda de arriba, acá no queda
        // ninguna que borrar. Dejar la línea sería conservar el borrado en cascada esperando
        // a que alguien saque la guarda.
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Para las pruebas: acá vive la regla de que el acceso de terreno sale con el prefijo de su
// taller. Sin él, el teléfono manda un token que el backend no sabe en qué base buscar.
exports.armarLink = armarLink;
