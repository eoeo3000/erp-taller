// Transporte de correo saliente (cotizaciones, avisos al supervisor, recuperación de clave
// e invitaciones), vía el relay SMTP de Brevo.
//
// Antes esto imprimía en cada arranque los primeros caracteres de BREVO_API_KEY. Se veía
// inofensivo —`xsmtpsib-` es el prefijo público de todas las claves de Brevo— pero el
// mecanismo estaba mal: los logs de Render los puede leer cualquiera con acceso al panel,
// quedan guardados, y el día que alguien suba el largo de ese `substring` para depurar algo,
// la clave se filtra de verdad. Un secreto no se registra ni a medias.
const nodemailer = require('nodemailer');

// El identificador SMTP de Brevo estaba escrito en el código. No es un secreto, pero atarlo
// al repositorio obliga a un deploy para cambiar de cuenta y lo deja igual en todos los
// entornos. Se mueve al entorno CON EL VALOR ANTERIOR COMO RESPALDO a propósito: exigir la
// variable de golpe dejaría sin correo a una instalación que despliegue esto sin haberla
// definido todavía, y lo que se rompería son las invitaciones y las recuperaciones de clave
// — el peor momento para descubrir que falta una variable. Cuando BREVO_SMTP_USER esté
// puesta en todos los entornos, este respaldo se puede borrar.
const USUARIO_ANTERIOR = 'a31194001@smtp-brevo.com';

// Dominios de correo personal. Usar uno como remitente no rompe el envío —Brevo reescribe
// el `From` a su propio dominio para poder firmarlo— pero el resultado es que el cliente
// del taller recibe la cotización de una dirección de máquina tipo
// `algo@1234567.brevosend.com`, que no dice nada y no da confianza. El arreglo es un
// dominio propio verificado en Brevo. Ver docs/multi-taller.md.
const DOMINIOS_PERSONALES = ['gmail.com', 'hotmail.com', 'outlook.com', 'outlook.es', 'yahoo.com', 'yahoo.es', 'live.com', 'icloud.com'];

// Un solo lugar que interpreta el entorno, usado al cargar el módulo y por la revisión de
// abajo. Si estuvieran duplicados, la revisión podría avisar de algo distinto de lo que el
// transporte está usando de verdad — que es exactamente el tipo de error que esto viene a
// cazar.
function leerConfig(env) {
    return {
        usuarioDefinido: !!String(env.BREVO_SMTP_USER || '').trim(),
        usuario: String(env.BREVO_SMTP_USER || '').trim() || USUARIO_ANTERIOR,
        clave: String(env.BREVO_API_KEY || '').trim(),
        remitente: String(env.EMAIL_FROM || '').trim(),
        // Adónde van las respuestas. Cuando el remitente pase a ser un dominio técnico, esto
        // es lo que hace que un cliente que responde una cotización le llegue a una persona.
        respuestasA: String(env.EMAIL_REPLY_TO || '').trim(),
    };
}

const config = leerConfig(process.env);

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: { user: config.usuario, pass: config.clave },
});

// Se inyecta `replyTo` acá y no en cada `sendMail` porque hay nueve lugares distintos que
// arman correos (controladores de cuentas, usuarios, portal, auth, asignaciones, compras y
// mailRoutes). Envolver el transporte los cubre a todos sin tocar ninguno — que es además
// lo que pide CLAUDE.md: no retrofitear controladores que no se están tocando por otra razón.
const enviarOriginal = transporter.sendMail.bind(transporter);
transporter.sendMail = (mensaje, ...resto) => enviarOriginal(
    config.respuestasA && !mensaje.replyTo ? { ...mensaje, replyTo: config.respuestasA } : mensaje,
    ...resto,
);

// Qué está mal en la configuración de correo. Devuelve la lista en vez de imprimirla para
// poder probarla: cada caso de acá se descubrió en producción, sin que nada lo avisara.
// `nivel` es 'error' cuando el correo simplemente no va a salir, y 'aviso' cuando va a salir
// pero mal.
function revisarConfiguracion(env = process.env) {
    const { usuarioDefinido, clave, remitente, respuestasA } = leerConfig(env);
    const hallazgos = [];

    if (!usuarioDefinido) {
        hallazgos.push({ nivel: 'aviso', codigo: 'smtp-user-respaldo',
            mensaje: 'BREVO_SMTP_USER no está definida: se usa el identificador de respaldo del código.' });
    }
    if (!clave) {
        // Sin clave no hay nada más que revisar: no va a salir ningún correo.
        hallazgos.push({ nivel: 'error', codigo: 'sin-clave',
            mensaje: 'Correo sin configurar: falta BREVO_API_KEY.'
                + ' Las cotizaciones, invitaciones y recuperaciones de clave no se van a poder enviar.' });
        return hallazgos;
    }
    if (!remitente) {
        // Sin esto, los nueve `from` del proyecto arman la cadena `"ERP" <undefined>` y el
        // envío falla en cada correo, uno por uno, sin que nada lo anuncie al arrancar.
        hallazgos.push({ nivel: 'error', codigo: 'sin-remitente',
            mensaje: 'EMAIL_FROM no está definida: cada correo va a salir con un remitente inválido y fallar.' });
    } else {
        const dominio = (remitente.split('@')[1] || '').toLowerCase();
        if (DOMINIOS_PERSONALES.includes(dominio)) {
            hallazgos.push({ nivel: 'aviso', codigo: 'remitente-personal',
                mensaje: `EMAIL_FROM usa un dominio personal (${dominio}).`
                    + ' Brevo va a reescribir el remitente a uno suyo para poder firmarlo, así que tus clientes'
                    + ' van a ver una dirección de máquina en vez de la del taller. Para arreglarlo hay que'
                    + ' verificar un dominio propio en Brevo (SPF + DKIM) y usarlo acá.' });
        }
    }
    if (!respuestasA) {
        hallazgos.push({ nivel: 'aviso', codigo: 'sin-responder-a',
            mensaje: 'EMAIL_REPLY_TO no está definida: las respuestas de los clientes van a volver al remitente técnico.' });
    }
    return hallazgos;
}

// Se llama desde server.js al arrancar. Ninguno de estos avisos corta el arranque: el correo
// roto no debe tumbar el sistema. Pero tienen que verse, que es justo lo que faltaba — una
// dirección remitente vacía o mal elegida fallaba en silencio y solo se notaba cuando alguien
// no recibía su invitación.
function avisarConfiguracion() {
    const hallazgos = revisarConfiguracion(process.env);
    for (const { nivel, mensaje } of hallazgos) {
        if (nivel === 'error') console.error(`❌ ${mensaje}`);
        else console.warn(`⚠️  ${mensaje}`);
    }
    if (hallazgos.some((h) => h.codigo === 'sin-clave')) return hallazgos;

    transporter.verify()
        .then(() => console.log('✅ Correo saliente conectado con Brevo'))
        .catch((err) => console.error('❌ Error mailer Brevo:', err.message));
    return hallazgos;
}

module.exports = transporter;
module.exports.avisarConfiguracion = avisarConfiguracion;
module.exports.revisarConfiguracion = revisarConfiguracion;
module.exports.DOMINIOS_PERSONALES = DOMINIOS_PERSONALES;
