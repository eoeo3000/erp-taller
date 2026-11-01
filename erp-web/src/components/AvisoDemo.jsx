// «Esta pantalla está mirando la base de demostración».
//
// Nace del peor mensaje que este sistema haya mostrado. Un navegador había quedado en modo
// demostración; la base de demostración no tiene cuentas de escritorio; `GET /auth/yo`
// respondió `requiereInstalacion`; y la app le dijo **«todavía no hay ninguna cuenta»** a un
// taller que llevaba meses operando, ofreciéndole crear un administrador. Visto en
// producción. Lo que faltaba no era el dato —el servidor siempre supo qué base abrió— sino
// decirlo en la pantalla donde importa.
//
// `BannerDemo` (App.jsx) no sirve acá: vive dentro del shell de la app, o sea del otro lado
// del login. Las dos pantallas que se ven ANTES de entrar —ingresar e instalar— no tenían
// ninguna señal, y son justamente donde un entorno equivocado se lee como un desastre.
//
// **El valor lo manda el servidor**, no el navegador: lo que falla es exactamente la memoria
// del navegador, así que preguntarle a él sería preguntarle al que se equivocó.
export default function AvisoDemo({ entorno }) {
    if (entorno !== 'demo') return null;
    return (
        <div style={estilos.franja}>
            <div style={estilos.titulo}>Base de demostración</div>
            <div style={estilos.texto}>
                Esta pestaña está mirando datos ficticios, no los de tu taller. Si llegaste
                buscando entrar a trabajar, cierra esta pestaña y abre la app de nuevo.
            </div>
        </div>
    );
}

const estilos = {
    // Ámbar y no rojo: no hay nada roto. Es una advertencia de «estás en otra parte», y el
    // rojo de esta app está reservado para lo que se rompe.
    franja: {
        padding: '9px 20px', background: '#f6ecd2', borderBottom: '1px solid rgba(0,0,0,.10)',
        color: '#5c4714',
    },
    titulo: { fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase' },
    texto: { fontSize: 11.5, lineHeight: 1.45, marginTop: 3 },
};
