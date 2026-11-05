// node --test reloj-cloudflare/   (sin dependencias)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import trabajador, { respaldar, esReintentable } from './worker.js';

const ENV = { RESPALDO_URL: 'https://backend.example/api/respaldos', RESPALDO_TOKEN: 'token-de-prueba' };

function respuesta(status, cuerpo = {}) {
  return { status, json: async () => cuerpo };
}

// Un fetch de mentira que contesta lo que se le pida, en orden, y anota cada pedido.
function traerFalso(...respuestas) {
  const pedidos = [];
  const traer = async (url, opciones) => {
    pedidos.push({ url, opciones });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  return { traer, pedidos };
}

const sinEsperar = async () => {};

// El código registra por consola; node --test habla con sus hijos por stdout y un
// console.log suelto le puede corromper el protocolo (ver CLAUDE.md). Se calla mientras corre.
async function callado(fn) {
  const original = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = original; }
}

test('pide el respaldo con el token en la cabecera, por POST, y resume la respuesta', async () => {
  const { traer, pedidos } = traerFalso(respuesta(201, { documentos: 1234, talleres: [{}, {}, {}] }));
  const resumen = await callado(() => respaldar(ENV, { traer, esperar: sinEsperar }));
  assert.equal(resumen, '1234 documentos de 3 taller(es)');
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, ENV.RESPALDO_URL);
  assert.equal(pedidos[0].opciones.method, 'POST');
  assert.equal(pedidos[0].opciones.headers['X-Respaldo-Token'], ENV.RESPALDO_TOKEN);
  assert.ok(pedidos[0].opciones.signal, 'sin corte por tiempo, un backend colgado se come los 15 minutos del trigger');
});

test('el token no viaja en la dirección', async () => {
  const { traer, pedidos } = traerFalso(respuesta(201));
  await callado(() => respaldar(ENV, { traer, esperar: sinEsperar }));
  assert.ok(!pedidos[0].url.includes(ENV.RESPALDO_TOKEN));
});

test('sin las variables falla con un mensaje que dice cuáles, sin llamar a nadie', async () => {
  const { traer, pedidos } = traerFalso();
  await assert.rejects(respaldar({}, { traer }), /RESPALDO_URL o RESPALDO_TOKEN/);
  assert.equal(pedidos.length, 0);
});

test('un 500 con talleres fallados NO se reintenta: respaldaría dos veces los que sí salieron', async () => {
  const { traer, pedidos } = traerFalso(
    respuesta(500, { error: 'No se pudo respaldar: rivas (base caída)' }),
    respuesta(201),
  );
  await assert.rejects(respaldar(ENV, { traer, esperar: sinEsperar }), /HTTP 500.*rivas \(base caída\)/);
  assert.equal(pedidos.length, 1);
});

test('un 401 o un 503 no se reintentan: son configuración, no mala suerte', async () => {
  for (const estado of [401, 503]) {
    const { traer, pedidos } = traerFalso(respuesta(estado, { error: 'x' }), respuesta(201));
    await assert.rejects(respaldar(ENV, { traer, esperar: sinEsperar }), new RegExp(`HTTP ${estado}`));
    assert.equal(pedidos.length, 1, `HTTP ${estado}`);
  }
});

test('sin respuesta o con 502/504 reintenta una vez, y si la segunda sale, todo bien', async () => {
  for (const primera of [new TypeError('fetch failed'), respuesta(502), respuesta(504)]) {
    const { traer, pedidos } = traerFalso(primera, respuesta(201, { documentos: 5, talleres: [{}] }));
    const resumen = await callado(() => respaldar(ENV, { traer, esperar: sinEsperar }));
    assert.equal(resumen, '5 documentos de 1 taller(es)');
    assert.equal(pedidos.length, 2);
  }
});

test('reintenta UNA sola vez: dos fallas seguidas terminan en error', async () => {
  const { traer, pedidos } = traerFalso(respuesta(502), respuesta(502), respuesta(201));
  await assert.rejects(callado(() => respaldar(ENV, { traer, esperar: sinEsperar })), /HTTP 502/);
  assert.equal(pedidos.length, 2);
});

test('un corte por tiempo no se reintenta (ya gastó los 14 minutos) y lo dice en palabras', async () => {
  const corte = new DOMException('signal timed out', 'TimeoutError');
  assert.equal(esReintentable(corte), false);
  const { traer, pedidos } = traerFalso(corte, respuesta(201));
  await assert.rejects(respaldar(ENV, { traer, esperar: sinEsperar }), /no respondió en 14 minutos/);
  assert.equal(pedidos.length, 1);
});

test('el error no deja pasar el token aunque el backend lo devolviera', async () => {
  const { traer } = traerFalso(respuesta(500, { error: 'algo' }));
  const error = await respaldar(ENV, { traer, esperar: sinEsperar }).catch((e) => e);
  assert.ok(!error.message.includes(ENV.RESPALDO_TOKEN));
});

test('la dirección pública del Worker no dispara nada', async () => {
  const r = await trabajador.fetch(new Request('https://erp-taller-reloj.x.workers.dev/'), ENV);
  assert.equal(r.status, 404);
});

test('scheduled entrega la promesa a waitUntil, así un error marca la ejecución como fallida', async () => {
  let entregada;
  const original = globalThis.fetch;
  globalThis.fetch = async () => respuesta(201, { documentos: 1, talleres: [{}] });
  try {
    await trabajador.scheduled({}, ENV, { waitUntil: (p) => { entregada = p; } });
    assert.ok(entregada instanceof Promise);
    await callado(() => entregada);
  } finally {
    globalThis.fetch = original;
  }
});

test('wrangler.toml no trae secretos y apunta a las 08:00 UTC', () => {
  const toml = fs.readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /crons = \["0 8 \* \* \*"\]/);
  assert.doesNotMatch(toml, /^\s*RESPALDO_(URL|TOKEN)\s*=/m);
});
