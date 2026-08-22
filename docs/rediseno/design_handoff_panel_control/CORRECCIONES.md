# Correcciones al rediseño implementado

Revisión de la rama `docs/funcionalidades-v2` (commit `ec66b94`) contra el prototipo `ERP Web App.dc.html`.
Cinco correcciones, en orden de impacto. Las dos primeras son globales: una sola pasada las arregla en las seis pantallas.

Sin rediseñar por decisión del cliente: `ComprasScreen`, `FinanzasScreen`, `ContabilidadScreen`, `PortalClienteScreen`, `ReporteTerreno`. No tocarlas.

---

## 1. Alto de pantalla y scroll del documento

**Síntoma:** la app no se ajusta al alto de la ventana; aparece barra de scroll del documento y el conjunto entero se desplaza en vez de scrollear solo la tabla.

**Causa:** tres capas que se suman.

1. `minHeight: '720px'` está en la raíz de `App.jsx:929` **y otra vez** en el estilo `raiz` de cada pantalla.
2. `App.jsx:959` — `main: { …, overflow: 'auto' }` le da scroll propio al contenedor completo.
3. Tres reglas `min-height: 100vh` compitiendo: `App.css:3` (#root), `index.css:28` (body), `screens/index.css:10` (body).

**Corrección:**

- `App.jsx`, estilo raíz: `height: '100dvh', maxHeight: '100dvh', overflow: 'hidden'`. **Quitar** `minHeight: '720px'`.
  `100dvh` en vez de `100vh` evita el salto por la barra del navegador móvil.
- `App.jsx`, estilo `main`: `overflow: 'hidden'` (no `auto`) y agregar `minHeight: 0`.
- Quitar `minHeight: '720px'` del estilo `raiz` de las seis pantallas: `DashboardScreen:720`, `GanttScreen:359`, `IngresoScreen:290`, `RecursosScreen:609`, `TratamientoScreen:1291`, `ImportExportScreen:470`. Deben quedar con `height: '100%'` y `minHeight: 0`.

**Verificación:** en una ventana de 1366×700 no debe existir barra de scroll del documento. El scroll vive solo dentro de las tablas y los paneles.

## 2. Botones redondeados (y tamaños heredados)

**Síntoma:** los botones de Tratamiento —y de todas las pantallas— salen redondeados e inflados, aunque el código de la pantalla declare `borderRadius: 2`.

**Causa:** `erp-web/src/index.css` sigue siendo la plantilla por defecto de Vite. Su regla global gana cuando el componente no declara radio:

```css
button { border-radius: 8px; padding: 0.6em 1.2em; font-size: 1em; background-color: #1a1a1a; }
button:hover { border-color: #646cff; }
```

El mismo archivo trae `color-scheme: light dark`, `background-color: #242424`, `h1 { font-size: 3.2em }` y enlaces `#646cff` — restos del scaffold que contradicen el sistema y son parte de la diferencia de tamaños original.

**Corrección:** reemplazar `erp-web/src/index.css` completo por el reset del sistema (resuelve también el punto 1):

```css
*, *::before, *::after { box-sizing: border-box; }

html, body {
  height: 100%;
  margin: 0;
  overflow: hidden;
}

body {
  background: #eceae5;
  color: #1a1a18;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root { height: 100%; }

button, input, select, textarea { font-family: inherit; font-size: inherit; }
button { border-radius: 2px; }

a { color: oklch(0.48 0.10 250); text-decoration: none; }
a:hover { color: oklch(0.38 0.10 250); }

::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,.18); }
```

Borrar además `erp-web/src/App.css` (solo contiene los estilos del logo de React y `.card`) junto con su `import`, y borrar `erp-web/src/screens/index.css`, que duplica el reset.

**Verificación:** ningún botón con esquina redondeada visible; radio máximo 2 px en toda la app. La única excepción legítima es `xFoto` en `TratamientoScreen:1329` (`borderRadius: '50%'`), que es el botón circular de quitar foto.

## 3. Panel de detalle: acciones muy abajo

**Síntoma:** al revisar una OT en el Panel de control, hay que scrollear hasta el fondo del panel derecho para llegar a las acciones.

**Corrección** en el panel de detalle de `DashboardScreen.jsx`:

1. **Anclar las acciones al pie.** Mover el bloque Acciones fuera del contenedor `asideScroll` (`overflow:auto`), a un hermano al final del `<aside>` con `flex: 'none'`, `borderTop: 1px solid rgba(0,0,0,.12)`, `background: '#fff'`, `padding: '10px 16px 12px'`. Quedan siempre visibles sin importar el contenido de arriba. Este es el arreglo de fondo.
2. **Secciones plegables.** Ficha, Flujo, Tareas y Costos: el encabezado en versalitas pasa a ser clicable, con el glifo `−` (abierta) / `+` (cerrada) a la derecha, en mono 12 px color `#a3a29a`. Sin iconos.
3. **Resumen al contraer.** El encabezado de Tareas conserva `resumenTareas` ("4 · 74 h") y el de Costos conserva `granTotal`, para que plegar no oculte el dato clave.
4. **Contraer todo / Expandir todo** como texto discreto junto al rótulo Acciones (9.5 px, `#a3a29a`).
5. **Persistir en la variante.** Agregar `secciones: { ficha, flujo, tareas, costos }` al objeto de layout que ya se guarda en `erpTaller.disposicion.v2`, normalizándolo con los defaults igual que se hace con `navOculta` / `asideOculta` — así una variante "Cobranza" puede traer todo contraído salvo Costos.

## 4. Programación: diferencias contra el prototipo

`GanttScreen.jsx` quedó fiel en estructura —misma grilla continua, mismo `GRID`, panel de sobredemanda en vez de modal—, pero hay doce diferencias visuales. 4.0 es un defecto de alineación que también estaba en el prototipo; 4.1–4.3 son las que más se notan.

### 4.0 El divisor antes de los días no coincide entre filas

**Síntoma:** la línea vertical que separa las columnas fijas de la zona de días queda más a la derecha en las filas de OT y más a la izquierda en las filas de tarea.

**Causa:** cada fila es su propia grilla (`display:grid` en cada `<div>`), así que los anchos se resuelven fila por fila. Las columnas de día son `minmax(74px, 1fr)`: cuando el contenido mide más que su porción, la pista **crece** por encima de 74 px. En las filas de tarea la barra dice `07:30 · 10h` con `nowrap` (~82 px de min-content) y estira las siete columnas; en las filas de OT las celdas de día están vacías y se quedan en 74 px. Zona de días más ancha en tareas → divisor más a la izquierda; más angosta en OT → divisor más a la derecha.

**Corrección** (aplicar las tres, o el problema vuelve):

1. En `GRID`, las columnas de día pasan de `repeat(7, minmax(74px,1fr))` a `repeat(7, minmax(0,1fr))`, para que el contenido no pueda estirar la pista.
2. El wrapper sube de `minWidth: 1180` a `minWidth: 1228` (710 px de columnas fijas + 7 × 74), que es lo que ahora garantiza el ancho mínimo de los días.
3. Toda celda por día —en `filaOT`, `filaTarea` y `filaCapacidad`— lleva `minWidth: 0, overflow: 'hidden'`, y la barra de tarea interior `whiteSpace: 'nowrap', overflow: 'hidden'`.

**Verificación:** con la ventana ancha y angosta, el divisor debe caer en la misma x en las tres clases de fila y en el encabezado.

### 4.1 Volvió el semáforo de color en la fila de OT

`filaOT` lleva `borderLeft: 2px solid ${colorEstadoOT(ot.estado)}`: la barra izquierda pinta el estado en cuatro colores. En el prototipo esa barra marca **selección**, no estado — `#1c1d1b` si la OT está seleccionada, `transparent` si no. El estado se comunica únicamente por su columna de texto, que ya tiene su color.

**Corrección:** `borderLeft: 2px solid ${otSel?._id === ot._id ? '#1c1d1b' : 'transparent'}`. Mantener `colorEstadoOT` solo para el texto del estado.

### 4.2 La fila de OT perdió el total de horas

La columna Hrs de la fila de OT es un `<span style={styles.celda} />` vacío. En el prototipo muestra la suma de horas de las tareas de esa OT **en la semana visible** ("36 h"), que es el dato de lectura rápida de esa fila.

**Corrección:** calcular `const horasSemana = (ot.tareas || []).filter(tt =&gt; diasSemana.includes(tt.fecha)).reduce((a, tt) =&gt; a + (Number(tt.duracion) || 0), 0)` y renderizarlo en esa celda, alineado a la derecha, en `fontMono` 11 px, como `${horasSemana} h`.

### 4.3 Se listan las tareas de todas las semanas

`ot.tareas?.map(...)` no filtra por la semana visible: al cambiar de semana aparecen las mismas filas de tarea con el timeline vacío. El prototipo solo muestra las tareas cuya fecha cae en la semana en pantalla.

**Corrección:** filtrar antes de mapear —`(ot.tareas || []).filter(tt =&gt; diasSemana.includes(tt.fecha))`— y ordenarlas por fecha. El índice visible (`tIdx + 1`) se numera sobre la lista filtrada.

### 4.4 Columnas de fin de semana sin fondo en las filas de datos

Solo el encabezado distingue sábado y domingo (`#dedcd5`). En el prototipo las celdas de fin de semana llevan `#f4f3ef` también en las filas de tarea y de capacidad, para que la columna se lea de arriba a abajo.

**Corrección:** en las celdas por día de `filaTarea`, `filaOT` y `filaCapacidad`, aplicar `background: esFinde ? '#f4f3ef' : 'transparent'` cuando la celda no tenga ya un fondo propio (barra de tarea, `cargaOk`, `cargaExceso`).

### 4.5 El acento es el color de hover

`t.acento` está en `oklch(0.42 0.10 250)`, que en el sistema es el estado *hover*. El acento base es `oklch(0.48 0.10 250)`; afecta las barras de tarea y el número de OT, que salen más oscuros de lo diseñado.

**Corrección:** `acento: 'oklch(0.48 0.10 250)'` y, si se quiere el hover, agregar `acentoHover: 'oklch(0.40 0.10 250)'`.

### 4.6 Los números de capacidad salen en verde

En las celdas de `carga/capacidad` el color es `carga &gt; 0 ? verde : ...`. En el prototipo el número con carga es `#1a1a18` (texto normal) y el color se reserva para el exceso. Verde repetido en decenas de celdas es ruido, no información.

**Corrección:** `color: exceso ? t.rojo : carga &gt; 0 ? t.textoPrincipal : t.textoDeshabilitado`. El fondo (`cargaOk` / `cargaExceso`) ya comunica el estado. La barra semanal del recurso sí conserva verde/rojo.

### 4.7 Falta el porcentaje en el resumen de capacidad

Hoy dice `28h/32h`. El prototipo muestra `28 / 32 h · 87 %` — el porcentaje es lo que permite comparar recursos de un vistazo sin leer la barra.

**Corrección:** `${sumaCarga} / ${sumaCapacidad} h · ${pct} %`. El color de ese texto también sigue la regla de 4.6: `t.textoPrincipal` con carga normal, `t.rojo` solo si `sumaCarga &gt; sumaCapacidad`.

### 4.9 Celdas de capacidad: `0/0` como ruido

Las celdas por día imprimen `{carga}/{capacidad}` siempre, así que los fines de semana y la gente sin calendario muestran `0/0`. Con 8 recursos × 7 días son decenas de ceros compitiendo con los datos reales.

**Corrección:** cuando no hay ni turno ni carga (`capacidad === 0 &amp;&amp; carga === 0`), imprimir `·` en `t.textoDeshabilitado`. En el resto, `${carga} / ${capacidad}` — con espacios alrededor de la barra: en monoespaciada, `4/8` se lee como un solo número. Igual en el resumen: `28 / 32 h`, no `28h/32h`.

### 4.10 El título de sección desaparece al hacer scroll horizontal

`filaSeccion` no tiene `position: sticky; left: 0`, así que al desplazarse a la derecha el rótulo "Disponibilidad de personal · carga / capacidad" sale de vista y las filas de capacidad quedan sin encabezado, indistinguibles de las de tarea.

**Corrección:** agregar `position: 'sticky', left: 0` a `styles.filaSeccion` (ya tiene `marginTop: 14`, que está bien).

### 4.11 Las celdas de día no tienen alto mínimo

En `filaCapacidad`, las celdas por día no declaran altura, así que el alto de la fila lo fija solo la columna que lleva la barra y el bloque queda más comprimido que el de tareas.

**Corrección:** `minHeight: 32` en las celdas por día de `filaCapacidad` (las de `filaTarea` usan 34).

### 4.8 Copy: voseo y panel vacío

"Seleccioná una OT para ver el detalle" es voseo rioplatense. Además el panel arranca vacío.

**Corrección:** preseleccionar la primera OT visible al montar (como el prototipo), de modo que el panel nunca aparezca vacío. Si se mantiene el estado vacío, el texto es "Selecciona una OT para ver el detalle."

### 4.13 Falta una barra de filtros para acotar por operario/supervisor

**Síntoma:** con muchos recursos programados en la semana, la grilla de Programación no tiene forma de acotar la vista a un operario o supervisor puntual — hay que recorrer visualmente todas las filas para encontrar las de una persona.

**Corrección:** agregar una barra de filtros bajo la barra de contexto, mismo patrón visual que ya usan Ingreso (§5) y Panel de control (§3): fondo `#f0efeb`, 37 px de alto, input de texto + chips. El control propio de esta barra es un `<select>` simple de operario/supervisor (mismo patrón que el selector de método de pago en Tratamiento, §6 — no el dropdown con `▼` embebido en `<th>` que Ingreso descarta). Al elegir una persona, filtra tanto las filas de OT donde participa como su fila de capacidad; el resto de la grilla se oculta sin recalcular ni perder la semana seleccionada.

**Verificación:** con un operario elegido en el filtro, solo quedan visibles las filas de OT donde participa y su fila de capacidad; al volver a "Todos", reaparece la grilla completa en la misma semana.

## 5. Limpieza menor

- `App.jsx:248` y `:325` — `alert("✅ OT eliminada…")` y `alert("✅ Estado reseteado…")` siguen con emoji en texto visible al usuario. Los emoji en `console.log` y comentarios son inofensivos, pero estos dos los ve el usuario.
- El directorio `Incomplete web app design/design_handoff_panel_control/` quedó comiteado dentro del repo. Conviene moverlo a `docs/rediseno/` o sacarlo del control de versiones.

## 7. El link del supervisor enviado desde demo aterriza en producción

**Síntoma:** al enviar una OT al supervisor estando en modo demostración, el correo y el link generado igual apuntan a producción; el supervisor ve "OT no encontrada" (404) al abrirlo.

**Causa:** `resolverEntorno` (`erp-backend/src/middlewares/entorno.js`) decide el entorno leyendo el header `X-Entorno` en cada request bajo `/api`. Ese header solo lo agrega `axios.defaults` dentro de la SPA (`erp-web/src/utils/entorno.js`), al cargar `App.jsx`. El portal del supervisor (`otController.supervisorPortal`, servido en `/api/ots/:id/supervisor`) es una página HTML aparte, abierta directo desde el link del correo sin pasar nunca por la SPA — ni la carga de esa página ni su `fetch()` interno (`postJson`, dentro del HTML) agregan ese header. Al faltar, `resolverEntorno` cae a su valor por defecto, `'producción'`; y como demo y producción son conexiones Mongo separadas (`config/conexiones.js`), el `_id` de una OT creada en demo no existe en la base de producción.

**Corrección**, en tres pasos:
1. `otController.enviarAlSupervisor` incluye el entorno activo (`req.entorno`) como parámetro de query en el link que genera: `.../api/ots/:id/supervisor?token=...&entorno=demo`.
2. `resolverEntorno` acepta el entorno también desde `req.query.entorno` además del header `X-Entorno` (el header sigue mandando para las rutas que vienen de la SPA; el query param cubre las que no pasan por ella), para no duplicar la lógica de resolución en `supervisorPortal`/`supervisorAccion` por separado.
3. El HTML servido por `supervisorPortal` (la constante `BASE` de su `<script>`) propaga ese mismo parámetro `entorno` en cada `fetch()` que dispara `postJson`, para que las acciones (iniciar/posponer/reportar/terminar) sigan operando sobre la misma conexión que abrió el link.

**Verificación:** cargar datos de demo, enviar una OT al supervisor con el entorno demo activo, abrir el link recibido y confirmar que la OT aparece (no 404) y que las acciones del portal quedan reflejadas en la base de datos demo, no en producción. Repetir el mismo envío desde producción y confirmar que sigue resolviendo contra producción.

Implementar en un commit aparte del resto de las correcciones de este documento — no es un ajuste visual, es una corrección de enrutamiento de datos con su propio riesgo si se hace mal. Contexto completo en [estrategia-movil.md §6.7](../../estrategia-movil.md).

---

## Orden sugerido

1. Puntos 1 y 2 juntos — ambos tocan `index.css` y arreglan las seis pantallas de una vez. Verificar antes de seguir.
2. Punto 3 — `DashboardScreen.jsx`.
3. Punto 7 — corrección de enrutamiento del link de supervisor en modo demo (`otController.js`, `middlewares/entorno.js`). Va antes que el resto: es una corrección de datos, no visual, y un envío mal enrutado en demo no se nota hasta que alguien lo prueba en terreno.
4. Punto 4 — `GanttScreen.jsx`. Empezar por 4.0 (alineación del divisor, afecta toda la pantalla), luego 4.1–4.3, 4.13 (barra de filtros, en cualquier momento de este bloque), y cerrar con 4.6–4.11 juntos, que tocan todos el bloque de capacidad.
5. Punto 5 — limpieza.

Reglas transversales, sin excepción: sin emoji ni iconos, sin sombras (salvo menús flotantes), radio máximo 2 px, color solo como información, números en monoespaciada, tamaños en px explícitos, nada de librerías nuevas.
