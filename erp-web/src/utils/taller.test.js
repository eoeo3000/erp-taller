// A qué taller apunta este navegador.
//
// Lo que esto cuida es lo que pasó en producción: quien administra varios clientes apretaba
// «Abrir» en el panel para mirar la puerta de uno, y desde entonces su clave correcta fallaba
// con «Correo o clave incorrectos» — porque su correo se buscaba en la base de ese cliente.
// localStorage es del ORIGEN, no de la pestaña, así que visitar a sus clientes lo dejaba
// afuera de lo suyo, en todas las pestañas y al día siguiente también.
import { beforeEach, describe, expect, test, vi } from 'vitest';

// El módulo lee `?taller=` al importarse, así que necesita una ventana.
function instalarVentana(busqueda = '') {
    globalThis.window = { location: { search: busqueda } };
}

// vitest corre en node, donde no hay almacenamiento. Dobles mínimos, más el que se niega a
// guardar: eso es una ventana privada, y ahí nada de esto puede lanzar.
function instalarAlmacenamiento({ rompe = false } = {}) {
    const hacer = () => {
        const datos = new Map();
        return {
            getItem: (k) => { if (rompe) throw new Error('bloqueado'); return datos.has(k) ? datos.get(k) : null; },
            setItem: (k, v) => { if (rompe) throw new Error('bloqueado'); datos.set(k, String(v)); },
            removeItem: (k) => { if (rompe) throw new Error('bloqueado'); datos.delete(k); },
        };
    };
    globalThis.localStorage = hacer();
    globalThis.sessionStorage = hacer();
}

// Cerrar la pestaña y abrir otra: se va sessionStorage, queda localStorage.
function pestanaNueva() {
    const hacer = () => {
        const datos = new Map();
        return {
            getItem: (k) => (datos.has(k) ? datos.get(k) : null),
            setItem: (k, v) => datos.set(k, String(v)),
            removeItem: (k) => datos.delete(k),
        };
    };
    globalThis.sessionStorage = hacer();
}

vi.mock('axios', () => ({ default: { defaults: { headers: { common: {} } } } }));

let axios, m;

async function cargarModulo() {
    vi.resetModules();
    axios = (await import('axios')).default;
    axios.defaults.headers.common = {};
    m = await import('./taller');
    return m;
}

beforeEach(async () => {
    instalarVentana();
    instalarAlmacenamiento();
    await cargarModulo();
});

describe('la pista del taller', () => {
    test('se guarda normalizada y viaja en la cabecera', () => {
        // El slug sale de un link escrito por una persona: mayúsculas y espacios son normales.
        expect(m.fijarTaller('  Taller-Lopez  ')).toBe('taller-lopez');
        expect(m.obtenerTaller()).toBe('taller-lopez');
        expect(axios.defaults.headers.common['X-Taller']).toBe('taller-lopez');
        expect(m.headerTaller()).toEqual({ 'X-Taller': 'taller-lopez' });
    });

    test('un valor vacío no pisa el que ya estaba', () => {
        // Un `?taller=` vacío en un link mal armado no puede borrar la memoria de alguien que
        // ya entraba bien.
        m.fijarTaller('taller-lopez');
        expect(m.fijarTaller('   ')).toBe('');
        expect(m.obtenerTaller()).toBe('taller-lopez');
    });

    test('olvidarla borra LAS DOS memorias', () => {
        // Si quedara una viva, el botón «Entrar a otro taller» parecería no hacer nada.
        m.fijarTaller('cliente-visitado');
        m.fijarTaller('mi-taller', { durable: true });
        m.fijarTaller('cliente-visitado');
        m.olvidarTaller();
        expect(m.obtenerTaller()).toBe('');
        expect(axios.defaults.headers.common['X-Taller']).toBeUndefined();
    });

    test('sin almacenamiento no lanza: la app entra igual, al taller por defecto', async () => {
        // Ventana privada. Esto se importa al arrancar el SPA: si lanzara, lo que se vería no
        // sería un aviso sino una pantalla en blanco.
        instalarAlmacenamiento({ rompe: true });
        await cargarModulo();
        expect(m.obtenerTaller()).toBe('');
        expect(() => m.fijarTaller('taller-lopez')).not.toThrow();
        expect(() => m.fijarTaller('x', { durable: true })).not.toThrow();
        expect(() => m.olvidarTaller()).not.toThrow();
    });
});

describe('visitar al cliente de otro no deja a nadie afuera de lo suyo', () => {
    test('la pista de un link vale SOLO para esa pestaña', async () => {
        // El caso exacto: entró a lo suyo (durable), después apretó «Abrir» en el panel para
        // mirar la puerta de un cliente. Esa pestaña apunta al cliente; al volver a la suya
        // —o al día siguiente— tiene que seguir siendo el suyo.
        m.fijarTaller('mi-taller', { durable: true });

        instalarVentana('?taller=cliente-ajeno');
        await cargarModulo();
        expect(m.obtenerTaller()).toBe('cliente-ajeno');

        pestanaNueva();
        instalarVentana();
        await cargarModulo();
        expect(m.obtenerTaller()).toBe('mi-taller');
    });

    test('solo ENTRAR escribe la memoria durable', async () => {
        // La regla que hace que lo de arriba se sostenga. Un link no puede dejar este
        // computador apuntando a otro cliente para siempre; el prefijo del token sí, porque
        // ahí ya se sabe de quién es esta persona.
        m.fijarTaller('cliente-ajeno');
        pestanaNueva();
        instalarVentana();
        await cargarModulo();
        expect(m.obtenerTaller()).toBe('');
    });

    test('entrar pisa la pista de la pestaña: el token manda sobre el link', async () => {
        m.fijarTaller('cliente-ajeno');
        m.fijarTaller('mi-taller', { durable: true });
        expect(m.obtenerTaller()).toBe('mi-taller');
    });
});
