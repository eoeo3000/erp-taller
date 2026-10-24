// El nombre y el logo del taller, donde la app dice quién es.
//
// Los dos salen de `GET /api/auth/yo` (campo `marca`) y los edita quien administra el
// producto desde el panel de talleres. Vacíos significan "este taller no eligió ninguno", y
// entonces se muestra el nombre de fábrica: desplegar esto no cambia nada en una instalación
// donde nadie escribió una marca todavía.
//
// --- La regla: el logo ARRIBA y el nombre DEBAJO ---
//
// Primero se probó mostrando solo el logo cuando hay logo, porque los cuatro lugares donde
// esto aparece son angostos —el menú lateral mide 186px y la tarjeta de ingreso 328px— y
// puestos uno al lado del otro el nombre salía cortado ("MAEST…"), que es peor que no
// mostrarlo. En la app funcionando se vio que falta: el logo solo deja la pantalla sin decir
// de quién es, y "quién es" es justamente lo que esto tiene que contestar.
//
// Apilados caben los dos sin cortar nada: el ancho lo gasta el logo, y el nombre usa las
// líneas que necesite debajo. Por eso el nombre **envuelve en vez de truncarse** — un nombre
// largo en dos líneas se lee; con puntos suspensivos, no.
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

    // El nombre siempre se muestra. Envuelve en lugar de truncarse: `estilo` trae
    // `whiteSpace: nowrap` del menú, donde antes era una línea sola y fija.
    const textoNombre = (
        <span style={{ maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.35 }}>
            {nombre}
        </span>
    );

    if (!logo) return <div style={estilo}>{textoNombre}</div>;

    return (
        <div style={{ ...estilo, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
            {/* El recuadro blanco no es adorno: los cuatro lugares donde esto se muestra
                tienen fondo casi negro (el menú y la banda de las tarjetas de acceso), y un
                logo de tinta oscura —que es la mitad de los logos— ahí no se lee. Un logo
                pensado para fondo oscuro se ve bien sobre blanco igual, así que el recuadro
                es el único que funciona para los dos casos. */}
            <span style={{ background: '#fff', borderRadius: 4, padding: '4px 6px', display: 'inline-flex', maxWidth: '100%' }}>
                {/* `alt` vacío a propósito: el nombre va escrito justo debajo, así que un
                    lector de pantalla que leyera los dos diría lo mismo dos veces. */}
                <img src={logo} alt="" style={{ maxHeight: altoLogo, maxWidth: '100%', objectFit: 'contain' }} />
            </span>
            {textoNombre}
        </div>
    );
}
