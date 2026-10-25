// Cuánto se está usando y cuánto queda, contra los techos de los planes contratados.
//
// --- Por qué esto MIDE y no CORTA ---
//
// La tentación con varios clientes es ponerle una cuota a cada uno y rechazar lo que la
// pase. Acá eso sería el peor modo de fallar que tiene el sistema: lo que se subiría al
// tope son las fotos de evidencia, y rechazarlas deja a un supervisor en terreno, a mitad
// de un trabajo, sin poder guardar lo que fue a hacer. Se pierde el trabajo de esa persona
// para ahorrar unos centavos de bucket.
//
// El problema real a esta escala tampoco es que un cliente consuma de más: es **no
// enterarse** de que el clúster o el bucket se están llenando hasta que algo se rompe. Eso
// se arregla mirando, no cortando. Si algún día alguien consume diez veces lo que el resto,
// esa es una conversación comercial, no un 413.
//
// Cuando haga falta cortar —y el día que haga falta se va a ver acá primero—, la regla
// tendría que ser: avisar mucho antes, y nunca bloquear la evidencia de un trabajo en
// curso. Bloquear una exportación o el alta de un cliente nuevo es otra cosa.
//
// --- No todos los topes son iguales ---
//
// Pasarse del tope de un clúster M0 de Atlas **rompe**: deja de poder escribir. Pasarse de
// los 10 GB gratuitos de R2 teniendo el plan pago **cobra**: no pasa nada, empieza a
// costar unos centavos por GB. Mostrar los dos con la misma barra roja entrena a ignorarla:
// la primera vez que el rojo resulta ser "te van a cobrar 20 centavos", el rojo dejó de
// significar algo.
//
// Por eso cada tope dice qué pasa al pasarlo, y **el rojo queda reservado para lo que se
// rompe**. Un tope de los que cobran avisa en ámbar al cruzarlo y no antes: antes de
// cruzarlo no pasa absolutamente nada.
//
// Cuál es cuál no se puede deducir desde el código —depende del plan contratado, que solo
// sabe quien paga— así que sale del entorno. Por omisión los dos son `rompe`: si alguien
// se olvida de configurarlo, el panel avisa de más y no de menos.
//
// --- Los techos también salen del entorno ---
//
// Por omisión son los de los planes gratuitos. El día que se pase a un plan pago se cambian
// las variables y el panel sigue diciendo la verdad; escritos en el código, seguiría
// avisando de un techo que ya no existe.

// 512 MB es el clúster M0 de Atlas COMPLETO, no por base: se reparte entre todos los
// talleres más la de control y la demo. Por eso el panel suma todo junto.
const LIMITE_BASE_MB = Number(process.env.LIMITE_BASE_MB || 512);
// 10 GB es el plan gratuito de Cloudflare R2, también para el bucket entero.
const LIMITE_ARCHIVOS_GB = Number(process.env.LIMITE_ARCHIVOS_GB || 10);

// 'rompe' | 'cobra'. Ver arriba.
const alPasar = (valor) => (String(valor || '').trim().toLowerCase() === 'cobra' ? 'cobra' : 'rompe');
const AL_PASAR_BASE = alPasar(process.env.LIMITE_BASE_AL_PASAR);
const AL_PASAR_ARCHIVOS = alPasar(process.env.LIMITE_ARCHIVOS_AL_PASAR);

const MB = 1024 * 1024;
const GB = 1024 * MB;

// Para un tope que ROMPE: verde hasta el 70%, ámbar hasta el 90, rojo después. El ámbar en
// 90 y no en 95 porque entre que se nota y que se cambia de plan pasan días, y el bucket no
// espera.
//
// Para uno que COBRA: verde hasta el 100 y ámbar después. Antes de cruzarlo no pasa nada,
// así que avisar al 70% sería ruido; y cruzarlo tampoco es una emergencia, así que nunca
// llega a rojo.
function nivel(porcentaje, queHace = 'rompe') {
    if (queHace === 'cobra') return porcentaje >= 100 ? 'tibio' : 'ok';
    if (porcentaje >= 90) return 'mal';
    if (porcentaje >= 70) return 'tibio';
    return 'ok';
}

// `tope` en bytes, o 0 para "sin techo configurado" — ahí se informa el uso y nada más, en
// vez de inventar un porcentaje contra un número que nadie puso.
function uso(bytes, tope, queHace = 'rompe') {
    const usado = Math.max(0, Number(bytes) || 0);
    if (!tope) return { bytes: usado, tope: 0, porcentaje: null, nivel: 'ok', alPasar: queHace };
    const porcentaje = Math.round((usado / tope) * 1000) / 10;
    return { bytes: usado, tope, porcentaje, nivel: nivel(porcentaje, queHace), alPasar: queHace };
}

function topeDeBases() {
    return LIMITE_BASE_MB > 0 ? LIMITE_BASE_MB * MB : 0;
}

function topeDeArchivos() {
    return LIMITE_ARCHIVOS_GB > 0 ? LIMITE_ARCHIVOS_GB * GB : 0;
}

module.exports = {
    uso, nivel, topeDeBases, topeDeArchivos,
    AL_PASAR_BASE, AL_PASAR_ARCHIVOS,
    LIMITE_BASE_MB, LIMITE_ARCHIVOS_GB, MB, GB,
};
