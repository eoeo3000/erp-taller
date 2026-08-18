import { useEffect, useState } from 'react';
import { setSesion, haySesion, accionOT } from './api.js';
import { reintentarCola } from './db.js';
import O1PrimerAcceso from './screens/O1_PrimerAcceso.jsx';
import O2MiDia from './screens/O2_MiDia.jsx';
import O3TrabajoEnCurso from './screens/O3_TrabajoEnCurso.jsx';
import O4ReporteTerreno from './screens/O4_ReporteTerreno.jsx';
import O5InformeEvaluacion from './screens/O5_InformeEvaluacion.jsx';
import O6MiSemana from './screens/O6_MiSemana.jsx';

export default function App() {
    const [pila, setPila] = useState([{ pantalla: 'cargando' }]);

    // O1 (bienvenida + ficha de persona/puesto) se muestra en cada apertura de la app, no
    // solo la primera vez — pedido explícito del dueño del negocio: quien abre la app debe
    // poder confirmar de un vistazo con qué usuario quedó identificada, cada vez que entra.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tokenUrl = params.get('token');
        const entornoUrl = params.get('entorno');
        if (tokenUrl) {
            setSesion(tokenUrl, entornoUrl);
            window.history.replaceState({}, '', window.location.pathname);
        }

        if (!haySesion()) {
            setPila([{ pantalla: 'sin-acceso' }]);
            return;
        }
        setPila([{ pantalla: 'o1' }]);
    }, []);

    // Cola de reportes sin señal (README pwa_movil §8): se reintenta al recuperar
    // conexión, sin importar en qué pantalla esté la persona en ese momento.
    useEffect(() => {
        const intentar = () => reintentarCola((item) => accionOT(item.otId, { accion: 'reporte', comentario: item.comentario, foto: item.foto }));
        intentar();
        window.addEventListener('online', intentar);
        return () => window.removeEventListener('online', intentar);
    }, []);

    const ir = (pantalla, contexto) => setPila((p) => [...p, { pantalla, contexto }]);
    const reemplazar = (pantalla, contexto) => setPila((p) => [...p.slice(0, -1), { pantalla, contexto }]);
    const volver = () => setPila((p) => (p.length > 1 ? p.slice(0, -1) : p));

    const actual = pila[pila.length - 1];
    const nav = { ir, reemplazar, volver };

    switch (actual.pantalla) {
        case 'cargando':
            return null;
        case 'sin-acceso':
            return (
                <div style={{ padding: 24, fontSize: 15 }}>
                    Este link no es válido. Pide a la oficina que te reenvíe tu acceso.
                </div>
            );
        case 'o1':
            return <O1PrimerAcceso onEntrar={() => reemplazar('o2')} />;
        case 'o2':
            return <O2MiDia nav={nav} />;
        case 'o3':
            return <O3TrabajoEnCurso nav={nav} asignacion={actual.contexto?.asignacion} />;
        case 'o4':
            return <O4ReporteTerreno nav={nav} asignacion={actual.contexto?.asignacion} modo={actual.contexto?.modo} />;
        case 'o5':
            return <O5InformeEvaluacion nav={nav} asignacion={actual.contexto?.asignacion} />;
        case 'o6':
            return <O6MiSemana nav={nav} />;
        default:
            return null;
    }
}
