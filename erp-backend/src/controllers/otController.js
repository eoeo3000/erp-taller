const getOT = require('../models/OT');
const getRecurso = require('../models/Recurso');
const transporter = require('../config/mailer');
const PDFDocument = require('pdfkit');

// --- Reserva/liberación de recursos por cambio de estado de la OT (ver docs/funcionalidades-v2.md, Gap 4) ---
// Nota: hoy OT.componentes solo guarda 'codigo' como copia de texto (sin referencia real al catálogo),
// así que el cruce con EquiposHerramientas/Suministro se hace por codigo — decisión documentada en el
// gap analysis (Parte VIII, punto 3): aplica hacia adelante, es un cruce best-effort.
// NOTA: esta función no es un handler (req,res) — recibe la conexión explícitamente como `conn`
// porque se invoca desde varios handlers distintos (actualizarOT, responderCotizacionCliente).
async function aplicarReservaPorCambioEstado(otAnterior, otNueva, conn) {
    try {
        const estadoAnt = otAnterior?.estado;
        const estadoNuevo = otNueva?.estado;
        if (!otNueva || estadoAnt === estadoNuevo) return;

        const EquiposHerramientas = require('../models/equiposHerramientas')(conn);
        const Suministro = require('../models/suministro')(conn);
        const MovimientoStock = require('../models/MovimientoStock')(conn);
        const componentes = otNueva.componentes || [];

        const esEquipo = (c) => c.tipo === 'Equipo' || c.tipo === 'Herramienta';

        // Cliente aceptó la cotización: reservar herramientas/equipos e insumos comprometidos
        if (estadoNuevo === 'Aprobada' && estadoAnt !== 'Aprobada') {
            for (const c of componentes) {
                if (!c.codigo) continue;
                if (esEquipo(c)) {
                    await EquiposHerramientas.updateOne({ codigo: c.codigo, estado: 'Disponible' }, { estado: 'Reservado' });
                } else {
                    const suministro = await Suministro.findOne({ codigo: c.codigo });
                    if (suministro) {
                        await Suministro.updateOne({ _id: suministro._id }, { $inc: { stockReservado: Number(c.cantidad) || 0 } });
                        await MovimientoStock.create({
                            suministroId: suministro._id, tipo: 'Reserva', cantidad: Number(c.cantidad) || 0,
                            otId: otNueva._id, motivo: `Reserva por aprobación de OT ${otNueva.numeroOT || ''}`
                        });
                    }
                }
            }
        }

        // Inicia la ejecución en terreno: lo reservado pasa a estar en uso
        if (estadoNuevo === 'En Ejecución' && estadoAnt !== 'En Ejecución') {
            for (const c of componentes) {
                if (c.codigo && esEquipo(c)) {
                    await EquiposHerramientas.updateOne({ codigo: c.codigo, estado: 'Reservado' }, { estado: 'En Uso' });
                }
            }
        }

        // Faena completada: libera herramientas/equipos e insumos reservados
        if (estadoNuevo === 'Trabajo Terminado' && estadoAnt !== 'Trabajo Terminado') {
            for (const c of componentes) {
                if (!c.codigo) continue;
                if (esEquipo(c)) {
                    await EquiposHerramientas.updateOne({ codigo: c.codigo, estado: 'En Uso' }, { estado: 'Disponible' });
                } else {
                    const suministro = await Suministro.findOne({ codigo: c.codigo });
                    if (suministro) {
                        const delta = -(Number(c.cantidad) || 0);
                        await Suministro.updateOne({ _id: suministro._id }, { $inc: { stockReservado: delta } });
                        await MovimientoStock.create({
                            suministroId: suministro._id, tipo: 'Liberación', cantidad: delta,
                            otId: otNueva._id, motivo: `Liberación al terminar OT ${otNueva.numeroOT || ''}`
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[Reservas] Hook de cambio de estado falló (sin impacto en la operación):', e.message);
    }
}

// 1. Obtener toda la data (OTs, Solicitudes y Recursos)
exports.getAllData = async (req, res) => {
    const OT = getOT(req.db);
    const Recurso = getRecurso(req.db);
    try {
        const Solicitud = require('../models/Solicitud')(req.db);
        const [todasLasOts, todasLasSolicitudes, recursos] = await Promise.all([
            OT.find().sort({ createdAt: -1 }),
            Solicitud.find().sort({ fechaCreacion: -1 }),
            Recurso.find()
        ]);
        res.json({ ots: todasLasOts, solicitudes: todasLasSolicitudes, recursos });
    } catch (error) {
        res.status(500).json({ error: "Error al sincronizar data" });
    }
};

// 2. Crear Solicitud Manual
exports.crearSolicitudManual = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const nueva = new OT({ ...req.body, estado: 'Pendiente', origen: 'Manual' });
        await nueva.save();
        res.status(201).json(nueva);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. Convertir a OT (Con formato OT-2026-0000)
exports.convertirOT = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const data = req.body;
        const idSolicitud = data._id || data.solicitudId;

        // Generación de número con guiones
        if (!data.numeroOT) {
            const ultimaOT = await OT.findOne({ numeroOT: { $regex: /^OT-2026-/ } }).sort({ numeroOT: -1 });
            let siguienteNum = 1;

            if (ultimaOT?.numeroOT) {
                const partes = ultimaOT.numeroOT.split('-');
                const ultimoSecuencial = parseInt(partes[partes.length - 1]);
                if (!isNaN(ultimoSecuencial)) siguienteNum = ultimoSecuencial + 1;
            }
            data.numeroOT = `OT-2026-${siguienteNum.toString().padStart(4, '0')}`;
        }

        const { _id, ...updateData } = data;

        const nuevaOT = await OT.findByIdAndUpdate(
            idSolicitud,
            {
                ...updateData,
                solicitudId: idSolicitud,
                numeroOT: data.numeroOT,
                estado: 'Tratada',
                ultimaEdicion: new Date().toISOString()
            },
            { new: true, upsert: true, runValidators: true }
        );

        res.status(201).json({ success: true, ot: nuevaOT });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4. Eliminar OT y Liberar Solicitud
exports.eliminarOT = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const otAEliminar = await OT.findById(id);
        if (!otAEliminar) return res.status(404).json({ message: "OT no encontrada" });

        const idSolicitudVinculada = otAEliminar.solicitudId || otAEliminar._id;
        await OT.findByIdAndDelete(id);

        const Solicitud = require('../models/Solicitud')(req.db);
        await Solicitud.findByIdAndUpdate(idSolicitudVinculada, { estado: 'Pendiente', numeroOT: null });

        res.status(200).json({ message: "OT eliminada y solicitud liberada" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 5. Obtener OT por ID de Solicitud (Búsqueda híbrida para evitar el 404)
exports.obtenerOTPorSolicitud = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { solicitudId } = req.params;
        const ot = await OT.findOne({
            $or: [
                { solicitudId: solicitudId },
                { _id: solicitudId }
            ]
        });

        if (!ot) return res.status(404).json({ message: "No se encontró planificación" });
        res.json(ot);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 6. Obtener por ID Directo
exports.obtenerOTPorId = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const ot = await OT.findById(req.params.id);
        if (!ot) return res.status(404).json({ message: "No encontrado" });
        res.json(ot);
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
};

// 7. Webhook Emails
exports.webhookEmail = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const nuevaSolicitud = new OT({
            solicitante: req.body.remitente,
            descripcion: `${req.body.asunto}: ${req.body.contenido}`,
            origen: 'Correo',
            estado: 'Pendiente'
        });
        await nuevaSolicitud.save();
        res.status(201).json({ mensaje: "Guardada en Atlas" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 8. Actualizar OT (General y Suministros)
exports.actualizarOT = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const datosCuerpo = req.body;

        // Snapshot previo para detectar transiciones contables
        const otAnterior = await OT.findById(id).lean();

        // 1. Intentar actualizar (Usamos $set para campos normales y nos aseguramos de traer la OT nueva)
        let ot = await OT.findByIdAndUpdate(
            id,
            { $set: datosCuerpo },
            { new: true, runValidators: true }
        );

        // 2. Lógica de creación si no existe (Tu lógica original mejorada)
        if (!ot) {
            const Solicitud = require('../models/Solicitud')(req.db);
            const solicitud = await Solicitud.findById(id);

            if (solicitud) {
                const total = await OT.countDocuments();
                const num = `OT-2026-${(total + 1).toString().padStart(4, '0')}`;

                // Creamos la nueva OT
                ot = new OT({
                    ...solicitud.toObject(),
                    ...datosCuerpo,
                    _id: solicitud._id,
                    solicitudId: solicitud._id,
                    numeroOT: num,
                    estado: 'Tratada'
                });

                await ot.save();
                // Actualizamos la solicitud original
                await Solicitud.findByIdAndUpdate(id, { estado: 'Tratada', numeroOT: num });
            }
        }

        if (!ot) return res.status(404).json({ error: "No encontrado" });

        // Hooks contables (no bloquean la respuesta si falla)
        try {
            const pagoNuevo = datosCuerpo.pago;
            const pagoViejo = otAnterior?.pago;
            const { crearAsientoAutomatico, anularAsientoPorReferencia } = require('./contabilidadController');

            const seEstaPagando = pagoNuevo?.estado === 'Pagado'
                && pagoViejo?.estado !== 'Pagado'
                && !pagoNuevo?.anulado;

            const seEstaAnulando = pagoNuevo?.anulado === true && !pagoViejo?.anulado;

            if (seEstaPagando) {
                const monto = Number(pagoNuevo.montoPagado) || 0;
                const fechaPago = pagoNuevo.fechaPago || new Date().toISOString().slice(0, 10);
                await crearAsientoAutomatico('OT', ot._id, ot.numeroOT, [
                    { codigoCuenta: '1.1.2', debe: monto, haber: 0, glosa: `Cobro ${ot.numeroOT}` },
                    { codigoCuenta: '4.1.1', debe: 0, haber: monto, glosa: `Ingreso ${ot.numeroOT}` }
                ], fechaPago, `Cobro servicios ${ot.numeroOT}`, req.db);
            }

            if (seEstaAnulando) {
                await anularAsientoPorReferencia('OT', ot._id, pagoNuevo.motivoAnulacion || 'Pago anulado', req.db);
            }
        } catch (eContab) {
            console.warn('[Contabilidad] Hook OT falló (sin impacto en la operación):', eContab.message);
        }

        await aplicarReservaPorCambioEstado(otAnterior, ot, req.db);

        // 🚩 CLAVE: Devolvemos la OT completa para que el frontend vea los reportes
        res.json(ot);

    } catch (error) {
        console.error("Error en actualizarOT:", error);
        res.status(500).json({ error: error.message });
    }
};

// 9. Generar link único para que el supervisor inicie la ejecución
exports.generarLinkEjecucion = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const crypto = require('crypto');
        const token = crypto.randomBytes(20).toString('hex');
        const ot = await OT.findByIdAndUpdate(id, { tokenEjecucion: token }, { new: true });
        if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
        const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
        const link = `${baseUrl}/api/ots/${id}/iniciar-ejecucion?token=${token}`;
        res.json({ link });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 10. Enviar OT al supervisor: genera token + PDF + email via Brevo
exports.enviarAlSupervisor = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const supervisorEmail = (req.body.supervisorEmail || '').trim();
        const supervisorNombre = (req.body.supervisorNombre || 'Supervisor').trim();

        console.log('[enviarAlSupervisor] email recibido:', JSON.stringify(supervisorEmail));

        if (!supervisorEmail) return res.status(400).json({ error: 'Email del supervisor requerido' });

        const crypto = require('crypto');
        let ot = await OT.findById(id);
        if (!ot) return res.status(404).json({ error: 'OT no encontrada' });

        // Reutilizar token existente para que el link no cambie al reenviar
        const token = ot.tokenEjecucion || crypto.randomBytes(20).toString('hex');
        if (!ot.tokenEjecucion) {
            ot.tokenEjecucion = token;
            await ot.save();
        }

        const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
        const link = `${baseUrl}/api/ots/${id}/supervisor?token=${token}`;

        // --- Generar PDF ---
        const pdfBuffer = await new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const chunks = [];
            doc.on('data', c => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const azul = '#2c3e50';
            const verde = '#27ae60';
            const gris = '#7f8c8d';
            const lineaY = () => doc.y;

            // Encabezado
            doc.rect(0, 0, doc.page.width, 80).fill(azul);
            doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
                .text('ORDEN DE TRABAJO', 40, 22);
            doc.fontSize(14).font('Helvetica')
                .text(ot.numeroOT || 'Sin número', 40, 48);
            doc.fillColor(azul);

            doc.moveDown(2);

            // Info general
            const fecha = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
            doc.fontSize(10).font('Helvetica-Bold').fillColor(gris).text('CLIENTE / SOLICITANTE');
            doc.fontSize(12).font('Helvetica').fillColor(azul).text(ot.solicitante || '—');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica-Bold').fillColor(gris).text('DESCRIPCIÓN');
            doc.fontSize(11).font('Helvetica').fillColor('#333').text(ot.descripcion || '—');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica-Bold').fillColor(gris).text('FECHA DE EMISIÓN');
            doc.fontSize(11).font('Helvetica').fillColor('#333').text(fecha);
            doc.moveDown(1);

            // Separador
            doc.moveTo(40, lineaY()).lineTo(doc.page.width - 40, lineaY()).strokeColor('#ddd').stroke();
            doc.moveDown(0.8);

            const seccion = (titulo) => {
                doc.fontSize(11).font('Helvetica-Bold').fillColor(azul).text(titulo.toUpperCase());
                doc.moveDown(0.3);
            };

            const filaTabla = (cols, anchos, esHeader = false) => {
                const y = lineaY();
                let x = 40;
                cols.forEach((col, i) => {
                    doc.fontSize(esHeader ? 9 : 9)
                        .font(esHeader ? 'Helvetica-Bold' : 'Helvetica')
                        .fillColor(esHeader ? 'white' : '#333')
                        .text(String(col ?? '—'), x + 3, y + 3, { width: anchos[i] - 6, lineBreak: false });
                    x += anchos[i];
                });
                const altura = 18;
                x = 40;
                cols.forEach((_, i) => {
                    if (esHeader) doc.rect(x, y, anchos[i], altura).fill('#3d5a73');
                    else doc.rect(x, y, anchos[i], altura).stroke('#e0e0e0');
                    x += anchos[i];
                });
                doc.y = y + altura;
            };

            // TAREAS
            if (ot.tareas && ot.tareas.length > 0) {
                seccion('Tareas');
                const aw = [200, 80, 50, 80, 100];
                filaTabla(['Descripción', 'Fecha', 'Hrs', 'Puesto', 'Responsable'], aw, true);
                ot.tareas.forEach(t => {
                    filaTabla([
                        t.descripcion,
                        t.fecha || '—',
                        t.duracion,
                        t.puesto || '—',
                        (t.operarioNombre || []).join(', ')
                    ], aw);
                });
                doc.moveDown(0.8);
            }

            // COMPONENTES
            if (ot.componentes && ot.componentes.length > 0) {
                seccion('Equipos y Herramientas');
                const cw = [80, 210, 80, 80, 60];
                filaTabla(['Código', 'Descripción', 'Tipo', 'Cantidad', 'Precio'], cw, true);
                ot.componentes.forEach(c => {
                    filaTabla([c.codigo, c.descripcion, c.tipo, c.cantidad, `$${(c.precio || 0).toLocaleString('es-CL')}`], cw);
                });
                doc.moveDown(0.8);
            }

            // LOGÍSTICA
            if (ot.logistica && ot.logistica.length > 0) {
                seccion('Suministros Directos');
                const lw = [80, 200, 80, 80, 70];
                filaTabla(['Unidad', 'Descripción', 'Patente', 'Cantidad', 'Precio'], lw, true);
                ot.logistica.forEach(l => {
                    filaTabla([l.unidad, l.descripcion, l.patente, l.cantidad, `$${(l.precio || 0).toLocaleString('es-CL')}`], lw);
                });
                doc.moveDown(0.8);
            }

            // Link de confirmación
            doc.moveTo(40, lineaY()).lineTo(doc.page.width - 40, lineaY()).strokeColor('#ddd').stroke();
            doc.moveDown(0.8);
            doc.fontSize(11).font('Helvetica-Bold').fillColor(azul).text('CONFIRMAR INICIO DE TRABAJO');
            doc.moveDown(0.3);
            doc.fontSize(10).font('Helvetica').fillColor('#333')
                .text('Al hacer clic en el siguiente enlace, la orden quedará marcada como "En Ejecución":');
            doc.moveDown(0.3);
            doc.fontSize(10).fillColor('#2980b9').text(link, { link, underline: true });

            doc.end();
        });

        // --- Enviar email ---
        await transporter.sendMail({
            from: `"ERP - Gestión de Trabajo" <${process.env.EMAIL_FROM}>`,
            to: supervisorEmail,
            subject: `📋 OT ${ot.numeroOT} — Confirmar inicio de trabajo`,
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
                    <h2 style="color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px">
                        Orden de Trabajo: ${ot.numeroOT}
                    </h2>
                    <p>Estimado/a <b>${supervisorNombre || 'Supervisor/a'}</b>,</p>
                    <p>Se te ha asignado la siguiente orden de trabajo. Por favor revisa el PDF adjunto con el detalle completo.</p>
                    <div style="background:#f8f9fa;padding:15px;border-radius:6px;border-left:4px solid #3498db;margin:15px 0">
                        <p style="margin:4px 0"><b>OT:</b> ${ot.numeroOT}</p>
                        <p style="margin:4px 0"><b>Cliente:</b> ${ot.solicitante}</p>
                        <p style="margin:4px 0"><b>Descripción:</b> ${ot.descripcion}</p>
                    </div>
                    <p style="text-align:center;margin-top:25px">
                        <a href="${link}" style="background:#27ae60;color:white;padding:14px 30px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
                            ✅ Confirmar Inicio de Trabajo
                        </a>
                    </p>
                    <p style="color:#aaa;font-size:12px;text-align:center;margin-top:20px">
                        Al hacer clic en el botón, la OT quedará marcada como "En Ejecución" automáticamente.
                    </p>
                </div>
            `,
            attachments: [{
                filename: `OT_${ot.numeroOT || id}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }]
        });

        res.json({ link, ok: true });
    } catch (error) {
        console.error('Error en enviarAlSupervisor:', error);
        res.status(500).json({ error: error.message });
    }
};

// 11. GET — Portal completo del supervisor
exports.supervisorPortal = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const { token } = req.query;
        const ot = await OT.findById(id);
        if (!ot) return res.status(404).send(paginaError('OT no encontrada'));
        if (!token || ot.tokenEjecucion !== token) return res.status(403).send(paginaError('Link inválido o expirado.'));

        const estado = ot.estado;
        const tareasHtml = (ot.tareas || []).map(t => `
            <div class="tarea-item">
                <span class="tarea-desc">${esc(t.descripcion)}</span>
                ${t.fecha ? `<span class="tag tag-blue">📅 ${t.fecha}</span>` : ''}
                ${t.hora ? `<span class="tag tag-gray">⏰ ${t.hora}</span>` : ''}
                ${(t.operarioNombre || []).length ? `<span class="tag tag-green">👷 ${[].concat(t.operarioNombre).join(', ')}</span>` : ''}
            </div>`).join('');

        const reportesHtml = (ot.reportes || []).slice().reverse().map(r => `
            <div class="reporte-card">
                ${r.foto ? `<img src="${r.foto}" class="reporte-foto" onclick="abrirFoto(this.src)">` : ''}
                <div class="reporte-body">
                    <div class="reporte-meta">📅 ${new Date(r.fecha).toLocaleString('es-CL')}${r.usuario ? ` · ${esc(r.usuario)}` : ''}</div>
                    <div class="reporte-comentario">${esc(r.comentario || '')}</div>
                </div>
            </div>`).join('');

        const estadoColor = { 'Programada': '#3498db', 'En Ejecución': '#e67e22', 'Trabajo Terminado': '#27ae60', 'Con Informe': '#8e44ad' }[estado] || '#95a5a6';
        const base = `/api/ots/${id}/supervisor?token=${token}`;

        const seccionAcciones = (() => {
            if (estado === 'Programada') return `
                <div class="acciones">
                    <div class="card-title" style="margin-bottom:12px">¿Qué deseas indicar?</div>

                    <button class="btn btn-green" onclick="toggleForm('form-iniciar','btn-iniciar')" id="btn-iniciar">✅ Iniciar Trabajo Ahora</button>
                    <div id="form-iniciar" class="form-panel oculto">
                        <p style="margin:0 0 12px;font-size:14px;color:#555">Confirma que estás comenzando el trabajo en este momento.</p>
                        <div style="display:flex;gap:8px">
                            <button class="btn btn-green" style="flex:1" onclick="postJson({accion:'iniciar'})">✅ Confirmar Inicio</button>
                            <button class="btn btn-gris" style="flex:0 0 80px" onclick="toggleForm('form-iniciar','btn-iniciar')">Cancelar</button>
                        </div>
                    </div>

                    <button class="btn btn-yellow" onclick="toggleForm('form-posponer','btn-posponer')" id="btn-posponer">⏸️ No puedo ir — Posponer</button>
                    <div id="form-posponer" class="form-panel oculto">
                        <label>Motivo del postergamiento</label>
                        <textarea id="motivo-input" placeholder="Ej: Falta de materiales, condiciones climáticas..."></textarea>
                        <div style="display:flex;gap:8px;margin-top:10px">
                            <button class="btn btn-yellow" style="flex:1" onclick="accionConCampo('posponer','motivo-input')">Confirmar</button>
                            <button class="btn btn-gris" style="flex:0 0 80px" onclick="toggleForm('form-posponer','btn-posponer')">Cancelar</button>
                        </div>
                    </div>
                </div>`;

            if (estado === 'En Ejecución') return `
                <div class="acciones">
                    <div class="estado-aviso">
                        <span style="font-size:1.4rem">⚙️</span>
                        <span>Trabajo <strong>En Ejecución</strong></span>
                    </div>

                    <button class="btn btn-blue" onclick="toggleForm('form-reporte','btn-reporte')" id="btn-reporte">📝 Enviar Reporte Diario</button>
                    <div id="form-reporte" class="form-panel oculto">
                        <label>Comentario / Avance</label>
                        <textarea id="comentario-input" placeholder="Describe el avance del trabajo..."></textarea>
                        <label>Foto (opcional)</label>
                        <input type="file" id="foto-input" accept="image/*" capture="environment" onchange="previsualizarFoto(this)">
                        <img id="foto-preview" style="display:none;width:100%;border-radius:8px;margin-top:8px">
                        <div style="display:flex;gap:8px;margin-top:12px">
                            <button class="btn btn-blue" style="flex:1" onclick="enviarReporte()">📤 Enviar</button>
                            <button class="btn btn-gris" style="flex:0 0 80px" onclick="toggleForm('form-reporte','btn-reporte')">Cancelar</button>
                        </div>
                    </div>

                    <button class="btn btn-orange" onclick="toggleForm('form-interrumpir','btn-interrumpir')" id="btn-interrumpir">⚠️ Trabajo Interrumpido</button>
                    <div id="form-interrumpir" class="form-panel oculto">
                        <label>Motivo de la interrupción</label>
                        <textarea id="motivo-interrumpir" placeholder="Ej: Condiciones peligrosas, falla de equipo, fuerza mayor..."></textarea>
                        <div style="display:flex;gap:8px;margin-top:10px">
                            <button class="btn btn-orange" style="flex:1" onclick="accionConCampo('interrumpir','motivo-interrumpir')">Confirmar</button>
                            <button class="btn btn-gris" style="flex:0 0 80px" onclick="toggleForm('form-interrumpir','btn-interrumpir')">Cancelar</button>
                        </div>
                    </div>

                    <button class="btn btn-green" onclick="toggleForm('form-terminar','btn-terminar')" id="btn-terminar">🏁 Trabajo Terminado</button>
                    <div id="form-terminar" class="form-panel oculto">
                        <p style="margin:0 0 12px;font-size:14px;color:#555">¿Confirmas que el trabajo fue completado? Esta acción no se puede deshacer.</p>
                        <div style="display:flex;gap:8px">
                            <button class="btn btn-green" style="flex:1" onclick="postJson({accion:'terminar'})">✅ Sí, Trabajo Terminado</button>
                            <button class="btn btn-gris" style="flex:0 0 80px" onclick="toggleForm('form-terminar','btn-terminar')">Cancelar</button>
                        </div>
                    </div>
                </div>`;

            if (estado === 'Trabajo Terminado') return `
                <div class="acciones">
                    <div class="aviso-verde">
                        <span style="font-size:1.4rem">🏁</span>
                        <strong>Trabajo Terminado</strong>
                    </div>

                    <button class="btn btn-blue" onclick="toggleForm('form-informe','btn-informe')" id="btn-informe">📋 Ingresar Informe Final</button>
                    <div id="form-informe" class="form-panel oculto">
                        <label>Descripción del trabajo realizado</label>
                        <textarea id="comentario-input" placeholder="Describe detalladamente lo que se realizó, materiales usados, observaciones..." style="min-height:130px"></textarea>
                        <label>Foto de evidencia (opcional)</label>
                        <input type="file" id="foto-input" accept="image/*" capture="environment" onchange="previsualizarFoto(this)">
                        <img id="foto-preview" style="display:none;width:100%;border-radius:8px;margin-top:8px">
                        <div style="display:flex;gap:8px;margin-top:12px">
                            <button class="btn btn-blue" style="flex:1" onclick="enviarReporte()">📤 Enviar Informe</button>
                            <button class="btn btn-gris" style="flex:0 0 80px" onclick="toggleForm('form-informe','btn-informe')">Cancelar</button>
                        </div>
                    </div>
                </div>`;

            if (estado === 'Con Informe') return `
                <div class="acciones">
                    <div class="aviso-verde">
                        <span style="font-size:1.4rem">📋</span>
                        <strong>Informe entregado — gracias</strong>
                    </div>
                    <button class="btn btn-blue" onclick="toggleForm('form-informe','btn-informe')" id="btn-informe">📋 Agregar otro Informe</button>
                    <div id="form-informe" class="form-panel oculto">
                        <label>Descripción</label>
                        <textarea id="comentario-input" placeholder="Agrega más detalles o correcciones..." style="min-height:110px"></textarea>
                        <label>Foto (opcional)</label>
                        <input type="file" id="foto-input" accept="image/*" capture="environment" onchange="previsualizarFoto(this)">
                        <img id="foto-preview" style="display:none;width:100%;border-radius:8px;margin-top:8px">
                        <div style="display:flex;gap:8px;margin-top:12px">
                            <button class="btn btn-blue" style="flex:1" onclick="enviarReporte()">📤 Enviar</button>
                            <button class="btn btn-gris" style="flex:0 0 80px" onclick="toggleForm('form-informe','btn-informe')">Cancelar</button>
                        </div>
                    </div>
                </div>`;

            return `<div class="aviso-gris">Estado actual: <strong>${esc(estado)}</strong>.<br>Si necesitas realizar una acción, contacta al administrador.</div>`;
        })();

        res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(ot.numeroOT || 'OT')} — Portal Supervisor</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;color:#2c3e50;min-height:100vh}
.header{background:#2c3e50;color:white;padding:20px 16px}
.header-label{font-size:11px;opacity:.65;letter-spacing:1px;text-transform:uppercase}
.header-ot{font-size:26px;font-weight:700;margin:4px 0}
.header-cliente{font-size:14px;opacity:.85}
.estado-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;color:white;margin-top:10px;background:${estadoColor}}
.container{max-width:560px;margin:0 auto;padding:16px}
.card{background:white;border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.card-title{font-size:13px;font-weight:700;color:#7f8c8d;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.tarea-item{padding:8px 0;border-bottom:1px solid #f0f0f0;display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}
.tarea-item:last-child{border-bottom:none}
.tarea-desc{font-size:14px;flex:1 1 100%}
.tag{font-size:11px;padding:2px 7px;border-radius:10px;white-space:nowrap}
.tag-blue{background:#ebf5fb;color:#2980b9}
.tag-gray{background:#f2f3f4;color:#7f8c8d}
.tag-green{background:#eafaf1;color:#27ae60}
.acciones{display:flex;flex-direction:column;gap:10px}
.btn{width:100%;padding:15px;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;transition:opacity .15s}
.btn:active{opacity:.8}
.btn-green{background:#27ae60;color:white}
.btn-blue{background:#3498db;color:white}
.btn-yellow{background:#f39c12;color:white}
.btn-orange{background:#e67e22;color:white}
.btn-red{background:#e74c3c;color:white}
.btn-gris{background:#bdc3c7;color:#555}
.estado-aviso{display:flex;align-items:center;gap:10px;padding:12px;background:#fff3e0;border-radius:8px;border-left:4px solid #e67e22;font-size:14px;color:#7d3c00}
.form-panel{background:#f8f9fa;border-radius:10px;padding:14px}
.oculto{display:none}
label{display:block;font-size:13px;font-weight:600;color:#555;margin-bottom:6px;margin-top:12px}
label:first-child{margin-top:0}
textarea{width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;min-height:90px;resize:vertical;font-family:inherit}
input[type=file]{width:100%;font-size:14px;color:#555}
.reporte-card{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0}
.reporte-card:last-child{border-bottom:none}
.reporte-foto{width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;cursor:pointer}
.reporte-body{flex:1}
.reporte-meta{font-size:11px;color:#aaa;margin-bottom:4px}
.reporte-comentario{font-size:13px;color:#333}
.aviso-verde{background:#eafaf1;border:1px solid #a9dfbf;border-radius:10px;padding:20px;text-align:center;color:#1e8449}
.aviso-gris{background:#f2f3f4;border-radius:10px;padding:14px;color:#7f8c8d;text-align:center}
.spinner{text-align:center;padding:20px;color:#aaa;font-size:14px}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:999;justify-content:center;align-items:center}
.modal-overlay.activo{display:flex}
.modal-overlay img{max-width:100%;max-height:100%;object-fit:contain}
</style>
</head>
<body>
<div class="header">
    <div class="header-label">Portal Supervisor</div>
    <div class="header-ot">${esc(ot.numeroOT || '—')}</div>
    <div class="header-cliente">${esc(ot.solicitante || '')}</div>
    <div class="estado-badge">${esc(estado)}</div>
</div>
<div class="container">
    ${ot.descripcion ? `<div class="card"><div class="card-title">Descripción</div><p style="font-size:14px">${esc(ot.descripcion)}</p></div>` : ''}
    ${tareasHtml ? `<div class="card"><div class="card-title">Tareas Programadas</div>${tareasHtml}</div>` : ''}
    <div class="card">${seccionAcciones}</div>
    ${(ot.reportes || []).length > 0 ? `<div class="card"><div class="card-title">Reportes enviados (${ot.reportes.length})</div>${reportesHtml}</div>` : ''}
</div>
<div class="modal-overlay" id="modal-foto" onclick="this.classList.remove('activo')">
    <img id="modal-img" src="">
</div>
<script>
const BASE = '${base}';

function toggleForm(panelId, btnId){
    const panel=document.getElementById(panelId);
    const btn=btnId&&document.getElementById(btnId);
    const abriendo=panel.classList.contains('oculto');
    // cerrar todos los paneles primero
    document.querySelectorAll('.form-panel').forEach(p=>p.classList.add('oculto'));
    if(abriendo){
        panel.classList.remove('oculto');
        if(btn)btn.style.opacity='.6';
    } else {
        if(btn)btn.style.opacity='1';
    }
}

function abrirFoto(src){document.getElementById('modal-img').src=src;document.getElementById('modal-foto').classList.add('activo')}

async function accion(tipo){
    await postJson({accion:tipo});
}

async function accionConCampo(tipo, inputId){
    const val=(document.getElementById(inputId)||{}).value||'';
    if(!val.trim()){alert('Ingresa el motivo.');return;}
    await postJson({accion:tipo,motivo:val});
}

function previsualizarFoto(input){
    if(!input.files||!input.files[0])return;
    const reader=new FileReader();
    reader.onload=e=>{
        const img=new Image();
        img.onload=()=>{
            const MAX=1200;
            const canvas=document.createElement('canvas');
            let w=img.width,h=img.height;
            if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
            canvas.width=w;canvas.height=h;
            canvas.getContext('2d').drawImage(img,0,0,w,h);
            const b64=canvas.toDataURL('image/jpeg',0.75);
            document.getElementById('foto-preview').src=b64;
            document.getElementById('foto-preview').style.display='block';
            input._b64=b64;
        };
        img.src=e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
}

async function enviarReporte(){
    const comentario=(document.getElementById('comentario-input')||{}).value||'';
    const fotoInput=document.getElementById('foto-input');
    const foto=fotoInput&&fotoInput._b64||'';
    if(!comentario.trim()&&!foto){alert('Agrega un comentario o foto.');return;}
    await postJson({accion:'reporte',comentario,foto});
}

async function postJson(body){
    const btn=event&&event.currentTarget;
    try{
        const resp=await fetch(BASE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await resp.json();
        if(!resp.ok)throw new Error(data.error||'Error');
        location.reload();
    }catch(e){alert('Error: '+e.message);}
}
</script>
</body>
</html>`);
    } catch (err) {
        res.status(500).send(paginaError('Error interno del servidor.'));
    }
};

// 11b. POST — Acciones del supervisor (iniciar / posponer / reporte / terminar)
exports.supervisorAccion = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const { token } = req.query;
        const { accion, motivo, comentario, foto } = req.body;

        const ot = await OT.findById(id);
        if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
        if (!token || ot.tokenEjecucion !== token) return res.status(403).json({ error: 'Token inválido' });

        if (accion === 'iniciar') {
            ot.estado = 'En Ejecución';

        } else if (accion === 'posponer') {
            if (!motivo) return res.status(400).json({ error: 'Motivo requerido' });
            ot.reportes = ot.reportes || [];
            ot.reportes.push({ comentario: `⏸️ TRABAJO POSPUESTO: ${motivo}`, fecha: new Date(), usuario: 'Supervisor' });
            ot.estado = 'Programada';

        } else if (accion === 'interrumpir') {
            if (!motivo) return res.status(400).json({ error: 'Motivo requerido' });
            ot.reportes = ot.reportes || [];
            ot.reportes.push({ comentario: `⚠️ TRABAJO INTERRUMPIDO: ${motivo}`, fecha: new Date(), usuario: 'Supervisor' });
            ot.estado = 'Programada';

        } else if (accion === 'reporte') {
            if (!comentario && !foto) return res.status(400).json({ error: 'Comentario o foto requeridos' });
            ot.reportes = ot.reportes || [];
            ot.reportes.push({ comentario: comentario || '', foto: foto || '', fecha: new Date(), usuario: 'Supervisor' });
            if (ot.estado === 'Trabajo Terminado') ot.estado = 'Con Informe';

        } else if (accion === 'terminar') {
            ot.estado = 'Trabajo Terminado';

        } else {
            return res.status(400).json({ error: 'Acción no reconocida' });
        }

        await ot.save();
        res.json({ ok: true, estado: ot.estado });
    } catch (err) {
        console.error('Error en supervisorAccion:', err);
        res.status(500).json({ error: err.message });
    }
};

function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function paginaError(msg) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#f0f2f5">
        <div style="font-size:3rem">⚠️</div>
        <h2 style="color:#e74c3c;margin:12px 0">${esc(msg)}</h2>
        <p style="color:#aaa;font-size:14px">Si crees que esto es un error, contacta al administrador.</p>
    </body></html>`;
}

// 12. GET — Muestra página de confirmación al supervisor (no cambia estado aún)
exports.iniciarEjecucion = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const { token } = req.query;
        const ot = await OT.findById(id);
        if (!ot) return res.status(404).send('<h1>OT no encontrada</h1>');
        if (!token || ot.tokenEjecucion !== token) {
            return res.status(403).send(`
                <div style="font-family:sans-serif;text-align:center;padding:80px 20px;max-width:500px;margin:auto">
                    <div style="font-size:60px">⚠️</div>
                    <h1 style="color:#e74c3c">Link inválido</h1>
                    <p style="color:#555">Este link ya fue utilizado o no es válido.</p>
                </div>
            `);
        }

        const tareasList = (ot.tareas || []).map(t =>
            `<li style="padding:6px 0;border-bottom:1px solid #eee">
                <b>${t.descripcion || '—'}</b>
                ${t.fecha ? `<span style="color:#3498db;margin-left:8px">📅 ${t.fecha}</span>` : ''}
                ${t.hora ? `<span style="color:#7f8c8d;margin-left:8px">⏰ ${t.hora}</span>` : ''}
                ${(t.operarioNombre || []).length ? `<span style="color:#27ae60;margin-left:8px">👷 ${[].concat(t.operarioNombre).join(', ')}</span>` : ''}
            </li>`
        ).join('');

        res.send(`<!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Confirmar Inicio — ${ot.numeroOT}</title>
            </head>
            <body style="font-family:sans-serif;background:#f0f2f5;margin:0;padding:20px">
                <div style="max-width:500px;margin:40px auto;background:white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);overflow:hidden">
                    <div style="background:#2c3e50;color:white;padding:24px">
                        <div style="font-size:13px;opacity:0.7;margin-bottom:4px">ORDEN DE TRABAJO</div>
                        <div style="font-size:24px;font-weight:bold">${ot.numeroOT || '—'}</div>
                        <div style="font-size:14px;opacity:0.85;margin-top:4px">${ot.solicitante || ''}</div>
                    </div>
                    <div style="padding:24px">
                        <p style="color:#555;margin-top:0">${ot.descripcion || ''}</p>
                        ${tareasList ? `<ul style="padding-left:0;list-style:none;margin:0 0 20px">${tareasList}</ul>` : ''}
                        <p style="color:#555;font-size:14px">
                            Al confirmar, la orden quedará marcada como <b>En Ejecución</b> en el sistema.
                        </p>
                        <form method="POST" action="/api/ots/${id}/iniciar-ejecucion?token=${token}">
                            <button type="submit"
                                style="width:100%;padding:16px;background:#27ae60;color:white;border:none;border-radius:8px;font-size:18px;font-weight:bold;cursor:pointer;margin-top:8px">
                                ✅ Confirmar Inicio de Trabajo
                            </button>
                        </form>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('<h1>Error interno</h1>');
    }
};

// 11b. POST — Supervisor confirma: cambia estado a En Ejecución
exports.confirmarEjecucion = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { id } = req.params;
        const { token } = req.query;
        const ot = await OT.findById(id);
        if (!ot) return res.status(404).send('<h1>OT no encontrada</h1>');
        if (!token || ot.tokenEjecucion !== token) {
            return res.status(403).send(`
                <div style="font-family:sans-serif;text-align:center;padding:80px 20px;max-width:500px;margin:auto">
                    <div style="font-size:60px">⚠️</div>
                    <h1 style="color:#e74c3c">Link ya utilizado</h1>
                    <p style="color:#555">Este link de confirmación ya fue procesado.</p>
                </div>
            `);
        }
        ot.estado = 'En Ejecución';
        await ot.save();
        res.send(`<!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Trabajo en Ejecución</title>
            </head>
            <body style="font-family:sans-serif;background:#f0f2f5;margin:0;padding:20px">
                <div style="max-width:500px;margin:80px auto;background:white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);padding:48px;text-align:center">
                    <div style="font-size:64px">⚙️</div>
                    <h1 style="color:#e67e22;margin:16px 0 8px">Trabajo en Ejecución</h1>
                    <p style="font-size:16px;color:#555">La OT <b>${ot.numeroOT}</b> ha sido marcada como <b>En Ejecución</b>.</p>
                    <p style="color:#aaa;font-size:13px;margin-top:24px">Puedes cerrar esta ventana.</p>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('<h1>Error interno</h1>');
    }
};

// 11. Respuesta Directa del Cliente (Solo actualización interna)
exports.responderCotizacionCliente = async (req, res) => {
    const OT = getOT(req.db);
    try {
        const { id, nuevoEstado } = req.params;

        // 1. Actualizar la OT
        const otAnterior = await OT.findById(id).lean();
        const otActualizada = await OT.findByIdAndUpdate(
            id,
            { estado: nuevoEstado },
            { new: true }
        );

        if (!otActualizada) {
            return res.status(404).send("<h1>Error: Registro no encontrado.</h1>");
        }

        // 2. Sincronizar con la Solicitud original para que el ERP sea consistente
        const idSolicitud = otActualizada.solicitudId || otActualizada._id;
        const Solicitud = require('../models/Solicitud')(req.db);
        await Solicitud.findByIdAndUpdate(idSolicitud, { estado: nuevoEstado });

        // 3. Reserva/liberación de recursos si corresponde (ej. Aceptar -> reserva herramientas e insumos)
        await aplicarReservaPorCambioEstado(otAnterior, otActualizada, req.db);

        console.log(`♻️ ERP Actualizado: OT ${otActualizada.numeroOT} ahora está ${nuevoEstado}`);

        // 3. Respuesta visual simple para el cliente
        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 100px 20px;">
                <div style="font-size: 50px;">✔️</div>
                <h1 style="color: #2c3e50;">Respuesta Recibida</h1>
                <p style="font-size: 18px; color: #7f8c8d;">
                    Gracias. Su respuesta sobre la cotización <b>${otActualizada.numeroOT}</b> ha sido procesada correctamente.
                </p>
            </div>
        `);

    } catch (error) {
        console.error("Error al procesar respuesta:", error);
        res.status(500).send("Error interno.");
    }
};