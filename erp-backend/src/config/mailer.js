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

const usuario = String(process.env.BREVO_SMTP_USER || '').trim() || USUARIO_ANTERIOR;
const clave = String(process.env.BREVO_API_KEY || '').trim();

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: { user: usuario, pass: clave },
});

if (!process.env.BREVO_SMTP_USER) {
    console.warn('⚠️  BREVO_SMTP_USER no está definida: se usa el identificador de respaldo del código.');
}

// Se avisa si falta la clave, sin mostrar ningún valor: lo que hay que poder diagnosticar es
// "está o no está", no "cuál es".
if (!clave) {
    console.warn('⚠️  Correo sin configurar: falta BREVO_API_KEY.'
        + ' Las cotizaciones, invitaciones y recuperaciones de clave no se van a poder enviar.');
} else {
    transporter.verify()
        .then(() => console.log('✅ Correo saliente conectado con Brevo'))
        .catch((err) => console.error('❌ Error mailer Brevo:', err.message));
}

module.exports = transporter;
