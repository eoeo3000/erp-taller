// @vitest-environment jsdom
//
// En qué base trabaja esta pestaña. Las tres reglas nacen del mismo incidente: un navegador
// había quedado en modo demostración, la base de demostración no tiene cuentas de
// escritorio, y la app terminó diciéndole «todavía no hay ninguna cuenta» a un taller que
// llevaba meses operando — ofreciéndole crear un administrador. Visto en producción.
import { test, expect, beforeEach, vi } from 'vitest';

// El módulo hace su trabajo AL IMPORTARSE (lee la pista del link, borra la marca vieja), así
// que cada caso lo carga de nuevo con el estado que quiere probar.
// Las rutas van relativas: jsdom sirve en su propio origen y un `replaceState` a otro
// lanza SecurityError, que no tiene nada que ver con lo que se está probando.
async function cargarCon({ url = '/', local = {}, sesion = {} } = {}) {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(sesion)) sessionStorage.setItem(k, v);
    window.history.replaceState({}, '', url);
    return import('./entorno.js');
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

test('por omisión se trabaja en producción', async () => {
    const { obtenerEntorno } = await cargarCon();
    expect(obtenerEntorno()).toBe('produccion');
});

test('a la demo se entra por el link, y queda SOLO en esta pestaña', async () => {
    // sessionStorage y no localStorage: localStorage es del ORIGEN, así que elegir la demo
    // una vez dejaba al navegador entero en demo —todas las pestañas, y al día siguiente
    // también—. Es la misma trampa que ya costó caro con la pista del taller.
    const { obtenerEntorno } = await cargarCon({ url: '/?entorno=demo' });
    expect(obtenerEntorno()).toBe('demo');
    expect(sessionStorage.getItem('erpTaller.entorno')).toBe('demo');
    expect(localStorage.getItem('erpTaller.entorno')).toBeNull();
});

test('la pista se borra de la barra de direcciones y conserva el taller', async () => {
    // Si quedara en la URL, recargar o compartir el link volvería a meter a esa pestaña en
    // la demo sin pedirlo. `?taller=` es ruteo y hay que recordarlo.
    await cargarCon({ url: '/dashboard?taller=rivas&entorno=demo' });
    expect(window.location.search).toBe('?taller=rivas');
    expect(window.location.pathname).toBe('/dashboard');
});

test('un navegador que quedó en demo ANTES de este cambio se libera solo', async () => {
    // La marca vieja vivía en localStorage y el selector que permitía salir ya no existe.
    // Sin esta limpieza, ese navegador abriría la base de demostración para siempre.
    const { obtenerEntorno } = await cargarCon({ local: { 'erpTaller.entorno': 'demo' } });
    expect(obtenerEntorno()).toBe('produccion');
    expect(localStorage.getItem('erpTaller.entorno')).toBeNull();
});

test('volver a producción borra la marca, no la deja en otro valor', async () => {
    const { fijarEntorno, obtenerEntorno } = await cargarCon({ url: '/?entorno=demo' });
    fijarEntorno('produccion');
    expect(obtenerEntorno()).toBe('produccion');
    expect(sessionStorage.getItem('erpTaller.entorno')).toBeNull();
});

test('cualquier otro valor en el link NO entra a la demo', async () => {
    // Solo la palabra exacta. Un `?entorno=prod` mal escrito no puede caer en demo.
    for (const valor of ['demostracion', 'DEMO', 'produccion', '1', '']) {
        const { obtenerEntorno } = await cargarCon({ url: `/?entorno=${valor}` });
        expect(obtenerEntorno(), `entorno=${valor}`).toBe('produccion');
    }
});

test('la cabecera que viaja dice lo mismo que obtenerEntorno', async () => {
    const { headerEntorno } = await cargarCon({ url: '/?entorno=demo' });
    expect(headerEntorno()).toEqual({ 'X-Entorno': 'demo' });
});
