// Reloj del respaldo diario: un Cron Trigger de Cloudflare Workers que llama a
// POST /api/respaldos a la hora. Ver README.md de esta carpeta y docs/respaldos.md.
//
// Existe porque GitHub Actions corre las tareas programadas de este repositorio entre 4,5
// y 10 horas tarde (el respaldo de las 08:00 UTC salía entre las 12:35 y las 18:08), así
// que el «respaldo de madrugada» se tomaba en plena jornada. Un Cron Trigger corre a la
// hora. GitHub no se jubila: pasa a VIGILAR que este respaldo haya salido (respaldo.yml),
// porque un atraso de horas no le importa a una revisión, y es quien manda un correo si
// algo falla — un Worker que falla no avisa a nadie.
//
// Sin dependencias y sin build: se pega tal cual en el editor del panel de Cloudflare.

// Un Cron Trigger puede durar hasta 15 minutos. Se deja uno de margen para que el corte
// lo haga este código, con un mensaje que diga qué pasó, y no Cloudflare.
export const ESPERA_MAXIMA_MS = 14 * 60 * 1000;
export const PAUSA_ENTRE_INTENTOS_MS = 30 * 1000;

// Solo se reintenta cuando el pedido NO llegó a hacerse: sin respuesta o con un error del
// proxy de Render (502/504, el servicio reiniciando). El 503 no, porque es también lo que
// el backend responde cuando le falta RESPALDO_TOKEN, y eso no se arregla esperando. Un 500 del backend es otra cosa:
// significa que respaldó algunos talleres y otros no, y repetir el pedido volvería a
// respaldar los que ya salieron — gastando dos lugares de los 30 que se conservan de cada
// uno. Un 401 o un 503 de «falta RESPALDO_TOKEN» tampoco se arreglan reintentando.
const REINTENTABLES = new Set([502, 504]);

export function esReintentable(error, estado) {
  if (error) return error.name !== 'TimeoutError';  // un corte por tiempo ya gastó los 14 minutos
  return REINTENTABLES.has(estado);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function respaldar(env, { traer = fetch, esperar = dormir } = {}) {
  if (!env.RESPALDO_URL || !env.RESPALDO_TOKEN) {
    throw new Error('Faltan RESPALDO_URL o RESPALDO_TOKEN en las variables del Worker.');
  }

  for (let intento = 1; intento <= 2; intento++) {
    let resp, error;
    try {
      resp = await traer(env.RESPALDO_URL, {
        method: 'POST',
        headers: { 'X-Respaldo-Token': env.RESPALDO_TOKEN },
        signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
      });
    } catch (e) {
      error = e;
    }

    if (resp && resp.status === 201) {
      const cuerpo = await resp.json().catch(() => ({}));
      const talleres = Array.isArray(cuerpo.talleres) ? cuerpo.talleres.length : '?';
      const resumen = `${cuerpo.documentos ?? '?'} documentos de ${talleres} taller(es)`;
      console.log(`[reloj] respaldo creado: ${resumen}`);
      return resumen;
    }

    const estado = resp?.status;
    if (intento === 1 && esReintentable(error, estado)) {
      console.log(`[reloj] intento 1 sin éxito (${error ? error.message : `HTTP ${estado}`}); reintento en 30 s`);
      await esperar(PAUSA_ENTRE_INTENTOS_MS);
      continue;
    }

    if (error) {
      throw new Error(error.name === 'TimeoutError'
        ? 'El backend no respondió en 14 minutos. Revisa los logs en Render.'
        : `No hubo respuesta del backend: ${error.message}`);
    }
    // Lo que importa del cuerpo es `error`, que nombra los talleres que fallaron. El token
    // nunca vuelve en la respuesta: lo garantiza test/respaldoEndpoint.test.js del backend.
    const cuerpo = await resp.json().catch(() => ({}));
    throw new Error(`El respaldo falló (HTTP ${estado}): ${cuerpo.error || 'sin detalle'}`);
  }
}

export default {
  // Lanzar acá es lo que hace que Cloudflare marque la ejecución como fallida en
  // «Cron Events». No se atrapa a propósito.
  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(respaldar(env));
  },

  // El Worker queda con una dirección pública (*.workers.dev). Responder ahí con un
  // respaldo convertiría esa dirección en un botón que cualquiera puede apretar, con el
  // token que el Worker guarda. Por eso no hace nada.
  async fetch() {
    return new Response('No hay nada acá.', { status: 404 });
  },
};
