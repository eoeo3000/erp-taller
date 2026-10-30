// ¿En qué taller está esta cuenta?
//
// Nace de un caso real que no se podía cerrar mirando el log. La recuperación de clave decía
// «ninguna cuenta con ese correo en este taller (@hotmail.com, taller principal)» una y otra
// vez, y con eso quedaban dos explicaciones igual de plausibles y ninguna forma de elegir:
// la cuenta no existe en ninguna parte, o existe en OTRO taller y el navegador de esa
// persona está apuntando al principal (ver `conexionPedida` en middlewares/entorno.js).
//
// Las dos se arreglan distinto —una invitando, la otra mandando el enlace `?taller=<slug>`—
// así que confundirlas cuesta la tarde. Esto recorre los talleres y contesta cuál es.
//
// **Esto NO va por HTTP, ni ahora ni después.** Preguntar «¿en qué cliente está este correo?»
// desde afuera convierte cualquier formulario en un buscador de a qué taller pertenece cada
// persona — justo lo que `CREDENCIAL_INVALIDA` y la respuesta única de la recuperación
// existen para impedir. Acá se usa desde un script, con las credenciales del servidor ya en
// la mano: no agrega ningún acceso que no estuviera.
//
// Devuelve lo encontrado en vez de imprimirlo, para poder probarlo sin abrir una conexión.

// Qué se cuenta de cada hallazgo. Nunca el `passwordHash` ni el `token`: son credenciales, y
// esto va a terminar pegado en un chat o en un ticket.
function resumen(usuario) {
    return {
        nombre: usuario.nombre || '',
        estado: usuario.estado || 'activo',
        // Las tres situaciones que mandan a lugares distintos: entrar, activar la invitación
        // que nunca se usó, o reactivar la cuenta en Cuentas de oficina.
        puedeEntrar: !!usuario.passwordHash && (usuario.estado || 'activo') === 'activo',
        invitacionSinActivar: !usuario.passwordHash,
    };
}

// `talleres` es una lista de { slug, conexion }. Se pasan ya abiertas para que el servicio no
// tenga que saber cómo se abren: así la prueba le pasa bases falsas y el script las de verdad.
async function buscarCuenta(email, talleres, getUsuario) {
    const buscado = String(email || '').trim().toLowerCase();
    if (!buscado) throw new Error('Hay que decir qué correo buscar.');

    const hallazgos = [];
    const fallidos = [];
    for (const { slug, conexion } of talleres) {
        try {
            // Un taller caído no corta la vuelta: el que se busca puede estar en otro, y una
            // respuesta parcial que dice cuál falló es mucho mejor que ninguna.
            const usuario = await getUsuario(conexion).findOne({ email: buscado });
            if (usuario) hallazgos.push({ taller: slug, ...resumen(usuario) });
        } catch (error) {
            fallidos.push({ taller: slug, error: error.message });
        }
    }
    return { email: buscado, hallazgos, fallidos };
}

// Qué hacer con lo que se encontró, en una frase. Es el valor de esto: el dato suelto todavía
// obliga a pensar, y a esa altura ya se perdió media hora.
function queHacer({ hallazgos, fallidos }, tallerDondeBusco) {
    if (!hallazgos.length) {
        const nota = fallidos.length
            ? ` (ojo: ${fallidos.length} taller(es) no respondieron, así que la respuesta está incompleta)`
            : '';
        return `Ese correo no tiene cuenta en ningún taller${nota}. Lo que corresponde es invitarlo`
            + ' desde la app del taller que le toca: Bodega de tokens → Cuentas de oficina → Invitar.';
    }
    const otros = hallazgos.filter((h) => h.taller !== tallerDondeBusco);
    if (otros.length && !hallazgos.some((h) => h.taller === tallerDondeBusco)) {
        const lista = otros.map((h) => h.taller).join(', ');
        return `La cuenta existe, pero en ${lista} — no en ${tallerDondeBusco}, que es donde el navegador`
            + ` de esa persona está buscando. Mándale el enlace de acceso de SU taller`
            + ` (SPA_URL/?taller=${otros[0].taller}) y que pida la recuperación desde ahí.`;
    }
    const aca = hallazgos.find((h) => h.taller === tallerDondeBusco);
    if (aca.invitacionSinActivar) {
        return 'La cuenta está en el taller correcto pero nunca activó su invitación: no tiene clave que'
            + ' reponer. Hay que reenviarle la invitación desde Cuentas de oficina.';
    }
    if (!aca.puedeEntrar) {
        return `La cuenta está en el taller correcto pero su estado es "${aca.estado}". Se reactiva desde`
            + ' Cuentas de oficina.';
    }
    return 'La cuenta está y puede entrar. Si aun así no le llega el correo, el problema es el envío:'
        + ' revisar el log por «FALLÓ el envío» y la bandeja de spam.';
}

module.exports = { buscarCuenta, queHacer };
