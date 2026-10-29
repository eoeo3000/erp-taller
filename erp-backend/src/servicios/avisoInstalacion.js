// Avisar a quien arrienda el sistema que un cliente terminó de instalar su taller.
//
// NO es una aprobación: cuando este correo sale, la persona ya entró. La autorización ocurrió
// antes, al emitir el enlace y decidir a qué buzón se manda — eso es lo que convierte un slug
// (que es ruteo y no autoriza nada) en una instalación válida. Poner una aprobación después
// dejaría a un cliente nuevo mirando una pantalla de espera hasta que alguien revise su
// correo, y habría que definir qué pasa al rechazarla con la cuenta ya creada.
//
// Para qué sirve entonces: es el registro de que pasó, y es cómo se nota lo que de otro modo
// no se notaría — que el enlace lo usó alguien que no era el destinatario, o un nombre que no
// corresponde. La vuelta atrás existe y está en el panel: suspender el taller lo deja sin
// conexión en el acto, desde el registro y no desde los controladores.
//
// Devuelve el mensaje en vez de enviarlo, por lo mismo que `mailer.revisarConfiguracion`:
// así se puede probar qué dice sin abrir una conexión SMTP.

// Opcional a propósito, mismo criterio que EMAIL_REPLY_TO: sin ella no sale el correo y no se
// rompe nada. Exigirla haría que un despliegue que no la haya definido todavía no pueda
// instalar un taller, y lo que está en juego ahí es un cliente nuevo entrando por primera vez.
function destinatario(env = process.env) {
    return String(env.EMAIL_OPERADOR || '').trim();
}

function armarAviso({ slug, nombreTaller, nombre, email, cuando = new Date() }, env = process.env) {
    const para = destinatario(env);
    if (!para) return null;

    const fecha = cuando.toLocaleString('es-CL', { timeZone: 'America/Santiago' });
    const titulo = nombreTaller || slug;
    return {
        from: process.env.EMAIL_FROM,
        to: para,
        subject: `Taller instalado: ${titulo}`,
        text: [
            `El taller "${titulo}" (${slug}) completó su primera puesta en marcha.`,
            '',
            `Cuenta creada: ${nombre} <${email}>`,
            `Cuándo: ${fecha}`,
            '',
            'Esa persona ya está adentro — este correo es el registro, no una aprobación.',
            'El enlace de instalación se consumió: no sirve de nuevo.',
            '',
            'Si no era quien esperabas, suspende el taller desde el panel: eso le corta la',
            'conexión en el acto, y la cuenta queda sin poder entrar.',
        ].join('\n'),
    };
}

module.exports = { armarAviso, destinatario };
