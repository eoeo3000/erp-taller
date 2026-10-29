// El guion del modo guía: qué se muestra, en qué orden y qué se dice.
//
// Vive separado del motor (Guia.jsx) a propósito. Esto es lo que se va a editar cuando
// cambie la forma de contar el producto —que va a pasar seguido— y para eso no hay que
// entender cómo se dibuja el foco ni cómo se mide un elemento en pantalla.
//
// --- Dos reglas que no son evidentes ---
//
// 1. **La guía señala, nunca toca.** Ningún paso crea, edita ni borra nada. Por eso se puede
//    correr sobre la base real de un taller que está trabajando, y no solo sobre la demo. Una
//    guía que "hace" el flujo para mostrarlo necesitaría datos de mentira en una base de
//    verdad, o resetear la demo después de cada visita.
//
// 2. **El ancla es un `data-guia`, no un selector CSS.** `.card:nth-child(2) button` se rompe
//    en silencio el día que alguien reordena la pantalla, y el síntoma aparece recién cuando
//    se está mostrando el sistema a un cliente. Un atributo explícito es un contrato: quien lo
//    borra ve el nombre y puede buscar quién lo usa. Y hay prueba (pasos.test.js) de que cada
//    ancla de acá existe de verdad en la pantalla que dice.
//
// `ancla` puede ir vacía: ese paso se muestra centrado, sin señalar nada. Es lo correcto para
// la bienvenida y el cierre, y es también lo que pasa solo cuando un ancla no está en pantalla
// —una tabla vacía no tiene filas— porque apuntar a la posición equivocada es peor que no
// apuntar.
export const PASOS = [
    {
        id: 'bienvenida',
        ruta: '/',
        ancla: '',
        titulo: 'Así funciona el sistema',
        texto: 'Un trabajo entra como solicitud, se aprueba y se convierte en orden de trabajo, '
            + 'se programa entre la gente del taller, se ejecuta en terreno con fotos, y se cobra. '
            + 'Este recorrido sigue ese camino, pantalla por pantalla. No cambia ningún dato.',
    },
    {
        id: 'nav-operacion',
        ruta: '/',
        ancla: 'nav.operacion',
        titulo: 'El menú está ordenado por el flujo',
        texto: 'Operación es el día a día, de arriba hacia abajo en el orden en que ocurren las cosas. '
            + 'Los números son lo que está esperando algo: solicitudes sin orden de trabajo, órdenes abiertas, '
            + 'trabajos por programar.',
    },
    {
        id: 'ingreso-nueva',
        ruta: '/',
        ancla: 'ingreso.nueva',
        titulo: 'Entra el pedido del cliente',
        texto: 'Acá se anota lo que pide el cliente: quién, qué y para cuándo. Todavía no se agenda a nadie '
            + 'ni se compromete nada — es el registro de que el pedido existe, que es justo lo que suele '
            + 'perderse entre un WhatsApp y un correo.',
    },
    {
        id: 'ingreso-lista',
        ruta: '/',
        ancla: 'ingreso.lista',
        titulo: 'Nada se queda sin respuesta',
        texto: 'Cada fila es un pedido y su estado. Mientras una solicitud no se convierta en orden de trabajo '
            + 'sigue contando en el menú, así que no hay forma de que se traspapele.',
    },
    {
        id: 'dashboard',
        ruta: '/dashboard',
        ancla: 'dashboard.titulo',
        titulo: 'Acá se decide',
        texto: 'Aprobar una solicitud crea la orden de trabajo en el momento, y el supervisor la ve en su '
            + 'teléfono. Rechazar también deja constancia. Lo que se aprueba o se rechaza queda escrito, '
            + 'con quién y cuándo.',
    },
    {
        // Sin ancla y sin salir del panel, a propósito. La pantalla donde se arma la orden
        // (`/tratamiento`) solo existe con una OT elegida: entrar directo muestra «No hay
        // datos», y un recorrido de venta que aterriza ahí se ve roto. Se descubrió
        // recorriendo los diez pasos en un navegador de verdad.
        id: 'tratamiento',
        ruta: '/dashboard',
        ancla: '',
        titulo: 'Abrir una orden la arma',
        texto: 'Al entrar a una orden de trabajo se abre la pantalla donde se cargan tareas, materiales, '
            + 'equipos y transporte. Cada tarea lleva su puesto y cada puesto su costo por hora, así que el '
            + 'total se calcula solo mientras se arma — y de ahí mismo sale la cotización en PDF con el logo '
            + 'del taller.',
    },
    {
        id: 'gantt',
        ruta: '/gantt',
        ancla: 'gantt.titulo',
        titulo: 'Quién hace qué, y qué día',
        texto: 'Las tareas se reparten contra las horas que cada persona tiene disponibles ese día, según su '
            + 'turno. Si un día no da, se ve antes de prometerlo — no el lunes a primera hora.',
    },
    {
        id: 'tablero',
        ruta: '/tablero-supervisores',
        ancla: 'tablero.titulo',
        titulo: 'Lo que pasa en terreno',
        texto: 'El supervisor trabaja desde su teléfono: ve lo que le toca, marca avance y saca fotos. '
            + 'Eso llega acá sin que nadie transcriba nada, y queda pegado a la orden de trabajo como '
            + 'respaldo de lo que se hizo.',
    },
    {
        id: 'recursos',
        ruta: '/recursos',
        ancla: 'recursos.titulo',
        titulo: 'El motor de atrás',
        texto: 'Personal y sus turnos, puestos con su costo por hora, equipos, suministros y plantillas de '
            + 'trabajos que se repiten. Esto se carga una vez y es lo que hace que programar y costear sea '
            + 'automático en vez de a mano.',
    },
    {
        id: 'cierre',
        ruta: '/',
        ancla: '',
        titulo: 'Eso es el recorrido completo',
        texto: 'Del pedido al cobro, con el respaldo de lo que se hizo pegado a cada trabajo. '
            + 'Para volver a verlo, el botón «Guía» está siempre abajo en el menú.',
    },
];

// Las anclas que el guion usa, sin repetidas. La prueba las busca en el código de las
// pantallas: un paso que apunta a un elemento que ya no existe se pone rojo acá y no en medio
// de una demostración.
export const ANCLAS = [...new Set(PASOS.map((p) => p.ancla).filter(Boolean))];
