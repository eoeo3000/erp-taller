// Genera erp-backend/seeds/demo.json — juego de datos de demostración (§9.2 del README de
// rediseño). Se ejecuta a mano cuando el contenido de la demo necesita cambiar
// (`node seeds/generar-demo.js`); el archivo resultante queda versionado en el repo y es lo que
// demoController.js lee en tiempo real. Las fechas NO quedan fijas: se guardan como offsets en
// días relativos al momento en que se ejecuta POST /api/demo/cargar (ver resolverFechas en
// demoController.js), así el Gantt y la matriz de Recursos de la demo nunca aparecen vacíos.
//
// Convenciones del archivo generado:
//  - Cada colección es un array de objetos "planos" (no ObjectIds reales todavía).
//  - "_ref" es un id de texto local para que otras colecciones se refieran a este registro
//    (ej: recursos[].calendarioRef === calendarios[]._ref). demoController.js resuelve estas
//    referencias a ObjectId reales durante la carga, en el orden de dependencia correcto.
//  - { "$diasFecha": N } se resuelve a un Date real (hoy + N días) — para campos tipo Date.
//  - { "$diasTexto": N } se resuelve a un string "YYYY-MM-DD" (hoy + N días) — para campos
//    tipo String que igual representan fechas (fecha de tarea, de pago, del informe, etc).

const fs = require('fs');
const path = require('path');

function svgFoto(texto, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${color}"/><text x="320" y="240" font-family="Helvetica,Arial,sans-serif" font-size="28" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${texto}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ---------- PUESTOS ----------
const puestos = [
    { _ref: 'p-mecanico', nombre: 'Mecánico Industrial', costoHora: 9500, categoria: 'Técnico' },
    { _ref: 'p-soldador', nombre: 'Soldadora Certificada', costoHora: 11000, categoria: 'Técnico' },
    { _ref: 'p-electrico', nombre: 'Eléctrico Industrial', costoHora: 10500, categoria: 'Técnico' },
    { _ref: 'p-supervisor', nombre: 'Supervisora de Terreno', costoHora: 14000, categoria: 'Supervisión' },
    { _ref: 'p-hidraulico', nombre: 'Técnico Hidráulico', costoHora: 9800, categoria: 'Técnico' },
    { _ref: 'p-admin', nombre: 'Administradora de Operaciones', costoHora: 8500, categoria: 'Administrativo' },
    { _ref: 'p-gruero', nombre: 'Operador de Grúa', costoHora: 9000, categoria: 'Operativo' },
    { _ref: 'p-guardia', nombre: 'Guardia de Faena', costoHora: 6500, categoria: 'Operativo' },
];

// ---------- CUENTAS CONTABLES ----------
const cuentasContables = [
    { _ref: 'c-1101', codigo: '1101', nombre: 'Caja', tipo: 'Activo', naturaleza: 'Deudora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-1102', codigo: '1102', nombre: 'Banco Estado Cta Cte', tipo: 'Activo', naturaleza: 'Deudora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-1201', codigo: '1201', nombre: 'Clientes por Cobrar', tipo: 'Activo', naturaleza: 'Deudora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-1301', codigo: '1301', nombre: 'Existencias (Insumos)', tipo: 'Activo', naturaleza: 'Deudora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-2101', codigo: '2101', nombre: 'Proveedores por Pagar', tipo: 'Pasivo', naturaleza: 'Acreedora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-2102', codigo: '2102', nombre: 'IVA Débito Fiscal', tipo: 'Pasivo', naturaleza: 'Acreedora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-2103', codigo: '2103', nombre: 'IVA Crédito Fiscal', tipo: 'Activo', naturaleza: 'Deudora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-3101', codigo: '3101', nombre: 'Capital', tipo: 'Patrimonio', naturaleza: 'Acreedora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-4101', codigo: '4101', nombre: 'Ingresos por Servicios OT', tipo: 'Ingreso', naturaleza: 'Acreedora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-5101', codigo: '5101', nombre: 'Costo de Mano de Obra', tipo: 'Gasto', naturaleza: 'Deudora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-5102', codigo: '5102', nombre: 'Costo de Materiales', tipo: 'Gasto', naturaleza: 'Deudora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
    { _ref: 'c-5103', codigo: '5103', nombre: 'Gastos Generales', tipo: 'Gasto', naturaleza: 'Deudora', nivel: 1, padreRef: null, activa: true, descripcion: '' },
];

// ---------- CALENDARIOS (4) ----------
const diasSemana = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const nombresDia = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };

function bloque(inicio, fin) { return { inicio, fin }; }

const calendarios = [
    {
        _ref: 'cal-admin', nombre: 'Turno Administrativo L-V', tipo: 'semanal', cicloDias: 7,
        config: diasSemana.map(d => ({
            dia: d, nombreDia: nombresDia[d],
            activo: !['sabado', 'domingo'].includes(d),
            bloques: !['sabado', 'domingo'].includes(d) ? [bloque('08:30', '17:30')] : [],
        })),
    },
    {
        _ref: 'cal-taller', nombre: 'Turno Taller L-V + Sábado AM', tipo: 'semanal', cicloDias: 7,
        config: diasSemana.map(d => ({
            dia: d, nombreDia: nombresDia[d],
            activo: d !== 'domingo',
            bloques: d === 'sabado' ? [bloque('08:00', '13:00')] : d === 'domingo' ? [] : [bloque('08:00', '18:00')],
        })),
    },
    {
        _ref: 'cal-rotativo', nombre: 'Turno Terreno Rotativo 7x7', tipo: 'rotativo', cicloDias: 14,
        config: Array.from({ length: 14 }, (_, i) => ({
            dia: String(i + 1), nombreDia: `Día ${i + 1}`,
            activo: i < 7,
            bloques: i < 7 ? [bloque('08:00', '19:00')] : [],
        })),
    },
    {
        _ref: 'cal-nocturno', nombre: 'Turno Nocturno Guardia', tipo: 'semanal', cicloDias: 7,
        config: diasSemana.map(d => ({
            dia: d, nombreDia: nombresDia[d],
            activo: ['lunes', 'miercoles', 'viernes', 'domingo'].includes(d),
            bloques: ['lunes', 'miercoles', 'viernes', 'domingo'].includes(d) ? [bloque('20:00', '08:00')] : [],
        })),
    },
];

// ---------- RECURSOS (8 personas) ----------
const recursos = [
    { _ref: 'r-manuel', nombre: 'Manuel Zúñiga', puesto: 'Mecánico Industrial', tipo: 'Interno', calendarioRef: 'cal-taller', telefono: '+56 9 8123 4501', email: 'manuel.zuniga@maestranzavergara.cl', tarifaHora: 9500, fechaInicioCiclo: { $diasTexto: -400 }, ausencias: [] },
    { _ref: 'r-patricia', nombre: 'Patricia Elgueta', puesto: 'Soldadora Certificada', tipo: 'Interno', calendarioRef: 'cal-taller', telefono: '+56 9 8123 4502', email: 'patricia.elgueta@maestranzavergara.cl', tarifaHora: 11000, fechaInicioCiclo: { $diasTexto: -380 }, ausencias: [] },
    { _ref: 'r-jorge', nombre: 'Jorge Huenchullán', puesto: 'Eléctrico Industrial', tipo: 'Interno', calendarioRef: 'cal-taller', telefono: '+56 9 8123 4503', email: 'jorge.huenchullan@maestranzavergara.cl', tarifaHora: 10500, fechaInicioCiclo: { $diasTexto: -300 }, ausencias: [] },
    { _ref: 'r-camila', nombre: 'Camila Reyes', puesto: 'Supervisora de Terreno', tipo: 'Interno', calendarioRef: 'cal-rotativo', telefono: '+56 9 8123 4504', email: 'camila.reyes@maestranzavergara.cl', tarifaHora: 14000, fechaInicioCiclo: { $diasTexto: -14 }, ausencias: [] },
    { _ref: 'r-diego', nombre: 'Diego Fuentes', puesto: 'Técnico Hidráulico', tipo: 'Interno', calendarioRef: 'cal-rotativo', telefono: '+56 9 8123 4505', email: 'diego.fuentes@maestranzavergara.cl', tarifaHora: 9800, fechaInicioCiclo: { $diasTexto: -14 }, ausencias: [] },
    { _ref: 'r-francisca', nombre: 'Francisca Molina', puesto: 'Administradora de Operaciones', tipo: 'Interno', calendarioRef: 'cal-admin', telefono: '+56 9 8123 4506', email: 'francisca.molina@maestranzavergara.cl', tarifaHora: 8500, fechaInicioCiclo: { $diasTexto: -600 }, ausencias: [] },
    { _ref: 'r-rodrigo', nombre: 'Rodrigo Salgado', puesto: 'Operador de Grúa', tipo: 'Externo', calendarioRef: 'cal-taller', telefono: '+56 9 8123 4507', email: 'rodrigo.salgado@maestranzavergara.cl', tarifaHora: 9000, fechaInicioCiclo: { $diasTexto: -90 }, ausencias: [] },
    { _ref: 'r-ignacio', nombre: 'Ignacio Bravo', puesto: 'Guardia de Faena', tipo: 'Interno', calendarioRef: 'cal-nocturno', telefono: '+56 9 8123 4508', email: 'ignacio.bravo@maestranzavergara.cl', tarifaHora: 6500, fechaInicioCiclo: { $diasTexto: -200 }, ausencias: [] },
];

// ---------- SUMINISTROS (18) ----------
const suministros = [
    { _ref: 's-1', codigo: 'SUM-001', descripcion: 'Filtro de aceite hidráulico', precio: 12500, categoria: 'Repuesto', stockActual: 40, stockReservado: 4, bodega: 'Bodega Central' },
    { _ref: 's-2', codigo: 'SUM-002', descripcion: 'Correa trapezoidal A-52', precio: 8900, categoria: 'Repuesto', stockActual: 25, stockReservado: 0, bodega: 'Bodega Central' },
    { _ref: 's-3', codigo: 'SUM-003', descripcion: 'Electrodo 6011 3.2mm (kg)', precio: 3200, categoria: 'Insumo', stockActual: 120, stockReservado: 20, bodega: 'Bodega Central' },
    { _ref: 's-4', codigo: 'SUM-004', descripcion: 'Grasa multiuso EP2 (balde 15kg)', precio: 45000, categoria: 'Insumo', stockActual: 8, stockReservado: 0, bodega: 'Bodega Central' },
    { _ref: 's-5', codigo: 'SUM-005', descripcion: 'Guantes de cuero reforzado (par)', precio: 5200, categoria: 'Insumo', stockActual: 60, stockReservado: 6, bodega: 'Bodega Central' },
    { _ref: 's-6', codigo: 'SUM-006', descripcion: 'Disco de corte 14"', precio: 4100, categoria: 'Insumo', stockActual: 90, stockReservado: 10, bodega: 'Bodega Central' },
    { _ref: 's-7', codigo: 'SUM-007', descripcion: 'Manguera hidráulica 1/2" (metro)', precio: 6800, categoria: 'Repuesto', stockActual: 150, stockReservado: 0, bodega: 'Bodega Central' },
    { _ref: 's-8', codigo: 'SUM-008', descripcion: 'Rodamiento 6205-2RS', precio: 7300, categoria: 'Repuesto', stockActual: 35, stockReservado: 2, bodega: 'Bodega Central' },
    { _ref: 's-9', codigo: 'SUM-009', descripcion: 'Pintura anticorrosiva (galón)', precio: 28000, categoria: 'Insumo', stockActual: 20, stockReservado: 0, bodega: 'Bodega Central' },
    { _ref: 's-10', codigo: 'SUM-010', descripcion: 'Combustible diésel (litro)', precio: 980, categoria: 'Transporte', stockActual: 500, stockReservado: 0, bodega: 'Bodega Terreno' },
    { _ref: 's-11', codigo: 'SUM-011', descripcion: 'Retén de eje 40x62x8', precio: 4500, categoria: 'Repuesto', stockActual: 22, stockReservado: 0, bodega: 'Bodega Central' },
    { _ref: 's-12', codigo: 'SUM-012', descripcion: 'Cable de acero 3/8" (metro)', precio: 3900, categoria: 'Repuesto', stockActual: 200, stockReservado: 15, bodega: 'Bodega Central' },
    { _ref: 's-13', codigo: 'SUM-013', descripcion: 'Solvente desengrasante (litro)', precio: 3400, categoria: 'Insumo', stockActual: 45, stockReservado: 0, bodega: 'Bodega Central' },
    { _ref: 's-14', codigo: 'SUM-014', descripcion: 'Perno hexagonal M12x60 (unidad)', precio: 350, categoria: 'Repuesto', stockActual: 400, stockReservado: 40, bodega: 'Bodega Central' },
    { _ref: 's-15', codigo: 'SUM-015', descripcion: 'Flete menor local', precio: 25000, categoria: 'Transporte', stockActual: 0, stockReservado: 0, bodega: '' },
    { _ref: 's-16', codigo: 'SUM-016', descripcion: 'Cinta aislante eléctrica', precio: 1800, categoria: 'Insumo', stockActual: 75, stockReservado: 0, bodega: 'Bodega Central' },
    { _ref: 's-17', codigo: 'SUM-017', descripcion: 'Terminal eléctrico ojal 10mm', precio: 220, categoria: 'Repuesto', stockActual: 300, stockReservado: 0, bodega: 'Bodega Central' },
    { _ref: 's-18', codigo: 'SUM-018', descripcion: 'Arriendo de generador diario', precio: 55000, categoria: 'Otro', stockActual: 0, stockReservado: 0, bodega: '' },
];

// ---------- EQUIPOS (14) ----------
const equipos = [
    { _ref: 'e-1', nombre: 'Grúa horquilla 3 ton', tipo: 'Maquinaria', precio: 85000, codigo: 'EQ-001', estado: 'Disponible' },
    { _ref: 'e-2', nombre: 'Soldadora inversora 200A', tipo: 'Herramienta', precio: 420000, codigo: 'EQ-002', estado: 'Disponible' },
    { _ref: 'e-3', nombre: 'Compresor de aire 50L', tipo: 'Herramienta', precio: 180000, codigo: 'EQ-003', estado: 'En Uso' },
    { _ref: 'e-4', nombre: 'Multímetro digital industrial', tipo: 'Instrumento', precio: 65000, codigo: 'EQ-004', estado: 'Disponible' },
    { _ref: 'e-5', nombre: 'Amoladora angular 7"', tipo: 'Herramienta', precio: 95000, codigo: 'EQ-005', estado: 'Disponible' },
    { _ref: 'e-6', nombre: 'Generador diésel 10kVA', tipo: 'Maquinaria', precio: 1200000, codigo: 'EQ-006', estado: 'Mantenimiento' },
    { _ref: 'e-7', nombre: 'Grúa pluma 5 ton', tipo: 'Maquinaria', precio: 2500000, codigo: 'EQ-007', estado: 'Reservado' },
    { _ref: 'e-8', nombre: 'Taladro magnético', tipo: 'Herramienta', precio: 310000, codigo: 'EQ-008', estado: 'Disponible' },
    { _ref: 'e-9', nombre: 'Termómetro infrarrojo', tipo: 'Instrumento', precio: 45000, codigo: 'EQ-009', estado: 'Disponible' },
    { _ref: 'e-10', nombre: 'Elevador hidráulico 2 ton', tipo: 'Maquinaria', precio: 680000, codigo: 'EQ-010', estado: 'Disponible' },
    { _ref: 'e-11', nombre: 'Llave de impacto neumática', tipo: 'Herramienta', precio: 150000, codigo: 'EQ-011', estado: 'En Uso' },
    { _ref: 'e-12', nombre: 'Manómetro de presión industrial', tipo: 'Instrumento', precio: 38000, codigo: 'EQ-012', estado: 'Disponible' },
    { _ref: 'e-13', nombre: 'Andamio modular (juego)', tipo: 'Herramienta', precio: 320000, codigo: 'EQ-013', estado: 'Reparación' },
    { _ref: 'e-14', nombre: 'Camioneta de servicio 4x4', tipo: 'Maquinaria', precio: 18000000, codigo: 'EQ-014', estado: 'Disponible' },
];

// ---------- PLANTILLAS (5) ----------
const plantillas = [
    {
        nombre: 'Mantención preventiva bomba centrífuga', descripcion: 'Revisión, lubricación y cambio de sellos de bomba centrífuga industrial', categoria: 'Mantención', procedimiento: 'Detener equipo, bloquear energía, desmontar acople, revisar sellos y rodamientos, lubricar y re-montar.',
        tareas: [
            { descripcion: 'Bloqueo y aislamiento de energía (LOTO)', puesto: 'Eléctrico Industrial', duracion: 1 },
            { descripcion: 'Desmontaje de acople y revisión de sellos', puesto: 'Mecánico Industrial', duracion: 3 },
            { descripcion: 'Lubricación y re-montaje', puesto: 'Mecánico Industrial', duracion: 2 },
        ],
        componentes: [
            { codigo: 'SUM-001', descripcion: 'Filtro de aceite hidráulico', cantidad: 1, precio: 12500, tipo: 'Material' },
            { codigo: 'SUM-008', descripcion: 'Rodamiento 6205-2RS', cantidad: 2, precio: 7300, tipo: 'Material' },
        ],
        logistica: [{ descripcion: 'Flete menor local', cantidad: 1, unidad: 'viaje', precio: 25000 }],
    },
    {
        nombre: 'Instalación tablero eléctrico industrial', descripcion: 'Montaje y conexionado de tablero eléctrico trifásico', categoria: 'Instalación', procedimiento: 'Fijar gabinete, tender canalizaciones, conexionar protecciones, medir y certificar.',
        tareas: [
            { descripcion: 'Montaje de gabinete y canalizaciones', puesto: 'Eléctrico Industrial', duracion: 4 },
            { descripcion: 'Conexionado de protecciones y circuitos', puesto: 'Eléctrico Industrial', duracion: 5 },
            { descripcion: 'Pruebas de aislación y puesta en marcha', puesto: 'Eléctrico Industrial', duracion: 2 },
        ],
        componentes: [
            { codigo: 'SUM-016', descripcion: 'Cinta aislante eléctrica', cantidad: 4, precio: 1800, tipo: 'Material' },
            { codigo: 'SUM-017', descripcion: 'Terminal eléctrico ojal 10mm', cantidad: 20, precio: 220, tipo: 'Material' },
        ],
        logistica: [],
    },
    {
        nombre: 'Reparación estructural de estanque', descripcion: 'Reparación de plancha corroída y refuerzo estructural en estanque metálico', categoria: 'Reparación', procedimiento: 'Vaciar y ventilar estanque, cortar sección dañada, soldar refuerzo, pintar con anticorrosivo.',
        tareas: [
            { descripcion: 'Corte y preparación de plancha', puesto: 'Soldadora Certificada', duracion: 3 },
            { descripcion: 'Soldadura de refuerzo estructural', puesto: 'Soldadora Certificada', duracion: 6 },
            { descripcion: 'Pintura anticorrosiva', puesto: 'Mecánico Industrial', duracion: 2 },
        ],
        componentes: [
            { codigo: 'SUM-003', descripcion: 'Electrodo 6011 3.2mm (kg)', cantidad: 5, precio: 3200, tipo: 'Material' },
            { codigo: 'SUM-009', descripcion: 'Pintura anticorrosiva (galón)', cantidad: 2, precio: 28000, tipo: 'Material' },
        ],
        logistica: [{ descripcion: 'Arriendo de generador diario', cantidad: 2, unidad: 'día', precio: 55000 }],
    },
    {
        nombre: 'Overhaul de motor diésel', descripcion: 'Reacondicionamiento completo de motor diésel estacionario', categoria: 'Mantención mayor', procedimiento: 'Desarmar motor, medir tolerancias, cambiar retenes y rodamientos críticos, re-armar y probar.',
        tareas: [
            { descripcion: 'Desarme y diagnóstico', puesto: 'Mecánico Industrial', duracion: 4 },
            { descripcion: 'Cambio de retenes y rodamientos', puesto: 'Mecánico Industrial', duracion: 6 },
            { descripcion: 'Re-armado y prueba en banco', puesto: 'Técnico Hidráulico', duracion: 4 },
        ],
        componentes: [
            { codigo: 'SUM-011', descripcion: 'Retén de eje 40x62x8', cantidad: 3, precio: 4500, tipo: 'Material' },
            { codigo: 'SUM-004', descripcion: 'Grasa multiuso EP2 (balde 15kg)', cantidad: 1, precio: 45000, tipo: 'Material' },
        ],
        logistica: [],
    },
    {
        nombre: 'Inspección y certificación de grúa horquilla', descripcion: 'Inspección técnica reglamentaria y certificación anual', categoria: 'Inspección', procedimiento: 'Revisar sistema hidráulico, frenos, horquillas y estructura; emitir informe de certificación.',
        tareas: [
            { descripcion: 'Inspección visual y funcional', puesto: 'Supervisora de Terreno', duracion: 2 },
            { descripcion: 'Revisión de sistema hidráulico y frenos', puesto: 'Técnico Hidráulico', duracion: 3 },
        ],
        componentes: [],
        logistica: [],
    },
];

// ---------- EMPRESAS / SOLICITUDES (8 empresas, 14 solicitudes) ----------
const empresas = [
    { nombre: 'Pesquera Austral SpA', contacto: 'Rodrigo Iturra', correo: 'rodrigo.iturra@pesqueraaustral.cl' },
    { nombre: 'Constructora Los Álamos', contacto: 'Marcela Vidal', correo: 'marcela.vidal@losalamos.cl' },
    { nombre: 'Frigorífico San Rafael', contacto: 'Cristián Paredes', correo: 'cristian.paredes@frigosanrafael.cl' },
    { nombre: 'Minera Cordillera Ltda.', contacto: 'Andrea Muñoz', correo: 'andrea.munoz@mineracordillera.cl' },
    { nombre: 'Transportes Bío Bío', contacto: 'Felipe Concha', correo: 'felipe.concha@transportesbiobio.cl' },
    { nombre: 'Agrícola Las Vertientes', contacto: 'Soledad Aravena', correo: 'soledad.aravena@lasvertientes.cl' },
    { nombre: 'Puerto Coronel Terminal', contacto: 'Hugo Sanhueza', correo: 'hugo.sanhueza@puertocoronel.cl' },
    { nombre: 'Viña Los Robles', contacto: 'Bárbara Ceballos', correo: 'barbara.ceballos@vinalosrobles.cl' },
];

const descripcionesSolicitud = [
    'Falla en bomba de agua de proceso, requiere revisión urgente',
    'Instalación de tablero eléctrico para nueva línea de producción',
    'Reparación de estructura metálica con corrosión visible',
    'Mantención preventiva programada de motor diésel de respaldo',
    'Certificación anual de grúa horquilla',
    'Fuga hidráulica en elevador de carga',
    'Habilitación eléctrica de bodega nueva',
    'Soldadura de refuerzo en pasarela de acceso',
    'Diagnóstico de vibración anómala en compresor',
    'Cambio de rodamientos en cinta transportadora',
    'Revisión de sistema de frenos de grúa pluma',
    'Instalación de generador de respaldo',
    'Mantención correctiva de sistema hidráulico',
    'Inspección de tuberías y válvulas de proceso',
];

// 12 solicitudes se convierten en OT (una por empresa, con las 2 primeras empresas con 2 cada una
// para llegar a 12), las 2 últimas quedan como solicitud pura sin convertir.
const solicitudes = descripcionesSolicitud.map((desc, i) => {
    const empresa = empresas[i % empresas.length];
    return {
        _ref: `sol-${i + 1}`,
        solicitante: empresa.contacto,
        empresaSolicitante: empresa.nombre,
        correo: empresa.correo,
        numero: `+56 9 7${String(700000 + i * 137).padStart(6, '0')}`,
        direccion: 'Camino Industrial s/n, Parque Industrial',
        descripcion: desc,
        origen: i % 3 === 0 ? 'WhatsApp' : i % 3 === 1 ? 'Correo' : 'Teléfono',
        estado: i < 12 ? 'Convertida' : 'Pendiente',
        fechaHoraSolicitud: { $diasFecha: -60 + i * 4 },
        fechaEjecucionSolicitada: { $diasFecha: -50 + i * 4 },
        plazoEjecucionSugerido: '15 días hábiles',
        numeroSolicitud: `SOL-2026-${String(i + 1).padStart(4, '0')}`,
    };
});

// ---------- OTs (12, al menos una por cada uno de los 10 estados) ----------
const ESTADOS_OT = ['Pendiente', 'Tratada', 'Planificada', 'Aprobada', 'Rechazada', 'Programada', 'En Ejecución', 'En Ejecución', 'Trabajo Terminado', 'Con Informe', 'Pagada', 'Pagada'];

const fotoColores = ['#3a3a35', '#57564f', '#6b6a63', '#8a8981'];
let contadorReporte = 0;
function reportesPara(n, offsetBase, usuarios) {
    const out = [];
    for (let i = 0; i < n; i++) {
        contadorReporte++;
        out.push({
            fecha: { $diasFecha: offsetBase + i },
            tareaId: '',
            comentario: `Avance registrado en terreno — visita ${i + 1}.`,
            foto: svgFoto(`Reporte ${contadorReporte}`, fotoColores[contadorReporte % fotoColores.length]),
            usuario: usuarios[i % usuarios.length],
        });
    }
    return out;
}

const ots = ESTADOS_OT.map((estado, i) => {
    const sol = solicitudes[i];
    const empresa = empresas[i % empresas.length];
    const base = {
        _ref: `ot-${i + 1}`,
        numeroOT: `OT-2026-${String(i + 1).padStart(4, '0')}`,
        solicitante: sol.solicitante,
        solicitudRef: sol._ref,
        descripcion: sol.descripcion,
        estado,
        origen: 'Manual',
        prioridad: ['Baja', 'Media', 'Alta', 'Urgente'][i % 4],
        tecnicoAsignado: '',
        tareas: [],
        componentes: [],
        logistica: [],
        reportes: [],
        granTotal: 0,
        pago: { estado: 'Pendiente', montoPagado: 0, fechaPago: '', metodoPago: 'Transferencia', referencia: '', notas: '', anulado: false, fechaAnulacion: '', motivoAnulacion: '' },
    };

    if (estado === 'Pendiente') return base;

    // Desde 'Tratada' en adelante hay informe de evaluación completo.
    base.informeEvaluacion = {
        fecha: { $diasTexto: -40 + i * 3 },
        responsable: 'Camila Reyes',
        condicionesSitio: `Faena de ${empresa.nombre}, acceso vehicular disponible, EPP obligatorio.`,
        fotos: [],
        recursosObservados: 'Se requiere personal técnico y equipo de izaje menor.',
        riesgos: 'Trabajo en altura media, superficies con aceite residual.',
        metodologia: 'Bloqueo de energía, ejecución por etapas, verificación final con cliente.',
        completo: true,
        tareas: [],
        componentes: [],
        logistica: [],
    };

    if (['Tratada'].includes(estado)) return base;

    base.tareas = [
        { descripcion: 'Diagnóstico inicial en terreno', puesto: 'Mecánico Industrial', duracion: 2, fecha: { $diasTexto: -20 + i * 3 }, hora: '08:30', operarioRefs: ['r-manuel'], valorHora: 9500, completada: ['Trabajo Terminado', 'Con Informe', 'Pagada'].includes(estado) },
        { descripcion: 'Ejecución de trabajo principal', puesto: 'Soldadora Certificada', duracion: 4, fecha: { $diasTexto: -19 + i * 3 }, hora: '09:00', operarioRefs: ['r-patricia', 'r-jorge'], valorHora: 11000, completada: ['Trabajo Terminado', 'Con Informe', 'Pagada'].includes(estado) },
    ];
    base.componentes = [
        { codigo: 'SUM-001', descripcion: 'Filtro de aceite hidráulico', cantidad: 2, precio: 12500, tipo: 'Material' },
        { codigo: 'EQ-002', descripcion: 'Soldadora inversora 200A', cantidad: 1, precio: 0, tipo: 'Equipo' },
    ];
    base.logistica = [{ unidad: 'Camioneta 01', patente: 'HJKL-23', descripcion: 'Traslado de personal y equipo', cantidad: 1, precio: 25000 }];
    base.granTotal = 2 * 12500 + 4 * 11000 + 2 * 9500 + 25000;

    if (['Planificada', 'Aprobada', 'Rechazada'].includes(estado)) return base;

    base.fechaInicio = { $diasFecha: -18 + i * 3 };
    base.fechaEntrega = { $diasFecha: -10 + i * 3 };

    if (estado === 'Programada') return base;

    // En Ejecución, Trabajo Terminado, Con Informe, Pagada: hay reportes de terreno.
    if (estado === 'En Ejecución' && i === 6) base.reportes = reportesPara(3, -3, ['Camila Reyes', 'Diego Fuentes']);
    if (estado === 'En Ejecución' && i === 7) base.reportes = reportesPara(2, -2, ['Camila Reyes']);
    if (estado === 'Trabajo Terminado') base.reportes = reportesPara(4, -8, ['Camila Reyes', 'Diego Fuentes']);
    if (estado === 'Con Informe') base.reportes = reportesPara(5, -12, ['Camila Reyes', 'Diego Fuentes', 'Ignacio Bravo']);
    if (estado === 'Pagada' && i === 10) base.reportes = reportesPara(2, -25, ['Camila Reyes']);
    if (estado === 'Pagada' && i === 11) base.reportes = reportesPara(2, -30, ['Diego Fuentes']);

    if (['En Ejecución'].includes(estado)) return base;

    // Trabajo Terminado en adelante: pago parcial o pagado según etapa.
    if (estado === 'Trabajo Terminado') {
        base.pago = { estado: 'Pendiente', montoPagado: 0, fechaPago: '', metodoPago: 'Transferencia', referencia: '', notas: '', anulado: false, fechaAnulacion: '', motivoAnulacion: '' };
        return base;
    }
    if (estado === 'Con Informe') {
        base.pago = { estado: 'Parcial', montoPagado: Math.round(base.granTotal * 0.4), fechaPago: { $diasTexto: -6 }, metodoPago: 'Transferencia', referencia: 'TRF-88213', notas: 'Anticipo recibido', anulado: false, fechaAnulacion: '', motivoAnulacion: '' };
        return base;
    }
    if (estado === 'Pagada') {
        base.pago = { estado: 'Pagado', montoPagado: base.granTotal, fechaPago: { $diasTexto: i === 10 ? -20 : -25 }, metodoPago: 'Transferencia', referencia: `TRF-8${8000 + i}`, notas: 'Pago total recibido', anulado: false, fechaAnulacion: '', motivoAnulacion: '' };
    }
    return base;
});

// ---------- ASIENTOS CONTABLES (6 meses cerrados de historial) ----------
const asientosContables = [];
let numAsiento = 1;
for (let mes = 6; mes >= 1; mes--) {
    const offsetIngreso = -(mes * 30) + 5;
    const offsetCosto = -(mes * 30) + 8;
    asientosContables.push({
        numeroAsiento: `AS-2026-${String(numAsiento++).padStart(4, '0')}`,
        fecha: { $diasTexto: offsetIngreso },
        descripcion: `Facturación de servicios OT — mes cerrado (${mes} meses atrás)`,
        tipo: 'automatico',
        origen: { tipo: 'OT', referenciaId: null, referenciaNro: `OT-2026-${String(((6 - mes) % 12) + 1).padStart(4, '0')}` },
        lineas: [
            { cuentaRef: 'c-1201', cuentaCodigo: '1201', cuentaNombre: 'Clientes por Cobrar', debe: 1500000 + mes * 20000, haber: 0, glosa: 'Venta de servicios' },
            { cuentaRef: 'c-4101', cuentaCodigo: '4101', cuentaNombre: 'Ingresos por Servicios OT', debe: 0, haber: 1500000 + mes * 20000, glosa: 'Venta de servicios' },
        ],
        totalDebe: 1500000 + mes * 20000,
        totalHaber: 1500000 + mes * 20000,
        estado: 'vigente',
        creadoPor: 'Sistema',
    });
    asientosContables.push({
        numeroAsiento: `AS-2026-${String(numAsiento++).padStart(4, '0')}`,
        fecha: { $diasTexto: offsetCosto },
        descripcion: `Costo de mano de obra y materiales — mes cerrado (${mes} meses atrás)`,
        tipo: 'automatico',
        origen: { tipo: 'OT', referenciaId: null, referenciaNro: `OT-2026-${String(((6 - mes) % 12) + 1).padStart(4, '0')}` },
        lineas: [
            { cuentaRef: 'c-5101', cuentaCodigo: '5101', cuentaNombre: 'Costo de Mano de Obra', debe: 620000 + mes * 8000, haber: 0, glosa: 'Costo de personal asignado' },
            { cuentaRef: 'c-2101', cuentaCodigo: '2101', cuentaNombre: 'Proveedores por Pagar', debe: 0, haber: 620000 + mes * 8000, glosa: 'Costo de personal asignado' },
        ],
        totalDebe: 620000 + mes * 8000,
        totalHaber: 620000 + mes * 8000,
        estado: 'vigente',
        creadoPor: 'Sistema',
    });
}

const demo = { puestos, cuentasContables, calendarios, recursos, suministros, equipos, plantillas, solicitudes, ots, asientosContables };

fs.writeFileSync(path.join(__dirname, 'demo.json'), JSON.stringify(demo, null, 2), 'utf8');

const totalDocs = puestos.length + cuentasContables.length + calendarios.length + recursos.length + suministros.length + equipos.length + plantillas.length + solicitudes.length + ots.length + asientosContables.length;
const totalReportes = ots.reduce((acc, ot) => acc + (ot.reportes ? ot.reportes.length : 0), 0);
console.log(`demo.json generado: ${totalDocs} documentos de nivel superior + ${totalReportes} reportes de terreno embebidos.`);
