import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PASOS } from './pasos';

// El motor del modo guía: lleva el paso actual, navega a la pantalla que ese paso pide,
// mide el elemento anclado y dibuja el foco encima.
//
// --- Cómo se hace el foco ---
//
// Un solo div transparente del tamaño del elemento, con una sombra enorme:
// `box-shadow: 0 0 0 9999px rgba(0,0,0,.55)`. Eso oscurece TODO menos ese rectángulo, sin
// recortes SVG ni cuatro paneles que haya que calzar al pixel. El overlay además se come los
// clics, que es lo que hace que la guía señale sin que nadie toque nada por accidente.
//
// --- Lo que no es evidente ---
//
// Si el ancla no está en pantalla, el paso se muestra CENTRADO y sin foco, en vez de apuntar
// a una posición vieja o al origen. Pasa de verdad y no es un caso raro: una tabla vacía no
// tiene filas, y la pantalla de una orden de trabajo no existe hasta que hay una elegida. Un
// foco sobre el lugar equivocado le dice a quien mira que el sistema está roto.
const MARGEN_FOCO = 6;
const ANCHO_GLOBO = 320;
const SEPARACION = 14;

function medir(ancla) {
    if (!ancla) return null;
    const nodo = document.querySelector(`[data-guia="${ancla}"]`);
    if (!nodo) return null;
    const r = nodo.getBoundingClientRect();
    // Un elemento con tamaño cero (oculto, o todavía sin pintar) no se puede señalar.
    if (!r.width || !r.height) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height, nodo };
}

// Dónde cae el globo. Debajo si cabe, arriba si no, y centrado si no hay a qué apuntar.
// Se calcula contra la ventana —el overlay es `position: fixed`— y se mantiene adentro de
// los bordes, que es lo que evita el globo cortado en una pantalla chica.
function ubicarGlobo(foco, alto) {
    if (!foco) return { centrado: true };
    const { innerWidth: ancho, innerHeight: altoVentana } = window;
    const debajo = foco.top + foco.height + SEPARACION;
    const arriba = foco.top - SEPARACION - alto;
    const cabeDebajo = debajo + alto <= altoVentana - 10;
    const top = cabeDebajo ? debajo : Math.max(10, arriba);
    const left = Math.min(
        Math.max(10, foco.left + foco.width / 2 - ANCHO_GLOBO / 2),
        ancho - ANCHO_GLOBO - 10,
    );
    return { centrado: false, top, left };
}

export default function Guia({ abierta, onCerrar }) {
    const navegar = useNavigate();
    const [i, setI] = useState(0);
    const [foco, setFoco] = useState(null);
    const [altoGlobo, setAltoGlobo] = useState(180);
    const paso = PASOS[i];

    const cerrar = useCallback(() => { setI(0); onCerrar(); }, [onCerrar]);
    const avanzar = useCallback(() => {
        setI((n) => (n + 1 < PASOS.length ? n + 1 : n));
        if (i + 1 >= PASOS.length) cerrar();
    }, [i, cerrar]);
    const retroceder = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

    // La ruta del paso, antes de medir: medir sobre la pantalla anterior daría el rectángulo
    // de un elemento que está a punto de desaparecer.
    useEffect(() => {
        if (!abierta || !paso) return;
        if (window.location.pathname !== paso.ruta) navegar(paso.ruta);
    }, [abierta, paso, navegar]);

    // Medir después de pintar, y volver a medir cuando la ventana cambia. El `setTimeout` da
    // el respiro que necesita la pantalla nueva para montarse: sin él, el primer paso después
    // de navegar mide un elemento que todavía no existe y se muestra centrado sin motivo.
    useLayoutEffect(() => {
        if (!abierta || !paso) return undefined;
        let vivo = true;
        const actualizar = () => {
            if (!vivo) return;
            const m = medir(paso.ancla);
            if (m) m.nodo.scrollIntoView({ block: 'center', behavior: 'smooth' });
            setFoco(m ? { top: m.top, left: m.left, width: m.width, height: m.height } : null);
        };
        actualizar();
        const t = setTimeout(actualizar, 120);
        const t2 = setTimeout(actualizar, 420);   // después del scroll suave
        window.addEventListener('resize', actualizar);
        window.addEventListener('scroll', actualizar, true);
        return () => {
            vivo = false;
            clearTimeout(t); clearTimeout(t2);
            window.removeEventListener('resize', actualizar);
            window.removeEventListener('scroll', actualizar, true);
        };
    }, [abierta, paso]);

    useEffect(() => {
        if (!abierta) return undefined;
        const tecla = (e) => {
            if (e.key === 'Escape') cerrar();
            else if (e.key === 'ArrowRight' || e.key === 'Enter') avanzar();
            else if (e.key === 'ArrowLeft') retroceder();
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [abierta, avanzar, retroceder, cerrar]);

    if (!abierta || !paso) return null;

    const globo = ubicarGlobo(foco, altoGlobo);
    const estiloGlobo = globo.centrado
        ? { ...estilos.globo, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        : { ...estilos.globo, top: globo.top, left: globo.left };

    return (
        <div style={estilos.capa} onClick={(e) => e.stopPropagation()}>
            {foco && (
                <div style={{
                    ...estilos.foco,
                    top: foco.top - MARGEN_FOCO,
                    left: foco.left - MARGEN_FOCO,
                    width: foco.width + MARGEN_FOCO * 2,
                    height: foco.height + MARGEN_FOCO * 2,
                }} />
            )}
            {!foco && <div style={estilos.fondoPlano} />}

            <div style={estiloGlobo} ref={(n) => { if (n) setAltoGlobo(n.offsetHeight); }}>
                <div style={estilos.contador}>Paso {i + 1} de {PASOS.length}</div>
                <div style={estilos.titulo}>{paso.titulo}</div>
                <div style={estilos.texto}>{paso.texto}</div>
                <div style={estilos.botones}>
                    <button type="button" onClick={cerrar} style={estilos.btnSalir}>Salir</button>
                    <div style={estilos.botonesDerecha}>
                        {i > 0 && <button type="button" onClick={retroceder} style={estilos.btnSecundario}>Atrás</button>}
                        <button type="button" onClick={avanzar} style={estilos.btnPrimario}>
                            {i + 1 === PASOS.length ? 'Terminar' : 'Siguiente'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const estilos = {
    // Por encima de todo lo de la app y capturando los clics: la guía señala, no deja tocar.
    capa: { position: 'fixed', inset: 0, zIndex: 9000 },
    // El rectángulo claro. La sombra gigante es la que oscurece el resto de la pantalla.
    foco: {
        position: 'fixed', borderRadius: 4, pointerEvents: 'none',
        boxShadow: '0 0 0 9999px rgba(10,10,12,.58)',
        outline: '2px solid rgba(255,255,255,.85)',
        transition: 'top .18s ease, left .18s ease, width .18s ease, height .18s ease',
    },
    fondoPlano: { position: 'fixed', inset: 0, background: 'rgba(10,10,12,.58)' },
    globo: {
        position: 'fixed', width: 320, maxWidth: 'calc(100vw - 20px)',
        background: '#ffffff', color: '#1a1a18', borderRadius: 4,
        padding: '14px 16px 12px', boxShadow: '0 10px 34px rgba(0,0,0,.34)',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontSize: 12.5,
    },
    contador: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: '#8a8981', marginBottom: 5 },
    titulo: { fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 6 },
    texto: { fontSize: 12.5, lineHeight: 1.55, color: '#3f3e3a' },
    botones: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 13 },
    botonesDerecha: { display: 'flex', gap: 6 },
    btnSalir: { height: 27, padding: '0 10px', border: 'none', background: 'none', color: '#8a8981', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
    btnSecundario: { height: 27, padding: '0 11px', border: '1px solid rgba(0,0,0,.18)', background: '#fff', fontSize: 11.5, cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit' },
    btnPrimario: { height: 27, padding: '0 13px', border: '1px solid oklch(0.48 0.10 250)', background: 'oklch(0.48 0.10 250)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit' },
};
