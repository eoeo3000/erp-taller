import { useEffect, useState } from 'react';
import { setSesion, haySesion, accionOT, whoami, subirDataURL } from './api.js';
import { reintentarCola } from './db.js';
import ConfirmHost from './screens/ConfirmHost.jsx';
import O1PrimerAcceso from './screens/O1_PrimerAcceso.jsx';
import O2MiDia from './screens/O2_MiDia.jsx';
import O3TrabajoEnCurso from './screens/O3_TrabajoEnCurso.jsx';
import O4ReporteTerreno from './screens/O4_ReporteTerreno.jsx';
import O5InformeEvaluacion from './screens/O5_InformeEvaluacion.jsx';
import O6MiSemana from './screens/O6_MiSemana.jsx';
import S1MiPanel from './screens/S1_MiPanel.jsx';
import S2MiSemanaSupervisor from './screens/S2_MiSemanaSupervisor.jsx';
import S3Trabajo from './screens/S3_Trabajo.jsx';
import S4Solicitudes from './screens/S4_Solicitudes.jsx';

export default function App() {
    const [pila, setPila] = useState([{ pantalla: 'cargando' }]);
    // Solo para decidir el destino de "Entrar" (S1 vs O2) y para el autor del registro de
    // evidencia en S3 — O1 sigue haciendo su propio whoami() para la ficha, este no lo reemplaza.
    const [persona, setPersona] = useState(null);

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
        whoami().then(setPersona).catch(() => {});
        setPila([{ pantalla: 'o1' }]);
    }, []);

    // Cola de reportes sin señal (README pwa_movil §8): se reintenta al recuperar
    // conexión, sin importar en qué pantalla esté la persona en ese momento. El item de la
    // cola trae la foto como data: URI (así se guardó sin señal); recién acá, con señal de
    // vuelta, se sube como archivo real antes de mandar el reporte.
    useEffect(() => {
        const intentar = () => reintentarCola(async (item) => {
            const fotoUrl = item.foto ? await subirDataURL(item.foto) : '';
            return accionOT(item.otId, { accion: 'reporte', comentario: item.comentario, foto: fotoUrl });
        });
        intentar();
        window.addEventListener('online', intentar);
        return () => window.removeEventListener('online', intentar);
    }, []);

    const ir = (pantalla, contexto) => setPila((p) => [...p, { pantalla, contexto }]);
    const reemplazar = (pantalla, contexto) => setPila((p) => [...p.slice(0, -1), { pantalla, contexto }]);
    const volver = () => setPila((p) => (p.length > 1 ? p.slice(0, -1) : p));

    const actual = pila[pila.length - 1];
    const nav = { ir, reemplazar, volver };

    // ConfirmHost (confirmar.js) montado una sola vez acá, fuera del switch de pantallas, para
    // que la confirmación estilizada (reemplazo de window.confirm/alert) esté disponible sin
    // importar en qué pantalla esté la persona.
    return (
        <>
            <ConfirmHost />
            {renderPantalla(actual, nav, persona, reemplazar)}
        </>
    );
}

function renderPantalla(actual, nav, persona, reemplazar) {
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
            return <O1PrimerAcceso onEntrar={() => reemplazar(persona?.rol === 'supervisor' ? 's1' : 'o2')} />;
        case 'o2':
            return <O2MiDia nav={nav} />;
        case 'o3':
            return <O3TrabajoEnCurso nav={nav} asignacion={actual.contexto?.asignacion} />;
        case 'o4':
            return <O4ReporteTerreno nav={nav} asignacion={actual.contexto?.asignacion} modo={actual.contexto?.modo} />;
        case 'o5':
            return <O5InformeEvaluacion nav={nav} asignacion={actual.contexto?.asignacion} persona={persona} />;
        case 'o6':
            return <O6MiSemana nav={nav} />;
        case 's1':
            return <S1MiPanel nav={nav} />;
        case 's2':
            return <S2MiSemanaSupervisor nav={nav} contexto={actual.contexto} />;
        case 's3':
            return <S3Trabajo nav={nav} asignacion={actual.contexto?.asignacion} persona={persona} />;
        // s4 reemplazó a las cuatro pantallas separadas de solicitudes (antes s4/s5/s6/s7):
        // ahora es una sola con filtros adentro, ver S4_Solicitudes.jsx.
        case 's4':
            return <S4Solicitudes nav={nav} />;
        default:
            return null;
    }
}
