// El encabezado del taller que emite el documento: su logo y su nombre, arriba a la
// izquierda, antes del título.
//
// Vive acá y no dentro de la pantalla porque el mismo encabezado le va a servir al informe de
// trabajo ejecutado, que hoy sale sin él.
//
// **Si el taller no puso marca, esto no dibuja nada y devuelve 0**: la cotización sale
// exactamente como antes, sin desplazar ni un milímetro. Eso es a propósito y no una
// omisión — poner "Taller ERP" en una cotización que se le manda a un cliente sería escribir
// el nombre del software en el papel del taller.

const X = 14;          // el mismo margen izquierdo que usa el resto del documento
const Y_TOPE = 10;
// El tamaño de un logo de membrete. Se probó con 26mm y queda demasiado chico: un logo
// ancho —que es la forma habitual, marca y razón social al lado— se reduce tanto que su
// propio texto deja de leerse en el papel.
const ANCHO_MAXIMO = 45;   // mm
const ALTO_MAXIMO = 16;    // mm

// Dibuja la marca y devuelve cuántos milímetros hay que bajar todo lo que sigue. El llamador
// suma ese número a las coordenadas de su encabezado: así, sin marca, las coordenadas quedan
// idénticas a las de siempre.
export function dibujarMarcaPdf(doc, marca) {
    const nombre = String(marca?.nombre || '').trim();
    const logo = String(marca?.logo || '');
    if (!nombre && !logo) return 0;

    let x = X;
    let alto = 0;

    if (logo) {
        try {
            // Las proporciones salen de la imagen y no de un tamaño fijo: un logo ancho y uno
            // cuadrado tienen que entrar los dos sin deformarse. `contain`, nunca estirado.
            const props = doc.getImageProperties(logo);
            const escala = Math.min(ANCHO_MAXIMO / props.width, ALTO_MAXIMO / props.height);
            const ancho = props.width * escala;
            alto = props.height * escala;
            doc.addImage(logo, props.fileType || 'PNG', X, Y_TOPE, ancho, alto);
            x += ancho + 5;
        } catch {
            // Logo ilegible (un formato que jsPDF no inserta, un data URI cortado). La
            // cotización sale sin imagen: quedarse sin poder cotizar por el logo sería mucho
            // peor que cotizar sin logo.
            alto = 0;
            x = X;
        }
    }

    if (nombre) {
        doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(44, 62, 80);
        // Centrado vertical respecto del logo cuando hay logo, y a la altura de una línea
        // normal cuando el nombre va solo.
        doc.text(nombre, x, Y_TOPE + (alto ? alto / 2 + 2 : 6));
        doc.setFont(undefined, 'normal');
        alto = Math.max(alto, 8);
    }

    // Lo que sigue arranca 4mm más abajo del bloque. Con un logo de 16mm son 20mm de desplazo.
    return alto + 4;
}
