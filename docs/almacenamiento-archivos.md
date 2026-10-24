# Almacenamiento de archivos — fotos de terreno y adjuntos

## El problema que esto resuelve

Las fotos de evidencia y los adjuntos de las solicitudes se guardaban como archivos en
`erp-backend/uploads/`, o sea en el disco del contenedor. En Render un Web Service sin disco
persistente contratado tiene **sistema de archivos efímero**: cada deploy, cada reinicio y
cada despertar del plan gratis lo dejan vacío.

El efecto era silencioso y por eso peligroso: la OT conservaba la URL
(`https://…onrender.com/uploads/1738…-123.jpg`), pero el archivo ya no existía. La foto que
respalda un trabajo cobrado simplemente dejaba de abrirse, sin ningún aviso, y sin forma de
recuperarla.

## Cómo quedó

Los archivos van a un bucket **Cloudflare R2** (compatible con S3). El disco pasa a ser
respaldo de lectura.

```
Subir:  PWA/SPA → POST /api/uploads/foto → almacenamiento.guardar() → bucket R2
                                                    ↓ (si no hay credenciales)
                                                  disco local

Leer:   <img src=".../uploads/talleres/rivas/1738-123.jpg"> → GET /uploads/… → bucket R2
                                                    ↓ (si no está ahí)
                                                  disco local → 404
```

Cuatro decisiones que conviene entender antes de tocar esto:

**1. La forma de la URL no cambió.** Se sigue guardando `/uploads/<clave>` en la base. No es
un detalle estético: los dos clientes arman la URL absoluta con `BACKEND_ORIGIN + data.url`
(ver `erp-web/src/utils/fotos.js` y `erp-pwa-operativa/src/api.js`). Si el backend devolviera
la URL del bucket, cada PWA ya instalada guardaría una URL con dos orígenes pegados. Además
hay miles de URL viejas ya escritas en `OT.reportes`, `OT.tareas[].registro.fotos` y
`Solicitud.adjuntos`: cambiar el formato obligaría a migrar la base.

**2. El bucket es privado.** Las lecturas pasan por el backend. Son fotos de las
instalaciones de los clientes del taller, no material público. El costo es que el tráfico
pasa por Render; a la escala de este sistema (≈5.000 fotos, ~1 GB) es despreciable, y el
encabezado `Cache-Control: immutable` hace que el navegador no vuelva a pedir la misma foto.

**3. Cada taller tiene su carpeta.** Desde la etapa 5 de [multi-taller.md](multi-taller.md)
los archivos van a `talleres/<slug>/<archivo>` en vez de al mismo nivel para todos. No es
orden por el orden: con todo junto, el respaldo de un taller no incluye sus archivos, no se
puede decir cuánto ocupa cada cliente, y darle de baja a uno obliga a mirar archivo por
archivo de quién es. La demo va a `demo/`, aparte, porque es una sola para todos (§9.2) y
sus archivos de prueba no pueden contar en la medición de un cliente real.

El taller sale de la request (`middlewares/entorno.js`), **nunca del cuerpo ni de la URL**.
Y si no viene, `guardar()` lanza en vez de escribir en la raíz: una ruta nueva que se olvide
de pasarlo tiene que romperse de inmediato, no acumular archivos sin dueño durante meses.

Que la carpeta aparezca en la URL **no autoriza nada ni lo pretende**: `/uploads` sigue
abierto igual que antes, y para leer una foto hay que saber su nombre, que es una marca de
tiempo más un número al azar. Separar por taller es para respaldar, medir y borrar por
cliente; tratarlo como un control de acceso sería el error.

**Lo anterior sigue funcionando.** La lectura entiende las dos formas: si la clave de la URL
no está donde dice, se busca dentro del taller principal, que era el único que existía
cuando esas URL se escribieron. Los archivos que quedaron sueltos se mueven con
`node scripts/migrarArchivosPorTaller.js` (sin `--hacerlo` solo muestra qué haría; copia,
verifica y recién entonces borra el original). **Las URL de la base no se tocan**: reescribir
miles de rutas en `OT.reportes`, `OT.tareas[].registro.fotos` y `Solicitud.adjuntos` sería un
riesgo enorme para cero beneficio. El panel de talleres dice cuántas quedan sin migrar.

**4. Sin credenciales funciona igual que antes.** Mismo criterio que `API_KEY` y
`AUTH_REQUERIDA`: si faltan las variables, se usa el disco y se avisa por consola. El entorno
de desarrollo no necesita cuenta en ningún lado.

## Puesta en marcha

### 1. Crear el bucket en Cloudflare

En el panel de Cloudflare, sección **R2**: crear un bucket (por ejemplo `erp-taller`).
Dejarlo **privado** — no hace falta habilitar acceso público ni dominio propio, porque las
fotos las sirve el backend.

Después, en los **tokens de API de R2**, crear uno con permiso de **lectura y escritura**
sobre ese bucket. Cloudflare entrega tres datos:

- el **Account ID**
- el **Access Key ID**
- el **Secret Access Key** — se muestra **una sola vez**; si se pierde hay que emitir otro

> Los nombres exactos de los menús en Cloudflare cambian cada cierto tiempo. Lo que hay que
> buscar es: crear bucket, y crear un token de API de R2 con permiso de lectura y escritura.

### 2. Configurar el backend

En Render, en el servicio del backend, **Environment**, agregar:

| Variable | Valor |
|---|---|
| `R2_ACCOUNT_ID` | el Account ID de Cloudflare |
| `R2_ACCESS_KEY_ID` | el Access Key ID del token |
| `R2_SECRET_ACCESS_KEY` | el Secret Access Key del token |
| `R2_BUCKET` | el nombre del bucket (`erp-taller`) |

Opcional: `R2_ENDPOINT` apunta a otro servicio compatible con S3 (Backblaze B2, MinIO, el
propio S3) sin tocar código. Es lo que hace que esta decisión sea reversible.

Al arrancar, el backend dice en el log cuál de los dos caminos está usando:

```
📦 Archivos en bucket R2 "erp-taller" (el disco queda de respaldo de lectura)
```

o, si falta alguna variable:

```
⚠️  R2 sin configurar: los archivos van al disco del contenedor.
```

### 3. Migrar lo que quede en disco

```bash
node scripts/migrarArchivosAR2.js --revisar   # informa, no sube nada
node scripts/migrarArchivosAR2.js             # sube lo que falte
```

Es idempotente: consulta cada archivo antes de subirlo, así que correrlo dos veces no
duplica nada.

**Advertencia realista**: si el disco de producción ya se borró en algún deploy anterior, ahí
no queda nada que migrar y las fotos de ese período ya se perdieron. El script lo dice
explícitamente en vez de terminar en silencio. Esas URL viejas quedan devolviendo 404, que
es la verdad — no había forma de recuperarlas.

## Qué se probó y qué no

`npm test` en `erp-backend` cubre:

- Guardar y volver a leer, por el disco y por el bucket.
- Que la URL devuelta sea **relativa** — el contrato del que dependen las dos PWA.
- Que una foto que solo está en disco se siga sirviendo con el bucket ya encendido (la
  situación durante la migración).
- Que sin credenciales no se toque el bucket.
- Que no se pueda salir de la carpeta por la URL (`..%2F..%2Fserver.js` y variantes).
- Subida y bajada por HTTP real contra los mismos routers que monta `server.js`.

El camino del bucket se ejercita contra un servicio S3 mínimo levantado en la prueba, no
contra R2. Eso verifica la configuración del SDK y el contrato, pero **no** las credenciales
ni la red: la primera subida real contra el bucket hay que mirarla a mano.

## Verificado en producción

Puesto en marcha el 23-09-2026 contra el bucket `erp-taller`: la primera foto subida desde la
PWA Operativa llegó al bucket (`image/jpeg`, 69.78 KB) y se leyó de vuelta a través del
backend. Las fotos comprimidas pesan ~70 KB, no los ~200 KB estimados, así que 5.000 fotos
ocupan unos 350 MB — el 3,5% de los 10 GB gratis.

## Pendiente

- **Respaldo de la base**: hecho, ver [`respaldos.md`](respaldos.md). Va al mismo bucket.
- **Borrado de archivos.** Hoy nada borra del bucket: una foto quitada de una OT queda
  ocupando lugar. A esta escala no importa, pero es deuda consciente.
