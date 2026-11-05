# Apagar el backend de noche

Render cobra el plan Starter **por hora encendido**, no por cuánto trabaja el servidor:
un mes entero son ~670 horas a $0,0094, unos $6,30. Apagarlo en las horas en que nadie lo
usa es la única forma de bajar esa cuenta sin cambiar de plan.

**Cuánto se ahorraría:** 5,5 horas por noche, unos **$1,50 al mes**.

> **El horario está desconectado.** Al revisar el historial de `respaldo.yml` se vio que
> en este repositorio GitHub corre las tareas programadas **entre 4,5 y 10 horas tarde**:
> el respaldo programado a las 08:00 UTC salió entre las 12:35 y las 18:08 UTC todos los
> días de dos semanas seguidas (21 de octubre a 4 de noviembre de 2026). El diseño
> suponía «a veces una hora tarde». Con atrasos de ocho horas, la protección contra un
> apagado atrasado (punto 2 abajo) lo descartaría casi siempre, pero el día que cayera
> dentro de la noche el **encendido** llegaría a media tarde, y nada lo cubre: el
> servidor quedaría apagado toda la mañana. Por eso `horario-servidor.yml` ya no tiene
> `schedule`; solo queda el botón manual, que sí sirve tal como está.
>
> Para volver a tener horario hace falta un reloj que cumpla. El candidato es un
> **Cron Trigger de Cloudflare Workers**: la cuenta de Cloudflare ya existe (R2), corre a
> la hora y puede llamar a la API de Render directamente. La clave de Render pasaría a
> vivir como secreto del Worker en vez de en GitHub.
>
> Lo mismo afectaba al **respaldo diario**: no corría a las 05:00 de Chile sino en plena
> jornada, entre las 09:30 y las 15:00. Ese ya pasó a un Cron Trigger de Cloudflare
> ([`reloj-cloudflare/`](../reloj-cloudflare/README.md)); el mismo Worker podría encargarse
> del apagado si algún día vale la pena.

## Cómo funciona

- `.github/workflows/horario-servidor.yml` apaga el servicio a las 02:00 UTC y lo enciende
  a las 07:30 UTC, usando la API de Render (`POST /services/{id}/suspend` y `/resume`).
  En Chile: **23:00 a 04:30 en verano, 22:00 a 03:30 en invierno**. GitHub solo entiende
  UTC, así que el cambio de hora lo corre una hora.
- `.github/scripts/servidor-render.sh` es la única definición de «encender» y «apagar».
  La usan esta acción y `respaldo.yml`.
- **El respaldo de las 05:00 enciende el servidor antes de pedir nada.** GitHub atrasa las
  tareas programadas cuando está cargado, a veces más de una hora, y un servicio
  suspendido **no despierta con una llamada** como el del plan gratis: sin ese paso, un
  encendido atrasado dejaría la noche sin respaldo.

## Las decisiones que no son evidentes

1. **Viene apagado.** Sin la variable `APAGADO_NOCTURNO = true` no apaga nada. Activarlo y
   desactivarlo es cambiar una variable en GitHub, sin tocar código.
2. **Un apagado atrasado no se ejecuta.** Si GitHub lo corre a las 9 de la mañana, apagar
   ahí dejaría el servidor apagado **todo el día**, hasta el encendido siguiente. Solo apaga
   entre las 02:00 y las 07:00 UTC; fuera de esa ventana avisa y no hace nada. Encender
   atrasado no daña a nadie, por eso esa revisión solo la tiene el apagado.
3. **El encendido corre aunque la variable esté desactivada.** Si alguien la desactiva de
   noche con el servidor ya suspendido, saltarse el encendido lo dejaría apagado todo el día.
   Encender un servidor encendido no hace nada. Solo se salta si nunca se configuraron las
   claves, para no fallar a diario en un repositorio que no usa esto.
4. **Una respuesta que no se entiende corta la acción en rojo.** Con una clave mala, el
   primer borrador decía «el servicio ya estaba apagado» y terminaba en verde sin haber
   hecho nada (un error dentro de `$( )` no corta un script de bash si no se pide
   explícitamente: `shopt -s inherit_errexit`, y el estado guardado en una variable antes
   de compararlo). Ahora cada error dice qué secreto revisar.
5. **«Encender» espera a que el backend conteste**, no solo a que Render diga que reanudó:
   pregunta a `/api/auth/yo` hasta recibir 200 o 401. Así el respaldo no sale contra un
   proceso que todavía está arrancando.
6. **Nunca se imprime el cuerpo de las respuestas de Render**, solo el código, para que nada
   de la cuenta termine en el log de la acción.

## Qué se pierde

- **Quien trabaje en esas horas no puede guardar.** Los calendarios rotativos existen
  justamente para talleres con turnos de noche. La PWA Operativa guarda en el teléfono lo
  que no logra enviar y reintenta, pero la oficina no lo ve hasta la mañana.
- **Los clientes no pueden abrir su portal** en ese horario.
- **La clave de la API de Render controla TODA la cuenta**, no solo este servicio: quien la
  tenga puede apagar o borrar cualquier servicio. Vive solo como secreto de GitHub.

## Activarlo

1. Render → Account Settings → **API Keys** → crear una clave.
2. Render → el servicio `erp-taller-backend`: su id empieza con `srv-` y sale en la URL.
3. GitHub → Settings → Secrets and variables → Actions:
   - Secrets: `RENDER_API_KEY` y `RENDER_SERVICE_ID`. `RESPALDO_URL` ya existe y de ahí se
     saca la dirección del backend.
   - Variables: `APAGADO_NOCTURNO` = `true`.
4. Probarlo de día, una vez: Actions → **Horario del servidor** → Run workflow → `apagar`,
   comprobar que la app no carga, y después `encender`, comprobar que vuelve.

## Encenderlo antes de hora (la vuelta atrás)

Actions → **Horario del servidor** → Run workflow → `encender`. Funciona aunque la
variable esté desactivada. También sirve el botón *Resume* del servicio en Render.

## Cambiar el horario

Cambiar los dos `cron` de `horario-servidor.yml` **y** `APAGAR_DESDE_UTC` /
`APAGAR_HASTA_UTC` en el mismo archivo, que son la ventana del punto 2. Si el encendido
queda después de las 08:00 UTC, el paso de encendido de `respaldo.yml` es el que lo cubre.

Para dejar de usarlo: borrar la variable `APAGADO_NOCTURNO`. El encendido de la mañana
sigue corriendo mientras existan las claves, así que nunca queda apagado.
