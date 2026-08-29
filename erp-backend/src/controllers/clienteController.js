const getCliente = require('../models/Cliente');
const getSolicitud = require('../models/Solicitud');

// Usado por solicitudController al crear/editar una Solicitud: resuelve el texto libre
// "Empresa" a un Cliente real (mismo criterio de match que poblarDesdeSolicitudes más abajo
// — nombre recortado, sin distinguir mayúsculas), creándolo si no existe todavía. Así toda
// Solicitud nueva queda con un clienteId real, no solo con el texto que se tipeó.
async function resolverOCrearClientePorNombre(conn, nombreEmpresa) {
    const nombre = (nombreEmpresa || '').trim();
    if (!nombre) return null;
    const Cliente = getCliente(conn);
    const existente = await Cliente.findOne({ empresa: { $regex: `^${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (existente) return existente._id;
    const creado = await Cliente.create({ empresa: nombre });
    return creado._id;
}
exports.resolverOCrearClientePorNombre = resolverOCrearClientePorNombre;

exports.listar = async (req, res) => {
    const Cliente = getCliente(req.db);
    try {
        const clientes = await Cliente.find().sort({ empresa: 1 });
        res.json(clientes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.crear = async (req, res) => {
    const Cliente = getCliente(req.db);
    try {
        const cliente = await Cliente.create({
            empresa: req.body.empresa,
            direccion: req.body.direccion || '',
            contactos: req.body.contactos || [],
        });
        res.status(201).json(cliente);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.actualizar = async (req, res) => {
    const Cliente = getCliente(req.db);
    try {
        const cliente = await Cliente.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(cliente);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.eliminar = async (req, res) => {
    const Cliente = getCliente(req.db);
    try {
        await Cliente.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Cliente eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/clientes/poblar-desde-solicitudes — arma Cliente+contactos a partir de lo que
// ya hay escrito en Solicitud.empresaSolicitante/solicitante/correo/numero (texto libre).
// Idempotente: agrupa por nombre de empresa (recortado y sin distinguir mayúsculas) y no
// duplica un Cliente que ya exista con ese nombre, ni un contacto que ya exista por correo
// o teléfono dentro de ese Cliente.
exports.poblarDesdeSolicitudes = async (req, res) => {
    const Cliente = getCliente(req.db);
    const Solicitud = getSolicitud(req.db);
    try {
        const solicitudes = await Solicitud.find({ empresaSolicitante: { $exists: true, $ne: '' } }).lean();
        const porEmpresa = new Map();
        for (const s of solicitudes) {
            const clave = (s.empresaSolicitante || '').trim().toLowerCase();
            if (!clave) continue;
            if (!porEmpresa.has(clave)) porEmpresa.set(clave, { empresa: s.empresaSolicitante.trim(), contactos: [] });
            const grupo = porEmpresa.get(clave);
            const yaExiste = grupo.contactos.some(c =>
                (c.correo && c.correo === s.correo) || (c.telefono && c.telefono === s.numero));
            if (!yaExiste && (s.solicitante || s.correo || s.numero)) {
                grupo.contactos.push({ nombre: s.solicitante || s.empresaSolicitante, correo: s.correo || '', telefono: s.numero || '' });
            }
        }

        let creados = 0, actualizados = 0;
        for (const { empresa, contactos } of porEmpresa.values()) {
            const existente = await Cliente.findOne({ empresa: { $regex: `^${empresa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
            if (existente) {
                const nuevos = contactos.filter(c =>
                    !existente.contactos.some(ec => (c.correo && ec.correo === c.correo) || (c.telefono && ec.telefono === c.telefono)));
                if (nuevos.length) {
                    existente.contactos.push(...nuevos);
                    await existente.save();
                    actualizados++;
                }
            } else {
                await Cliente.create({ empresa, contactos });
                creados++;
            }
        }

        res.json({ mensaje: 'Clientes poblados desde solicitudes', empresasCreadas: creados, empresasActualizadas: actualizados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
