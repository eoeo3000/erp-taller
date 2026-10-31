// Las tres acciones sobre una cuenta de oficina: reenviar su invitación, revocarla y
// reactivarla.
//
// Viven acá y no dentro de `cuentasController` porque ahora las llaman DOS lados con
// credenciales distintas:
//
//   - `cuentasController` (`/api/cuentas`), que corre con la sesión de alguien de la oficina
//     y opera sobre la base de SU taller.
//   - `tallerController` (`/api/talleres/:slug/cuentas/...`), el panel, que corre con
//     PANEL_TOKEN y opera sobre la base del taller que se le diga — porque quien arrienda el
//     sistema no tiene cuenta dentro de la app de sus clientes y no puede entrar a ayudarlos.
//
// Duplicarlas habría sido el mismo error que ya costó caro dos veces en este proyecto
// (`fechasDeTrabajo` con tres versiones que se contradecían, `resolverTaller` con una copia
// congelada): la segunda copia no se arregla cuando se arregla la primera.
const { generarToken, hashToken } = require('../utils/tokens');
const { SPA_URL } = require('../config/urls');
const transporter = require('../config/mailer');

const DIAS_VALIDEZ_INVITACION = 7;

// Emite un token de un solo uso y arma el link. Pisa el anterior: una invitación reemitida
// mata la que estaba dando vueltas, que es lo que se quiere cuando se reenvía porque la
// primera se perdió o se mandó al buzón equivocado.
//
// **El taller va en el link** por el mismo motivo que en el de recuperación: quien lo abre
// todavía no tiene sesión, y sin ese dato el SPA manda la activación a la base del taller por
// defecto, donde esta invitación no existe. Es el mismo bug que dejaba a alguien con «el link
// no es válido o ya venció» teniendo un link perfectamente bueno.
async function emitirInvitacion(Usuario, usuario, entorno, taller) {
    const token = generarToken();
    await Usuario.updateOne({ _id: usuario._id }, {
        resetHash: hashToken(token),
        resetExpira: new Date(Date.now() + DIAS_VALIDEZ_INVITACION * 24 * 60 * 60 * 1000),
    });
    return `${SPA_URL}/activar?token=${token}&entorno=${entorno}&taller=${encodeURIComponent(taller)}`;
}

async function enviarCorreoInvitacion(usuario, link, invitadoPor) {
    await transporter.sendMail({
        from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
        to: usuario.email,
        subject: 'Tu acceso al ERP del taller',
        text: `Hola ${usuario.nombre},\n\n`
            + `${invitadoPor} te dio acceso al sistema del taller. Entra a este link para elegir tu clave y activar tu cuenta:\n\n`
            + `${link}\n\n`
            + `El link vence en ${DIAS_VALIDEZ_INVITACION} días. Si vence antes de que alcances a usarlo, pídele a la oficina que te lo reenvíe.\n`
            + `Si no esperabas este correo, ignóralo: sin entrar a ese link la cuenta no queda activa.`,
    });
}

// Reenviar la invitación de una cuenta que todavía no eligió su clave.
//
// Si el correo no sale, se devuelve el link igual en vez de fallar: dejar la cuenta
// inservible porque Brevo no respondió sería peor que entregarlo a mano. Mismo criterio que
// al emitir tokens de la PWA.
async function reenviarInvitacion({ Usuario, id, entorno = 'produccion', taller, invitadoPor = 'La oficina' }) {
    const usuario = await Usuario.findById(id);
    if (!usuario || !usuario.email) return { error: 'Cuenta no encontrada', estado: 404 };
    if (usuario.passwordHash) {
        return {
            error: 'Esa cuenta ya está activa — si perdió la clave, que use "Olvidé mi clave" en la pantalla de ingreso.',
            estado: 409,
        };
    }
    // `POST /auth/restablecer` exige `estado: 'activo'`, así que una invitación a una cuenta
    // revocada saldría con un link que no va a funcionar. El corte va acá y no solo en la
    // pantalla: el panel no es el único que puede llamar a esto.
    if ((usuario.estado || 'activo') === 'revocado') {
        return { error: 'Esa cuenta está revocada: reactívala antes de reenviarle la invitación.', estado: 409 };
    }

    const link = await emitirInvitacion(Usuario, usuario, entorno, taller);
    try {
        await enviarCorreoInvitacion(usuario, link, invitadoPor);
        return { correoEnviado: true, link: '', usuario };
    } catch (eCorreo) {
        console.warn('[cuentas] no se pudo enviar la invitación:', eCorreo.message);
        return { correoEnviado: false, link, usuario };
    }
}

// Cuántas cuentas de este taller pueden entrar HOY: con clave y activas. Es lo que separa
// «revocar a alguien» de «dejar al taller afuera de su propio sistema».
async function cuentasQuePuedenEntrar(Usuario) {
    return Usuario.countDocuments({
        estado: 'activo',
        passwordHash: { $exists: true, $ne: '' },
    });
}

// Revocar: deja de poder entrar en el acto, y se deshace con reactivar (principio de vuelta
// atrás — ver docs/principio-vuelta-atras.md).
//
// **El candado es no dejar al taller sin NINGUNA cuenta que pueda entrar.** Desde la app eso
// se expresaba como «nadie puede revocarse a sí mismo», que alcanzaba porque quien revoca es
// una de esas cuentas. Desde el panel no hay un «sí mismo»: quien aprieta no tiene cuenta en
// esa base, así que podría dejar a un cliente completamente afuera y recuperarlo exigiría
// entrar al servidor a correr scripts/crearAdmin.js. Por eso el candado se generaliza acá:
// en el camino de la app no cambia nada —quien revoca siempre es una cuenta más— y en el del
// panel es lo único que lo hace seguro.
async function revocarCuenta({ Usuario, SesionStaff, id }) {
    const usuario = await Usuario.findById(id);
    if (!usuario) return { error: 'Cuenta no encontrada', estado: 404 };

    const puedeEntrar = !!usuario.passwordHash && (usuario.estado || 'activo') === 'activo';
    if (puedeEntrar && await cuentasQuePuedenEntrar(Usuario) <= 1) {
        return {
            error: 'Es la única cuenta que puede entrar a este taller: revocarla lo dejaría afuera de su'
                + ' propio sistema. Crea o activa otra antes.',
            estado: 409,
        };
    }

    usuario.estado = 'revocado';
    await usuario.save();

    // No se espera al próximo request suyo para echarla: se cierran sus sesiones ya.
    if (SesionStaff) {
        await SesionStaff.updateMany({ usuarioId: usuario._id, estado: 'activa' }, { estado: 'cerrada' });
    }
    return { usuario };
}

async function reactivarCuenta({ Usuario, id }) {
    const usuario = await Usuario.findById(id);
    if (!usuario) return { error: 'Cuenta no encontrada', estado: 404 };
    usuario.estado = 'activo';
    await usuario.save();
    return { usuario };
}

module.exports = {
    reenviarInvitacion, revocarCuenta, reactivarCuenta,
    emitirInvitacion, enviarCorreoInvitacion, cuentasQuePuedenEntrar,
    DIAS_VALIDEZ_INVITACION,
};
