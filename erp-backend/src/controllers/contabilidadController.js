const mongoose = require('mongoose');
const CuentaContable = require('../models/CuentaContable');
const AsientoContable = require('../models/AsientoContable');

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function generarNumeroAsiento() {
    const ultimo = await AsientoContable.findOne({ numeroAsiento: { $regex: /^ASI-2026-/ } }).sort({ numeroAsiento: -1 });
    let n = 1;
    if (ultimo?.numeroAsiento) {
        const partes = ultimo.numeroAsiento.split('-');
        const num = parseInt(partes[partes.length - 1]);
        if (!isNaN(num)) n = num + 1;
    }
    return `ASI-2026-${n.toString().padStart(4, '0')}`;
}

// ── PLAN DE CUENTAS ───────────────────────────────────────────────────────────

exports.getCuentas = async (req, res) => {
    try {
        const cuentas = await CuentaContable.find().sort({ codigo: 1 }).lean();
        res.json(cuentas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.crearCuenta = async (req, res) => {
    try {
        const { codigo, nombre, tipo, naturaleza, padreId, descripcion } = req.body;
        const nivel = codigo ? codigo.split('.').length : 1;
        const cuenta = await CuentaContable.create({ codigo, nombre, tipo, naturaleza, nivel, padreId: padreId || null, descripcion: descripcion || '' });
        res.status(201).json(cuenta);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: 'El código ya existe' });
        res.status(500).json({ error: err.message });
    }
};

exports.actualizarCuenta = async (req, res) => {
    try {
        const { id } = req.params;
        const { codigo, nombre, tipo, naturaleza, padreId, descripcion, activa } = req.body;
        const nivel = codigo ? codigo.split('.').length : undefined;
        const cuenta = await CuentaContable.findByIdAndUpdate(
            id,
            { codigo, nombre, tipo, naturaleza, nivel, padreId: padreId || null, descripcion, activa },
            { new: true, runValidators: true }
        );
        if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
        res.json(cuenta);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.eliminarCuenta = async (req, res) => {
    try {
        const { id } = req.params;
        const tieneMovimientos = await AsientoContable.findOne({ 'lineas.cuentaId': id });
        if (tieneMovimientos) return res.status(400).json({ error: 'La cuenta tiene movimientos registrados y no puede eliminarse' });
        await CuentaContable.findByIdAndDelete(id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── LIBRO DIARIO ──────────────────────────────────────────────────────────────

exports.getAsientos = async (req, res) => {
    try {
        const { desde, hasta, tipo, limite = 200 } = req.query;
        const filtro = {};
        if (desde || hasta) {
            filtro.fecha = {};
            if (desde) filtro.fecha.$gte = desde;
            if (hasta) filtro.fecha.$lte = hasta;
        }
        if (tipo) filtro.tipo = tipo;

        const asientos = await AsientoContable.find(filtro)
            .sort({ fecha: -1, numeroAsiento: -1 })
            .limit(Number(limite))
            .lean();
        res.json(asientos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.crearAsientoManual = async (req, res) => {
    try {
        const { fecha, descripcion, lineas: lineasRaw } = req.body;
        if (!lineasRaw || lineasRaw.length < 2) return res.status(400).json({ error: 'El asiento requiere al menos 2 líneas' });

        const lineas = [];
        for (const ld of lineasRaw) {
            const cuenta = await CuentaContable.findById(ld.cuentaId).lean();
            if (!cuenta) return res.status(400).json({ error: `Cuenta ${ld.cuentaId} no encontrada` });
            lineas.push({
                cuentaId: cuenta._id,
                cuentaCodigo: cuenta.codigo,
                cuentaNombre: cuenta.nombre,
                debe: Number(ld.debe) || 0,
                haber: Number(ld.haber) || 0,
                glosa: ld.glosa || ''
            });
        }

        const totalDebe = lineas.reduce((s, l) => s + l.debe, 0);
        const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);

        if (Math.abs(totalDebe - totalHaber) > 0.01) {
            return res.status(400).json({ error: `Partida doble no balanceada: Debe ${totalDebe} ≠ Haber ${totalHaber}` });
        }

        const numeroAsiento = await generarNumeroAsiento();
        const asiento = await AsientoContable.create({
            numeroAsiento,
            fecha,
            descripcion,
            tipo: 'manual',
            origen: { tipo: 'Manual' },
            lineas,
            totalDebe,
            totalHaber,
            estado: 'vigente',
            creadoPor: 'Usuario'
        });
        res.status(201).json(asiento);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.anularAsiento = async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;

        const asiento = await AsientoContable.findById(id);
        if (!asiento) return res.status(404).json({ error: 'Asiento no encontrado' });
        if (asiento.estado === 'anulado') return res.status(400).json({ error: 'El asiento ya está anulado' });

        const lineasReversa = asiento.lineas.map(l => ({
            cuentaId: l.cuentaId,
            cuentaCodigo: l.cuentaCodigo,
            cuentaNombre: l.cuentaNombre,
            debe: l.haber,
            haber: l.debe,
            glosa: `REVERSA: ${l.glosa}`
        }));

        const numeroReversa = await generarNumeroAsiento();
        const fechaHoy = new Date().toISOString().slice(0, 10);

        const reversa = await AsientoContable.create({
            numeroAsiento: numeroReversa,
            fecha: fechaHoy,
            descripcion: `ANULACIÓN: ${asiento.descripcion}`,
            tipo: 'manual',
            origen: { tipo: 'Ajuste', referenciaNro: asiento.numeroAsiento },
            lineas: lineasReversa,
            totalDebe: asiento.totalHaber,
            totalHaber: asiento.totalDebe,
            estado: 'vigente',
            creadoPor: 'Sistema'
        });

        asiento.estado = 'anulado';
        asiento.anulacion = {
            fechaAnulacion: fechaHoy,
            motivoAnulacion: motivo || '',
            asientoReversaId: reversa._id
        };
        await asiento.save();

        res.json({ ok: true, reversa });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── FUNCIÓN INTERNA (importada por otros controllers) ─────────────────────────

exports.crearAsientoAutomatico = async (tipoOrigen, referenciaId, referenciaNro, lineasData, fecha, descripcion) => {
    const lineas = [];
    for (const ld of lineasData) {
        const cuenta = await CuentaContable.findOne({ codigo: ld.codigoCuenta }).lean();
        if (!cuenta) throw new Error(`Cuenta ${ld.codigoCuenta} no encontrada en plan de cuentas`);
        lineas.push({
            cuentaId: cuenta._id,
            cuentaCodigo: cuenta.codigo,
            cuentaNombre: cuenta.nombre,
            debe: Number(ld.debe) || 0,
            haber: Number(ld.haber) || 0,
            glosa: ld.glosa || ''
        });
    }

    const totalDebe = lineas.reduce((s, l) => s + l.debe, 0);
    const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);
    const numeroAsiento = await generarNumeroAsiento();

    return AsientoContable.create({
        numeroAsiento,
        fecha: fecha || new Date().toISOString().slice(0, 10),
        descripcion,
        tipo: 'automatico',
        origen: { tipo: tipoOrigen, referenciaId: referenciaId || null, referenciaNro: referenciaNro || '' },
        lineas,
        totalDebe,
        totalHaber,
        estado: 'vigente',
        creadoPor: 'Sistema'
    });
};

exports.anularAsientoPorReferencia = async (tipoOrigen, referenciaId, motivo) => {
    const asiento = await AsientoContable.findOne({
        'origen.tipo': tipoOrigen,
        'origen.referenciaId': referenciaId,
        estado: 'vigente'
    });
    if (!asiento) return null;

    const lineasReversa = asiento.lineas.map(l => ({
        cuentaId: l.cuentaId,
        cuentaCodigo: l.cuentaCodigo,
        cuentaNombre: l.cuentaNombre,
        debe: l.haber,
        haber: l.debe,
        glosa: `REVERSA: ${l.glosa}`
    }));

    const numeroReversa = await generarNumeroAsiento();
    const fechaHoy = new Date().toISOString().slice(0, 10);

    const reversa = await AsientoContable.create({
        numeroAsiento: numeroReversa,
        fecha: fechaHoy,
        descripcion: `ANULACIÓN AUTOMÁTICA: ${asiento.descripcion}`,
        tipo: 'automatico',
        origen: { tipo: 'Ajuste', referenciaNro: asiento.numeroAsiento },
        lineas: lineasReversa,
        totalDebe: asiento.totalHaber,
        totalHaber: asiento.totalDebe,
        estado: 'vigente',
        creadoPor: 'Sistema'
    });

    asiento.estado = 'anulado';
    asiento.anulacion = { fechaAnulacion: fechaHoy, motivoAnulacion: motivo || '', asientoReversaId: reversa._id };
    await asiento.save();
    return reversa;
};

// ── LIBRO MAYOR ───────────────────────────────────────────────────────────────

exports.getLibroMayor = async (req, res) => {
    try {
        const { cuentaId } = req.params;
        const { desde, hasta } = req.query;

        const filtroFecha = {};
        if (desde) filtroFecha.$gte = desde;
        if (hasta) filtroFecha.$lte = hasta;

        const pipeline = [
            {
                $match: {
                    estado: 'vigente',
                    ...(Object.keys(filtroFecha).length ? { fecha: filtroFecha } : {})
                }
            },
            { $unwind: '$lineas' },
            { $match: { 'lineas.cuentaId': new mongoose.Types.ObjectId(cuentaId) } },
            { $sort: { fecha: 1, numeroAsiento: 1 } },
            {
                $project: {
                    fecha: 1,
                    numeroAsiento: 1,
                    descripcion: 1,
                    glosa: '$lineas.glosa',
                    debe: '$lineas.debe',
                    haber: '$lineas.haber'
                }
            }
        ];

        const movimientos = await AsientoContable.aggregate(pipeline);
        const cuenta = await CuentaContable.findById(cuentaId).lean();

        let saldo = 0;
        const movimientosConSaldo = movimientos.map(m => {
            saldo += cuenta.naturaleza === 'Deudora' ? (m.debe - m.haber) : (m.haber - m.debe);
            return { ...m, saldo };
        });

        res.json({ cuenta, movimientos: movimientosConSaldo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── REPORTES ──────────────────────────────────────────────────────────────────

exports.getBalanceComprobacion = async (req, res) => {
    try {
        const { hasta } = req.query;
        const filtro = { estado: 'vigente', ...(hasta ? { fecha: { $lte: hasta } } : {}) };

        const saldos = await AsientoContable.aggregate([
            { $match: filtro },
            { $unwind: '$lineas' },
            {
                $group: {
                    _id: '$lineas.cuentaId',
                    cuentaCodigo: { $first: '$lineas.cuentaCodigo' },
                    cuentaNombre: { $first: '$lineas.cuentaNombre' },
                    totalDebe: { $sum: '$lineas.debe' },
                    totalHaber: { $sum: '$lineas.haber' }
                }
            },
            { $sort: { cuentaCodigo: 1 } }
        ]);

        const cuentas = await CuentaContable.find({ _id: { $in: saldos.map(s => s._id) } }).lean();
        const mapa = {};
        cuentas.forEach(c => { mapa[String(c._id)] = c; });

        const filas = saldos.map(s => {
            const c = mapa[String(s._id)] || {};
            const saldoDeudor = s.totalDebe > s.totalHaber ? s.totalDebe - s.totalHaber : 0;
            const saldoAcreedor = s.totalHaber > s.totalDebe ? s.totalHaber - s.totalDebe : 0;
            return { ...s, tipo: c.tipo, naturaleza: c.naturaleza, saldoDeudor, saldoAcreedor };
        });

        const totales = {
            totalDebe: filas.reduce((s, f) => s + f.totalDebe, 0),
            totalHaber: filas.reduce((s, f) => s + f.totalHaber, 0),
            totalSaldoDeudor: filas.reduce((s, f) => s + f.saldoDeudor, 0),
            totalSaldoAcreedor: filas.reduce((s, f) => s + f.saldoAcreedor, 0)
        };

        res.json({ filas, totales });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEstadoResultados = async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        const filtroFecha = {};
        if (desde) filtroFecha.$gte = desde;
        if (hasta) filtroFecha.$lte = hasta;
        const filtro = { estado: 'vigente', ...(Object.keys(filtroFecha).length ? { fecha: filtroFecha } : {}) };

        const saldos = await AsientoContable.aggregate([
            { $match: filtro },
            { $unwind: '$lineas' },
            { $group: { _id: '$lineas.cuentaId', totalDebe: { $sum: '$lineas.debe' }, totalHaber: { $sum: '$lineas.haber' } } }
        ]);

        const cuentas = await CuentaContable.find({
            _id: { $in: saldos.map(s => s._id) },
            tipo: { $in: ['Ingreso', 'Gasto'] }
        }).lean();
        const mapa = {};
        cuentas.forEach(c => { mapa[String(c._id)] = c; });

        const grupos = { ingresos: [], costoServicios: [], gastosAdmin: [], gastosFinancieros: [] };
        const totales = { ingresos: 0, costoServicios: 0, gastosAdmin: 0, gastosFinancieros: 0 };

        saldos.forEach(s => {
            const c = mapa[String(s._id)];
            if (!c) return;
            const saldo = c.naturaleza === 'Acreedora' ? s.totalHaber - s.totalDebe : s.totalDebe - s.totalHaber;
            const fila = { codigo: c.codigo, nombre: c.nombre, saldo };

            if (c.tipo === 'Ingreso') { grupos.ingresos.push(fila); totales.ingresos += saldo; }
            else if (c.codigo.startsWith('5.1')) { grupos.costoServicios.push(fila); totales.costoServicios += saldo; }
            else if (c.codigo.startsWith('5.2')) { grupos.gastosAdmin.push(fila); totales.gastosAdmin += saldo; }
            else if (c.codigo.startsWith('5.3')) { grupos.gastosFinancieros.push(fila); totales.gastosFinancieros += saldo; }
        });

        const totalGastos = totales.costoServicios + totales.gastosAdmin + totales.gastosFinancieros;
        res.json({ grupos, totales, totalGastos, resultado: totales.ingresos - totalGastos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getBalanceGeneral = async (req, res) => {
    try {
        const { hasta } = req.query;
        const filtro = { estado: 'vigente', ...(hasta ? { fecha: { $lte: hasta } } : {}) };

        const saldos = await AsientoContable.aggregate([
            { $match: filtro },
            { $unwind: '$lineas' },
            { $group: { _id: '$lineas.cuentaId', totalDebe: { $sum: '$lineas.debe' }, totalHaber: { $sum: '$lineas.haber' } } }
        ]);

        const cuentas = await CuentaContable.find({ _id: { $in: saldos.map(s => s._id) } }).lean();
        const mapa = {};
        cuentas.forEach(c => { mapa[String(c._id)] = c; });

        const grupos = { activoCirculante: [], activoFijo: [], pasivoCirculante: [], pasivoNoCirculante: [], patrimonio: [], ingresos: [], gastos: [] };
        const totales = { activoCirculante: 0, activoFijo: 0, pasivoCirculante: 0, pasivoNoCirculante: 0, patrimonio: 0, ingresos: 0, gastos: 0 };

        saldos.forEach(s => {
            const c = mapa[String(s._id)];
            if (!c) return;
            const saldo = c.naturaleza === 'Deudora' ? s.totalDebe - s.totalHaber : s.totalHaber - s.totalDebe;
            const fila = { codigo: c.codigo, nombre: c.nombre, saldo };

            if (c.tipo === 'Activo' && c.codigo.startsWith('1.1')) { grupos.activoCirculante.push(fila); totales.activoCirculante += saldo; }
            else if (c.tipo === 'Activo' && c.codigo.startsWith('1.2')) { grupos.activoFijo.push(fila); totales.activoFijo += saldo; }
            else if (c.tipo === 'Pasivo' && c.codigo.startsWith('2.1')) { grupos.pasivoCirculante.push(fila); totales.pasivoCirculante += saldo; }
            else if (c.tipo === 'Pasivo' && c.codigo.startsWith('2.2')) { grupos.pasivoNoCirculante.push(fila); totales.pasivoNoCirculante += saldo; }
            else if (c.tipo === 'Patrimonio') { grupos.patrimonio.push(fila); totales.patrimonio += saldo; }
            else if (c.tipo === 'Ingreso') { totales.ingresos += saldo; }
            else if (c.tipo === 'Gasto') { totales.gastos += saldo; }
        });

        const resultado = totales.ingresos - totales.gastos;
        const totalActivo = totales.activoCirculante + totales.activoFijo;
        const totalPasivo = totales.pasivoCirculante + totales.pasivoNoCirculante;
        const totalPatrimonio = totales.patrimonio + resultado;

        res.json({ grupos, totales, resultado, totalActivo, totalPasivo, totalPatrimonio, cuadra: Math.abs(totalActivo - (totalPasivo + totalPatrimonio)) < 1 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
