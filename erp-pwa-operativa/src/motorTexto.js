// Motor de texto adaptativo — docs/plan-formulario-adaptativo.md §5. Único renderizador,
// sin variantes por tipo de trabajo: recorre la plantilla ("Cambio de línea de {diametro}
// {material}...") una sola vez, separando texto literal de marcadores {clave}, y resuelve
// cada marcador contra los valores ya capturados. No sabe nada de React ni del DOM — la
// pantalla decide cómo pintar cada segmento (folleto §11: cada valor es un objetivo táctil
// propio, no solo una palabra subrayada).
//
// Duplicado a propósito en erp-web/src/utils/motorTexto.js — ver motorSugerencia.js para el
// motivo (sin monorepo/paquete compartido entre erp-web y las PWA).

const PATRON_MARCADOR = /\{([a-zA-Z0-9_]+)\}/g;
const MARCADOR_PENDIENTE = '___';

function valorATexto(valor) {
    if (valor === undefined || valor === null || valor === '') return MARCADOR_PENDIENTE;
    if (Array.isArray(valor)) return valor.length ? valor.join(', ') : MARCADOR_PENDIENTE;
    return String(valor);
}

function estaPendiente(valor) {
    if (valor === undefined || valor === null || valor === '') return true;
    if (Array.isArray(valor)) return valor.length === 0;
    return false;
}

// Devuelve la plantilla dividida en segmentos {tipo:'texto', contenido} y
// {tipo:'valor', clave, contenido, pendiente} — la pantalla solo pinta distinto a los
// segundos y los hace tocables (abren el selector de ese campo).
export function generarSegmentos(plantillaTexto, valores = {}) {
    const segmentos = [];
    const texto = plantillaTexto || '';
    let ultimo = 0;
    let m;
    PATRON_MARCADOR.lastIndex = 0;
    while ((m = PATRON_MARCADOR.exec(texto)) !== null) {
        if (m.index > ultimo) segmentos.push({ tipo: 'texto', contenido: texto.slice(ultimo, m.index) });
        const clave = m[1];
        const valor = valores[clave];
        segmentos.push({ tipo: 'valor', clave, contenido: valorATexto(valor), pendiente: estaPendiente(valor) });
        ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) segmentos.push({ tipo: 'texto', contenido: texto.slice(ultimo) });
    return segmentos;
}

// El texto plano final — lo que se guarda en hallazgo.textoGenerado/textoDescriptivo
// mientras no se edite a mano (ver plan §5).
export function generarTexto(plantillaTexto, valores = {}) {
    return generarSegmentos(plantillaTexto, valores).map((s) => s.contenido).join('');
}
