import { Component } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Qué se ve cuando una pantalla se rompe.
//
// Antes no había nada. `TableroSupervisoresScreen` hacía `datos.supervisores.length` sin
// guarda, y con una respuesta de otra forma React desmonta el árbol ENTERO: se iba la
// pantalla, el menú, y la guía con ellos —vive en el mismo árbol—. Lo que quedaba era una
// página en blanco, que es el peor síntoma posible: no dice qué pasó, no dice qué hacer, y
// delante de un cliente parece que el sistema entero se cayó.
//
// Tres decisiones:
//
// 1. **Envuelve `<Routes>` y no la app entera.** El menú vive fuera de `<main>`, así que
//    queda vivo: se puede navegar a otra pantalla sin recargar. Un límite en la raíz habría
//    dado una pantalla de error de borde a borde cuya única salida es recargar, que es poco
//    mejor que la página en blanco.
//
// 2. **Se reinicia solo al cambiar de ruta.** Un límite de error de React NO se repone solo:
//    una vez que entra en estado de error, se queda ahí. Sin esto, apretar otra pantalla en
//    el menú cambiaría la URL y seguiría mostrando el mismo error — se vería como que toda
//    la app se rompió, que es justo lo que esto viene a evitar. La `key` atada al pathname
//    hace que React lo trate como un componente nuevo y lo monte limpio.
//
// 3. **Muestra el mensaje del error.** Esto es el sistema interno de un taller, no una
//    página pública: quien lo ve es la persona que va a pedir ayuda, y «no se pudo leer
//    'length' de undefined» pegado en un mensaje vale más que diez minutos de ida y vuelta.
//    El detalle técnico va chico y aparte; arriba va en castellano qué pasó y qué hacer.
class LimiteDeError extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // A la consola del navegador, que es donde se va a mirar con la persona al teléfono.
        // React ya imprime lo suyo; esto agrega el componente exacto donde reventó.
        console.error('[pantalla] se rompió:', error, info?.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            <div style={estilos.raiz}>
                <div style={estilos.titulo}>Esta pantalla no se pudo mostrar</div>
                <div style={estilos.ayuda}>
                    El resto del sistema sigue funcionando: puedes ir a otra pantalla desde el menú.
                    Nada de lo que habías guardado se perdió.
                </div>
                <div style={estilos.acciones}>
                    <button type="button" style={estilos.btnPrimario} onClick={this.props.alReintentar}>
                        Reintentar
                    </button>
                    <button type="button" style={estilos.btnTexto} onClick={this.props.alSalir}>
                        Ir al panel
                    </button>
                </div>
                <div style={estilos.detalle}>{String(error?.message || error)}</div>
            </div>
        );
    }
}

// El envoltorio que se usa. Va acá y no en App.jsx porque `useLocation` solo existe dentro
// del `<Router>`, y App es justamente quien lo monta.
export default function LimiteDePantalla({ children }) {
    const { pathname } = useLocation();
    const navegar = useNavigate();
    // La `key` es lo que lo repone al cambiar de ruta (ver punto 2 arriba).
    return (
        <LimiteDeError
            key={pathname}
            alReintentar={() => navegar(0)}
            alSalir={() => navegar('/dashboard')}
        >
            {children}
        </LimiteDeError>
    );
}

export { LimiteDeError };

const estilos = {
    raiz: { maxWidth: 520, margin: '48px auto', padding: '20px 22px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 3 },
    titulo: { fontSize: 15, fontWeight: 700, marginBottom: 6 },
    ayuda: { fontSize: 12, lineHeight: 1.5, color: '#57564f' },
    acciones: { display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 0' },
    btnPrimario: { height: 30, padding: '0 14px', background: '#1c1d1b', border: '1px solid #1c1d1b', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 2 },
    btnTexto: { padding: 0, border: 'none', background: 'none', color: 'oklch(0.48 0.10 250)', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
    detalle: { marginTop: 16, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,.09)', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, color: '#8a8981', wordBreak: 'break-word' },
};
