# Reloj del respaldo (Cloudflare Workers)

Un Cron Trigger que llama a `POST /api/respaldos` todos los días a las **08:00 UTC**
(05:00 en Chile en verano, 04:00 en invierno). Es solo un reloj: quien respalda sigue
siendo el backend, igual que antes.

## Por qué existe

GitHub Actions corre las tareas programadas de este repositorio **entre 4,5 y 10 horas
tarde**. El respaldo «de las 05:00» salía en plena jornada, entre las 09:30 y las 15:00
de Chile. Un Cron Trigger corre a la hora, y la cuenta de Cloudflare ya existe porque ahí
está el bucket R2.

**GitHub no se jubila, cambia de papel.** Con la variable `RESPALDO_POR_CLOUDFLARE` deja
de respaldar y pasa a **vigilar** (`.github/scripts/vigilar-respaldo.sh`): revisa que cada
taller tenga un respaldo de menos de 30 horas y, si no, termina en rojo y GitHub te manda
un correo. Hace falta porque **un Worker que falla no le avisa a nadie**. A una revisión
no le importa que GitHub la corra ocho horas tarde.

## Decisiones (con prueba en `worker.test.mjs`)

- **La dirección pública del Worker no hace nada.** Todo Worker queda con una URL
  `*.workers.dev`; si respondiera ahí con un respaldo, sería un botón que cualquiera puede
  apretar, con el token que el Worker guarda.
- **Reintenta una sola vez, y solo si el pedido no llegó**: sin respuesta, o con 502/504
  del proxy de Render. Un **500** significa que algunos talleres se respaldaron y otros no;
  repetir el pedido respaldaría dos veces los que salieron, gastando dos de los 30 lugares
  que se conservan de cada uno. Un 401 o un 503 (falta `RESPALDO_TOKEN`) son configuración
  y no se arreglan esperando.
- **Corte a los 14 minutos**, uno antes del límite de Cloudflare, para que el error diga
  qué pasó en vez de un corte sin mensaje.
- **Un error marca la ejecución como fallida** en *Cron Events* (`ctx.waitUntil` con la
  promesa, sin atrapar).

Probar: `npm test` en esta carpeta. Sin dependencias.

## Publicarlo (desde el panel, sin instalar nada)

1. Cloudflare → **Workers & Pages** → **Create** → *Create Worker* → nombre
   `erp-taller-reloj` → **Deploy**.
2. **Edit code**: borra lo que trae, pega el contenido de `worker.js` → **Deploy**.
3. **Settings → Variables and Secrets** → agrega dos, de tipo **Secret**:
   - `RESPALDO_URL`: el mismo valor del secreto de GitHub
     (`https://…onrender.com/api/respaldos`).
   - `RESPALDO_TOKEN`: el mismo valor de `RESPALDO_TOKEN` en Render.
4. **Settings → Trigger events** (o *Triggers*) → **Add → Cron trigger** → `0 8 * * *`.
5. **Al día siguiente**, después de las 05:00:
   - en *Cron Events* o *Logs* del Worker tiene que verse la ejecución sin error, y
   - en R2, un archivo nuevo de esa hora en `respaldos/produccion/<taller>/`.
6. **Recién entonces**, en GitHub → Settings → Secrets and variables → Actions →
   *Variables*: `RESPALDO_POR_CLOUDFLARE` = `true`. Desde ahí GitHub vigila en vez de
   respaldar. Ponerla antes del paso 5 dejaría una noche sin respaldo si algo del Worker
   quedó mal.

Desde la terminal también se puede: `npx wrangler deploy` en esta carpeta y
`npx wrangler secret put RESPALDO_URL` / `RESPALDO_TOKEN`. El horario ya está en
`wrangler.toml`.

## Volver atrás

Borrar la variable `RESPALDO_POR_CLOUDFLARE` en GitHub: la acción vuelve a respaldar como
antes, con su atraso. Si además el Worker sigue activo habrá dos respaldos por día, que
gastan la retención el doble de rápido (15 días en vez de 30), así que conviene también
desactivar su Cron Trigger.

## Respaldo a mano

No cambia: GitHub → Actions → *Respaldo diario* → **Run workflow** respalda siempre,
con o sin la variable.
