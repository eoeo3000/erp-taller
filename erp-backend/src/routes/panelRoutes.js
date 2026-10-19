// La página del panel de talleres. Se monta FUERA de /api (igual que /uploads), porque es
// una página para abrir en el navegador, no un endpoint.
//
// La página en sí es pública y no lleva ningún dato: es un formulario y el código que pinta
// la tabla. Todo lo que muestra sale de /api/talleres y /api/talleres/metricas, que exigen
// PANEL_TOKEN. Así la clave **nunca viaja en la dirección** —una URL con la clave adentro
// queda en el historial, en los logs del servidor y en el Referer de cualquier cosa que se
// abra desde ahí— y además no hay que inventar una sesión para el panel.
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Se lee una vez al arrancar: es un archivo fijo y leerlo en cada visita no aporta nada.
const PAGINA = fs.readFileSync(path.join(__dirname, '..', 'paneles', 'panel.html'), 'utf8');

router.get('/', (req, res) => {
    // Sin caché: la página es chica y que una versión vieja quede pegada en el navegador de
    // quien administra es más caro que volver a bajar 8 KB.
    res.set('Cache-Control', 'no-store');
    res.type('html').send(PAGINA);
});

module.exports = router;
