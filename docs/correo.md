# Correo saliente: cómo funciona y cómo diagnosticar que "no llega"

Todo el correo del sistema sale por el **relay SMTP de Brevo** (`config/mailer.js`). Son cinco
cosas distintas: cotizaciones al cliente, avisos al supervisor, invitaciones a cuentas de
oficina, recuperaciones de clave y avisos de órdenes de compra.

## Variables

| Variable | Obligatoria | Qué pasa si falta |
|---|---|---|
| `BREVO_API_KEY` | sí | No sale ningún correo. Se avisa al arrancar. **Nunca se registra su valor, ni truncado.** |
| `EMAIL_FROM` | sí | Cada correo arma `"ERP" <undefined>` y falla de a uno. Se avisa al arrancar. |
| `BREVO_SMTP_USER` | no | Se usa el identificador que quedó como respaldo en el código. Se avisa. |
| `EMAIL_REPLY_TO` | no | Las respuestas de los clientes vuelven al remitente técnico y nadie las lee. |
| `SPA_URL` | sí para recuperar clave | El link del correo no abre. Se valida al arrancar (ver abajo). |

## Lo que se valida al arrancar

`server.js` llama a `avisarUrlsInvalidas()` y `mailer.avisarConfiguracion()`. Ninguna corta el
arranque —el correo roto no debe tumbar el sistema— pero las dos gritan en el log de Render.

Existen porque **dos configuraciones malas de `SPA_URL` costaron una tarde cada una**, y en las
dos el backend arrancó sin una queja mientras mandaba correos con links muertos:

```
https://.onrender.com                          ← faltaba el nombre del servicio
SPA_URL = https://erp-taller-web.onrender.com  ← se pegó la línea entera del panel en el valor
```

El segundo no parsea como URL. **El primero sí**: `new URL()` lo acepta y deja el hostname en
`.onrender.com`, así que una validación ingenua lo deja pasar. Por eso `urlUsable()` mira
además que el host no tenga etiquetas vacías. Está probado en `test/configuracion.test.js` con
esos dos valores exactos.

## El remitente: por qué el cliente ve una dirección de máquina

Hoy `EMAIL_FROM` es una dirección de dominio personal (`@gmail.com`). Brevo **no puede firmar
un correo en nombre de Gmail**, así que reescribe el remitente a uno propio y el cliente del
taller recibe la cotización de algo como `thexeos00@10686868.brevosend.com`. El correo llega,
pero no dice nada y no da confianza.

El arreglo es un **dominio propio verificado en Brevo** (SPF + DKIM) y usarlo en `EMAIL_FROM`,
con `EMAIL_REPLY_TO` apuntando a una persona. Al arrancar se avisa mientras esto siga así.

Cuando haya varios talleres, el dominio es **uno solo, del producto**, no uno por taller: quien
manda el correo es el sistema, y verificar SPF/DKIM de diez dominios ajenos es trabajo de
soporte que no compra nada. Lo que sí cambia por taller es el nombre visible del remitente y el
`EMAIL_REPLY_TO`.

## Diagnosticar "no me llega el correo de recuperación"

La respuesta al navegador es **siempre la misma** exista o no la cuenta, a propósito: si no, el
formulario se convierte en una forma de averiguar qué correos están registrados. Eso dejaba a
quien administra sin ninguna forma de saber qué pasó. El diagnóstico sale del **log de Render**:

```
[auth] recuperación: NO se envió — ninguna cuenta activa con ese correo (@hotmail.com)
[auth] recuperación: NO se envió — la cuenta existe pero aún no tiene clave (invitación sin activar) (@hotmail.com)
[auth] recuperación: correo entregado al proveedor (@hotmail.com)
[auth] recuperación: FALLÓ el envío — Invalid login: 535 ... (@hotmail.com)
[auth] recuperación: pedida sin correo (@(sin dominio))
```

Pides la recuperación, miras el log, y en una línea sabes cuál de los cinco casos es.

**Nunca se escribe la dirección completa, solo el dominio.** El log de Render lo lee cualquiera
con acceso al panel: la parte local dejaría ahí la lista de quién tiene cuenta, y el dominio es
lo que de verdad sirve —el error típico es escribir el correo de otra cuenta, un gmail cuando la
cuenta es de hotmail—. **El token de reset tampoco se registra**: es una credencial viva por 60
minutos. Las dos reglas están probadas en `test/recuperacionLog.test.js`, y la prueba se pone
roja si alguien vuelve a registrar el correo completo.

Si el log dice `correo entregado al proveedor` y la persona igual no lo recibe, el problema ya
no es del sistema: está en Brevo (Transaccional → Logs, ver si el evento pasó de *Enviado* a
*Entregado*) o en el buzón de destino. Outlook, en particular, suprime silenciosamente correos
idénticos repetidos — al depurar esto conviene cambiar algo del asunto entre intentos.
