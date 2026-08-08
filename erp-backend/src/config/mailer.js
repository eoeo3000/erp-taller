require('dotenv').config();
const nodemailer = require('nodemailer');

console.log("--- 🔍 DIAGNÓSTICO DE SUMINISTROS ---");
console.log("¿API KEY detectada?:", process.env.BREVO_API_KEY ? "SÍ ✅" : "NO ❌");
console.log("Valor de la clave (primeros 5 caracteres):", process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.substring(0, 10) : "NADA");
console.log("-------------------------------------");

const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
        // CAMBIO AQUÍ: Usa el identificador de tu imagen
        user: "a31194001@smtp-brevo.com",
        // Tu clave xsmtpsib-... del .env corregida con .trim()
        pass: process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.trim() : "",
    },
});

transporter.verify().then(() => {
    console.log('✅ Servidor de suministros conectado con Brevo');
}).catch((err) => {
    console.error('❌ Error mailer Brevo:', err.message);
});

module.exports = transporter;