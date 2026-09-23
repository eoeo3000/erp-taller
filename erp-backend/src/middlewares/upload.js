// Multer en memoria: el archivo llega como buffer y lo escribe config/almacenamiento.js,
// que decide si va al bucket R2 o al disco. Antes esto escribía directo en `uploads/` con
// diskStorage, que en Render es un disco efímero — ver el comentario de almacenamiento.js.
const multer = require('multer');

// Antes no había ningún límite: una subida de varios GB la aceptaba igual y se la comía la
// memoria del contenedor. Las dos apps comprimen a 1200px/JPEG 0.75 antes de subir (~200KB),
// así que 12MB es holgado incluso para un adjunto sin comprimir.
const MAX_BYTES = 12 * 1024 * 1024;

module.exports = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });
