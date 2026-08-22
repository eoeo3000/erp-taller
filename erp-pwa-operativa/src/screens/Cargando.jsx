// Círculo de carga compartido — se usa mientras cada pantalla espera su primer fetch, con
// la cabecera ya pintada arriba (ver App.jsx / S1-S6): reemplaza el hueco en blanco de
// antes por una señal de que algo está pasando.
export default function Cargando() {
    return (
        <div className="spinner-caja">
            <div className="spinner" />
        </div>
    );
}
