const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Convierte un data-URI base64 a un archivo real en uploads/ y devuelve la ruta pública — si
// `valor` ya es una ruta/URL (o está vacío), se devuelve tal cual. Extraído de
// portalController (donde nació para Solicitud.adjuntos, ver nota histórica ahí) para que
// otController también lo use con los documentos de pago (Orden de Compra/EDP/HES) sin
// duplicar la lógica ni crear un require circular entre ambos controllers.
function guardarAdjuntoSiEsBase64(valor) {
    const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(valor || '');
    if (!match) return valor;
    const [, mime, contenido] = match;
    const ext = (mime.split('/')[1] || 'bin').replace('jpeg', 'jpg');
    const nombre = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const destino = path.join(__dirname, '..', '..', 'uploads', nombre);
    fs.writeFileSync(destino, Buffer.from(contenido, 'base64'));
    return `/uploads/${nombre}`;
}

module.exports = { guardarAdjuntoSiEsBase64 };
