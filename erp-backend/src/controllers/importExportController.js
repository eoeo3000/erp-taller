const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const getRecurso = require('../models/Recurso');
const getSuministro = require('../models/suministro');
const getEquipo = require('../models/equiposHerramientas');
const getPuesto = require('../models/puesto');
const getOT = require('../models/OT');
const getSolicitud = require('../models/Solicitud');
const getTipoTrabajo = require('../models/TipoTrabajo');
const getCatalogoTransversal = require('../models/CatalogoTransversal');
const TIPOS_DATO_CAMPO = getTipoTrabajo.TIPOS_DATO_CAMPO;

// ── HELPERS ───────────────────────────────────────────────────────────────────

function parsearExcel(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function normStr(v) { return String(v || '').trim(); }
function normNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function normSiNo(v) { return /^s(i|í)$/i.test(normStr(v)); }
function normLista(v) { return normStr(v).split(',').map(s => s.trim()).filter(Boolean); }

// Para el catálogo de tipos de trabajo (varias hojas, ver docs/plan-formulario-adaptativo.md
// §7) — a diferencia de parsearExcel (siempre la primera hoja), acá hace falta leer varias
// hojas del mismo archivo por nombre.
function parsearHoja(wb, nombreHoja) {
    const sheet = wb.Sheets[nombreHoja];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

// "Cambio de línea" -> "CAMBIO_DE_LINEA" — código de correlación entre hojas, generado al
// exportar; no se guarda en el modelo (TipoTrabajo se identifica por nombre, igual que
// Puesto), es solo para que las hojas de un mismo archivo se puedan enlazar entre sí.
const ACENTOS = { 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N', 'Ü': 'U' };
function sinAcentos(s) { return s.replace(/[ÁÉÍÓÚÑÜ]/g, (c) => ACENTOS[c] || c); }

function slugCodigo(nombre) {
    return sinAcentos(normStr(nombre).toUpperCase())
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

// Índice de listas (docs/plan-formulario-adaptativo.md §3.3) — prácticamente estático: son
// las 9 listas transversales que trae hoy el catálogo real. Vive como constante (no en Mongo)
// porque describe la FORMA del catálogo (qué claves son transversales y si son de selección
// única o múltiple), no datos propios de una lista — eso sí vive en CatalogoTransversal.
const INDICE_LISTAS = [
    { clave: 'condicionesEntorno', seleccion: 'múltiple', universal: 'Sí', descripcion: 'Condiciones del entorno donde se ejecuta el trabajo' },
    { clave: 'tipoEquipo', seleccion: 'única', universal: 'Sí', descripcion: 'Equipo sobre el que se interviene' },
    { clave: 'trabajosPrevios', seleccion: 'múltiple', universal: 'Sí', descripcion: 'Lo que hay que hacer antes de empezar' },
    { clave: 'tareasSecundarias', seleccion: 'múltiple', universal: 'Sí', descripcion: 'Tareas que arrastra la tarea principal. Pre-sugeridas por tipo' },
    { clave: 'materiales', seleccion: 'múltiple', universal: 'Sí', descripcion: 'Materiales y consumibles requeridos. Pre-sugeridos por tipo' },
    { clave: 'tareasHabilitadoras', seleccion: 'múltiple', universal: 'Sí', descripcion: 'Recursos y permisos que habilitan la ejecución' },
    { clave: 'riesgos', seleccion: 'múltiple', universal: 'Sí', descripcion: 'Riesgos que el supervisor debe identificar. Pre-sugeridos por tipo' },
    { clave: 'obrasCiviles', seleccion: 'única', universal: 'NO', descripcion: 'Solo en los tipos donde aplica. Ver hoja Sugerencias por tipo' },
    { clave: 'trabajosCierre', seleccion: 'múltiple', universal: 'Sí', descripcion: 'Lo que cierra formalmente el trabajo' },
];
const CLAVES_TRANSVERSALES = new Set(INDICE_LISTAS.map(l => l.clave));

// Una sugerencia premarcada cuyo valor no matchea ningún valor real del catálogo transversal
// de esa lista, y viene entre paréntesis, es la convención "esto aplica pero se elige en
// terreno, no hay valor premarcado sensato" (ver plan §0) — no un dato roto. Se reconoce por
// patrón y se descarta sin reportar error de fila.
function esMarcadorDeAplicabilidad(valor) {
    return /^\(.*\)$/.test(normStr(valor));
}

function construirWorkbookCatalogo(tipos, catalogosTransversales = []) {
    const wb = XLSX.utils.book_new();
    agregarHojasCatalogo(wb, tipos, catalogosTransversales);
    return wb;
}

// Separado de construirWorkbookCatalogo para poder sumar las 7 hojas del catálogo a un
// workbook YA existente (exportarBatch, cuando "tipos-trabajo" se selecciona junto a otros
// módulos) en vez de generar siempre un archivo aparte.
function agregarHojasCatalogo(wb, tipos, catalogosTransversales = []) {
    const filasTipos = [], filasCampos = [], filasOpciones = [], filasSugerencias = [];

    for (const t of tipos) {
        const codigoTipo = t.codigoTipo || slugCodigo(t.nombre);
        filasTipos.push({
            codigoTipo,
            nombre: t.nombre,
            sinonimos: (t.sinonimos || []).join(', '),
            plantillaTexto: t.plantillaTexto || '',
            condicionesNoAplicables: (t.condicionesNoAplicables || []).join(', '),
        });
        for (const c of (t.campos || [])) {
            filasCampos.push({
                codigoTipo, clave: c.clave, etiqueta: c.etiqueta, tipoDato: c.tipoDato,
                obligatorio: c.obligatorio ? 'Sí' : 'No', orden: c.orden ?? 0,
            });
            for (const op of (c.opciones || [])) {
                filasOpciones.push({ codigoTipo, clave: c.clave, opcion: op });
            }
        }
        for (const s of (t.sugerencias || [])) {
            filasSugerencias.push({ codigoTipo, lista: s.lista, valor: s.valor, porDefecto: 'Sí' });
        }
    }

    const filasIndice = INDICE_LISTAS;
    const filasTransversales = [];
    for (const cat of catalogosTransversales) {
        for (const v of (cat.valores || [])) {
            filasTransversales.push({ lista: cat.clave, valor: v.valor, categoria: v.categoria || '' });
        }
    }

    agregarHoja(wb, [{ 'Catálogo de tipos de trabajo — Informes de Evaluación': 'Ver docs/plan-formulario-adaptativo.md para la explicación completa del modelo.' }], 'Instrucciones');
    agregarHoja(wb, filasTipos, 'Tipos de trabajo');
    agregarHoja(wb, filasCampos, 'Campos');
    agregarHoja(wb, filasOpciones, 'Opciones');
    agregarHoja(wb, filasTransversales, 'Catálogos transversales');
    agregarHoja(wb, filasSugerencias, 'Sugerencias por tipo');
    agregarHoja(wb, filasIndice, 'Índice de listas');
    return wb;
}

// ── IMPORTAR ──────────────────────────────────────────────────────────────────

exports.importarRecursos = async (req, res) => {
    const Recurso = getRecurso(req.db);
    try {
        const filas = parsearExcel(req.file.buffer);
        const insertados = [], errores = [];

        for (let i = 0; i < filas.length; i++) {
            const f = filas[i];
            const nombre = normStr(f.nombre || f.Nombre || f.NOMBRE);
            if (!nombre) { errores.push({ fila: i + 2, motivo: 'nombre vacío' }); continue; }

            const tipo = normStr(f.tipo || f.Tipo) || 'Humano';
            const tiposValidos = ['Interno', 'Externo', 'Humano'];
            const tipoFinal = tiposValidos.includes(tipo) ? tipo : 'Humano';

            try {
                const doc = await Recurso.create({
                    nombre,
                    puesto: normStr(f.puesto || f.Puesto),
                    tipo: tipoFinal,
                    telefono: normStr(f.telefono || f.Telefono),
                    email: normStr(f.email || f.Email),
                    tarifaHora: normNum(f.tarifaHora || f.tarifa_hora || f['Tarifa Hora'])
                });
                insertados.push(doc.nombre);
            } catch (e) {
                errores.push({ fila: i + 2, motivo: e.message });
            }
        }

        res.json({ total: filas.length, insertados: insertados.length, errores });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.importarSuministros = async (req, res) => {
    const Suministro = getSuministro(req.db);
    try {
        const filas = parsearExcel(req.file.buffer);
        const insertados = [], errores = [];

        const categoriasValidas = ['Transporte', 'Repuesto', 'Insumo', 'Otro'];

        for (let i = 0; i < filas.length; i++) {
            const f = filas[i];
            const codigo = normStr(f.codigo || f.Codigo || f.CODIGO || f['Código']);
            const descripcion = normStr(f.descripcion || f.Descripcion || f.DESCRIPCION || f['Descripción']);

            if (!codigo) { errores.push({ fila: i + 2, motivo: 'código vacío' }); continue; }
            if (!descripcion) { errores.push({ fila: i + 2, motivo: 'descripción vacía' }); continue; }

            const cat = normStr(f.categoria || f.Categoria || f['Categoría']) || 'Insumo';
            const categoriaFinal = categoriasValidas.includes(cat) ? cat : 'Insumo';

            try {
                await Suministro.findOneAndUpdate(
                    { codigo },
                    { codigo, descripcion, precio: normNum(f.precio || f.Precio), categoria: categoriaFinal },
                    { upsert: true, new: true, runValidators: true }
                );
                insertados.push(codigo);
            } catch (e) {
                errores.push({ fila: i + 2, motivo: e.message });
            }
        }

        res.json({ total: filas.length, insertados: insertados.length, errores });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.importarEquipos = async (req, res) => {
    const Equipo = getEquipo(req.db);
    try {
        const filas = parsearExcel(req.file.buffer);
        const insertados = [], errores = [];

        const tiposValidos = ['Herramienta', 'Maquinaria', 'Instrumento'];
        const estadosValidos = ['Disponible', 'En Uso', 'Mantenimiento', 'Reparación'];

        for (let i = 0; i < filas.length; i++) {
            const f = filas[i];
            const nombre = normStr(f.nombre || f.Nombre || f.NOMBRE);
            if (!nombre) { errores.push({ fila: i + 2, motivo: 'nombre vacío' }); continue; }

            const tipo = normStr(f.tipo || f.Tipo) || 'Herramienta';
            const estado = normStr(f.estado || f.Estado) || 'Disponible';

            try {
                const doc = await Equipo.create({
                    nombre,
                    codigo: normStr(f.codigo || f.Codigo || f['Código']),
                    tipo: tiposValidos.includes(tipo) ? tipo : 'Herramienta',
                    estado: estadosValidos.includes(estado) ? estado : 'Disponible',
                    precio: normNum(f.precio || f.Precio)
                });
                insertados.push(doc.nombre);
            } catch (e) {
                errores.push({ fila: i + 2, motivo: e.message });
            }
        }

        res.json({ total: filas.length, insertados: insertados.length, errores });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.importarPuestos = async (req, res) => {
    const Puesto = getPuesto(req.db);
    try {
        const filas = parsearExcel(req.file.buffer);
        const insertados = [], errores = [];

        const categoriasValidas = ['Operativo', 'Técnico', 'Administrativo', 'Supervisión'];

        for (let i = 0; i < filas.length; i++) {
            const f = filas[i];
            const nombre = normStr(f.nombre || f.Nombre || f.NOMBRE || f.puesto || f.Puesto);
            if (!nombre) { errores.push({ fila: i + 2, motivo: 'nombre vacío' }); continue; }

            const cat = normStr(f.categoria || f.Categoria || f['Categoría']) || 'Técnico';

            try {
                await Puesto.findOneAndUpdate(
                    { nombre },
                    { nombre, costoHora: normNum(f.costoHora || f.costo_hora || f['Costo Hora']), categoria: categoriasValidas.includes(cat) ? cat : 'Técnico' },
                    { upsert: true, new: true, runValidators: true }
                );
                insertados.push(nombre);
            } catch (e) {
                errores.push({ fila: i + 2, motivo: e.message });
            }
        }

        res.json({ total: filas.length, insertados: insertados.length, errores });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Catálogo de tipos de trabajo — 7 hojas por archivo (ver
// docs/plan-formulario-adaptativo.md §8): "Índice de listas", "Catálogos transversales",
// "Tipos de trabajo", "Campos", "Opciones" y "Sugerencias por tipo" (más "Instrucciones", de
// solo lectura, que no se procesa). Todas unidas por `codigoTipo`, columna de texto libre que
// la persona que arma el Excel define ella misma — no es un id de Mongo. Las 9 listas
// transversales (condicionesEntorno, tipoEquipo, ...) ya NO son un campo más de cada tipo —
// viven en CatalogoTransversal, compartidas entre todos los tipos que las referencian en su
// plantillaTexto (ver plan §3.3).
exports.importarTiposTrabajo = async (req, res) => {
    const TipoTrabajo = getTipoTrabajo(req.db);
    const CatalogoTransversal = getCatalogoTransversal(req.db);
    try {
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const filasIndice = parsearHoja(wb, 'Índice de listas');
        const filasTransversales = parsearHoja(wb, 'Catálogos transversales');
        const filasTipos = parsearHoja(wb, 'Tipos de trabajo');
        const filasCampos = parsearHoja(wb, 'Campos');
        const filasOpciones = parsearHoja(wb, 'Opciones');
        const filasSugerencias = parsearHoja(wb, 'Sugerencias por tipo');
        const errores = [];

        // 1) Índice de listas — de dónde salen las claves transversales válidas. Si el archivo
        // no trae esta hoja (compatibilidad con un archivo más simple, sin catálogos
        // transversales), se usan las 9 conocidas hoy como respaldo.
        const clavesTransversales = filasIndice.length
            ? new Set(filasIndice.map(f => normStr(f.clave)).filter(Boolean))
            : CLAVES_TRANSVERSALES;

        // 2) Catálogos transversales, agrupados por lista, y upsert inmediato — las hojas
        // siguientes ya los necesitan cargados para validar contra ellos.
        const valoresPorLista = new Map(); // lista -> Set(valor)
        const catalogosPorLista = new Map(); // lista -> [{valor, categoria}]
        for (const f of filasTransversales) {
            const lista = normStr(f.lista);
            const valor = normStr(f.valor);
            if (!lista || !valor) continue;
            if (!clavesTransversales.has(lista)) { errores.push({ fila: 0, motivo: `lista desconocida "${lista}" en Catálogos transversales (fila con valor "${valor}")` }); continue; }
            if (!catalogosPorLista.has(lista)) { catalogosPorLista.set(lista, []); valoresPorLista.set(lista, new Set()); }
            catalogosPorLista.get(lista).push({ valor, categoria: normStr(f.categoria) });
            valoresPorLista.get(lista).add(valor);
        }
        const catalogosInsertados = [];
        for (const [lista, valores] of catalogosPorLista) {
            const meta = filasIndice.find(f => normStr(f.clave) === lista);
            try {
                await CatalogoTransversal.findOneAndUpdate(
                    { clave: lista },
                    {
                        clave: lista,
                        descripcion: normStr(meta?.descripcion),
                        seleccion: normStr(meta?.seleccion).includes('múltipl') || normStr(meta?.seleccion).includes('multipl') ? 'multiple' : 'unica',
                        valores,
                    },
                    { upsert: true, new: true, runValidators: true }
                );
                catalogosInsertados.push(lista);
            } catch (e) {
                errores.push({ fila: 0, motivo: `catálogo transversal "${lista}": ${e.message}` });
            }
        }

        // 3) Campos agrupados por codigoTipo + clave (Hoja "Campos") — solo campos propios de
        // cada tipo, nunca una clave transversal (si alguien la declara ahí por error, no hay
        // forma de saberlo desde acá; el motor de texto la resuelve igual en tiempo real).
        const camposPorTipo = new Map(); // codigoTipo -> Map(clave -> campo)
        for (const f of filasCampos) {
            const codigoTipo = normStr(f.codigoTipo);
            const clave = normStr(f.clave);
            if (!codigoTipo || !clave) continue;
            if (!camposPorTipo.has(codigoTipo)) camposPorTipo.set(codigoTipo, new Map());
            const tipoDato = normStr(f.tipoDato);
            camposPorTipo.get(codigoTipo).set(clave, {
                clave,
                etiqueta: normStr(f.etiqueta) || clave,
                tipoDato: TIPOS_DATO_CAMPO.includes(tipoDato) ? tipoDato : 'texto',
                obligatorio: normSiNo(f.obligatorio),
                orden: normNum(f.orden),
                opciones: [],
            });
        }

        // 4) Opciones anexadas a su campo (Hoja "Opciones").
        for (const f of filasOpciones) {
            const codigoTipo = normStr(f.codigoTipo);
            const clave = normStr(f.clave);
            const opcion = normStr(f.opcion);
            if (!codigoTipo || !clave || !opcion) continue;
            const campo = camposPorTipo.get(codigoTipo)?.get(clave);
            if (campo) campo.opciones.push(opcion);
        }

        // 5) Sugerencias premarcadas por tipo (Hoja "Sugerencias por tipo") — valida que la
        // lista y el valor existan; el marcador especial de aplicabilidad (ver
        // esMarcadorDeAplicabilidad, plan §0) se descarta en silencio, no es un error.
        const sugerenciasPorTipo = new Map(); // codigoTipo -> [{lista, valor}]
        for (let i = 0; i < filasSugerencias.length; i++) {
            const f = filasSugerencias[i];
            const codigoTipo = normStr(f.codigoTipo);
            const lista = normStr(f.lista);
            const valor = normStr(f.valor);
            if (!codigoTipo || !lista || !valor) continue;
            if (!clavesTransversales.has(lista)) { errores.push({ fila: i + 2, motivo: `Sugerencias por tipo: lista desconocida "${lista}"` }); continue; }
            if (!valoresPorLista.get(lista)?.has(valor)) {
                if (esMarcadorDeAplicabilidad(valor)) continue; // convención conocida, no un error
                errores.push({ fila: i + 2, motivo: `Sugerencias por tipo: "${valor}" no existe en la lista "${lista}"` });
                continue;
            }
            if (!sugerenciasPorTipo.has(codigoTipo)) sugerenciasPorTipo.set(codigoTipo, []);
            sugerenciasPorTipo.get(codigoTipo).push({ lista, valor });
        }

        // 6) Tipos de trabajo (Hoja "Tipos de trabajo") — upsert final. Se matchea por
        // codigoTipo O por nombre: cubre tanto el caso normal (ya tiene codigoTipo de una
        // importación anterior con este mismo formato) como el de un catálogo cargado con el
        // importador anterior (3 hojas, sin codigoTipo) — para no duplicar esos tipos, se
        // actualiza el documento existente en vez de crear uno nuevo al lado.
        const insertados = [];
        for (let i = 0; i < filasTipos.length; i++) {
            const f = filasTipos[i];
            const nombre = normStr(f.nombre);
            if (!nombre) { errores.push({ fila: i + 2, motivo: 'nombre vacío' }); continue; }

            const codigoTipo = (normStr(f.codigoTipo) || slugCodigo(nombre)).toUpperCase();
            const camposMapa = camposPorTipo.get(codigoTipo);
            const campos = camposMapa ? [...camposMapa.values()].sort((a, b) => a.orden - b.orden) : [];

            const condicionesEntornoValidas = valoresPorLista.get('condicionesEntorno') || new Set();
            const condicionesNoAplicables = normLista(f.condicionesNoAplicables).filter(v => {
                if (condicionesEntornoValidas.has(v)) return true;
                errores.push({ fila: i + 2, motivo: `condición no aplicable "${v}" no existe en la lista condicionesEntorno` });
                return false;
            });

            try {
                await TipoTrabajo.findOneAndUpdate(
                    { $or: [{ codigoTipo }, { nombre }] },
                    {
                        codigoTipo, nombre,
                        sinonimos: normLista(f.sinonimos),
                        plantillaTexto: normStr(f.plantillaTexto),
                        campos,
                        condicionesNoAplicables,
                        sugerencias: sugerenciasPorTipo.get(codigoTipo) || [],
                    },
                    { upsert: true, new: true, runValidators: true }
                );
                insertados.push(nombre);
            } catch (e) {
                errores.push({ fila: i + 2, motivo: e.message });
            }
        }

        res.json({ total: filasTipos.length, insertados: insertados.length, catalogosTransversales: catalogosInsertados.length, errores });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── EXPORTAR (genera buffer Excel en el servidor) ─────────────────────────────

exports.exportarRecursos = async (req, res) => {
    const Recurso = getRecurso(req.db);
    try {
        const docs = await Recurso.find().lean();
        const filas = docs.map(d => ({
            nombre: d.nombre,
            puesto: d.puesto || '',
            tipo: d.tipo || '',
            telefono: d.telefono || '',
            email: d.email || '',
            tarifaHora: d.tarifaHora || 0
        }));
        enviarExcel(res, filas, 'Personal', 'recursos_personal.xlsx');
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.exportarSuministros = async (req, res) => {
    const Suministro = getSuministro(req.db);
    try {
        const docs = await Suministro.find().lean();
        const filas = docs.map(d => ({
            codigo: d.codigo,
            descripcion: d.descripcion,
            precio: d.precio || 0,
            categoria: d.categoria || ''
        }));
        enviarExcel(res, filas, 'Suministros', 'suministros.xlsx');
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.exportarEquipos = async (req, res) => {
    const Equipo = getEquipo(req.db);
    try {
        const docs = await Equipo.find().lean();
        const filas = docs.map(d => ({
            nombre: d.nombre,
            codigo: d.codigo || '',
            tipo: d.tipo || '',
            estado: d.estado || '',
            precio: d.precio || 0
        }));
        enviarExcel(res, filas, 'Equipos', 'equipos_herramientas.xlsx');
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.exportarPuestos = async (req, res) => {
    const Puesto = getPuesto(req.db);
    try {
        const docs = await Puesto.find().lean();
        const filas = docs.map(d => ({
            nombre: d.nombre,
            costoHora: d.costoHora || 0,
            categoria: d.categoria || ''
        }));
        enviarExcel(res, filas, 'Puestos', 'puestos.xlsx');
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.exportarOTs = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { desde, hasta, estado } = req.query;
        const filtro = {};
        if (estado) filtro.estado = estado;
        if (desde || hasta) {
            filtro.fechaCreacion = {};
            if (desde) filtro.fechaCreacion.$gte = new Date(desde);
            if (hasta) filtro.fechaCreacion.$lte = new Date(hasta + 'T23:59:59');
        }

        const docs = await OT.find(filtro).sort({ createdAt: -1 }).lean();
        const filas = docs.map(d => ({
            numeroOT: d.numeroOT || '',
            solicitante: d.solicitante || '',
            descripcion: d.descripcion || '',
            estado: d.estado || '',
            prioridad: d.prioridad || '',
            granTotal: d.granTotal || 0,
            estadoPago: d.pago?.estado || 'Pendiente',
            montoPagado: d.pago?.montoPagado || 0,
            pagoAnulado: d.pago?.anulado ? 'Sí' : 'No',
            fechaCreacion: d.fechaCreacion ? new Date(d.fechaCreacion).toLocaleDateString('es-CL') : '',
            fechaEntrega: d.fechaEntrega ? new Date(d.fechaEntrega).toLocaleDateString('es-CL') : '',
            nTareas: (d.tareas || []).length,
            nComponentes: (d.componentes || []).length
        }));
        enviarExcel(res, filas, 'OTs', 'ordenes_trabajo.xlsx');
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.exportarSolicitudes = async (req, res) => {
    const Solicitud = getSolicitud(req.db);
    try {
        const docs = await Solicitud.find().sort({ fechaCreacion: -1 }).lean();
        const filas = docs.map(d => ({
            solicitante: d.solicitante || '',
            empresa: d.empresaSolicitante || '',
            descripcion: d.descripcion || '',
            estado: d.estado || '',
            origen: d.origen || '',
            correo: d.correo || '',
            numero: d.numero || '',
            fechaSolicitud: d.fechaCreacion ? new Date(d.fechaCreacion).toLocaleDateString('es-CL') : ''
        }));
        enviarExcel(res, filas, 'Solicitudes', 'solicitudes.xlsx');
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.exportarTiposTrabajo = async (req, res) => {
    const TipoTrabajo = getTipoTrabajo(req.db);
    const CatalogoTransversal = getCatalogoTransversal(req.db);
    try {
        const [tipos, catalogosTransversales] = await Promise.all([
            TipoTrabajo.find().lean(),
            CatalogoTransversal.find().lean(),
        ]);
        const wb = construirWorkbookCatalogo(tipos, catalogosTransversales);
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="catalogo_tipos_trabajo.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── PLANTILLAS VACÍAS ─────────────────────────────────────────────────────────

exports.plantillaRecursos = (_req, res) => {
    const filas = [{ nombre: 'Juan Pérez', puesto: 'Electricista', tipo: 'Humano', telefono: '+56912345678', email: 'juan@empresa.cl', tarifaHora: 5000 }];
    enviarExcel(res, filas, 'Personal', 'plantilla_recursos.xlsx');
};
exports.plantillaSuministros = (_req, res) => {
    const filas = [{ codigo: 'INS-001', descripcion: 'Cable eléctrico 2.5mm', precio: 850, categoria: 'Repuesto' }];
    enviarExcel(res, filas, 'Suministros', 'plantilla_suministros.xlsx');
};
exports.plantillaEquipos = (_req, res) => {
    const filas = [{ nombre: 'Taladro Bosch', codigo: 'HER-001', tipo: 'Herramienta', estado: 'Disponible', precio: 75000 }];
    enviarExcel(res, filas, 'Equipos', 'plantilla_equipos.xlsx');
};
exports.plantillaPuestos = (_req, res) => {
    const filas = [{ nombre: 'Electricista', costoHora: 8000, categoria: 'Técnico' }];
    enviarExcel(res, filas, 'Puestos', 'plantilla_puestos.xlsx');
};
// Ejemplo lleno de "Cambio de línea" (docs/plan-formulario-adaptativo.md §8) — más útil como
// punto de partida que una fila vacía, dado que el catálogo tiene 7 hojas relacionadas entre
// sí. Las condiciones de entorno y el resto de listas transversales ya NO son un campo más de
// este tipo — se referencian directo en la plantilla de texto y se resuelven contra la hoja
// "Catálogos transversales".
exports.plantillaTiposTrabajo = (_req, res) => {
    const tipoEjemplo = [{
        codigoTipo: 'CAMBIO_DE_LINEA',
        nombre: 'Cambio de línea',
        sinonimos: ['cañería', 'tubería', 'línea de proceso'],
        plantillaTexto: 'Cambio de línea de {diametro} {material}, {trazado}, transporta {fluido}, en {planta}. Condiciones de terreno: {condicionesEntorno}.',
        condicionesNoAplicables: ['Energizado'],
        campos: [
            { clave: 'diametro', etiqueta: 'Diámetro', tipoDato: 'seleccionUnica', obligatorio: true, orden: 1, opciones: ['2 pulgadas', '4 pulgadas', '6 pulgadas'] },
            { clave: 'material', etiqueta: 'Material', tipoDato: 'seleccionUnica', obligatorio: true, orden: 2, opciones: ['inoxidable', 'carbono', 'PVC'] },
            { clave: 'trazado', etiqueta: 'Trazado', tipoDato: 'seleccionUnica', obligatorio: false, orden: 3, opciones: ['línea recta', 'con codos'] },
            { clave: 'fluido', etiqueta: 'Fluido que transporta', tipoDato: 'seleccionUnica', obligatorio: true, orden: 4, opciones: ['agua', 'ácido', 'vapor'] },
            { clave: 'planta', etiqueta: 'Área o planta', tipoDato: 'texto', obligatorio: true, orden: 5, opciones: [] },
        ],
        sugerencias: [],
    }];
    const catalogoEjemplo = [{
        clave: 'condicionesEntorno',
        valores: ['Energizado', 'Ambiente ácido', 'A la intemperie', 'Excavación', 'Apertura de línea', 'Bloqueo de línea'].map(valor => ({ valor, categoria: '' })),
    }];
    const wb = construirWorkbookCatalogo(tipoEjemplo, catalogoEjemplo);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_tipos_trabajo.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
};

// ── EXPORTAR BATCH (múltiples hojas en un solo archivo) ──────────────────────

exports.exportarBatch = async (req, res) => {
    const Recurso = getRecurso(req.db);
    const Suministro = getSuministro(req.db);
    const Equipo = getEquipo(req.db);
    const Puesto = getPuesto(req.db);
    const OT = getOT(req.db);
    const Solicitud = getSolicitud(req.db);
    try {
        const { modulos = '', otDesde, otHasta, otEstado } = req.query;
        const lista = modulos.split(',').map(m => m.trim()).filter(Boolean);
        if (!lista.length) return res.status(400).json({ error: 'Selecciona al menos un módulo' });

        const wb = XLSX.utils.book_new();

        if (lista.includes('recursos')) {
            const docs = await Recurso.find().lean();
            agregarHoja(wb, docs.map(d => ({ nombre: d.nombre, puesto: d.puesto || '', tipo: d.tipo || '', telefono: d.telefono || '', email: d.email || '', tarifaHora: d.tarifaHora || 0 })), 'Personal');
        }
        if (lista.includes('suministros')) {
            const docs = await Suministro.find().lean();
            agregarHoja(wb, docs.map(d => ({ codigo: d.codigo, descripcion: d.descripcion, precio: d.precio || 0, categoria: d.categoria || '' })), 'Suministros');
        }
        if (lista.includes('equipos')) {
            const docs = await Equipo.find().lean();
            agregarHoja(wb, docs.map(d => ({ nombre: d.nombre, codigo: d.codigo || '', tipo: d.tipo || '', estado: d.estado || '', precio: d.precio || 0 })), 'Equipos');
        }
        if (lista.includes('puestos')) {
            const docs = await Puesto.find().lean();
            agregarHoja(wb, docs.map(d => ({ nombre: d.nombre, costoHora: d.costoHora || 0, categoria: d.categoria || '' })), 'Puestos');
        }
        if (lista.includes('ots')) {
            const filtro = {};
            if (otEstado) filtro.estado = otEstado;
            if (otDesde || otHasta) {
                filtro.fechaCreacion = {};
                if (otDesde) filtro.fechaCreacion.$gte = new Date(otDesde);
                if (otHasta) filtro.fechaCreacion.$lte = new Date(otHasta + 'T23:59:59');
            }
            const docs = await OT.find(filtro).sort({ createdAt: -1 }).lean();
            agregarHoja(wb, docs.map(d => ({
                numeroOT: d.numeroOT || '', solicitante: d.solicitante || '', descripcion: d.descripcion || '',
                estado: d.estado || '', prioridad: d.prioridad || '', granTotal: d.granTotal || 0,
                estadoPago: d.pago?.estado || 'Pendiente', montoPagado: d.pago?.montoPagado || 0,
                pagoAnulado: d.pago?.anulado ? 'Sí' : 'No',
                fechaCreacion: d.fechaCreacion ? new Date(d.fechaCreacion).toLocaleDateString('es-CL') : '',
                fechaEntrega: d.fechaEntrega ? new Date(d.fechaEntrega).toLocaleDateString('es-CL') : ''
            })), 'OTs');
        }
        if (lista.includes('solicitudes')) {
            const docs = await Solicitud.find().sort({ fechaCreacion: -1 }).lean();
            agregarHoja(wb, docs.map(d => ({
                solicitante: d.solicitante || '', empresa: d.empresaSolicitante || '',
                descripcion: d.descripcion || '', estado: d.estado || '', origen: d.origen || '',
                correo: d.correo || '', numero: d.numero || '',
                fechaSolicitud: d.fechaCreacion ? new Date(d.fechaCreacion).toLocaleDateString('es-CL') : ''
            })), 'Solicitudes');
        }
        if (lista.includes('tipos-trabajo')) {
            const TipoTrabajo = getTipoTrabajo(req.db);
            const CatalogoTransversal = getCatalogoTransversal(req.db);
            const [tipos, catalogosTransversales] = await Promise.all([
                TipoTrabajo.find().lean(),
                CatalogoTransversal.find().lean(),
            ]);
            agregarHojasCatalogo(wb, tipos, catalogosTransversales);
        }

        if (!wb.SheetNames.length) return res.status(400).json({ error: 'No se generaron datos' });

        const fecha = new Date().toISOString().slice(0, 10);
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="exportacion_erp_${fecha}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

function agregarHoja(wb, filas, nombreHoja) {
    if (!filas.length) filas = [{}]; // hoja vacía igual se agrega
    const ws = XLSX.utils.json_to_sheet(filas);
    const cols = Object.keys(filas[0] || {});
    ws['!cols'] = cols.map(key => {
        const maxLen = Math.max(key.length, ...filas.map(f => String(f[key] ?? '').length));
        return { wch: Math.min(maxLen + 2, 50) };
    });
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
}

// ── HELPER: enviar Excel como descarga ───────────────────────────────────────

function enviarExcel(res, filas, nombreHoja, nombreArchivo) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);

    // Ancho automático por columna
    const cols = Object.keys(filas[0] || {});
    ws['!cols'] = cols.map(key => {
        const maxLen = Math.max(key.length, ...filas.map(f => String(f[key] || '').length));
        return { wch: Math.min(maxLen + 2, 50) };
    });

    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
}

// ── USO DE DISCO ──────────────────────────────────────────────────────────────
// Vive acá por falta de un lugar mejor: es el único otro bloque de "administración
// del sistema" que ya tiene pantalla propia (ImportExportScreen, junto a Entorno de
// trabajo), no porque tenga que ver con importar/exportar datos.

// Tarifa de Render Persistent Disk al momento de escribir esto — es un estimado mío,
// no un valor que Render exponga por API; confirmar contra render.com/pricing si el
// número empieza a importar de verdad.
const USD_POR_GB_MES = 0.25;

function tamanoCarpeta(ruta) {
    let bytes = 0;
    let archivos = 0;
    if (!fs.existsSync(ruta)) return { bytes, archivos };
    for (const nombre of fs.readdirSync(ruta)) {
        const completa = path.join(ruta, nombre);
        const info = fs.statSync(completa);
        if (info.isFile()) { bytes += info.size; archivos++; }
    }
    return { bytes, archivos };
}

// GET /api/import/uso-disco — tamaño real de erp-backend/uploads/, para ver cuánto
// se viene acumulando y a cuánto equivale en el disco persistente de Render.
exports.usoDisco = (req, res) => {
    try {
        const carpeta = path.join(__dirname, '..', '..', 'uploads');
        const { bytes, archivos } = tamanoCarpeta(carpeta);
        const gb = bytes / (1024 ** 3);
        res.json({
            archivos,
            bytes,
            mb: Number((bytes / (1024 ** 2)).toFixed(2)),
            gb: Number(gb.toFixed(4)),
            costoEstimadoMensualUSD: Number((gb * USD_POR_GB_MES).toFixed(4)),
            tarifaUsadaUSDPorGBMes: USD_POR_GB_MES,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
