# Grabación de la demo

Herramientas para grabar el video de demostración del ERP (landing de validación). Son dos
piezas, y el orden importa:

| Paso | Comando | Qué hace |
|---|---|---|
| 1 | `npm run demo:reset` | Siembra la base de demostración con datos ficticios |
| 2 | `npm run demo:record` | Recorre el flujo y graba el video |

Los dos se corren desde la raíz del repositorio. `npm run demo` hace los dos seguidos.

## Antes de grabar: las cuatro apps

El grabador **no** levanta nada: espera encontrar todo corriendo, y si algo falta aborta
diciendo qué. Una terminal por app:

```bash
cd erp-backend        && npm start      # 5000
cd erp-web            && npm run dev    # 5173
cd erp-pwa-operativa  && npm run dev    # 5174
cd erp-pwa-cliente    && npm run dev    # 5175
```

La primera vez, además: `npx playwright install chromium` (descarga el navegador, ~150 MB).

**`erp-pwa-operativa/.env` es obligatorio**, con la misma `VITE_API_KEY` que `erp-web/.env` (que a
su vez es la `API_KEY` del backend). La PWA guarda contra `PUT /api/ots/:id` —marcar tareas,
grabar el informe de evaluación— y esa ruta está detrás del gate de `API_KEY`: sin la clave el
backend responde 401 y **los guardados fallan en silencio**. Esto se descubrió grabando: el video
mostraba el informe "guardándose" mientras la base no recibía nada. El grabador ahora verifica que
el informe quede grabado y aborta si no, pero el `.env` hay que tenerlo igual. Si cambias de
máquina o clonas el repo de nuevo, créalo (está en `.gitignore`):

```bash
# erp-pwa-operativa/.env
VITE_API_KEY=<la misma de erp-web/.env>
VITE_API_URL=http://localhost:5000/api
```

## Seguridad: solo la base de demostración

`scripts/seed-demo.js` **borra colecciones completas** antes de insertar, así que tiene dos
candados:

1. Lee **únicamente** `MONGO_URI_DEMO`. La variable `MONGO_URI` (producción) no aparece en
   ninguna línea del script.
2. Ya conectado, verifica que el nombre **real** de la base sea `erp_taller_demo` y aborta si no
   lo es — se comprueba lo que Mongo responde, no el texto de la URI, porque una URI puede
   apuntar a otro lugar del que parece leyéndola.

Todo el contenido es inventado: ninguna empresa, persona, teléfono, correo o monto corresponde a
alguien real. Los dominios de correo son `.demo`, que no existe.

## Qué produce

Todo cae en `demo-output/`, que está en `.gitignore`:

- **`demo.webm`** — el video, 1920×1080, un solo archivo continuo.
- **`guion.json`** — los cortes: el segundo de inicio y fin de cada beat, con su rótulo. Los
  títulos se ponen en la edición, no los inyecta el grabador (grabar un elemento que el producto
  no tiene sería falsear la demo).
- **`acceso-demo.json`** — los accesos de la demostración (cuenta de oficina, tokens de las PWAs)
  y qué trabajo usa cada escena. Lo escribe el seed y lo lee el grabador.

Si necesitas mp4, convierte el `.webm` con ffmpeg:

```bash
ffmpeg -i demo-output/demo.webm -c:v libx264 -crf 20 -pix_fmt yuv420p demo-output/demo.mp4
```

## Cómo está armado el guion

Ocho beats, una solicitud atravesando las tres apps. Muestra los dos ejes: el vínculo con el
cliente y la comunicación interna.

1. El cliente pide el servicio desde su teléfono
2. La oficina la recibe y la asigna a una supervisora
3. Terreno evalúa en el sitio — **hasta que no lo haga, la oficina no puede cotizar**
4. La oficina arma la oferta: horas, materiales, total
5. El Gantt la programa contra el turno real del personal
6. El cliente aprueba la oferta desde su teléfono
7. Terreno reporta, incluso sin señal, y cierra el trabajo — el reporte queda en el teléfono
   (IndexedDB) y se envía solo al volver la conexión. Ojo con el alcance real: **"Mi día" no
   se arma sin red**, porque se pinta con datos del servidor; lo único que funciona sin señal
   es la cola de reportes, no la app completa.
8. La oficina cierra: el material salió de bodega solo, y los KPIs lo reflejan

**Beats 1 a 3: en vivo.** La solicitud se crea durante la grabación. Sale `SOL-2026-0842` sola,
sin forzar ningún número: el seed deja el correlativo en `0841` y el número de OT se deriva del
de su solicitud.

**Beats 4 a 8: sobre trabajos preparados.** El seed deja algunos en el punto exacto que cada
escena necesita (cuáles, lo dice `acceso-demo.json` → `escenas`). Es deliberado: encadenar veinte
interacciones de UI para dejar **una** OT lista para cotizar la haría fallar completa ante
cualquier cambio menor. Todo cambio de estado que se ve en pantalla es real — incluido el
descuento de bodega del beat 8, que lo provoca el cierre del beat 7.

## Por qué sobrevive a un rediseño

El grabador ubica todo por atributos **`data-demo`**, nunca por texto visible ni clases CSS:

```jsx
<button data-demo="pedido-enviar" ...>Enviar solicitud</button>
<div data-demo="solicitud-fila" data-demo-ref={s.numeroSolicitud}>
```

Mover, restilar o recolorear un botón no rompe nada. Renombrar o borrar un `data-demo` sí, y
entonces el script falla nombrando exactamente cuál no encontró. Si cambias una pantalla que el
guion recorre, mantén su atributo.

Para ver la lista completa de los que hay hoy:

```bash
grep -rho 'data-demo="[a-z-]*"' erp-web/src erp-pwa-cliente/src erp-pwa-operativa/src | sort -u
```

## Opciones del grabador

| Opción | Para qué |
|---|---|
| `--ventana` | Corre con ventana visible, para mirar la grabación mientras pasa |
| `--lento=1.5` | Multiplica todas las pausas; útil para revisar un beat que va muy rápido |

## Ajustar el contenido de la demo

El **contenido** (nombres, montos, descripciones, stock) vive separado de la lógica de carga, en
[`../erp-backend/scripts/datos-demo.js`](../erp-backend/scripts/datos-demo.js). Se puede editar
sin tocar el candado de base de datos ni el orden de inserción.

Dos cosas a tener en cuenta al editar:

- **El stock declarado es el que la demo muestra**, ya descontado lo que consumieron los trabajos
  terminados; el seed calcula hacia atrás el ingreso de bodega que lo explica. Deja `stockActual`
  por encima de lo reservado o el "disponible" de la pantalla de tratamiento sale negativo — el
  seed avisa por consola si eso pasa.
- **El correlativo de `trabajos` termina en `0841` a propósito.** Si agregas o quitas trabajos,
  cambia el número de la solicitud que se crea en vivo; el grabador lo lee de
  `acceso-demo.json`, así que no hay que tocarlo a mano, pero sí conviene saberlo.
