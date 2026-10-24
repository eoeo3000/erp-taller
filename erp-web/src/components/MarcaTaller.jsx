// El nombre y el logo del taller, donde la app dice quién es.
//
// Los dos salen de `GET /api/auth/yo` (campo `marca`) y los edita quien administra el
// producto desde el panel de talleres. Vacíos significan "este taller no eligió ninguno", y
// entonces se muestra el nombre de fábrica: desplegar esto no cambia nada en una instalación
// donde nadie escribió una marca todavía.
//
// --- La regla: con logo, el logo REEMPLAZA al nombre ---
//
// Los cuatro lugares donde esto se muestra son angostos: el menú lateral mide 186px y la
// tarjeta de ingreso 328px. Puestos uno al lado del otro, el nombre queda cortado —"MAEST…"—
// que es peor que no mostrarlo. Un logo ya dice el nombre del taller, igual que un membrete.
// El nombre no se pierde: va en el `alt` (lo lee un lector de pantalla) y en el `title` (lo
// muestra el navegador al pasar el mouse).
//
// La cotización hace lo contrario y muestra los dos, y eso es a propósito: ahí el ancho
// sobra, y en un documento que se le manda a un cliente la razón social del que emite no es
// decoración.
//
// Existe como componente —y no copiado en las cuatro pantallas— porque esta regla es
// justamente lo que no puede divergir: una pantalla que se quedara mostrando "Taller ERP"
// después de que el taller puso su nombre se vería como un error de la app.
const NOMBRE_POR_OMISION = 'Taller ERP';

// Sin exportar: este archivo exporta solo el componente, que es lo que pide la regla de
// react-refresh. El PDF de la cotización NO usa este respaldo a propósito — poner "Taller
// ERP" en una cotización sería escribir el nombre del software en el papel del taller.
function nombreDeMarca(marca) {
    return String(marca?.nombre || '').trim() || NOMBRE_POR_OMISION;
}

export default function MarcaTaller({ marca, estilo, altoLogo = 26 }) {
    const logo = marca?.logo || '';
    const nombre = nombreDeMarca(marca);

    if (logo) {
        return (
            <div style={{ ...estilo, display: 'flex', alignItems: 'center' }} title={nombre}>
                {/* El recuadro blanco no es adorno: los cuatro lugares donde esto se muestra
                    tienen fondo casi negro (el menú y la banda de las tarjetas de acceso), y
                    un logo de tinta oscura —que es la mitad de los logos— ahí no se lee. Un
                    logo pensado para fondo oscuro se ve bien sobre blanco igual, así que el
                    recuadro es el único que funciona para los dos casos. */}
                <span style={{ background: '#fff', borderRadius: 4, padding: '4px 6px', display: 'inline-flex', maxWidth: '100%' }}>
                    <img src={logo} alt={nombre} style={{ maxHeight: altoLogo, maxWidth: '100%', objectFit: 'contain' }} />
                </span>
            </div>
        );
    }
    return <div style={estilo}>{nombre}</div>;
}
