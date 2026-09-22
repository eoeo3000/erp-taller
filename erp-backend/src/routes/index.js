const express = require('express');
const router = express.Router();
const { identificar, requiereSesion } = require('../middlewares/sesion');

// Importar todas las rutas individuales
const authRoutes = require('./authRoutes');
const instalacionRoutes = require('./instalacionRoutes');
const cuentasRoutes = require('./cuentasRoutes');
const dataRoutes = require('./dataRoutes');
const personalRoutes = require('./recursosRoutes');
const equipoRoutes = require('./equiposHerramientasRoutes');
const suministroRoutes = require('./suministroRoutes');
const calendarioRoutes = require('./calendarioRoutes');
const otRoutes = require('./otRoutes');
const puestosRoutes = require('./puestosRoutes');
// ✅ PASO 1: Importar solicitudes
const solicitudRoutes = require('./solicitudRoutes');
const plantillaRoutes = require('./plantillaRoutes');
const finanzasRoutes = require('./finanzasRoutes');
const contabilidadRoutes = require('./contabilidadRoutes');
const importExportRoutes = require('./importExportRoutes');
const portalRoutes = require('./portalRoutes');
const proveedorRoutes = require('./proveedorRoutes');
const ordenCompraRoutes = require('./ordenCompraRoutes');
const disposicionRoutes = require('./disposicionRoutes');
const demoRoutes = require('./demoRoutes');
const usuarioRoutes = require('./usuarioRoutes');
const asignacionRoutes = require('./asignacionRoutes');
const clienteRoutes = require('./clienteRoutes');
const uploadRoutes = require('./uploadRoutes');
const tipoTrabajoRoutes = require('./tipoTrabajoRoutes');
const catalogoTransversalRoutes = require('./catalogoTransversalRoutes');

// Deja req.usuario disponible en TODA la API cuando la request trae una sesión válida, sin
// bloquear a nadie — las PWAs y el portal del cliente siguen entrando sin sesión de
// escritorio. Va antes que cualquier ruta, incluidas las de /auth (logout y yo necesitan
// saber con qué sesión se las llamó).
router.use(identificar);

router.use('/auth', authRoutes);
// Primera puesta en marcha: pública, y se apaga sola cuando ya hay una cuenta con clave.
router.use('/instalacion', instalacionRoutes);
// Administración de cuentas de escritorio. Exige sesión real por su cuenta (ver el router),
// no el gate con rollout que usan las rutas de abajo.
router.use('/cuentas', cuentasRoutes);

// --- Rutas de la app de escritorio: exigen sesión ---
// (mientras AUTH_REQUERIDA no esté en 'true' solo avisan por consola, ver sesion.js)
router.use('/data', requiereSesion, dataRoutes);
router.use('/recursos', requiereSesion, personalRoutes);
router.use('/equipos', requiereSesion, equipoRoutes);
router.use('/suministros', requiereSesion, suministroRoutes);
router.use('/calendarios', requiereSesion, calendarioRoutes);
router.use('/puestos', requiereSesion, puestosRoutes);
router.use('/plantillas', requiereSesion, plantillaRoutes);
router.use('/finanzas', requiereSesion, finanzasRoutes);
router.use('/contabilidad', requiereSesion, contabilidadRoutes);
router.use('/import', requiereSesion, importExportRoutes);
router.use('/proveedores', requiereSesion, proveedorRoutes);
router.use('/ordenes-compra', requiereSesion, ordenCompraRoutes);
router.use('/disposiciones', requiereSesion, disposicionRoutes);
router.use('/demo', requiereSesion, demoRoutes);
router.use('/clientes', requiereSesion, clienteRoutes);

// --- Rutas compartidas con las PWAs: siguen abiertas ---
// Las dos PWAs las llaman con su propio token (Usuario.token / SesionPortal) o, en el caso
// de los catálogos y de las lecturas de OT/Solicitud, sin ningún token. Cerrarlas acá
// dejaría a las apps móviles fuera de servicio, así que la protección de este grupo es el
// paso siguiente y requiere tocar erp-pwa-operativa para que mande su token en esas
// llamadas. Mientras tanto siguen con el gate de apiKey donde ya lo tenían.
router.use('/ots', otRoutes);
router.use('/solicitudes', solicitudRoutes);
router.use('/portal', portalRoutes);
router.use('/asignaciones', asignacionRoutes);
router.use('/uploads', uploadRoutes);
router.use('/tipos-trabajo', tipoTrabajoRoutes);
router.use('/catalogos-transversales', catalogoTransversalRoutes);
// Mixto: /whoami la llama la PWA Operativa por token; el resto es administración desde el
// SPA y exige sesión (ver usuarioRoutes.js).
router.use('/usuarios', usuarioRoutes);

module.exports = router;