// Clave compartida por header, exigida solo en las rutas de escritura de mayor riesgo: OT
// (incluye pago — no tiene ruta propia, ver actualizarOT), contabilidad, y administración
// (recursos/puestos/calendarios). Ver plan de robustecimiento, punto 4.
//
// No es autenticación real por persona: la clave vive en el build del SPA (VITE_API_KEY) y
// cualquiera con las herramientas de desarrollador del navegador puede verla en las
// requests — protege contra acceso casual/directo a la API (bots, alguien probando la URL
// del backend con curl), no contra un usuario malicioso que ya está usando la app.
//
// Si API_KEY no está definida en .env, el gate queda desactivado (deja pasar, con un aviso
// en consola) en vez de bloquear todo: así el rollout es explícito — no se activa hasta que
// se configure la clave en erp-backend/.env (y VITE_API_KEY en erp-web/.env), y mientras
// tanto la app sigue funcionando exactamente igual que antes de este cambio.
let avisoEmitido = false;

module.exports = (req, res, next) => {
    if (!process.env.API_KEY) {
        if (!avisoEmitido) {
            console.warn('⚠️  API_KEY no está definida en .env — las rutas de escritura de mayor riesgo quedan sin protección real.');
            avisoEmitido = true;
        }
        return next();
    }

    if (req.headers['x-api-key'] !== process.env.API_KEY) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    next();
};
