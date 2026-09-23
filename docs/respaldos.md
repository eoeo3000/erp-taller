# Respaldos de la base de datos

## El problema que esto resuelve

Mongo Atlas en plan gratis (M0) **no trae respaldo automático**. Y en `scripts/peligrosos/`
hay borrado masivo. Hasta ahora, un error —un script corrido contra el `.env` equivocado, un
borrado que pasó desapercibido, una colección vaciada por accidente— no tenía vuelta atrás.

Es la otra mitad del problema que resolvió [`almacenamiento-archivos.md`](almacenamiento-archivos.md):
ahí se perdían archivos, acá se perderían los datos.

## Cómo funciona

```
Diario 08:00 UTC              El backend                    Bucket R2
GitHub Actions ──POST /api/respaldos──> lee todas las ──> respaldos/produccion/
  (RESPALDO_TOKEN)                       colecciones        2026-09-23T08-00-01.json.gz
```

Se conservan los **30 más recientes** por entorno; los anteriores se borran solos.

### EJSON, no JSON

El detalle que decide si un respaldo sirve o no. `JSON.stringify` de un documento de Mongo
convierte un `ObjectId` en `{}` y una fecha en texto. El respaldo se crearía sin error, se
vería bien en el listado, y el día que hiciera falta restauraría basura: `OT.solicitudId`
dejaría de apuntar a su `Solicitud`, las fechas dejarían de ser fechas, y los `Decimal128`
de los totales perderían precisión.

Se usa **EJSON canónico** (de `bson`, que ya viene con mongoose), que conserva los tipos. Hay
pruebas específicas para cada uno de esos tres casos, porque es exactamente el tipo de falla
que no se nota hasta que es tarde.

### Dónde se guarda

En el mismo bucket R2 de las fotos, bajo `respaldos/<entorno>/`. Sin credenciales cae al
disco local — útil para probar, inútil en Render, donde el disco se borra en cada deploy.

### Por qué un endpoint y no un temporizador

En el plan gratis de Render el servicio **se duerme** cuando nadie lo usa, y un `setInterval`
no corre mientras duerme. El respaldo no saldría, y —peor— nadie se enteraría. La llamada
desde fuera además despierta el servicio.

## Puesta en marcha

### 1. En Render (servicio del backend → Environment)

| Variable | Valor |
|---|---|
| `RESPALDO_TOKEN` | Una clave larga al azar, inventada por ti |

Sin esta variable el endpoint responde **503**. A diferencia de `API_KEY` y `AUTH_REQUERIDA`
—que sin configurar dejan pasar, porque protegen rutas que ya estaban abiertas— esta ruta
nace cerrada: dejarla abierta por omisión regalaría la capacidad de disparar respaldos y de
leer el listado de lo que hay en la base.

### 2. En GitHub (Settings → Secrets and variables → Actions)

| Secreto | Valor |
|---|---|
| `RESPALDO_URL` | `https://erp-taller-backend.onrender.com/api/respaldos` |
| `RESPALDO_TOKEN` | El mismo valor que pusiste en Render |

### 3. Probarlo

En GitHub → pestaña **Actions** → *Respaldo diario* → **Run workflow**. Debería terminar en
verde e informar cuántos documentos guardó. Después, en Cloudflare R2, tiene que aparecer
`respaldos/produccion/…json.gz`.

## Uso

### A mano, antes de tocar algo delicado

```bash
cd erp-backend
node scripts/respaldo.js                 # respalda producción
node scripts/respaldo.js --entorno=demo
node scripts/respaldo.js --listar        # qué hay guardado
```

### Restaurar

```bash
node scripts/peligrosos/restaurar.js --listar
node scripts/peligrosos/restaurar.js --ultimo
node scripts/peligrosos/restaurar.js --clave=respaldos/produccion/2026-09-23T08-00-01.json.gz
```

Está en `scripts/peligrosos/` y pide escribir el nombre de la base, como el resto de esa
carpeta. Dos protecciones propias:

- **Avisa si el respaldo viene de otra base** que la que vas a pisar. No siempre es un error
  (restaurar producción sobre la demo para probar es legítimo), pero tiene que verse antes.
- **Guarda un respaldo del estado actual antes de restaurar** — la vuelta atrás de la vuelta
  atrás ([principio-vuelta-atras.md](principio-vuelta-atras.md)). Si restauraste el archivo
  equivocado, ese respaldo previo es el camino de regreso. Se salta con
  `--sin-respaldo-previo`, pero hay que pedirlo a propósito.

Restaurar **no borra colecciones que el respaldo no conoce**: quien restaura quiere recuperar
lo que perdió, no volver el mundo entero atrás.

> **Un respaldo que nunca se probó a restaurar no es un respaldo.** Vale la pena correr una
> restauración contra la base de demostración alguna vez, con calma, antes de necesitarlo de
> verdad y con el taller detenido.

## Qué se probó y qué no

`npm test` en `erp-backend` cubre, con una base falsa que expone la misma superficie que el
driver de Mongo:

- Que un `ObjectId`, una fecha y un `Decimal128` sobrevivan intactos al viaje de ida y vuelta.
- Que restaurar deje la base con el contenido del respaldo, reemplazando lo que hubiera.
- Que restaurar no borre una colección ausente del respaldo.
- Que las sesiones abiertas no se respalden.
- Que la retención borre los viejos y conserve los nuevos.
- Que el endpoint esté cerrado sin clave, rechace claves incorrectas (comparación de tiempo
  constante) y no filtre contenido de la base en su respuesta.

⚠️ **No se probó contra Mongo real**: la red del entorno de desarrollo bloquea la descarga de
su binario. La prueba de fuego —una restauración de verdad sobre la demo— sigue pendiente y
conviene hacerla pronto.

## Pendiente

- **Avisar si el respaldo deja de correr.** Hoy, si el workflow falla, GitHub manda un correo
  al dueño del repositorio; si alguien lo desactiva, no avisa nada. `GET /api/respaldos`
  devuelve `masReciente` justamente para poder vigilarlo desde afuera.
- **Un respaldo lee todas las colecciones enteras a memoria.** A la escala de un taller son
  unos pocos MB. Cuando deje de serlo, habrá que exportar por colección y en streaming.
