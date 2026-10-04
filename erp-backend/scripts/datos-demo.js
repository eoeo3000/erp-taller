// Juego de datos ficticios de la demo — lo consume scripts/seed-demo.js.
//
// TODO acá es inventado. No hay ni un dato de un cliente real: ni nombres, ni teléfonos, ni
// correos, ni direcciones. Los teléfonos usan números que no corresponden a nadie y los
// correos apuntan a dominios .demo, que no existen.
//
// Va en un archivo aparte del script que escribe en Mongo para que se pueda leer y corregir
// el CONTENIDO de la demo (nombres, montos, descripciones) sin tocar la lógica de carga ni
// el guard de base de datos.
//
// Convenciones, las mismas de seeds/generar-demo.js:
//  - Las fechas NO son fijas: son offsets en días respecto del momento de la carga, para que
//    el Gantt y la matriz de Recursos nunca aparezcan vacíos por más viejo que sea el seed.
//  - `ref` es un identificador de texto local para que una colección apunte a otra antes de
//    que existan los ObjectId reales; seed-demo.js los resuelve en orden de dependencia.

// La empresa que OPERA el ERP (la pyme de servicios que se le muestra al visitante de la
// landing). No es una colección: es el nombre que aparece en cotizaciones y correos.
const EMPRESA = {
    nombre: 'Servicios Industriales Andes Ltda.',
    giro: 'Mantención industrial, soldadura y montajes',
    direccion: 'Camino Lo Espejo 2140, San Bernardo, Región Metropolitana',
    telefono: '+56 2 2745 8800',
    correo: 'contacto@siandes.demo',
};

// ---------- CLIENTES ----------
// El primero es el protagonista del video: desde su teléfono se pide el servicio en el beat 1
// y desde el mismo se aprueba la oferta en el beat 4.
const clientes = [
    {
        ref: 'cli-maipo', empresa: 'Planta Agroindustrial Maipo S.A.',
        direccion: 'Ruta G-46 km 12, Buin, Región Metropolitana',
        contactos: [
            { nombre: 'Camila Reyes', cargo: 'Jefa de Mantención', correo: 'c.reyes@agromaipo.demo', telefono: '+56962410877' },
            { nombre: 'Joaquín Vera', cargo: 'Encargado de Turno', correo: 'j.vera@agromaipo.demo', telefono: '+56962410878' },
        ],
    },
    {
        ref: 'cli-frigo', empresa: 'Frigorífico Puerto Central Ltda.',
        direccion: 'Av. Costanera 880, San Antonio, Región de Valparaíso',
        contactos: [{ nombre: 'Andrés Milla', cargo: 'Jefe de Planta', correo: 'a.milla@puertocentral.demo', telefono: '+56963550142' }],
    },
    {
        ref: 'cli-embot', empresa: 'Embotelladora Río Claro S.A.',
        direccion: 'Longitudinal Sur km 186, Talca, Región del Maule',
        contactos: [{ nombre: 'Paula Ossandón', cargo: 'Jefa de Proyectos', correo: 'p.ossandon@rioclaro.demo', telefono: '+56964880311' }],
    },
    {
        ref: 'cli-molin', empresa: 'Molinera San Bernardo Ltda.',
        direccion: 'Freire 1425, San Bernardo, Región Metropolitana',
        contactos: [{ nombre: 'Héctor Pizarro', cargo: 'Administrador', correo: 'h.pizarro@molinerasb.demo', telefono: '+56965120988' }],
    },
    {
        ref: 'cli-coronel', empresa: 'Terminal Graneles Coronel S.A.',
        direccion: 'Sitio 3, Puerto de Coronel, Región del Biobío',
        contactos: [{ nombre: 'Ximena Alarcón', cargo: 'Jefa de Operaciones', correo: 'x.alarcon@graneles.demo', telefono: '+56966390754' }],
    },
];

// ---------- PUESTOS ----------
const puestos = [
    { nombre: 'Mecánico Industrial', costoHora: 9500, categoria: 'Técnico' },
    { nombre: 'Técnico Hidráulico', costoHora: 9800, categoria: 'Técnico' },
    { nombre: 'Soldadora Certificada', costoHora: 11000, categoria: 'Técnico' },
    { nombre: 'Eléctrico Industrial', costoHora: 10500, categoria: 'Técnico' },
    { nombre: 'Supervisora de Terreno', costoHora: 14000, categoria: 'Supervisión' },
    { nombre: 'Administradora de Operaciones', costoHora: 8500, categoria: 'Administrativo' },
    { nombre: 'Operador de Grúa', costoHora: 9000, categoria: 'Operativo' },
];

// ---------- CALENDARIOS ----------
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const NOMBRE_DIA = {
    lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
    viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};

const calendarios = [
    {
        ref: 'cal-admin', nombre: 'Turno Administrativo L-V', tipo: 'semanal', cicloDias: 7,
        config: DIAS.map((d) => {
            const habil = !['sabado', 'domingo'].includes(d);
            return { dia: d, nombreDia: NOMBRE_DIA[d], activo: habil, bloques: habil ? [{ inicio: '08:30', fin: '17:30' }] : [] };
        }),
    },
    {
        ref: 'cal-taller', nombre: 'Turno Taller L-V + Sábado AM', tipo: 'semanal', cicloDias: 7,
        config: DIAS.map((d) => {
            if (d === 'domingo') return { dia: d, nombreDia: NOMBRE_DIA[d], activo: false, bloques: [] };
            const bloques = d === 'sabado' ? [{ inicio: '08:00', fin: '13:00' }] : [{ inicio: '08:00', fin: '18:00' }];
            return { dia: d, nombreDia: NOMBRE_DIA[d], activo: true, bloques };
        }),
    },
    {
        ref: 'cal-terreno', nombre: 'Turno Terreno Rotativo 7x7', tipo: 'rotativo', cicloDias: 14,
        config: Array.from({ length: 14 }, (_, i) => ({
            dia: String(i + 1), nombreDia: `Día ${i + 1}`, activo: i < 7,
            bloques: i < 7 ? [{ inicio: '07:30', fin: '19:30' }] : [],
        })),
    },
];

// ---------- PERSONAL ----------
// 4 técnicos + 1 supervisora. La supervisora no estaba en el encargo original, pero sin ella
// el beat de terreno no existe: cerrar el trabajo desde la PWA es una acción de supervisor
// (pantalla S3), no de ejecutor.
const personal = [
    {
        ref: 'per-fuentes', nombre: 'Rodrigo Fuentes', puesto: 'Técnico Hidráulico', tipo: 'Interno',
        calendarioRef: 'cal-taller', telefono: '+56967720101', email: 'r.fuentes@siandes.demo',
        tarifaHora: 9800, rol: 'ejecutor',
    },
    {
        ref: 'per-ibarra', nombre: 'Marcela Ibarra', puesto: 'Soldadora Certificada', tipo: 'Interno',
        calendarioRef: 'cal-taller', telefono: '+56967720102', email: 'm.ibarra@siandes.demo',
        tarifaHora: 11000, rol: 'ejecutor',
    },
    {
        ref: 'per-cortes', nombre: 'Iván Cortés', puesto: 'Eléctrico Industrial', tipo: 'Interno',
        calendarioRef: 'cal-taller', telefono: '+56967720103', email: 'i.cortes@siandes.demo',
        tarifaHora: 10500, rol: 'ejecutor',
    },
    {
        ref: 'per-negrete', nombre: 'Patricio Negrete', puesto: 'Mecánico Industrial', tipo: 'Interno',
        calendarioRef: 'cal-terreno', telefono: '+56967720104', email: 'p.negrete@siandes.demo',
        tarifaHora: 9500, rol: 'ejecutor',
    },
    {
        ref: 'per-salas', nombre: 'Daniela Salas', puesto: 'Supervisora de Terreno', tipo: 'Interno',
        calendarioRef: 'cal-terreno', telefono: '+56967720105', email: 'd.salas@siandes.demo',
        tarifaHora: 14000, rol: 'supervisor', senior: true,
    },
];

// ---------- EQUIPOS Y HERRAMIENTAS (12) ----------
const equipos = [
    { codigo: 'MAQ-004', nombre: 'Cargador frontal 4', tipo: 'Maquinaria', precio: 320000 },
    { codigo: 'MAQ-011', nombre: 'Camión pluma 8 t', tipo: 'Maquinaria', precio: 240000 },
    { codigo: 'MAQ-018', nombre: 'Grúa horquilla 2,5 t', tipo: 'Maquinaria', precio: 145000 },
    { codigo: 'MAQ-023', nombre: 'Generador diésel 60 kVA', tipo: 'Maquinaria', precio: 98000 },
    { codigo: 'HER-101', nombre: 'Compresor de aire 500 l', tipo: 'Herramienta', precio: 64000 },
    { codigo: 'HER-115', nombre: 'Máquina de soldar inverter 400 A', tipo: 'Herramienta', precio: 52000 },
    { codigo: 'HER-122', nombre: 'Torque hidráulico 3/4 pulgada', tipo: 'Herramienta', precio: 47000 },
    { codigo: 'HER-130', nombre: 'Bomba de prueba hidrostática', tipo: 'Herramienta', precio: 38000 },
    { codigo: 'HER-141', nombre: 'Prensa hidráulica 20 t', tipo: 'Herramienta', precio: 41000 },
    { codigo: 'HER-150', nombre: 'Andamio modular 6 m', tipo: 'Herramienta', precio: 29000 },
    { codigo: 'INS-201', nombre: 'Cámara termográfica', tipo: 'Instrumento', precio: 72000 },
    { codigo: 'INS-208', nombre: 'Analizador de vibraciones', tipo: 'Instrumento', precio: 85000 },
];

// ---------- MATERIALES / SUMINISTROS ----------
// stockActual es el stock que la demo MUESTRA, ya descontado lo que consumieron los trabajos
// terminados: seed-demo.js no lo baja, sino que calcula hacia atrás el ingreso inicial de
// bodega que lo explica (ingreso = este número + lo consumido). Al revés —partir de este
// número y restarle los consumos— quedaban materiales en negativo.
//
// stockReservado tampoco se define acá: se calcula sumando los componentes de las OT que están
// en un estado que ya tomó reserva (Programada / En Ejecución / Reprogramar), para que la
// bodega cuadre con el pipeline en vez de ser un número decorativo que lo contradice.
//
// Al elegir estos números hay que dejar stockActual por encima de lo reservado, o el
// "disponible" que calcula la pantalla de tratamiento (stockActual - stockReservado) sale
// negativo. Lo reservado de cada material es la cantidad de la plantilla multiplicada por las
// OT programadas que la usan: ver el comentario de `trabajos` más abajo.
const suministros = [
    { codigo: 'SEL-204', descripcion: 'Kit de sellos hidráulicos 3 pulgadas', categoria: 'Repuesto', precio: 84500, stockActual: 18, bodega: 'Bodega Central' },
    { codigo: 'MAN-118', descripcion: 'Manguera hidráulica R2 media pulgada (m)', categoria: 'Repuesto', precio: 12400, stockActual: 240, bodega: 'Bodega Central' },
    { codigo: 'ACE-090', descripcion: 'Aceite hidráulico ISO 68 (tambor 200 l)', categoria: 'Insumo', precio: 398000, stockActual: 6, bodega: 'Bodega Central' },
    { codigo: 'ROD-556', descripcion: 'Rodamiento cónico 22216', categoria: 'Repuesto', precio: 67800, stockActual: 9, bodega: 'Bodega Central' },
    { codigo: 'EMP-330', descripcion: 'Empaquetadura grafitada 10 mm', categoria: 'Repuesto', precio: 21300, stockActual: 45, bodega: 'Bodega Central' },
    { codigo: 'FIL-088', descripcion: 'Filtro hidráulico de retorno', categoria: 'Repuesto', precio: 43900, stockActual: 14, bodega: 'Bodega Central' },
    { codigo: 'ELE-771', descripcion: 'Contactor tripolar 40 A', categoria: 'Repuesto', precio: 58200, stockActual: 24, bodega: 'Bodega Eléctrica' },
    { codigo: 'ELE-780', descripcion: 'Relé térmico regulable 25-40 A', categoria: 'Repuesto', precio: 39500, stockActual: 20, bodega: 'Bodega Eléctrica' },
    { codigo: 'SOL-410', descripcion: 'Electrodo E7018 3,25 mm (kg)', categoria: 'Insumo', precio: 6900, stockActual: 120, bodega: 'Bodega Central' },
    { codigo: 'DIS-205', descripcion: 'Disco de corte 7 pulgadas', categoria: 'Insumo', precio: 3400, stockActual: 60, bodega: 'Bodega Central' },
    { codigo: 'LUB-014', descripcion: 'Grasa EP2 (kg)', categoria: 'Insumo', precio: 8700, stockActual: 35, bodega: 'Bodega Central' },
    { codigo: 'EPP-500', descripcion: 'Set EPP completo', categoria: 'Insumo', precio: 46000, stockActual: 20, bodega: 'Bodega Central' },
    { codigo: 'TRA-001', descripcion: 'Flete camioneta ida y vuelta a planta', categoria: 'Transporte', precio: 95000, stockActual: 0, bodega: '' },
];

// ---------- PROVEEDORES ----------
const proveedores = [
    { ref: 'prov-hidra', nombre: 'Hidráulica del Pacífico Ltda.', contacto: 'Sergio Bravo', correo: 'ventas@hidropacifico.demo', telefono: '+56 2 2988 4410', tipoInsumo: 'Sellos, mangueras y aceites', rut: '76.412.880-4' },
    { ref: 'prov-rodam', nombre: 'Rodamientos y Transmisiones Sur S.A.', contacto: 'Lorena Fica', correo: 'cotizaciones@rtsur.demo', telefono: '+56 41 2755 190', tipoInsumo: 'Rodamientos y transmisión', rut: '77.905.221-8' },
    { ref: 'prov-solda', nombre: 'Insumos Soldadura Biobío Ltda.', contacto: 'Mauricio Lepe', correo: 'contacto@insusolda.demo', telefono: '+56 41 2310 775', tipoInsumo: 'Consumibles de soldadura', rut: '78.330.145-2' },
];

// ---------- PLANTILLAS ----------
// El orden importa: `trabajos[].plantilla` es el índice dentro de este array, y de ahí salen
// las tareas y los materiales de cada OT sembrada.
const plantillas = [
    {
        nombre: 'Mantención de sistema hidráulico', categoria: 'Hidráulica',
        descripcion: 'Cambio de sellos, mangueras y aceite en circuito hidráulico de equipo móvil.',
        procedimiento: 'Bloqueo y despresurización, retiro del mando, cambio de sellos y mangueras, llenado y purga, prueba de presión y entrega.',
        tareas: [
            { descripcion: 'Bloqueo, despresurización y desarme del mando', puesto: 'Técnico Hidráulico', duracion: 3 },
            { descripcion: 'Cambio de sellos y mangueras', puesto: 'Técnico Hidráulico', duracion: 5 },
            { descripcion: 'Llenado, purga y prueba de presión', puesto: 'Técnico Hidráulico', duracion: 3 },
        ],
        componentes: [
            { codigo: 'SEL-204', cantidad: 2, tipo: 'Material' },
            { codigo: 'MAN-118', cantidad: 6, tipo: 'Material' },
            { codigo: 'ACE-090', cantidad: 1, tipo: 'Material' },
        ],
        equipos: ['HER-130'],
        logistica: [{ descripcion: 'Flete camioneta ida y vuelta a planta', cantidad: 1, unidad: 'viaje', precio: 95000 }],
    },
    {
        nombre: 'Reparación estructural con soldadura', categoria: 'Soldadura',
        descripcion: 'Reparación de estructura metálica con soldadura certificada y ensayo visual.',
        procedimiento: 'Preparación de junta, precalentamiento, soldadura por pasadas, esmerilado y ensayo visual.',
        tareas: [
            { descripcion: 'Preparación de junta y biselado', puesto: 'Soldadora Certificada', duracion: 2 },
            { descripcion: 'Soldadura por pasadas', puesto: 'Soldadora Certificada', duracion: 6 },
            { descripcion: 'Esmerilado, limpieza y ensayo visual', puesto: 'Soldadora Certificada', duracion: 2 },
        ],
        componentes: [
            { codigo: 'SOL-410', cantidad: 8, tipo: 'Material' },
            { codigo: 'DIS-205', cantidad: 6, tipo: 'Material' },
        ],
        equipos: ['HER-115'],
        logistica: [{ descripcion: 'Flete camioneta ida y vuelta a planta', cantidad: 1, unidad: 'viaje', precio: 95000 }],
    },
    {
        nombre: 'Puesta en marcha de tablero eléctrico', categoria: 'Eléctrica',
        descripcion: 'Revisión, cambio de protecciones y puesta en marcha de tablero de fuerza.',
        procedimiento: 'Inspección termográfica, cambio de contactores y relés, reapriete, pruebas en vacío y con carga.',
        tareas: [
            { descripcion: 'Inspección termográfica y levantamiento', puesto: 'Eléctrico Industrial', duracion: 2 },
            { descripcion: 'Cambio de protecciones y reapriete', puesto: 'Eléctrico Industrial', duracion: 4 },
            { descripcion: 'Pruebas en vacío y con carga', puesto: 'Eléctrico Industrial', duracion: 2 },
        ],
        componentes: [
            { codigo: 'ELE-771', cantidad: 3, tipo: 'Material' },
            { codigo: 'ELE-780', cantidad: 3, tipo: 'Material' },
        ],
        equipos: ['INS-201'],
        logistica: [],
    },
];

// ---------- CATÁLOGO DEL FORMULARIO ADAPTATIVO ----------
// Sin esto el Informe de Evaluación de la PWA Operativa (O5 + EditorHallazgo) no tiene con qué
// trabajar: el buscador no sugiere nada y no hay listas que elegir. Y sin informe la oficina no
// puede pasar a las pestañas 1-4 de Tratamiento (TratamientoScreen: motivoTabs14), o sea que sin
// estos catálogos la demo se queda sin la mitad del flujo. Ver docs/plan-formulario-adaptativo.md.
//
// Las claves de `catalogosTransversales` son las que los marcadores {clave} de plantillaTexto
// resuelven cuando no son un campo propio del tipo (ver EditorHallazgo.resolverCampo).
const catalogosTransversales = [
    {
        clave: 'tipoEquipo', descripcion: 'Tipo de equipo', seleccion: 'unica',
        valores: ['Equipo móvil', 'Bomba', 'Motor eléctrico', 'Reductor', 'Tablero eléctrico',
            'Estructura metálica', 'Transportador', 'Compresor'].map((v) => ({ valor: v, categoria: '' })),
    },
    {
        clave: 'condicionesEntorno', descripcion: 'Condiciones del sitio', seleccion: 'multiple',
        valores: ['Espacio confinado', 'Trabajo en altura', 'Equipo en operación', 'Zona de tránsito de vehículos',
            'Ambiente húmedo', 'Alta temperatura', 'Poca iluminación', 'Sin energía disponible'].map((v) => ({ valor: v, categoria: '' })),
    },
    {
        clave: 'riesgos', descripcion: 'Riesgos identificados', seleccion: 'multiple',
        valores: ['Atrapamiento', 'Proyección de partículas', 'Contacto eléctrico', 'Quemadura',
            'Caída de altura', 'Golpe por carga suspendida', 'Derrame de aceite'].map((v) => ({ valor: v, categoria: '' })),
    },
    {
        clave: 'materiales', descripcion: 'Materiales requeridos', seleccion: 'multiple',
        valores: ['Kit de sellos hidráulicos', 'Manguera hidráulica', 'Aceite hidráulico', 'Rodamiento',
            'Empaquetadura', 'Filtro hidráulico', 'Contactor', 'Relé térmico', 'Electrodo',
            'Disco de corte', 'Grasa'].map((v) => ({ valor: v, categoria: '' })),
    },
    {
        clave: 'tareasSecundarias', descripcion: 'Tareas asociadas', seleccion: 'multiple',
        valores: [
            { valor: 'Bloqueo y despresurización', categoria: 'Desmontaje' },
            { valor: 'Retiro del componente', categoria: 'Desmontaje' },
            { valor: 'Traslado a taller', categoria: 'Traslado' },
            { valor: 'Reparación en banco', categoria: 'Taller' },
            { valor: 'Montaje del componente', categoria: 'Montaje' },
            { valor: 'Llenado y purga', categoria: 'Ajuste y verificación' },
            { valor: 'Prueba de presión', categoria: 'Ajuste y verificación' },
            { valor: 'Prueba en vacío y con carga', categoria: 'Ajuste y verificación' },
        ],
    },
];

// `sinonimos` es lo que hace que el buscador reaccione a lo que el supervisor escribe con sus
// palabras (motorSugerencia compara por palabra completa, normalizada sin tildes). El primero de
// la lista es el del hilo del video: se escribe "fuga de aceite en la manguera" y aparece.
const tiposTrabajo = [
    {
        codigoTipo: 'HID-REP', nombre: 'Reparación de sistema hidráulico',
        sinonimos: ['fuga', 'hidraulico', 'hidraulica', 'manguera', 'sello', 'cilindro', 'aceite', 'presion', 'goteo'],
        plantillaTexto: 'Se detecta {falla} en {componente} del sistema hidráulico de un {tipoEquipo}. '
            + 'Condiciones del sitio: {condicionesEntorno}. Riesgos: {riesgos}. '
            + 'Se requiere {tareasSecundarias}, con los siguientes materiales: {materiales}.',
        campos: [
            { clave: 'falla', etiqueta: 'Falla observada', tipoDato: 'seleccionUnica', obligatorio: true, orden: 1,
                opciones: ['fuga de aceite', 'pérdida de presión', 'manguera reventada', 'cilindro que baja solo', 'ruido en la bomba'] },
            { clave: 'componente', etiqueta: 'Componente afectado', tipoDato: 'seleccionUnica', obligatorio: true, orden: 2,
                opciones: ['el brazo izquierdo', 'el brazo derecho', 'la central hidráulica', 'el cilindro de levante', 'la línea de retorno'] },
        ],
        sugerencias: [
            { lista: 'tareasSecundarias', valor: 'Bloqueo y despresurización' },
            { lista: 'tareasSecundarias', valor: 'Llenado y purga' },
            { lista: 'tareasSecundarias', valor: 'Prueba de presión' },
            { lista: 'materiales', valor: 'Kit de sellos hidráulicos' },
            { lista: 'materiales', valor: 'Manguera hidráulica' },
            { lista: 'materiales', valor: 'Aceite hidráulico' },
            { lista: 'riesgos', valor: 'Derrame de aceite' },
        ],
    },
    {
        codigoTipo: 'SOL-EST', nombre: 'Reparación estructural con soldadura',
        sinonimos: ['soldadura', 'soldar', 'fisura', 'grieta', 'estructura', 'baranda', 'refuerzo', 'desgaste'],
        plantillaTexto: 'Se observa {falla} en {componente} de una {tipoEquipo}. '
            + 'Condiciones del sitio: {condicionesEntorno}. Riesgos: {riesgos}. '
            + 'Se requiere {tareasSecundarias}, con los siguientes materiales: {materiales}.',
        campos: [
            { clave: 'falla', etiqueta: 'Falla observada', tipoDato: 'seleccionUnica', obligatorio: true, orden: 1,
                opciones: ['una fisura', 'desgaste severo', 'una perforación', 'deformación', 'un cordón de soldadura roto'] },
            { clave: 'componente', etiqueta: 'Componente afectado', tipoDato: 'seleccionUnica', obligatorio: true, orden: 2,
                opciones: ['la plataforma de acceso', 'la baranda', 'el soporte del motor', 'la tolva de descarga', 'el chute'] },
        ],
        sugerencias: [
            { lista: 'tareasSecundarias', valor: 'Reparación en banco' },
            { lista: 'materiales', valor: 'Electrodo' },
            { lista: 'materiales', valor: 'Disco de corte' },
            { lista: 'riesgos', valor: 'Proyección de partículas' },
        ],
    },
    {
        codigoTipo: 'ELE-TAB', nombre: 'Intervención de tablero eléctrico',
        sinonimos: ['tablero', 'electrico', 'contactor', 'rele', 'proteccion', 'partidor', 'recalentamiento'],
        plantillaTexto: 'Se detecta {falla} en {componente} de un {tipoEquipo}. '
            + 'Condiciones del sitio: {condicionesEntorno}. Riesgos: {riesgos}. '
            + 'Se requiere {tareasSecundarias}, con los siguientes materiales: {materiales}.',
        campos: [
            { clave: 'falla', etiqueta: 'Falla observada', tipoDato: 'seleccionUnica', obligatorio: true, orden: 1,
                opciones: ['recalentamiento', 'falla intermitente', 'contactor pegado', 'ausencia de alimentación', 'disparo de protección'] },
            { clave: 'componente', etiqueta: 'Componente afectado', tipoDato: 'seleccionUnica', obligatorio: true, orden: 2,
                opciones: ['el tablero de fuerza', 'el partidor', 'la sala eléctrica', 'el circuito de comando'] },
        ],
        sugerencias: [
            { lista: 'tareasSecundarias', valor: 'Prueba en vacío y con carga' },
            { lista: 'materiales', valor: 'Contactor' },
            { lista: 'materiales', valor: 'Relé térmico' },
            { lista: 'riesgos', valor: 'Contacto eléctrico' },
        ],
    },
    {
        codigoTipo: 'MEC-ROT', nombre: 'Mantención de elementos rotatorios',
        sinonimos: ['rodamiento', 'reductor', 'vibracion', 'ruido', 'polea', 'correa', 'eje', 'acoplamiento'],
        plantillaTexto: 'Se detecta {falla} en {componente} de un {tipoEquipo}. '
            + 'Condiciones del sitio: {condicionesEntorno}. Riesgos: {riesgos}. '
            + 'Se requiere {tareasSecundarias}, con los siguientes materiales: {materiales}.',
        campos: [
            { clave: 'falla', etiqueta: 'Falla observada', tipoDato: 'seleccionUnica', obligatorio: true, orden: 1,
                opciones: ['vibración anormal', 'ruido de rodamiento', 'temperatura elevada', 'juego excesivo'] },
            { clave: 'componente', etiqueta: 'Componente afectado', tipoDato: 'seleccionUnica', obligatorio: true, orden: 2,
                opciones: ['el reductor', 'el eje de transmisión', 'la polea motriz', 'el acoplamiento'] },
        ],
        sugerencias: [
            { lista: 'tareasSecundarias', valor: 'Retiro del componente' },
            { lista: 'tareasSecundarias', valor: 'Traslado a taller' },
            { lista: 'materiales', valor: 'Rodamiento' },
            { lista: 'materiales', valor: 'Grasa' },
            { lista: 'riesgos', valor: 'Atrapamiento' },
        ],
    },
];

// ---------- CUENTAS CONTABLES ----------
const cuentasContables = [
    { codigo: '1101', nombre: 'Caja', tipo: 'Activo', naturaleza: 'Deudora' },
    { codigo: '1102', nombre: 'Banco cuenta corriente', tipo: 'Activo', naturaleza: 'Deudora' },
    { codigo: '1201', nombre: 'Clientes por cobrar', tipo: 'Activo', naturaleza: 'Deudora' },
    { codigo: '1301', nombre: 'Existencias (materiales)', tipo: 'Activo', naturaleza: 'Deudora' },
    { codigo: '2101', nombre: 'Proveedores por pagar', tipo: 'Pasivo', naturaleza: 'Acreedora' },
    { codigo: '2102', nombre: 'IVA débito fiscal', tipo: 'Pasivo', naturaleza: 'Acreedora' },
    { codigo: '2103', nombre: 'IVA crédito fiscal', tipo: 'Activo', naturaleza: 'Deudora' },
    { codigo: '3101', nombre: 'Capital', tipo: 'Patrimonio', naturaleza: 'Acreedora' },
    { codigo: '4101', nombre: 'Ingresos por servicios', tipo: 'Ingreso', naturaleza: 'Acreedora' },
    { codigo: '5101', nombre: 'Costo de mano de obra', tipo: 'Gasto', naturaleza: 'Deudora' },
    { codigo: '5102', nombre: 'Costo de materiales', tipo: 'Gasto', naturaleza: 'Deudora' },
    { codigo: '5103', nombre: 'Gastos generales', tipo: 'Gasto', naturaleza: 'Deudora' },
].map((c) => ({ ...c, nivel: 1, activa: true, descripcion: '' }));

// ---------- TRABAJOS (Solicitud + OT) ----------
// 28 solicitudes correlativas desde SOL-2026-0814. Las 25 primeras tienen OT; las 3 últimas
// quedan Pendientes sin OT, que es lo que alimenta el KPI "Solicitudes sin OT" del panel.
//
// El correlativo termina en 0841 A PROPÓSITO: el número de la OT se deriva del de su
// solicitud (otController.numeroOTDesdeSolicitud), así que la solicitud que el cliente crea
// EN VIVO durante el video sale SOL-2026-0842 y su OT, OT-2026-0842 — la del guion, sin
// tener que forzar ningún número a mano.
const PRIMER_CORRELATIVO = 814;

// `dias` son offsets respecto del día de la carga: negativo es pasado, positivo futuro.
// `responsableRef` ejecuta las tareas; `supervisorRef` es quien responde por la OT completa.
const trabajos = [
    { clienteRef: 'cli-maipo', plantilla: 0, descripcion: 'Fuga hidráulica en brazo izquierdo de cargador frontal 4', estado: 'Pagada', dias: -47, responsableRef: 'per-fuentes' },
    { clienteRef: 'cli-frigo', plantilla: 2, descripcion: 'Tablero de fuerza de sala de máquinas con protecciones recalentadas', estado: 'Pagada', dias: -44, responsableRef: 'per-cortes' },
    { clienteRef: 'cli-embot', plantilla: 1, descripcion: 'Fisura en estructura de soporte de transportador de botellas', estado: 'Pagada', dias: -41, responsableRef: 'per-ibarra' },
    { clienteRef: 'cli-molin', plantilla: 0, descripcion: 'Pérdida de presión en central hidráulica de prensa', estado: 'Pagada', dias: -38, responsableRef: 'per-fuentes' },
    { clienteRef: 'cli-coronel', plantilla: 1, descripcion: 'Reparación de tolva de descarga con desgaste en el costado', estado: 'Pagada', dias: -35, responsableRef: 'per-ibarra' },
    { clienteRef: 'cli-maipo', plantilla: 2, descripcion: 'Partidor de bomba de riego queda pegado al arrancar', estado: 'Con Informe', dias: -31, responsableRef: 'per-cortes' },
    { clienteRef: 'cli-frigo', plantilla: 0, descripcion: 'Cilindro de portón de cámara baja solo', estado: 'Con Informe', dias: -29, responsableRef: 'per-fuentes' },
    { clienteRef: 'cli-embot', plantilla: 2, descripcion: 'Tablero de llenadora con falla intermitente de contactor', estado: 'Con Informe', dias: -27, responsableRef: 'per-cortes' },
    { clienteRef: 'cli-molin', plantilla: 1, descripcion: 'Refuerzo de plataforma de acceso a silo 3', estado: 'Trabajo Terminado', dias: -24, responsableRef: 'per-ibarra' },
    { clienteRef: 'cli-coronel', plantilla: 0, descripcion: 'Mantención de central hidráulica de cinta transportadora', estado: 'Trabajo Terminado', dias: -22, responsableRef: 'per-negrete' },
    { clienteRef: 'cli-maipo', plantilla: 1, descripcion: 'Soldadura de baranda dañada en pasarela de planta', estado: 'Trabajo Terminado', dias: -20, responsableRef: 'per-ibarra' },
    { clienteRef: 'cli-frigo', plantilla: 2, descripcion: 'Cambio de protecciones en tablero de compresores', estado: 'En Ejecución', dias: -6, responsableRef: 'per-cortes' },
    // dias: 0 (HOY) a propósito: es el trabajo que usa la escena de terreno del video, y con
    // fecha pasada no aparece en "Mi día" ni en "Mis trabajos" de la PWA, que miran la semana
    // en curso. Un trabajo en ejecución hoy también es lo que uno espera ver al abrir la app.
    { clienteRef: 'cli-embot', plantilla: 0, descripcion: 'Cambio de mangueras en unidad hidráulica de paletizador', estado: 'En Ejecución', dias: 0, responsableRef: 'per-fuentes' },
    { clienteRef: 'cli-molin', plantilla: 1, descripcion: 'Reparación de ducto de aspiración con perforaciones', estado: 'En Ejecución', dias: -4, responsableRef: 'per-ibarra' },
    { clienteRef: 'cli-coronel', plantilla: 2, descripcion: 'Puesta en marcha de tablero de sala eléctrica 2', estado: 'Programada', dias: 2, responsableRef: 'per-cortes' },
    { clienteRef: 'cli-maipo', plantilla: 0, descripcion: 'Mantención preventiva de central hidráulica de línea 2', estado: 'Programada', dias: 3, responsableRef: 'per-fuentes' },
    { clienteRef: 'cli-frigo', plantilla: 1, descripcion: 'Refuerzo estructural de rack de cámara de congelado', estado: 'Programada', dias: 5, responsableRef: 'per-ibarra' },
    { clienteRef: 'cli-embot', plantilla: 2, descripcion: 'Normalización de tablero de sala de compresores', estado: 'Programada', dias: 8, responsableRef: 'per-cortes' },
    { clienteRef: 'cli-molin', plantilla: 0, descripcion: 'Revisión de fuga en gato hidráulico de volteador', estado: 'Reprogramar', dias: 4, responsableRef: 'per-negrete' },
    { clienteRef: 'cli-coronel', plantilla: 1, descripcion: 'Reparación de chute de descarga con desgaste severo', estado: 'Planificada', dias: 7, responsableRef: 'per-ibarra', cotizacionEnviada: true },
    { clienteRef: 'cli-maipo', plantilla: 2, descripcion: 'Cambio de contactores en tablero de sala de bombas', estado: 'Planificada', dias: 9, responsableRef: 'per-cortes', cotizacionEnviada: true },
    { clienteRef: 'cli-frigo', plantilla: 0, descripcion: 'Mantención de unidad hidráulica de puerta rápida', estado: 'Planificada', dias: 10, responsableRef: 'per-fuentes' },
    { clienteRef: 'cli-embot', plantilla: 1, descripcion: 'Soldadura de soporte de motor de transportador 4', estado: 'Planificada', dias: 12, responsableRef: 'per-ibarra' },
    { clienteRef: 'cli-molin', plantilla: 2, descripcion: 'Inspección termográfica de tableros de molienda', estado: 'Tratada', dias: 14, responsableRef: 'per-cortes' },
    { clienteRef: 'cli-coronel', plantilla: 0, descripcion: 'Cambio de filtros y aceite en central hidráulica de grúa', estado: 'Tratada', dias: 15, responsableRef: 'per-negrete' },
    // Sin OT — alimentan el KPI "Solicitudes sin OT" del panel de control.
    { clienteRef: 'cli-maipo', plantilla: 1, descripcion: 'Ruido y vibración en reductor de cinta de despacho', estado: 'Pendiente', dias: -1, sinOT: true },
    { clienteRef: 'cli-frigo', plantilla: 2, descripcion: 'Luminarias del andén sin alimentación desde el corte', estado: 'Pendiente', dias: -1, sinOT: true },
    { clienteRef: 'cli-embot', plantilla: 0, descripcion: 'Goteo en conexión de central hidráulica de enfardadora', estado: 'Pendiente', dias: 0, sinOT: true },
];

// ---------- ÓRDENES DE COMPRA ----------
// `otIndice` apunta a la posición dentro de `trabajos` (la OC pertenece a una OT).
const ordenesCompra = [
    {
        numeroOC: 'OC-2026-0231', proveedorRef: 'prov-hidra', otIndice: 12, estado: 'Recibida', dias: -12,
        items: [
            { codigo: 'SEL-204', cantidad: 6, precioUnitario: 79000 },
            { codigo: 'MAN-118', cantidad: 40, precioUnitario: 11200 },
        ],
    },
    {
        numeroOC: 'OC-2026-0238', proveedorRef: 'prov-rodam', otIndice: 13, estado: 'En tránsito', dias: -4,
        items: [{ codigo: 'ROD-556', cantidad: 4, precioUnitario: 62500 }],
    },
    {
        numeroOC: 'OC-2026-0242', proveedorRef: 'prov-solda', otIndice: 16, estado: 'Emitida', dias: -1,
        items: [
            { codigo: 'SOL-410', cantidad: 25, precioUnitario: 6200 },
            { codigo: 'DIS-205', cantidad: 30, precioUnitario: 2900 },
        ],
    },
];

module.exports = {
    EMPRESA, clientes, puestos, calendarios, personal, equipos, suministros,
    proveedores, plantillas, cuentasContables, trabajos, ordenesCompra, PRIMER_CORRELATIVO,
    catalogosTransversales, tiposTrabajo,
};
