const express = require('express');
const router = express.Router();
const transporter = require('../config/mailer');
const otController = require('../controllers/otController');

router.post('/enviar-cotizacion', async (req, res) => {
    const { emails, otId, cliente, total, pdfData, tareas = [] } = req.body;
    const URL_BASE = "http://localhost:5000/api/mail";

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
                    
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="${URL_BASE}/respuesta/${otId}/Aprobada" 
                           style="background-color: #27ae60; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin: 5px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                           ✅ Aceptar y Programar Trabajo
                        </a>

                        <a href="${URL_BASE}/respuesta/${otId}/Rechazada" 
                           style="background-color: #e74c3c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin: 5px; opacity: 0.9;">
                           ❌ Rechazar
                        </a>
                    </div>

                    <p style="font-size: 13px; color: #7f8c8d; margin-top: 40px; text-align: center; font-style: italic;">
                        Al hacer clic en "Aceptar", la orden quedará programada en nuestro sistema con las fechas indicadas; la ejecución en terreno se coordinará según ese cronograma.
                    </p>
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

module.exports = router;