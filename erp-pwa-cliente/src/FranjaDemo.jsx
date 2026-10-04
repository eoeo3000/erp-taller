// Franja persistente del modo demostración. Equivalente a BannerDemo de erp-web/src/App.jsx:
// mismo texto, mismo ámbar, mismo ícono. Es una copia y no un módulo compartido porque este
// repositorio no tiene paquete común entre las apps (ver CLAUDE.md) — cada PWA se construye y
// se despliega sola.
//
// Existe porque el video de la landing muestra las tres apps una detrás de otra: si la franja
// apareciera solo en la de escritorio, los tramos grabados en el teléfono quedarían sin ningún
// aviso de que lo que se ve es inventado.
import { getSesion } from './api.js';

function IconoAviso({ tamano = 12 }) {
    return (
        <svg width={tamano} height={tamano} viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ flex: 'none' }}>
            <path d="M8 2.2 14.4 13.4H1.6L8 2.2Z" />
            <path d="M8 6.6v3.1" />
            <path d="M8 11.6h.01" />
        </svg>
    );
}

export default function FranjaDemo() {
    if (getSesion().entorno !== 'demo') return null;
    return (
        <div style={estilos.franja}>
            <IconoAviso />
            <span>Demo con datos ficticios</span>
        </div>
    );
}

const estilos = {
    franja: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: 24, background: 'oklch(0.55 0.11 65)', color: '#ffffff',
        fontSize: 11, fontWeight: 600, letterSpacing: '.02em',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        position: 'sticky', top: 0, zIndex: 50,
    },
};
