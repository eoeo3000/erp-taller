// src/middlewares/auth.js

// NOTA: Usa module.exports para exportar LA FUNCIÓN DIRECTAMENTE
module.exports = (req, res, next) => {
    const { key } = req.body;

    if (key !== "ClaveSecreta123") {
        return res.status(401).json({ error: "No autorizado" });
    }

    next(); // Esto permite que pase al controlador
};