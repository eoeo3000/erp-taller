// Cuándo la app de terreno echa a alguien, y cuándo NO.
//
// Nace de un caso real: se borraron los `Usuario` de un taller y la app de un supervisor
// aterrizó en «Mi día» —la pantalla de operario— mostrando «Sin asignaciones para hoy». Ni
// una palabra de que su acceso ya no existía. El `catch` de `whoami()` estaba vacío, así que
// `persona` quedaba en null y el ternario que elige la pantalla caía a su valor por omisión.
//
// Pero el arreglo obvio —«si whoami falla, a la pantalla de sin acceso»— sería PEOR que el
// problema: esta app vive en el teléfono de alguien que está en terreno, con cola de
// reintento y service worker porque se da por hecho que va a quedarse sin señal. Echarlo
// cada vez que una llamada no sale lo dejaría sin poder trabajar justo cuando menos puede
// hacer algo al respecto.
//
// De ahí que esta decisión sea una función con nombre y con pruebas, y no una condición
// suelta dentro de un catch.
import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import { tokenRechazado } from './api.js';

function errorHttp(estado) {
    const e = new Error(`Error ${estado}`);
    e.estado = estado;
    return e;
}

test('el servidor dice que el token no sirve: 403 de whoami', () => {
    // `usuarioController.whoami` responde 403 «Token inválido o revocado» cuando
    // `resolverUsuarioPorToken` no encuentra a nadie — token borrado, revocado, o de otro
    // taller.
    expect(tokenRechazado(errorHttp(403))).toBe(true);
});

test('o 401, que es lo que devuelve el gate de identidad', () => {
    expect(tokenRechazado(errorHttp(401))).toBe(true);
});

test('SIN SEÑAL no echa a nadie', () => {
    // `fetch` lanza un TypeError sin `estado` cuando no hay conexión. Un supervisor en
    // terreno sin señal tiene un token perfectamente válido: si esto diera true, la app lo
    // sacaría en medio de un trabajo. Es la prueba que de verdad importa de este archivo.
    expect(tokenRechazado(new TypeError('Failed to fetch'))).toBe(false);
});

test('un servidor caído tampoco: es un problema suyo, no de quién eres', () => {
    for (const estado of [500, 502, 503, 504]) {
        expect(tokenRechazado(errorHttp(estado)), `${estado}`).toBe(false);
    }
});

test('un 404 o un 400 no son un rechazo de identidad', () => {
    // Una ruta mal escrita o un cuerpo inválido no dicen nada sobre la credencial.
    expect(tokenRechazado(errorHttp(404))).toBe(false);
    expect(tokenRechazado(errorHttp(400))).toBe(false);
});

test('no se cae con lo que sea que le llegue', () => {
    // El catch de App.jsx le pasa lo que haya lanzado la promesa, y eso puede ser cualquier
    // cosa. Si esta función lanzara, el error se comería la carga de la app entera.
    for (const cosa of [undefined, null, 'un texto', 0, {}, new Error('pelado')]) {
        expect(tokenRechazado(cosa)).toBe(false);
    }
});

// --- Que el estado llegue de verdad hasta acá ---
//
// Lo de arriba arma el error a mano, así que probaba `tokenRechazado` y NO que `pedir`
// adjunte el código. Se vio al verificar la guarda en rojo: borrando `error.estado =
// resp.status` las seis pruebas seguían verdes, o sea que en producción `tokenRechazado`
// no se dispararía nunca y nadie se enteraría. Esto cierra esa punta llamando a `whoami()`
// de verdad contra un `fetch` sustituido.

function conFetch(respuesta) {
    const anterior = { fetch: globalThis.fetch, localStorage: globalThis.localStorage };
    globalThis.fetch = async () => respuesta;
    globalThis.localStorage = { getItem: () => 'token-de-mentira', setItem: () => {} };
    return () => Object.assign(globalThis, anterior);
}

test('un 403 del servidor llega al catch CON su código', async () => {
    const restaurar = conFetch({
        ok: false, status: 403,
        json: async () => ({ error: 'Token inválido o revocado' }),
    });
    try {
        const { whoami } = await import('./api.js');
        const error = await whoami().then(() => null, (e) => e);
        expect(error, 'whoami tenía que fallar').toBeTruthy();
        expect(error.estado).toBe(403);
        expect(tokenRechazado(error)).toBe(true);
    } finally { restaurar(); }
});

test('una respuesta buena no lanza', async () => {
    const restaurar = conFetch({
        ok: true, status: 200,
        json: async () => ({ nombre: 'Supervisor', rol: 'supervisor' }),
    });
    try {
        const { whoami } = await import('./api.js');
        expect((await whoami()).rol).toBe('supervisor');
    } finally { restaurar(); }
});

test('el catch de whoami NO vuelve a quedar vacío', () => {
    // Lo que regresó una vez puede regresar otra vez, y es una línea. `tokenRechazado` puede
    // estar perfecta y no servir de nada si App.jsx no la llama: eso es exactamente lo que
    // pasaba antes —`.catch(() => {})`— y el síntoma era un supervisor aterrizando en la
    // pantalla de operario sin que nada lo explicara.
    //
    // Esto mira el código fuente porque probar el cableado de React pediría montar la app
    // entera en un DOM, y lo que hay que fijar es una sola cosa: que ese catch decida algo.
    const fuente = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
    // Anclado en `.then(setPersona)` y no en `whoami()`: lo segundo aparece antes dentro
    // de un comentario, y la prueba se ponía roja por eso en vez de por lo que mira.
    const trozo = fuente.match(/\.then\(setPersona\)[\s\S]{0,250}?;/)?.[0] || '';
    expect(trozo).toMatch(/tokenRechazado/);
    expect(trozo).toMatch(/sin-acceso/);
    expect(trozo).not.toMatch(/catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
});
