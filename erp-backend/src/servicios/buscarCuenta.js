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
        // **Si alguna vez entró, y cuándo.** Lo decide `ultimoAccesoSpa`, que escribe el
        // login de escritorio. Existe porque «creo que yo sí había entrado con esa cuenta»
        // es lo primero que se piensa cuando una invitación aparece sin activar, y no había
        // forma de contestarlo: la cuenta se ve igual si nunca se usó el link o si se usó y
        // algo falló. Una fecha lo cierra; una opinión no.
        //
        // `creada` sale de `timestamps: true` y sirve para lo otro que se sospecha enseguida:
        // si la cuenta es de hoy, nadie la borró — es nueva.
        ultimoAcceso: usuario.ultimoAccesoSpa || null,
        creada: usuario.createdAt || null,
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

// Lo mismo, pero listando en vez de buscando una exacta. Lo usa el panel, donde el caso real
// no siempre es «¿está este correo?» sino «no me acuerdo con cuál la creé»: ahí una búsqueda
// exacta no sirve de nada.
//
// `texto` vacío devuelve todas las cuentas del taller. Con texto, filtra por lo que contenga
// el correo o el nombre — la comparación se hace EN MEMORIA y no con una expresión regular en
// Mongo, porque un `$regex` armado con lo que escribe alguien es una forma conocida de colgar
// una base con un patrón patológico, y acá son decenas de documentos por taller.
//
// **Solo cuentas con correo**, igual que `cuentasController.listar`: un `Usuario` con solo
// `token` es alguien de terreno que entra por la PWA, no tiene correo ni clave, y mezclarlos
// haría que la lista de «cuentas de oficina» no signifique nada.
const TOPE_POR_TALLER = 500;

async function listarCuentas({ texto = '', talleres, getUsuario }) {
    const buscado = String(texto || '').trim().toLowerCase();
    const cuentas = [];
    const fallidos = [];
    for (const { slug, conexion } of talleres) {
        try {
            const encontrados = await getUsuario(conexion)
                .find({ email: { $exists: true, $ne: '' } })
                // **`passwordHash` SE TRAE, y no se devuelve.** Excluirlo acá parecía lo
                // prudente y era un error grave: `resumen()` lo lee para decidir
                // `puedeEntrar` e `invitacionSinActivar`, así que sin el campo esas dos
                // salían `false`/`true` SIEMPRE — el panel mostraba todas las cuentas como
                // «invitación sin activar», incluidas las que entran todos los días. Se
                // creyó durante días que una cuenta perfectamente activa estaba rota.
                //
                // Lo que impide que salga no es la consulta sino `resumen()`, que arma un
                // objeto con campos nombrados uno por uno. `token` y `resetHash` sí se
                // excluyen: nadie los lee acá, así que ni siquiera hace falta traerlos.
                .select('-token -resetHash')
                .limit(TOPE_POR_TALLER)
                .lean();
            for (const u of encontrados || []) {
                const email = String(u.email || '').toLowerCase();
                const nombre = String(u.nombre || '').toLowerCase();
                if (buscado && !email.includes(buscado) && !nombre.includes(buscado)) continue;
                // El `_id` va solo acá y no en `resumen`: lo necesita el panel para poder
                // actuar sobre una cuenta (reenviar, revocar), y el script que solo informa
                // no tiene nada que hacer con él. No es una credencial —es un identificador
                // opaco— y las acciones que lo usan van igual detrás de PANEL_TOKEN.
                cuentas.push({ id: String(u._id), taller: slug, email: u.email, ...resumen(u) });
            }
        } catch (error) {
            fallidos.push({ taller: slug, error: error.message });
        }
    }
    cuentas.sort((a, b) => a.taller.localeCompare(b.taller) || a.email.localeCompare(b.email));
    return { texto: buscado, cuentas, fallidos };
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

module.exports = { buscarCuenta, listarCuentas, queHacer, TOPE_POR_TALLER };
