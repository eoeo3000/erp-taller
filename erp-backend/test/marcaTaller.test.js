// El logo que se guarda de cada taller: qué entra y qué no.
//
// Esto es una función pura a propósito. El logo viaja dentro de un documento de Mongo, sale
// en cada respuesta del panel y en cada arranque del SPA, así que lo que se acepte acá es lo
// que después hay que cargar en todas partes — y el día que entre algo que jsPDF no sepa
// insertar, el error no va a aparecer acá sino al generar una cotización para un cliente.
const test = require('node:test');
const assert = require('node:assert');
const { normalizarLogo, marcaPublica, LARGO_MAXIMO_LOGO } = require('../src/servicios/marcaTaller');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

test('un PNG y un JPEG pasan tal cual', () => {
    assert.strictEqual(normalizarLogo(PNG), PNG);
    assert.strictEqual(normalizarLogo('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');
});

test('vacío QUITA el logo y no es un error', () => {
    // Poner un logo se tiene que poder deshacer, igual que todo lo demás
    // (docs/principio-vuelta-atras.md). Si esto lanzara, el botón "Quitar logo" no existiría.
    assert.strictEqual(normalizarLogo(''), '');
    assert.strictEqual(normalizarLogo('   '), '');
    assert.strictEqual(normalizarLogo(null), '');
    assert.strictEqual(normalizarLogo(undefined), '');
});

test('WEBP se rechaza aunque el navegador lo muestre bien', () => {
    // Es el caso que más importa: el navegador lo pinta en el panel y en la app, así que se
    // vería correcto en todas partes y recién fallaría al armar la cotización — el peor
    // momento posible para enterarse.
    assert.throws(() => normalizarLogo('data:image/webp;base64,UklGRh4AAABXRUJQ'), /PNG o JPEG/);
    assert.throws(() => normalizarLogo('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), /PNG o JPEG/);
});

test('lo que no es una imagen en data URI no entra', () => {
    for (const malo of [
        'https://ejemplo.cl/logo.png',                 // una URL: el logo tiene que viajar entero
        'data:text/html;base64,PHNjcmlwdD4=',          // no es una imagen
        'data:image/png,noesbase64',                   // sin base64
        'data:image/png;base64,con espacios y <>',     // caracteres fuera del alfabeto base64
        'javascript:alert(1)',
    ]) {
        assert.throws(() => normalizarLogo(malo), /data URI/, `debería rechazar: ${malo}`);
    }
});

test('hay un tope de peso, y el mensaje dice cuánto', () => {
    // Sin tope, un logo de 4MB entraría al documento del taller y después saldría en CADA
    // respuesta del panel y en CADA arranque del SPA de ese cliente.
    const enorme = 'data:image/png;base64,' + 'A'.repeat(LARGO_MAXIMO_LOGO);
    assert.throws(() => normalizarLogo(enorme), /pesa demasiado/);
});

test('la marca pública siempre trae las dos claves', () => {
    // Quien la consume (el SPA, el panel) no tiene que preguntar si el objeto existe: una
    // ficha anterior a este campo y una con marca se leen igual.
    assert.deepStrictEqual(marcaPublica(undefined), { nombre: '', logo: '' });
    assert.deepStrictEqual(marcaPublica({ nombre: '  Taller Rivas  ' }), { nombre: 'Taller Rivas', logo: '' });
});
