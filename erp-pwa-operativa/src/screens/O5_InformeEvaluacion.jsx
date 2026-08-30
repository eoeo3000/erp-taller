import { useEffect, useState } from 'react';
import { obtenerOT, actualizarOT, cerrarAsignacion, obtenerTiposTrabajo, obtenerCatalogosTransversales } from '../api.js';
import { nuevoHallazgo, guardarHallazgoEnInforme, eliminarHallazgoDeInforme } from '../hallazgos.js';
import EditorHallazgo from './EditorHallazgo.jsx';

// El informe de evaluación ES un solo cuadro para escribir (a pedido explícito: sin botón
// "+ Agregar hallazgo", sin lista, sin modal aparte) — un hallazgo por informe. EditorHallazgo
// es un componente controlado acá (hallazgo + onCambiar); esta pantalla es la que manda los
// botones de abajo y decide cuándo se persiste.
export default function O5InformeEvaluacion({ nav, asignacion, persona }) {
    // El _id de la Solicitud es también el que va a tener la OT una vez creada (mismo
    // upsert que ya usa otController.actualizarOT) — por eso alcanza con un solo id para
    // leer y guardar, exista o no la OT todavía. otId es el respaldo para cuando la
    // asignación ya apunta a una OT real (por ejemplo, una segunda visita).
    const targetId = asignacion?.otId || asignacion?.solicitudId;
    const [ot, setOt] = useState(null);
    const [hallazgo, setHallazgo] = useState(nuevoHallazgo());
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [tiposTrabajo, setTiposTrabajo] = useState([]);
    const [catalogosTransversales, setCatalogosTransversales] = useState([]);

    useEffect(() => {
        if (!targetId) return;
        obtenerOT(targetId).then((o) => {
            setOt(o);
            const existente = o.informeEvaluacion?.hallazgos?.[0];
            if (existente) setHallazgo(existente);
        }).catch(() => setOt({})); // primera visita: la OT todavía no existe, se crea al guardar
        obtenerTiposTrabajo().then(setTiposTrabajo).catch(() => {});
        obtenerCatalogosTransversales().then(setCatalogosTransversales).catch(() => {});
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
        setError('');
        const informeBase = { hallazgos: [], tareas: [], fotos: [], ...ot.informeEvaluacion };
        // Regrabar (ej. corrigiendo un informe "Con observaciones") vuelve la revisión a
        // 'Pendiente' — el Planificador tiene que volver a mirarlo, ver S5_MisInformes.jsx.
        const revisionReseteada = { estado: 'Pendiente', comentario: '', fecha: null, autor: '' };
        // Queda registrado quién hizo el levantamiento — pedido explícito del usuario (antes
        // el campo existía en el modelo, hasta se mostraba en el PDF interno, pero nunca se
        // completaba en ningún lado). Se pisa con la persona logueada en cada guardado, así
        // que si alguien más regraba un informe "Con observaciones" queda como el responsable
        // más reciente, no el original — es lo mismo que ya pasa con revision.autor.
        const responsable = persona?.nombre || ot.informeEvaluacion?.responsable || '';
        const nuevo = hallazgo.textoDescriptivo?.trim()
            ? { ...guardarHallazgoEnInforme(informeBase, hallazgo), completo: true, revision: revisionReseteada, responsable }
            : { ...(hallazgo._id ? eliminarHallazgoDeInforme(informeBase, hallazgo._id) : informeBase), completo: true, revision: revisionReseteada, responsable };
        try {
            await actualizarOT(targetId, { informeEvaluacion: nuevo });
            if (asignacion?._id) await cerrarAsignacion(asignacion._id).catch(() => {});
            nav.volver();
        } catch (e) {
            setError(e.message || 'No se pudo guardar el informe.');
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
                    catalogosTransversales={catalogosTransversales}
                />
            </div>

            {error && <div style={{ margin: '0 18px 10px', fontSize: 13, color: 'var(--detenido)', fontWeight: 600 }}>{error}</div>}
            <div className="pie-accion" style={{ flexDirection: 'row' }}>
                <button className="boton-secundario" style={{ width: 120 }} disabled={guardando} onClick={nav.volver}>Volver</button>
                <button className="boton-primario" disabled={guardando} onClick={terminarInforme}>Guardar y salir</button>
            </div>
        </div>
    );
}
