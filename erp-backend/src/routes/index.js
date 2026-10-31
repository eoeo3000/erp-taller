const express = require('express');
const router = express.Router();
const { identificar, requiereSesion } = require('../middlewares/sesion');
const { requiereIdentidad } = require('../middlewares/identidad');

// Importar todas las rutas individuales
const authRoutes = require('./authRoutes');
const instalacionRoutes = require('./instalacionRoutes');
const cuentasRoutes = require('./cuentasRoutes');
const respaldoRoutes = require('./respaldoRoutes');
const tallerRoutes = require('./tallerRoutes');
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
// Respaldos: los dispara un programador externo con RESPALDO_TOKEN, no una sesión del SPA.
router.use('/respaldos', respaldoRoutes);
// Registro de talleres: el panel de quien arrienda el sistema, con PANEL_TOKEN. No es de
// ningún taller, así que no pasa por los gates de sesión ni de identidad.
router.use('/talleres', tallerRoutes);

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

// --- Rutas compartidas con las PWAs ---
// Las llaman dos clientes con dos pruebas de identidad distintas: erp-web manda
// `Authorization: Bearer` y erp-pwa-operativa manda el token permanente en `?token=`. Por
// eso el gate es `requiereIdentidad` y no `requiereSesion`: el segundo dejaría a la PWA
// fuera de servicio. `/ots` y `/solicitudes` lo aplican ruta por ruta (ahí conviven rutas
// de las dos clases, ver solicitudRoutes.js).
router.use('/ots', otRoutes);
router.use('/solicitudes', solicitudRoutes);
router.use('/portal', portalRoutes);
router.use('/asignaciones', asignacionRoutes);

// Subir archivos. El gate va **en el montaje y no en la ruta**, al revés que en
// solicitudRoutes: este router no tiene ninguna ruta que deba quedar abierta, así que
// cerrarlo entero hace que la próxima ruta de subida que alguien agregue nazca cerrada en
// vez de nacer abierta. Es lo contrario de lo que pasó con `/solicitudes`, donde el router
// entero estaba sin gate porque UNA de sus rutas la usaba la PWA.
//
// Lo que esto cierra: `POST /api/uploads/foto` no pedía ninguna credencial, así que
// cualquiera que supiera la URL del backend podía llenar el bucket — y el bucket se mide
// contra el tope del plan, que es del bucket entero y no de cada cliente.
//
// Y arregla algo que no era un agujero sino un extravío: sin credencial,
// `middlewares/entorno.js` resuelve al taller por defecto, así que TODA foto subida por
// cualquier taller caía en `talleres/principal/`. La carpeta por cliente existe para
// respaldar, medir y borrar por cliente; sin identidad en la request no podía funcionar.
// Cerrar la ruta y archivar bien la foto son el mismo arreglo.
//
// El gate va ANTES de multer a propósito: así una subida sin identidad se rechaza sin
// haber leído 12MB a memoria.
router.use('/uploads', requiereIdentidad, uploadRoutes);

// Abiertas de verdad: catálogos que no son de nadie en particular.
router.use('/tipos-trabajo', tipoTrabajoRoutes);
router.use('/catalogos-transversales', catalogoTransversalRoutes);
// Mixto: /whoami la llama la PWA Operativa por token; el resto es administración desde el
// SPA y exige sesión (ver usuarioRoutes.js).
router.use('/usuarios', usuarioRoutes);

module.exports = router;