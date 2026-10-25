// La página para probar las dos apps móviles en una sola pantalla. Se monta FUERA de /api
// (igual que /panel y /uploads) porque es una página para abrir en el navegador.
//
// Para qué existe: la PWA Operativa y la del cliente solo se pueden mirar de verdad en un
// teléfono, y probar un flujo que cruza las dos —el supervisor cierra el trabajo, el cliente
// lo ve— obliga a tener dos aparatos a mano o a cambiar de pestaña perdiendo de vista una de
// las dos. Acá van las dos al lado, al tamaño de un teléfono.
//
// **No habla con la API ni pide ninguna clave.** Son dos marcos y los controles para
// manejarlos; los links los pega quien prueba, con el token que ya tiene. Esto es
// deliberado: los tokens son credenciales y `usuarioController.listar` los esconde a
// propósito (`.select('-token')`), así que una página que los fuera a buscar al servidor
// sería un agujero abierto para ahorrarse un pegado.
//
// Lo único que el servidor le pasa son las direcciones configuradas de cada app, que son
// públicas, y solo para usarlas de pista en los campos vacíos.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { PWA_OPERATIVA_URL, PWA_CLIENTE_URL } = require('../config/urls');
const router = express.Router();

const PLANTILLA = fs.readFileSync(path.join(__dirname, '..', 'paneles', 'moviles.html'), 'utf8');

// Se arma una vez al arrancar: las direcciones salen del entorno y no cambian en caliente.
// `JSON.stringify` y no pegar las cadenas a mano — una comilla en una variable de entorno
// rompería el script de la página entera.
const PAGINA = PLANTILLA.replace(
    'window.__PWA_URLS__ || { operativa: \'\', cliente: \'\' }',
    `window.__PWA_URLS__ || ${JSON.stringify({ operativa: PWA_OPERATIVA_URL, cliente: PWA_CLIENTE_URL })}`,
);

router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('html').send(PAGINA);
});

module.exports = router;
