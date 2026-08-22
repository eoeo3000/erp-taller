import { useEffect, useState } from 'react';
import { obtenerOT, actualizarOT, cerrarAsignacion, obtenerTiposTrabajo, obtenerCondicionesEntorno } from '../api.js';
import { nuevoHallazgo, guardarHallazgoEnInforme, eliminarHallazgoDeInforme } from '../hallazgos.js';
import EditorHallazgo from './EditorHallazgo.jsx';

// El informe de evaluación ES un solo cuadro para escribir (a pedido explícito: sin botón
// "+ Agregar hallazgo", sin lista, sin modal aparte) — un hallazgo por informe. EditorHallazgo
// es un componente controlado acá (hallazgo + onCambiar); esta pantalla es la que manda los
// botones de abajo y decide cuándo se persiste.
export default function O5InformeEvaluacion({ nav, asignacion }) {
    // El _id de la Solicitud es también el que va a tener la OT una vez creada (mismo
    // upsert que ya usa otController.actualizarOT) — por eso alcanza con un solo id para
    // leer y guardar, exista o no la OT todavía. otId es el respaldo para cuando la
    // asignación ya apunta a una OT real (por ejemplo, una segunda visita).
    const targetId = asignacion?.otId || asignacion?.solicitudId;
    const [ot, setOt] = useState(null);
    const [hallazgo, setHallazgo] = useState(nuevoHallazgo());
    const [guardando, setGuardando] = useState(false);
    const [tiposTrabajo, setTiposTrabajo] = useState([]);
    const [condicionesEntorno, setCondicionesEntorno] = useState([]);

    useEffect(() => {
        if (!targetId) return;
        obtenerOT(targetId).then((o) => {
            setOt(o);
            const existente = o.informeEvaluacion?.hallazgos?.[0];
            if (existente) setHallazgo(existente);
        }).catch(() => setOt({})); // primera visita: la OT todavía no existe, se crea al guardar
        obtenerTiposTrabajo().then(setTiposTrabajo).catch(() => {});
        obtenerCondicionesEntorno().then(setCondicionesEntorno).catch(() => {});
    }, [targetId]);

    if (!targetId) {
        return (
            <div style={{ padding: 24 }}>
                <p style={{ fontSize: 'var(--fs-cuerpo)' }}>Esta visita todavía no tiene una solicitud u OT asociada — avisa a la oficina antes de levantar el informe.</p>
                <button className="boton-secundario" onClick={nav.volver}>Volver</button>
            </div>
        );
    }
    if (!ot) return null;

    // Todo queda en el estado local hasta "Guardar y salir" — igual que el resto de esta
    // pantalla antes de que existiera el formulario adaptativo. Un hallazgo vacío no se
    // guarda (no deja basura en informeEvaluacion.hallazgos), pero eso nunca bloquea salir.
    const terminarInforme = async () => {
        setGuardando(true);
        const informeBase = { hallazgos: [], tareas: [], fotos: [], ...ot.informeEvaluacion };
        const nuevo = hallazgo.textoDescriptivo?.trim()
            ? { ...guardarHallazgoEnInforme(informeBase, hallazgo), completo: true }
            : { ...(hallazgo._id ? eliminarHallazgoDeInforme(informeBase, hallazgo._id) : informeBase), completo: true };
        try {
            await actualizarOT(targetId, { informeEvaluacion: nuevo });
            if (asignacion?._id) await cerrarAsignacion(asignacion._id).catch(() => {});
            nav.volver();
        } finally { setGuardando(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{ padding: '10px 16px' }}>
                <span style={{ fontSize: 'var(--fs-card-titulo)', fontWeight: 600 }}>Informe</span>
            </header>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <EditorHallazgo
                    hallazgo={hallazgo}
                    onCambiar={setHallazgo}
                    tiposTrabajo={tiposTrabajo}
                    condicionesEntorno={condicionesEntorno}
                />
            </div>

            <div className="pie-accion" style={{ flexDirection: 'row' }}>
                <button className="boton-secundario" style={{ width: 120 }} disabled={guardando} onClick={nav.volver}>Volver</button>
                <button className="boton-primario" disabled={guardando} onClick={terminarInforme}>Guardar y salir</button>
            </div>
        </div>
    );
}
