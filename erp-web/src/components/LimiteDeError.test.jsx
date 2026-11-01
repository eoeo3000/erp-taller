// @vitest-environment jsdom
//
// Un límite de error que no se prueba es exactamente la clase de cosa que no funciona el día
// que hace falta: envuelto al nivel equivocado, o dejado en estado de error para siempre.
// Por eso acá se renderiza de verdad (jsdom) y se hace reventar un componente a propósito.
//
// El entorno va por archivo y no en vite.config.js: las otras tres pruebas de erp-web son de
// lógica pura y corren más rápido en 'node'.
import { test, expect, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import LimiteDePantalla from './LimiteDeError';

// React imprime el error por consola aunque el límite lo atrape — es su comportamiento, no
// un fallo. Se tapa para que la salida de la prueba diga solo lo que la prueba verifica.
function sinRuido(fn) {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { return fn(); } finally { espia.mockRestore(); }
}

let contenedor = null;
let raiz = null;

function montar(elemento) {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    raiz = createRoot(contenedor);
    sinRuido(() => act(() => { raiz.render(<StrictMode>{elemento}</StrictMode>); }));
    return contenedor;
}

afterEach(() => {
    if (raiz) sinRuido(() => act(() => raiz.unmount()));
    contenedor?.remove();
    raiz = null; contenedor = null;
});

function Revienta() {
    throw new Error('no se pudo leer length de undefined');
}

test('una pantalla que revienta no deja la página en blanco', () => {
    // El caso real: TableroSupervisoresScreen hacía `datos.supervisores.length` sin guarda y
    // React desmontaba el árbol entero. Lo que se veía era una página vacía, sin una sola
    // palabra de qué pasó.
    const dom = montar(
        <MemoryRouter initialEntries={['/tablero-supervisores']}>
            <LimiteDePantalla><Revienta /></LimiteDePantalla>
        </MemoryRouter>,
    );
    expect(dom.textContent).toContain('Esta pantalla no se pudo mostrar');
    expect(dom.textContent.trim().length).toBeGreaterThan(0);
});

test('el mensaje del error se muestra, para poder pegarlo al pedir ayuda', () => {
    // Esto es el sistema interno de un taller, no una página pública: quien lo ve es quien va
    // a pedir ayuda, y el texto del error ahorra una ida y vuelta entera.
    const dom = montar(
        <MemoryRouter><LimiteDePantalla><Revienta /></LimiteDePantalla></MemoryRouter>,
    );
    expect(dom.textContent).toContain('no se pudo leer length de undefined');
});

test('una pantalla sana se dibuja igual que sin el límite', () => {
    const dom = montar(
        <MemoryRouter><LimiteDePantalla><div>Tablero de supervisores</div></LimiteDePantalla></MemoryRouter>,
    );
    expect(dom.textContent).toContain('Tablero de supervisores');
    expect(dom.textContent).not.toContain('no se pudo mostrar');
});

test('al cambiar de ruta el límite se repone solo', () => {
    // La parte que no es evidente y que decide si esto sirve: un límite de error de React NO
    // vuelve solo. Sin la `key` atada al pathname, apretar otra pantalla en el menú cambiaría
    // la URL y seguiría mostrando el error — se vería como que toda la app se rompió, que es
    // justo lo que esto viene a evitar.
    function Menu() {
        const navegar = useNavigate();
        return <button type="button" onClick={() => navegar('/sana')}>ir</button>;
    }
    const dom = montar(
        <MemoryRouter initialEntries={['/rota']}>
            <Menu />
            <LimiteDePantalla>
                <Routes>
                    <Route path="/rota" element={<Revienta />} />
                    <Route path="/sana" element={<div>Pantalla sana</div>} />
                </Routes>
            </LimiteDePantalla>
        </MemoryRouter>,
    );
    expect(dom.textContent).toContain('Esta pantalla no se pudo mostrar');

    sinRuido(() => act(() => { dom.querySelector('button').click(); }));
    expect(dom.textContent).toContain('Pantalla sana');
    expect(dom.textContent).not.toContain('no se pudo mostrar');
});
