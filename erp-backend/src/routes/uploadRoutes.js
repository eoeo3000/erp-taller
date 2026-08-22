const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');

// POST /api/uploads/foto — sube una foto de evidencia (S3/O4/O5, PWA Operativa modo
// supervisor) como archivo real en /uploads, en vez de texto base64 incrustado en el
// documento de la OT (mismo criterio ya aplicado a Solicitud.adjuntos). Una sola foto de
// 256KB en base64 hacía que CUALQUIER consulta que trajera esa OT tardara varios segundos
// — visto directo en producción (mi-semana, mi-panel, etc.), no relacionado con índices
// ni con la red: el propio driver de Mongo tardaba igual sirviendo esa OT.
router.post('/foto', upload.single('foto'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo "foto"' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

module.exports = router;
