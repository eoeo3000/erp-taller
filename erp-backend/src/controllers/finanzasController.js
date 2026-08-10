const OT = require('../models/OT');
const Recurso = require('../models/Recurso');
const RegistroPago = require('../models/RegistroPagoRecurso');

// ── CUENTAS POR COBRAR ──────────────────────────────────────────────────────

exports.getCuentasPorCobrar = async (req, res) => {
    try {
        const ots = await OT.find({
            estado: { $in: ['Con Informe', 'Pagada', 'Trabajo Terminado'] }
        }).select('numeroOT descripcion solicitante granTotal pago estado fechaCreacion fechaEntrega').lean();

        const datos = ots.map(ot => {
            const total = ot.granTotal || 0;
            const anulado = ot.pago?.anulado || false;
            const pagado = anulado ? 0 : (ot.pago?.montoPagado || 0);
            const saldo = total - pagado;
            return {
                _id: ot._id,
                numeroOT: ot.numeroOT,
                descripcion: ot.descripcion,
                solicitante: ot.solicitante,
                estado: ot.estado,
                estadoPago: ot.pago?.estado || 'Pendiente',
                pagoAnulado: anulado,
                fechaAnulacion: ot.pago?.fechaAnulacion || '',
                motivoAnulacion: ot.pago?.motivoAnulacion || '',
                total,
                pagado,
                saldo,
                fechaPago: ot.pago?.fechaPago || '',
                metodoPago: ot.pago?.metodoPago || '',
                referencia: ot.pago?.referencia || '',
                fechaCreacion: ot.fechaCreacion,
                fechaEntrega: ot.fechaEntrega
            };
        });

        res.json(datos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── REGISTROS DE PAGO DE PERSONAL ──────────────────────────────────────────

exports.getRegistrosPago = async (req, res) => {
    try {
        const { mes, recursoId } = req.query; // mes: "YYYY-MM"
        const filtro = {};
        if (mes) filtro.fecha = { $regex: `^${mes}` };
        if (recursoId) filtro.recursoId = recursoId;

        const registros = await RegistroPago.find(filtro).sort({ fecha: -1 }).lean();
        res.json(registros);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.crearRegistroPago = async (req, res) => {
    try {
        const { recursoId, fecha, horasTrabajadas, notas } = req.body;
        const recurso = await Recurso.findById(recursoId).lean();
        if (!recurso) return res.status(404).json({ error: 'Recurso no encontrado' });

        const existente = await RegistroPago.findOne({ recursoId, fecha });
        if (existente) return res.status(400).json({ error: 'Ya existe un registro para este recurso en esa fecha' });

        const tarifaHora = recurso.tarifaHora || 0;
        const horas = Number(horasTrabajadas) || 8;
        const totalDia = tarifaHora * horas;

        const registro = await RegistroPago.create({
            recursoId,
            recursoNombre: recurso.nombre,
            fecha,
            horasTrabajadas: horas,
            tarifaHora,
            totalDia,
            notas: notas || ''
        });
        res.status(201).json(registro);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.actualizarRegistroPago = async (req, res) => {
    try {
        const { id } = req.params;
        const registro = await RegistroPago.findByIdAndUpdate(id, req.body, { new: true });
        if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
        res.json(registro);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.eliminarRegistroPago = async (req, res) => {
    try {
        await RegistroPago.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.marcarPagado = async (req, res) => {
    try {
        const { ids, fechaPago, metodoPago } = req.body;
        await RegistroPago.updateMany(
            { _id: { $in: ids } },
            { $set: { pagado: true, fechaPago: fechaPago || '', metodoPago: metodoPago || 'Transferencia' } }
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── RESUMEN MENSUAL ─────────────────────────────────────────────────────────

exports.getResumenMensual = async (req, res) => {
    try {
        const { mes } = req.query; // "YYYY-MM"

        // Ingresos: OTs pagadas en el mes
        const ots = await OT.find({ estado: { $in: ['Con Informe', 'Pagada', 'Trabajo Terminado'] } }).lean();

        const ingresosPorMes = {};
        const gastosMaterialesPorMes = {};

        ots.forEach(ot => {
            const fechaPago = ot.pago?.fechaPago;
            if (!fechaPago || ot.pago?.anulado) return;
            const m = fechaPago.slice(0, 7);
            if (mes && m !== mes) return;
            ingresosPorMes[m] = (ingresosPorMes[m] || 0) + (ot.pago?.montoPagado || 0);

            // Gastos de materiales y logística de la OT
            let gastoOT = 0;
            (ot.componentes || []).forEach(c => { gastoOT += (c.precio || 0) * (c.cantidad || 1); });
            (ot.logistica || []).forEach(l => { gastoOT += (l.precio || 0) * (l.cantidad || 1); });
            gastosMaterialesPorMes[m] = (gastosMaterialesPorMes[m] || 0) + gastoOT;
        });

        // Gastos de personal
        const filtroReg = mes ? { fecha: { $regex: `^${mes}` } } : {};
        const registros = await RegistroPago.find(filtroReg).lean();
        const gastosPersonalPorMes = {};
        registros.forEach(r => {
            const m = r.fecha.slice(0, 7);
            gastosPersonalPorMes[m] = (gastosPersonalPorMes[m] || 0) + (r.totalDia || 0);
        });

        // Unir todos los meses
        const meses = [...new Set([
            ...Object.keys(ingresosPorMes),
            ...Object.keys(gastosMaterialesPorMes),
            ...Object.keys(gastosPersonalPorMes)
        ])].sort();

        const resumen = meses.map(m => {
            const ingresos = ingresosPorMes[m] || 0;
            const materiales = gastosMaterialesPorMes[m] || 0;
            const personal = gastosPersonalPorMes[m] || 0;
            const totalGastos = materiales + personal;
            return { mes: m, ingresos, materiales, personal, totalGastos, resultado: ingresos - totalGastos };
        });

        res.json(resumen);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
