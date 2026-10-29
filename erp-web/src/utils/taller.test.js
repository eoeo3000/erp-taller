// A qué taller apunta este navegador.
//
// Lo que esto cuida es el callejón sin salida que se vio en producción: quien administra
// varios clientes abre el enlace de uno, el navegador queda apuntando ahí, y al volver a
// entrar al suyo el backend responde «Correo o clave incorrectos» con la clave correcta —
// porque la busca en la base equivocada.
import { beforeEach, describe, expect, test, vi } from 'vitest';

// vitest corre en node, donde no hay localStorage. Un doble mínimo, más el que se niega a
// guardar: eso es una ventana privada, y ahí nada de esto puede lanzar.
// El módulo lee `?taller=` al importarse, así que necesita una ventana. `busqueda` es lo que
// trae el link: así se puede probar también que un link con `?taller=` pisa lo guardado, que
// es el camino por el que este navegador termina apuntando al cliente equivocado.
function instalarVentana(busqueda = '') {
    globalThis.window = { location: { search: busqueda } };
}

function instalarAlmacenamiento({ rompe = false } = {}) {
    const datos = new Map();
    globalThis.localStorage = {
        getItem: (k) => { if (rompe) throw new Error('bloqueado'); return datos.has(k) ? datos.get(k) : null; },
        setItem: (k, v) => { if (rompe) throw new Error('bloqueado'); datos.set(k, String(v)); },
        removeItem: (k) => { if (rompe) throw new Error('bloqueado'); datos.delete(k); },
    };
    return datos;
}

// axios solo se usa para dejar la cabecera por omisión.
vi.mock('axios', () => ({ default: { defaults: { headers: { common: {} } } } }));

let axios, fijarTaller, obtenerTaller, olvidarTaller, headerTaller;

beforeEach(async () => {
    instalarVentana();
    instalarAlmacenamiento();
    vi.resetModules();
    axios = (await import('axios')).default;
    axios.defaults.headers.common = {};
    ({ fijarTaller, obtenerTaller, olvidarTaller, headerTaller } = await import('./taller'));
});

describe('la pista del taller', () => {
    test('se guarda normalizada y viaja en la cabecera', () => {
        // El slug sale de un link escrito por una persona: mayúsculas y espacios son normales.
        expect(fijarTaller('  Taller-Lopez  ')).toBe('taller-lopez');
        expect(obtenerTaller()).toBe('taller-lopez');
        expect(axios.defaults.headers.common['X-Taller']).toBe('taller-lopez');
        expect(headerTaller()).toEqual({ 'X-Taller': 'taller-lopez' });
    });

    test('olvidarla deja el navegador como recién estrenado', () => {
        // La salida del callejón: sin esto, quien visitó el enlace de un cliente no puede
        // volver a entrar al suyo desde ese navegador, y no hay nada en pantalla que lo diga.
        fijarTaller('taller-lopez');
        olvidarTaller();
        expect(obtenerTaller()).toBe('');
        expect(axios.defaults.headers.common['X-Taller']).toBeUndefined();
        expect(headerTaller()).toEqual({});
    });

    test('un valor vacío no pisa el que ya estaba', () => {
        // `?taller=` vacío en un link mal armado no puede borrar la memoria de alguien que
        // ya entraba bien.
        fijarTaller('taller-lopez');
        expect(fijarTaller('   ')).toBe('');
        expect(obtenerTaller()).toBe('taller-lopez');
    });

    test('abrir el enlace de otro cliente deja este navegador apuntando ahí', async () => {
        // El camino exacto por el que pasa lo que se vio: quien administra abre el link de un
        // cliente, y desde entonces su propio correo se busca en la base de ese cliente.
        fijarTaller('mi-taller');
        instalarVentana('?taller=taller-lopez');
        vi.resetModules();
        const m = await import('./taller');
        expect(m.obtenerTaller()).toBe('taller-lopez');
        // Y la salida: olvidarlo devuelve el navegador al taller por defecto.
        m.olvidarTaller();
        expect(m.obtenerTaller()).toBe('');
    });

    test('sin almacenamiento no lanza: la app entra igual, al taller por defecto', async () => {
        // Ventana privada o almacenamiento bloqueado. Esto se importa al arrancar el SPA, así
        // que si lanzara no se vería la app, se vería una pantalla en blanco.
        instalarAlmacenamiento({ rompe: true });
        vi.resetModules();
        const m = await import('./taller');
        expect(m.obtenerTaller()).toBe('');
        expect(() => m.fijarTaller('taller-lopez')).not.toThrow();
        expect(() => m.olvidarTaller()).not.toThrow();
    });
});
