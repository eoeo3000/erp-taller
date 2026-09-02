import { useEffect, useState } from 'react';
import { setSesion, haySesion } from './api.js';
import C1Acceso from './screens/C1_Acceso.jsx';
import C2MisSolicitudes from './screens/C2_MisSolicitudes.jsx';
import C3EstadoTrabajo from './screens/C3_EstadoTrabajo.jsx';
import C4AvanceFotos from './screens/C4_AvanceFotos.jsx';
import C5CuentaPago from './screens/C5_CuentaPago.jsx';
import C6PedirServicio from './screens/C6_PedirServicio.jsx';

export default function App() {
    const [pila, setPila] = useState([{ pantalla: 'cargando' }]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tokenUrl = params.get('token');
        const entornoUrl = params.get('entorno');
        if (tokenUrl) {
            // Link firmado por contacto (WhatsApp/correo): salta C1, entra directo a C2.
            setSesion(tokenUrl, entornoUrl);
            window.history.replaceState({}, '', window.location.pathname);
            setPila([{ pantalla: 'c2' }]);
            return;
        }
        setPila([{ pantalla: haySesion() ? 'c2' : 'c1' }]);
    }, []);

    const ir = (pantalla, contexto) => setPila((p) => [...p, { pantalla, contexto }]);
    const reemplazar = (pantalla, contexto) => setPila((p) => [...p.slice(0, -1), { pantalla, contexto }]);
    const volver = () => setPila((p) => (p.length > 1 ? p.slice(0, -1) : p));
    const irRaiz = (pantalla, contexto) => setPila([{ pantalla, contexto }]);

    const actual = pila[pila.length - 1];
    const nav = { ir, reemplazar, volver, irRaiz };

    switch (actual.pantalla) {
        case 'cargando':
            return null;
        case 'c1':
            return <C1Acceso nav={nav} />;
        case 'c2':
            return <C2MisSolicitudes nav={nav} />;
        case 'c3':
            return <C3EstadoTrabajo nav={nav} trabajo={actual.contexto?.trabajo} />;
        case 'c4':
            return <C4AvanceFotos nav={nav} trabajo={actual.contexto?.trabajo} />;
        case 'c5':
            return <C5CuentaPago nav={nav} trabajo={actual.contexto?.trabajo} verCotizacionInicial={actual.contexto?.verCotizacion} />;
        case 'c6':
            return <C6PedirServicio nav={nav} />;
        default:
            return null;
    }
}
