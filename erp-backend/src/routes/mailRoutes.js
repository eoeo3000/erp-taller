const express = require('express');
const router = express.Router();
const transporter = require('../config/mailer');
const otController = require('../controllers/otController');
const portalController = require('../controllers/portalController');
const getOT = require('../models/OT');
const getSolicitud = require('../models/Solicitud');
const { PWA_CLIENTE_URL } = require('../config/urls');

router.post('/enviar-cotizacion', async (req, res) => {
    const { emails, otId, cliente, total, pdfData, tareas = [] } = req.body;

    // Link al portal del cliente (PWA), autenticado con una SesionPortal emitida acá mismo
    // para el teléfono de la Solicitud vinculada a esta OT — reemplaza los botones viejos de
    // Aceptar/Rechazar directos (sin auth, y con URL_BASE hardcodeada a localhost, ver
    // historial de este archivo). Si no se puede resolver el teléfono, se degrada a un aviso
    // sin romper el envío del correo/PDF.
    let linkPortal = null;
    try {
        const OT = getOT(req.db);
        const Solicitud = getSolicitud(req.db);
        const ot = await OT.findById(otId).lean();
        const solicitud = ot ? await Solicitud.findById(ot.solicitudId || ot._id).lean() : null;
        if (solicitud?.numero) {
            const token = await portalController.emitirSesionParaTelefono(req.db, solicitud.numero, solicitud.empresaSolicitante);
            if (token) linkPortal = `${PWA_CLIENTE_URL}/?token=${token}&entorno=${req.entorno}`;
        }
    } catch (eToken) {
        console.warn('[enviar-cotizacion] no se pudo emitir el link del portal:', eToken.message);
    }

    let fechaInicioStr = "Por confirmar";
    let fechaTerminoStr = "Por confirmar";

    if (tareas.length > 0) {
        const fechasValidas = tareas
            .map(t => {
                // 🚩 CORRECCIÓN AQUÍ: Forzamos la hora local añadiendo T00:00:00
                // Esto evita que el Timezone mueva la fecha al día anterior.
                return new Date(t.fecha + 'T00:00:00');
            })
            .filter(d => !isNaN(d.getTime()));

        if (fechasValidas.length > 0) {
            const minFecha = new Date(Math.min(...fechasValidas));
            const maxFecha = new Date(Math.max(...fechasValidas));

            // Usamos locale 'es-CL' para asegurar el formato día-mes-año
            const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
            fechaInicioStr = minFecha.toLocaleDateString('es-CL', opciones);
            fechaTerminoStr = maxFecha.toLocaleDateString('es-CL', opciones);
        }
    }

    try {
        await transporter.sendMail({
            from: `"Gestión de Suministros" <${process.env.EMAIL_FROM}>`,
            to: emails,
            subject: `📄 Cotización Suministros - OT: ${otId}`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px; margin: auto; color: #333;">
                    <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Cotización de Suministros</h2>
                    <p>Estimado/a <b>${cliente}</b>,</p>
                    <p>Adjuntamos el detalle técnico y comercial de su solicitud bajo la <b>OT: ${otId}</b>.</p>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #3498db;">
                        <h4 style="margin-top: 0; color: #2c3e50;">Resumen del Servicio:</h4>
                        <p style="margin: 5px 0;"><strong>📅 Fecha Inicio:</strong> ${fechaInicioStr}</p>
                        <p style="margin: 5px 0;"><strong>🏁 Fecha Término:</strong> ${fechaTerminoStr}</p>
                        <p style="margin: 15px 0 5px 0; font-size: 1.1em;"><strong>💰 Inversión Total:</strong></p>
                        <strong style="font-size: 24px; color: #27ae60;">$${total.toLocaleString()}</strong>
                    </div>
                    
                    <p style="text-align: center; font-weight: bold; margin-top: 30px; color: #2c3e50;">
                        ¿Desea aceptar la programación y el costo indicados?
                    </p>

                    ${linkPortal ? `
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="${linkPortal}"
                           style="background-color: #27ae60; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin: 5px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                           ✅ Ver cotización y responder
                        </a>
                    </div>
                    <p style="font-size: 13px; color: #7f8c8d; margin-top: 40px; text-align: center; font-style: italic;">
                        En el portal puede revisar el detalle completo y aceptar o rechazar la propuesta. Al aceptar, la orden queda programada con las fechas indicadas.
                    </p>` : `
                    <p style="text-align: center; margin-top: 20px; color: #2c3e50;">
                        Por favor contáctenos para confirmar su respuesta a esta cotización.
                    </p>`}
                </div>
            `,
            attachments: [
                {
                    filename: `Cotizacion_${otId}.pdf`,
                    content: pdfData,
                    encoding: 'base64'
                }
            ]
        });

        res.status(200).json({ ok: true, message: 'Enviado con éxito' });
    } catch (error) {
        console.error("Error en servidor:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

router.get('/respuesta/:id/:nuevoEstado', otController.responderCotizacionCliente);

// POST /enviar-excepcion — mirror de /enviar-cotizacion, pero para una "extensión de
// cotización" (OT.excepciones, ver models/OT.js §7): el planificador ya completó
// componentesExtra/tareasExtra con precios en Tratamiento y la manda al cliente. Marca la
// excepción como 'Enviada' y limpia OT.subEstado ('Replanificar') — la oficina ya preparó y
// mandó la extensión, ese flag queda resuelto.
router.post('/enviar-excepcion', async (req, res) => {
    const { emails, otId, excepcionId, cliente } = req.body;
    const OT = getOT(req.db);

    try {
        const ot = await OT.findById(otId);
        if (!ot) return res.status(404).json({ ok: false, error: 'OT no encontrada' });

        const excepcion = ot.excepciones.id(excepcionId);
        if (!excepcion) return res.status(404).json({ ok: false, error: 'Excepción no encontrada' });

        const componentesExtra = excepcion.componentesExtra || [];
        const tareasExtra = excepcion.tareasExtra || [];
        if (componentesExtra.length === 0 && tareasExtra.length === 0) {
            return res.status(400).json({ ok: false, error: 'Agrega al menos un material o una tarea extra antes de enviar.' });
        }

        const montoExtra = componentesExtra.reduce((s, c) => s + (c.cantidad || 0) * (c.precio || 0), 0)
            + tareasExtra.reduce((s, t) => s + (t.duracion || 0) * (t.valorHora || 0), 0);

        excepcion.montoExtra = montoExtra;
        excepcion.estado = 'Enviada';
        excepcion.fechaEnvio = new Date();
        ot.subEstado = '';
        await ot.save();

        // Mismo link autenticado que /enviar-cotizacion — ver ese endpoint para el detalle.
        let linkPortal = null;
        try {
            const Solicitud = getSolicitud(req.db);
            const solicitud = await Solicitud.findById(ot.solicitudId || ot._id).lean();
            if (solicitud?.numero) {
                const token = await portalController.emitirSesionParaTelefono(req.db, solicitud.numero, solicitud.empresaSolicitante);
                if (token) linkPortal = `${PWA_CLIENTE_URL}/?token=${token}&entorno=${req.entorno}`;
            }
        } catch (eToken) {
            console.warn('[enviar-excepcion] no se pudo emitir el link del portal:', eToken.message);
        }

        const filasExtra = [
            ...componentesExtra.map(c => `<li>${c.cantidad || 0} × ${c.descripcion || c.codigo || 'Material'} — $${((c.cantidad || 0) * (c.precio || 0)).toLocaleString()}</li>`),
            ...tareasExtra.map(t => `<li>${t.duracion || 0} h × ${t.descripcion || t.puesto || 'Tarea'} — $${((t.duracion || 0) * (t.valorHora || 0)).toLocaleString()}</li>`),
        ].join('');

        await transporter.sendMail({
            from: `"Gestión de Suministros" <${process.env.EMAIL_FROM}>`,
            to: emails,
            subject: `📄 Extensión de cotización - OT: ${ot.numeroOT || otId}`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px; margin: auto; color: #333;">
                    <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Extensión de cotización</h2>
                    <p>Estimado/a <b>${cliente || ''}</b>,</p>
                    <p>Durante la ejecución de la OT <b>${ot.numeroOT || ''}</b> identificamos que se necesita lo siguiente, adicional a lo ya cotizado:</p>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #3498db;">
                        <p>${excepcion.descripcion || ''}</p>
                        <ul style="margin: 10px 0; padding-left: 20px;">${filasExtra}</ul>
                        <p style="margin: 15px 0 5px 0; font-size: 1.1em;"><strong>💰 Costo adicional:</strong></p>
                        <strong style="font-size: 24px; color: #27ae60;">$${montoExtra.toLocaleString()}</strong>
                    </div>
                    <p style="text-align: center; font-weight: bold; margin-top: 30px; color: #2c3e50;">
                        ¿Aprueba este costo adicional?
                    </p>
                    ${linkPortal ? `
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="${linkPortal}"
                           style="background-color: #27ae60; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin: 5px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                           ✅ Ver y responder
                        </a>
                    </div>` : `
                    <p style="text-align: center; margin-top: 20px; color: #2c3e50;">
                        Por favor contáctenos para confirmar su respuesta a esta extensión de cotización.
                    </p>`}
                </div>
            `,
        });

        res.status(200).json({ ok: true, message: 'Enviado con éxito' });
    } catch (error) {
        console.error('[enviar-excepcion] Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;