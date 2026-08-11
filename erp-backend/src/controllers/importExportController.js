const XLSX = require('xlsx');
const Recurso = require('../models/Recurso');
const Suministro = require('../models/suministro');
const Equipo = require('../models/equiposHerramientas');
const Puesto = require('../models/puesto');
const OT = require('../models/OT');
const Solicitud = require('../models/Solicitud');

// ── HELPERS ───────────────────────────────────────────────────────────────────

function parsearExcel(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function normStr(v) { return String(v || '').trim(); }
function normNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

// ── IMPORTAR ──────────────────────────────────────────────────────────────────

exports.importarRecursos = async (req, res) => {
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

// ── EXPORTAR (genera buffer Excel en el servidor) ─────────────────────────────

exports.exportarRecursos = async (req, res) => {
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

// ── EXPORTAR BATCH (múltiples hojas en un solo archivo) ──────────────────────

exports.exportarBatch = async (req, res) => {
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
