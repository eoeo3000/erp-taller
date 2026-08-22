// Motor de sugerencia por palabras clave — docs/plan-formulario-adaptativo.md §4. Instantáneo
// y sin dependencias externas: normaliza (minúscula, sin tildes) y compara por palabra
// completa, nunca por substring, para que "línea" no dispare cualquier tipo de trabajo que
// contenga esas letras en otra palabra. Nombre/sinónimos pesan más que las opciones de los
// campos (una opción de campo es un indicio más indirecto y puede repetirse entre tipos).
//
// Duplicado a propósito desde erp-pwa-operativa/src/motorSugerencia.js: este proyecto no
// tiene tooling de monorepo/paquete compartido entre erp-web y las PWA (ver CLAUDE.md) —
// mismo criterio ya usado para los tokens de diseño (tokens.css). Si se corrige un bug acá,
// corregirlo también allá.

const MAPA_ACENTOS = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u' };
function sinAcentos(s) { return s.replace(/[áéíóúñü]/g, (c) => MAPA_ACENTOS[c] || c); }
function normalizar(s) { return sinAcentos(String(s || '').toLowerCase()).trim(); }

// Palabras demasiado comunes como para servir de señal — sin esto, dos tipos de trabajo sin
// relación real podían "coincidir" solo porque ambos contienen "de" o "en" en su nombre.
const PALABRAS_VACIAS = new Set(['de', 'la', 'el', 'los', 'las', 'en', 'y', 'o', 'a', 'un', 'una', 'del', 'con', 'para', 'que', 'su']);
function tokenizar(s) {
    return normalizar(s).split(/[^a-z0-9]+/).filter((tok) => tok.length > 2 && !PALABRAS_VACIAS.has(tok));
}

const PESO_NOMBRE_SINONIMO = 3;
const PESO_OPCION_CAMPO = 1;

// tipos: catálogo completo de TipoTrabajo (con campos/opciones ya cargados).
// Devuelve hasta `limite` coincidencias con puntaje > 0, de mayor a menor puntaje.
export function sugerirTiposTrabajo(texto, tipos, limite = 5) {
    const tokensTexto = new Set(tokenizar(texto));
    if (tokensTexto.size === 0) return [];

    const resultados = [];
    for (const tipo of tipos || []) {
        if (tipo.activo === false) continue;

        const tokensNombre = new Set([
            ...tokenizar(tipo.nombre),
            ...(tipo.sinonimos || []).flatMap(tokenizar),
        ]);
        const tokensOpciones = new Set(
            (tipo.campos || []).flatMap((c) => (c.opciones || []).flatMap(tokenizar))
        );

        let puntaje = 0;
        for (const tok of tokensTexto) {
            if (tokensNombre.has(tok)) puntaje += PESO_NOMBRE_SINONIMO;
            else if (tokensOpciones.has(tok)) puntaje += PESO_OPCION_CAMPO;
        }
        if (puntaje > 0) resultados.push({ tipo, puntaje });
    }

    resultados.sort((a, b) => b.puntaje - a.puntaje || a.tipo.nombre.localeCompare(b.tipo.nombre));
    return resultados.slice(0, limite);
}
