// El guion del modo guía, contra el código de verdad.
//
// Lo que esto cuida es el único modo en que una guía falla de forma vergonzosa: alguien
// renombra o borra un elemento, el paso se queda apuntando a nada, y eso se descubre recién
// mientras se le está mostrando el sistema a un cliente. Acá se descubre en CI.
import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASOS, ANCLAS } from './pasos';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function archivosJsx(dir = SRC, acc = []) {
    for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) archivosJsx(ruta, acc);
        else if (nombre.endsWith('.jsx')) acc.push(ruta);
    }
    return acc;
}

// El motor queda afuera del barrido a propósito: `Guia.jsx` arma su selector con
// `[data-guia="${ancla}"]`, y un barrido ingenuo lee eso como un ancla llamada `${ancla}`.
// Las anclas de verdad viven en las pantallas y en App.jsx, nunca acá adentro.
const FUENTES = archivosJsx()
    .filter((ruta) => !ruta.includes(`${sep}guia${sep}`))
    .map((ruta) => ({ ruta, texto: readFileSync(ruta, 'utf8') }));
const APP = FUENTES.find((f) => f.ruta.endsWith('App.jsx')).texto;

describe('el guion', () => {
    test('cada paso está completo y su id no se repite', () => {
        for (const paso of PASOS) {
            expect(paso.id, 'un paso sin id no se puede referenciar').toBeTruthy();
            expect(paso.titulo, `${paso.id} sin título`).toBeTruthy();
            expect(paso.texto.length, `${paso.id}: el texto tiene que explicar algo`).toBeGreaterThan(40);
            expect(paso.ruta.startsWith('/'), `${paso.id}: la ruta tiene que ser absoluta`).toBe(true);
        }
        expect(new Set(PASOS.map((p) => p.id)).size).toBe(PASOS.length);
    });

    test('la guía SEÑALA y no toca: ningún paso puede traer código que corra', () => {
        // La regla que permite correr esto sobre la base real de un taller que está
        // trabajando. Si alguien agrega un `alEntrar: () => aprobarOT(...)` para que la demo
        // se vea más viva, esto se pone rojo y lo obliga a decidirlo a propósito.
        const PERMITIDAS = new Set(['id', 'ruta', 'ancla', 'titulo', 'texto']);
        for (const paso of PASOS) {
            for (const clave of Object.keys(paso)) {
                expect(PERMITIDAS.has(clave), `${paso.id}: clave no permitida "${clave}"`).toBe(true);
                expect(typeof paso[clave], `${paso.id}.${clave} tiene que ser texto`).toBe('string');
            }
        }
    });

    test('cada paso lleva a una ruta que el router monta de verdad', () => {
        // Una ruta mal escrita manda a la pantalla de "no encontrado" en medio del recorrido.
        const montadas = new Set([...APP.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]));
        for (const paso of PASOS) {
            expect(montadas.has(paso.ruta), `${paso.id}: la ruta "${paso.ruta}" no está en el router`).toBe(true);
        }
    });
});

describe('las anclas', () => {
    test('cada una existe en el código, y una sola vez', () => {
        // Dos elementos con el mismo `data-guia` harían que el foco caiga en el primero que
        // encuentre el navegador, que no tiene por qué ser el que el paso quiere mostrar.
        for (const ancla of ANCLAS) {
            const veces = FUENTES.reduce(
                (n, f) => n + f.texto.split(`data-guia="${ancla}"`).length - 1, 0,
            );
            expect(veces, `el ancla "${ancla}" aparece ${veces} veces en el código`).toBe(1);
        }
    });

    test('no quedan anclas huérfanas: todo data-guia del código lo usa algún paso', () => {
        // Al revés que la anterior. Un `data-guia` que ya nadie usa es basura que el próximo
        // que lea la pantalla va a creer que está viva.
        const enElCodigo = new Set(
            FUENTES.flatMap((f) => [...f.texto.matchAll(/data-guia="([^"]+)"/g)].map((m) => m[1])),
        );
        for (const ancla of enElCodigo) {
            expect(ANCLAS.includes(ancla), `"${ancla}" está en el código pero ningún paso lo usa`).toBe(true);
        }
    });
});
