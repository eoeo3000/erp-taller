// Contrato de respuesta consistente — ver plan de robustecimiento, punto 3. Los 22
// controladores existentes devuelven la clave de error que les pareció en el momento
// (`error`, `mensaje`, `message` mezclados, ver CLAUDE.md) y esto NO los reescribe: se
// deja disponible para controladores nuevos o para los que ya se estén tocando por otra
// razón, igual que se hizo con el patrón crearX/actualizarX/eliminarX del frontend.
module.exports = function contratoRespuesta(req, res, next) {
    res.ok = (datos, status = 200) => res.status(status).json(datos);
    res.fail = (status, mensaje) => res.status(status).json({ error: mensaje });
    next();
};
