# Handoff: rediseño de erp-web · 5 pantallas

Repositorio destino: `eoeo3000/erp-taller`, rama `main`, carpeta `erp-web`
Fidelidad: **alta (hi-fi)**. Colores, tipografía, espaciado y densidad son definitivos.

Archivos a reemplazar:

| Pantalla | Archivo |
| --- | --- |
| Panel de control | `erp-web/src/screens/DashboardScreen.jsx` |
| Ingreso | `erp-web/src/screens/IngresoScreen.jsx` |
| Tratamiento | `erp-web/src/screens/TratamientoScreen.jsx` |
| Recursos | `erp-web/src/screens/RecursosScreen.jsx` |
| Programación | `erp-web/src/screens/GanttScreen.jsx` |
| Importar y exportar | `erp-web/src/screens/ImportExportScreen.jsx` |
| Shell / navegación | `erp-web/src/App.jsx` (+ el componente de nav actual) |

Fuera de alcance por decisión del cliente: Finanzas, Contabilidad, Portal cliente. Sus entradas de nav se mantienen visibles pero sin rediseñar.

---

## 0. Por qué la primera implementación no se veía igual

Hubo dos causas, y conviene no confundirlas:

**1. Estructura (la causa principal).** Se implementó la tabla suelta, no el layout de tres zonas. Faltaban la nav lateral y el panel de detalle de 300 px. Sin el panel, la columna `1fr` de cliente absorbe todo el ancho y las columnas de la derecha quedan pegadas al borde con un vacío enorme en medio: exactamente lo que se veía. El panel no es decoración, es lo que contiene la grilla.

**2. Tipografía heredada (la causa secundaria, y sí, se nota).** El diseño **no hereda ningún tamaño**: fija `font-size: 13px` en el contenedor raíz y luego declara el tamaño explícito en cada elemento. La app actual, en cambio, deja que hereden del navegador (16px) y arrastra clases de Bootstrap (`h2`, `mb-4`, `text-primary`), que traen sus propios tamaños, pesos y márgenes. El resultado: filas ~46 px donde el diseño pide 40, títulos más grandes, y todo el conjunto ~20 % más suelto.

Reglas duras que se derivan de eso:

- Ninguna clase de Bootstrap en estas cinco pantallas. Se elimina también `<h2 className="mb-0">` y compañía: los títulos son `<h1 style={{fontSize:14, fontWeight:700, margin:0}}>`.
- Todo elemento con texto declara su `fontSize` explícito. Nada de heredar.
- Ningún `rem`, `em`, `clamp()` ni `%` para tipografía. Solo px, con los valores de la tabla de §2.
- `margin: 0` en títulos y párrafos; el espacio se resuelve con `gap` del flex/grid contenedor, no con márgenes.

## 1. El shell (aplica a las cinco pantallas)

```
┌──┬────────┬─┬──────────────────────────────────────────────┬─┬─────────┐
│T │  nav   │R│ header 46px                                  │T│         │
│i │ 186px  │e├──────────────────────────────────────────────┤i│ panel   │
│r │(arras- │s│ (barra de contexto por pantalla)             │r│ de      │
│a │trable) │i├──────────────────────────────────────────────┤a│ detalle │
│13│        │z│ contenido: un solo scroller                  │13│ 300px  │
│px│        │5│                                              │px│(arras- │
│  │        │px│                                             │  │trable) │
└──┴────────┴─┴──────────────────────────────────────────────┴─┴─────────┘
```

- Raíz: `display:flex; height:100vh; min-height:720px; background:#eceae5; font-size:13px; color:#1a1a18`.
- **Nav lateral, no top bar.** Reemplaza la nav horizontal azul con emoji. Dos grupos (`OPERACIÓN`, `ADMINISTRACIÓN`), ítem activo con `background: rgba(255,255,255,.10)` y `border-left: 2px solid oklch(0.62 0.11 250)`. Los ítems de Operación muestran su conteo a la derecha en monoespaciada.
- **Separadores arrastrables**: `<div>` de 5 px, `cursor:col-resize`, `pointerdown` + listeners en `window`. Límites: nav 132–320, panel 220–560, columnas 44–240.
- **Tiras de colapso**: `<div>` de 13 px siempre visible a cada lado (oscura junto a la nav, `#e4e2dc` junto al panel). Clic colapsa/expande; el glifo es `‹` / `›`. El estado se guarda dentro de la variante.
- Cada `<section>` de contenido lleva `flex:1; min-width:0; overflow:hidden` y contiene **un solo** scroller `overflow:auto` con el encabezado `position:sticky; top:0` dentro.

## 2. Tokens

**Color**

| Uso | Valor |
| --- | --- |
| Lienzo exterior | `#eceae5` |
| Fondo de main | `#f6f5f2` |
| Superficie de contenido | `#ffffff` |
| Nav / texto principal | `#1c1d1b` / `#1a1a18` |
| Texto secundario | `#262622`, `#3a3a35`, `#4a4a44`, `#57564f` |
| Texto atenuado | `#6b6a63`, `#75746e`, `#8a8981` |
| Texto deshabilitado | `#a3a29a`, `#b5b3ab`, `#c9c7c0`, `#d4d2cb` |
| Barra de contexto | `#e9e7e2` |
| Encabezado de tabla | `#e4e2dc` (fin de semana `#dedcd5`) |
| Barra de filtros / pie / tabs | `#f0efeb` |
| Hover de fila | `#f4f3ef` · hover de fila editable `#fbfaf8` |
| Celda con carga | `#eef4ef` · celda en exceso `#fbeceb` · turno en matriz `#f3f6f9` |
| Hairline | `.06` filas · `.10` bloques · `.12–.14` zonas · `.16–.22` controles (todos `rgba(0,0,0,x)`) |
| Acento | `oklch(0.48 0.10 250)`; hover `oklch(0.40 0.10 250)`; nav activo `oklch(0.62 0.11 250)` |
| Verde (pagado, capacidad ok) | `oklch(0.48 0.10 155)` |
| Ámbar (parcial, ajuste manual) | `oklch(0.55 0.11 65)` |
| Rojo (pendiente, exceso) | `oklch(0.52 0.13 25)` |

Sin sombras salvo menús flotantes: `0 8px 24px rgba(0,0,0,.14)`. Radio 2 px en controles, 0 en el resto.

**Tipografía**

- UI: `"Helvetica Neue", Helvetica, Arial, sans-serif`. Números, IDs, fechas, montos, horas: `ui-monospace, Menlo, monospace`.
- Escala completa, en px:

| px | peso | uso |
| --- | --- | --- |
| 18 | 600 | valor de KPI (mono) |
| 15 | 600 | total neto / bruto en cotización (mono) |
| 14.5 | 700 | título del panel de detalle |
| 14 | 700 | título de pantalla (`<h1>`), gran total (mono) |
| 13 | 400 | base del contenedor raíz |
| 12.5 | 600 | nombre de cliente, marca de nav, ítems de nav |
| 12.5 | 400 | descripción en tablas de catálogo |
| 12 | 400/700 | inputs de formulario, tabs, botón primario |
| 11.5 | 400 | cuerpo de tabla, cuerpo del panel, controles de filtro |
| 11 | 400/600 | controles de 20–23 px, estados, celdas de matriz |
| 10.5 | 400 | metadatos, notas, subtítulos de fila |
| 10 | 600 | número de día en matrices (mono) |
| 9.5 | 700 | etiquetas en versalitas: `letter-spacing:.11em; text-transform:uppercase` |
| 8.5 | 400 | letra del día de la semana |

- Marca de nav: 12.5px/700, `letter-spacing:.14em`, mayúsculas. Encabezados de tabla: 9.5px/700 con `letter-spacing:.1em`.

**Alturas** — header 46 · barra de contexto 30 · KPI 56 · barra de filtros 37 · tabs 31 · encabezado de tabla 26 · fila de tabla 32/40/52 · fila de catálogo 34 · fila de matriz 38 · pie 28. Controles: 20 (barra de contexto), 21–24 (en fila), 23 (filtros), 26–27 (formulario), 28–30 (acciones).

**Espaciado** — 16 px horizontal de zona · 11–13 px de bloque en paneles · 10 px gap entre columnas de tabla · 8–9 px en formularios · 6 px entre controles · 3–5 px en listas densas.

## 3. Panel de control

Tres zonas: barra Disposición → franja KPI → [tabla | panel de detalle].

**Catálogo de 13 campos.** Cada uno declara `key`, `label` (largo, para el menú), `corto` (encabezado de columna), `origen`, `w`, `align`, `tipo`, `mono`.

| key | corto | origen | w | align | tipo |
| --- | --- | --- | --- | --- | --- |
| `ot` | OT | `ot.numeroOT` | 76 | left | texto mono |
| `cliente` | Cliente / faena | `solicitud.empresaSolicitante` + faena | flex | left | compuesto **fijo** |
| `etapa` | Etapa | `ot.estado` | 104 | left | etapa + barra |
| `horas` | Horas | Σ `ot.tareas[].duracion` | 58 | right | texto mono |
| `total` | Total | `ot.granTotal` | 92 | right | texto mono |
| `pago` | Pago | `ot.pago.estado` | 80 | right | texto en color |
| `creacion` | Ingresada | `solicitud.fechaCreacion` | 84 | right | texto mono |
| `ejecucion` | Ejecución | `solicitud.fechaEjecucionSolicitada` | 84 | right | texto mono |
| `supervisor` | Supervisor | `ot.tareas[].operarioNombre` (puesto Supervisor) | 96 | left | texto |
| `contacto` | Contacto | `solicitud.solicitante` | 140 | left | texto |
| `tareas` | Tareas | `ot.tareas.length` | 60 | right | texto mono |
| `margen` | Margen | calculado | 70 | right | texto mono |
| `oc` | OC | orden de compra | 92 | left | texto mono |

Visibles por defecto: `ot, cliente, etapa, horas, total`.

**Reglas de grilla (críticas — costaron varias iteraciones):**

- `grid-template-columns = "3px " + cols.map(c => c.key==='cliente' ? 'minmax(170px,1fr)' : c.w+'px').join(' ')`, `gap:10px`, `padding:0 16px 0 13px`.
- Primera columna de 3 px = marcador de selección (`#1c1d1b` / `transparent`).
- Wrapper interior con `min-width = 3 + 170 + Σ(w no-cliente) + 10·n + 29` px, dentro de **un solo** scroller; encabezado `sticky` para que acompañe el scroll horizontal.
- Cada celda `min-width:0; overflow:hidden`; texto `nowrap` + `ellipsis`. Encabezados usan `corto`.

**Tipos de celda** — `cliente`: empresa 12.5/600 + línea de estado de pago en color y faena atenuada 10.5 (`flex; gap:6px`). `etapa`: texto 11.5 + barra de 3 px sobre riel `rgba(0,0,0,.09)`, ancho `(etapaIdx+1)/8`, verde si `etapaIdx>=6`, gris sin OT, acento en el resto. `texto`: una línea, mono si el campo lo declara, peso 600 solo en `pago`.

**Franja KPI** — 4 celdas `flex: 1 1 170px; min-width:150px`, separadas por `border-right: 1px solid rgba(0,0,0,.08)`: solicitudes sin OT, OTs activas, horas planificadas, por cobrar (con margen promedio como nota).

**Filtros** — Todos / Con OT / Sin OT / Por cobrar, el activo con `▪ ` antepuesto, no con fondo. Orden reciente (por fecha real parseada, no por índice) / monto.

## 4. Variantes de disposición

```js
{ navW: 186, asideW: 300, rowH: 40, navOculta: false, asideOculta: false,
  columnas: [ { key:'ot', w:76, visible:true }, … ] }  // el orden del array es el orden visual
```

- `localStorage` key `erpTaller.disposicion.v2`, contenido `{ variantes:[{nombre, layout}], layout, activa }`.
- Al leer, **normalizar**: descartar keys desconocidas, completar campos nuevos como `visible:false`, forzar `cliente.visible = true`. Así agregar un campo al catálogo no rompe variantes guardadas.
- Guardar con nombre libre (repetir sobrescribe). Chip con `▪` si está activa, `×` para borrar (con `stopPropagation`).
- Cualquier ajuste manual limpia `activa`. "Restablecer" vuelve al base.
- Menú **Columnas (n/13)**: panel absoluto 296 px, `max-height:340px`, filas en grid `16px 1fr auto auto` — marca (`×` visible / `·` oculta), label largo, `origen` en mono 10 px, `‹` para mover a la izquierda. `cliente` va rotulada "(fija)".

**Decisión pendiente del negocio**: variantes por usuario (localStorage, como está) o compartidas por rol. Para lo segundo: modelo `DisposicionTabla` (`{ nombre, pantalla, rol, layout }`), router en `/api/disposiciones`, y `crearDisposicion` / `actualizarDisposicion` / `eliminarDisposicion` por props desde `App.jsx`, siguiendo el patrón `crearX` existente.

## 5. Ingreso

Dos columnas: formulario 452 px (fijo, con scroll propio) | tabla de solicitudes.

- **Formulario** en grid de 4 columnas, `gap: 9px 10px`. Campos y su `grid-column`: empresa (span 2), solicitante (span 2), correo (span 2), teléfono (span 2), dirección (span 4), fecha de ejecución (span 2), plazo (span 2), canal de origen `<select>` (span 2), adjunto (span 2), descripción `<textarea>` (span 4, `min-height:96px`).
- Etiquetas en versalitas 9.5 px sobre el campo, no negritas grises de 13 px.
- Validación: empresa, solicitante y descripción. **Reemplaza el `alert()`** por una franja bajo el formulario: `background:#f0efeb; border-left:2px solid` acento, 11.5 px.
- **Tabla**: N° (mono, `padStart(2,'0')`), empresa, solicitante, estado (ámbar sin OT / verde con OT), origen, ingresada, adjunto (acento si hay, `#c9c7c0` si no), y botón `Tratar` / `Ver OT` que navega a `/tratamiento` con el state actual.
- Los filtros por columna (dropdown con `▼`/`✅` dentro del `<th>`) **se eliminan**: pasan a la barra de filtros como input de texto + chips de estado, igual que en el panel.

## 6. Tratamiento

Header con OT + cliente → pipeline → tabs → [contenido | panel de resumen].

- **Pipeline**: las 8 etapas en texto en una fila, `gap: 2px 16px`, marcas `×` cumplida (`#6b6a63`) / `▪` actual (`#1a1a18`, 700) / `·` pendiente (`#b5b3ab`). Elimina los 7 badges de colores con `boxShadow` y los `✓`/emoji.
- **Tabs** (31 px, activa con fondo blanco y `border-bottom: 2px solid #1c1d1b`): `1 · Tareas`, `2 · Equipos y materiales`, `3 · Suministros directos`, `4 · Cotización`, `Ejecución`, `Pago`. Sin emoji y sin un color de fondo distinto por tab.
- **Tablas editables** — el patrón clave: inputs con `border: 1px solid transparent; background: transparent`, que revelan `border-color: rgba(0,0,0,.14)` en hover y `oklch(0.48 0.10 250)` + fondo blanco en foco. Altura 24 px, 11.5 px, mono y alineados a la derecha los numéricos. Subtotal calculado en vivo, `×` para quitar la fila, y un botón punteado "Agregar …" al final. Grillas: tareas `minmax(200px,1fr) 118px 132px 52px 68px 62px 84px 96px 24px`; materiales `104px 128px minmax(200px,1fr) 62px 96px 100px 24px`; logística `96px 96px minmax(200px,1fr) 62px 96px 100px 24px`.
- **Cotización**: subtotales de mano de obra / equipos y materiales / suministros, luego total neto, IVA 19 % y total bruto. Máx. 620 px de ancho.
- **Ejecución**: reportes de terreno como lista (fecha mono, autor, conteo de fotos, comentario). Nota sobre el enlace con token del supervisor.
- **Pago**: estados Pendiente / Parcial / Pagado como chips con `▪`, y grid `130px 1fr` con monto (number), fecha, método (`<select>` con Transferencia / Cheque / Efectivo / Crédito 30 días) y referencia. **Cada campo con su propio handler** — nada de un handler currificado `campo => e => …`, que React llama con el evento y no actualiza nada.
- **Panel derecho**: requerimiento, resumen de costos vivo (→ neto → bruto), acciones 2×2 (`Guardar`, `Plantilla`, `Cotización PDF`, `Programar` — etiquetas cortas, no entran más largas en 116 px) y el primario `Enviar al supervisor` a ancho completo.

Cableado con lo existente: `actualizarOtGlobal`, `enviarASupervisor`, `guardarPlanificacion`, `finalizarYCotizar`, `generarPDF`, `aplicarPlantilla`, `guardarPago` / `anularPago` / `restaurarPago`. Los `window.confirm` pueden quedarse; si se reemplazan, mismo lenguaje sobrio.

## 7. Recursos

Tabs (31 px): Personal · Equipos y herramientas · Suministros directos · Calendarios · Plantillas. Panel derecho de 264 px con Resumen siempre, más un bloque contextual (Puestos en Personal, detalle del calendario en Calendarios).

- **Personal — la matriz mensual es la pieza principal.** Barra de contexto con navegación de mes. Columna izquierda de 188 px **sticky** (`position:sticky; left:0`) con nombre 12 px/600 + puesto + turno (ámbar si "Sin turno"), luego total del mes (52 px, mono), luego una celda de 27 px por día del mes (fila de 38 px). Encabezado con letra del día 8.5 px + número 10 px mono; fin de semana `#dedcd5`.
  - Celda: horas del calendario del recurso, o `·` si 0. **Clic alterna turno / libre**; si el valor difiere del calendario es ajuste manual y se marca con `border-top: 2px solid` ámbar. "Descartar ajustes manuales" en el panel derecho.
  - Ojo con el índice: los arreglos de horas van indexados por `getDay()`, **0 = domingo**. Un turno 4x3 de lunes a jueves es `[0,10,10,10,10,0,0]`.
- **Equipos y herramientas**: `120px minmax(220px,1fr) 116px 116px 116px` — código mono, modelo, tipo, valor, estado (verde Disponible / ámbar En uso / rojo En mantención).
- **Suministros directos**: `132px minmax(240px,1fr) 124px 116px` — código, descripción, categoría, precio.
- **Calendarios**: fila con nombre + bloques horarios, tipo, y la semana L→D como 7 mini-columnas con las horas por día; seleccionar abre el detalle día por día en el panel derecho.
- **Plantillas**: las tarjetas con borde violeta y emoji pasan a lista `minmax(200px,1fr) 140px minmax(220px,1.2fr)` — hoja de ruta + descripción, categoría, composición ("5 tareas · 4 equipos · 3 suministros").
- Los modales de creación se reemplazan por botones punteados al final de cada tabla (mismo patrón que Tratamiento).

## 8. Programación

Vista semanal. **Una sola grilla continua** para OT → tareas → capacidad, para que el timeline quede alineado:

```
grid-template-columns:
  118px minmax(180px,1fr) 132px 104px 52px 62px 62px repeat(7, minmax(74px,1fr))
  //  OT   tarea/desc      resp.  acción hrs  ini   fin   7 días
```

Wrapper con `min-width: 1180px`. El encabezado va `sticky; top:0`. **El mismo `grid-template-columns` en las tres clases de fila** — encabezado, filas y capacidad; las filas de capacidad rellenan con `<span>` vacíos las columnas 4–7.

- Barra de contexto: Semana anterior / `Semana 34 · 17 ago – 23 ago` / Semana siguiente. La semana se deriva del lunes ISO como hoy.
- **Fila de OT**: número en acento (clic abre `/tratamiento`), empresa 12 px/700 + descripción, estado en su color, y en su propia columna el botón `Programar` / `Desprogramar` / `No disponible` (solo activo en Planificada o Programada). Fila resaltada `#f6f5f2` si tiene tareas en la semana, `#f0efeb` si está seleccionada.
- **Fila de tarea**: índice, descripción, responsables + puesto, horas, fecha de inicio, y en el día correspondiente una barra de 22 px con `hora · N h`. **Un solo color** (acento), rojo `oklch(0.52 0.13 25)` cuando algún responsable excede su capacidad ese día. Se elimina `getColorByPuesto` y el `⚠️`.
- **Bloque de capacidad**: por recurso, `carga / capacidad` por día — fondo `#eef4ef` con carga, `#fbeceb` en exceso, y barra semanal con porcentaje (verde / rojo / gris sin turno).
- **La sobredemanda no es un modal.** El panel derecho lista los conflictos del OT seleccionado (nombre, fecha, `N h sobre M h`, `+N h`); al intentar programar con conflictos aparece ahí la confirmación `Programar igual` / `Cancelar`. Mantiene la lógica de `verificarDisponibilidad`, `toggleProgramada` y `confirmarProgramacion`.

## 9. Importar y exportar

Dos mitades distintas: **importar/exportar real** (existe, se rediseña) y **modo demostración** (nuevo, requiere backend).

Una sola columna de máx. 860 px, bloques separados por hairline. Esta pantalla no lleva panel derecho.

### 9.1 Importar / exportar real — respetar el backend existente

La fuente es `ImportExportScreen.jsx`. No inventar módulos ni flujos:

**Exportar** — `EXPORTABLES`, 6 módulos, cada uno con su cadena de columnas mostrada en mono 10 px:

| id | label | columnas |
| --- | --- | --- |
| `recursos` | Personal (Recursos) | `nombre, puesto, tipo, telefono, email, tarifaHora` |
| `suministros` | Suministros | `codigo, descripcion, precio, categoria` |
| `equipos` | Equipos y herramientas | `nombre, codigo, tipo, estado, precio` |
| `puestos` | Puestos / especialidades | `nombre, costoHora, categoria` |
| `ots` | Órdenes de trabajo | `numeroOT, solicitante, estado, granTotal, pago…` |
| `solicitudes` | Solicitudes | `solicitante, empresa, descripcion, estado, fecha` |

- Selección con marca `×` / `·` (no checkboxes nativos), fila seleccionada con fondo `#f4f3ef`. Todos / Ninguno arriba a la derecha.
- **Un solo `.xlsx`** con una hoja por módulo: `GET {API}/import/exportar/batch?modulos=a,b,c`. **No existe exportación JSON** — no agregarla.
- Si `ots` está seleccionado, se revelan los filtros `otDesde` / `otHasta` / `otEstado` (los 8 estados de `ESTADOS_OT`), sobre fondo `#faf8f6`.
- El botón queda inerte (`#efedea`, texto `#b5b3ab`, `not-allowed`) mientras no haya módulos.

**Importar** — `IMPORTABLES`, solo 4. OTs y solicitudes **no son importables**.

| id | columnas | regla de fusión |
| --- | --- | --- |
| `recursos` | `nombre *`, puesto, tipo, telefono, email, tarifaHora | siempre crea nuevos |
| `suministros` | `codigo *`, `descripcion *`, precio, categoria | upsert por código |
| `equipos` | `nombre *`, codigo, tipo, estado, precio | siempre crea nuevos |
| `puestos` | `nombre *`, costoHora, categoria | upsert por nombre |

- Grid de 2 columnas, una tarjeta por módulo. Columnas como badges mono 10 px; las obligatorias (`*`) en `#fdf3e6` / `oklch(0.50 0.11 65)`, el resto en `#f0efeb` / `#57564f`.
- Cada tarjeta trae **Plantilla** (`GET {API}/import/plantilla/{id}`, abre en pestaña nueva) e **Importar** (`<input type=file accept=".xlsx,.xls,.csv">` oculto tras un `<label>`, que hace `POST {API}/import/{id}` con `FormData` campo `archivo`). Durante la carga la etiqueta pasa a "Cargando…".
- **No hay dry run.** El backend responde `{ insertados, total, errores:[{fila, motivo}] }` DESPUÉS de escribir. El bloque de resultado va sobre las tarjetas: módulo, `N importados de M filas`, y la lista de errores por fila en mono 10.5 px. Borde izquierdo verde si no hubo errores, ámbar si hubo. `×` para cerrar. Al terminar, `cargarDatos()` y limpiar el input.
- Nota al pie: `*` obligatorio, reglas de fusión, filas con error se omiten sin afectar a las demás.
- Se elimina todo emoji (👷 🔩 🔧 🏷️ 📋 📥 📤 ⏳ ✅ ❌ ⚠️) y las tarjetas con `boxShadow` y radio 12.

### 9.2 Modo demostración — nuevo, requiere backend

Decisión tomada: **base de datos separada**. La demo apunta a `erp_taller_demo` en el mismo cluster; es imposible que contamine producción.

**Backend a construir:**

- Variable de entorno `MONGO_URI_DEMO`. El servidor mantiene dos conexiones y resuelve la activa por header (`X-Entorno: demo|produccion`) o por sesión — no por una variable global mutable.
- `erp-api/seeds/demo.json` versionado en el repo, con el contenido acordado (119 registros): 8 empresas y 14 solicitudes, 12 OTs con al menos una por etapa, 8 personas con 4 calendarios, 32 ítems de catálogo, 5 plantillas, 18 reportes de terreno con fotos de ejemplo, pagos en los tres estados, y 6 meses cerrados de historial.
- Endpoints: `POST /api/demo/cargar`, `POST /api/demo/vaciar`, `GET /api/demo/estado` → `{ cargado, registros, fecha }`. **Los tres rechazan con 409 si el entorno activo no es demo.**
- Empresa ficticia genérica ("Maestranza Vergara Ltda." y clientes inventados), no el nombre del prospecto.
- **Decisión pendiente:** fechas del seed relativas a la fecha de carga (recomendado — así el Gantt y la matriz de Recursos nunca salen vacíos en una demo) o fijas. Si son relativas, el seed guarda offsets en días y el endpoint los resuelve al cargar.

**Frontend:**

- Bloque **Entorno de trabajo**: dos tarjetas (Producción / Demostración) con nombre de BD en mono, host, y la consecuencia en una línea. La activa lleva `border-left: 3px solid #1c1d1b` y fondo `#f0efeb`.
- Bloque **Juego de demostración**: los 8 grupos de contenido con su conteo, y las acciones Cargar / Regenerar / Vaciar. En Producción las tres se muestran **visiblemente inertes** (`#efedea`, texto `#b5b3ab`, `not-allowed`) más una franja explicativa; nunca activas-pero-sin-efecto.
- **Vaciar exige escribir VACIAR.** El botón de confirmación permanece inerte hasta que la palabra coincide, y el handler valida igual — no basta el estilo.
- **Franja ámbar persistente** (`oklch(0.55 0.11 65)`, 26 px, texto blanco 11 px) en el tope de `<main>`, visible en **todas** las pantallas mientras el entorno sea demo, con acción "Volver a producción". Sin esto alguien mostrará la demo creyendo que son datos del taller.



## 10. Estados que faltan y hay que cubrir
- Carga inicial: filas esqueleto del mismo alto (`#f4f3ef`), sin spinner.
- Error de `/api/data`: franja sobre el contenido en `oklch(0.52 0.13 25)`, texto sobrio y acción "Reintentar".
- Móvil (`useIsMobile`, 768 px): el panel de detalle debe pasar a pantalla completa o a hoja inferior en vez de convivir con la tabla. **No está diseñado — pedir definición antes de implementarlo.**

## 11. Archivos del paquete

- `ERP Web App.dc.html` — prototipo completo y navegable de las cinco pantallas (layout, tokens, variantes, colapso, datos de ejemplo). Los datos son ficticios: reemplazar por las props reales de `App.jsx`.
- `support.js` — runtime del prototipo. No se traspasa a la app; solo permite abrir el HTML.

## 12. Orden de trabajo

1. Shell: contenedor raíz, nav lateral (reemplaza el top bar azul con emoji), separadores arrastrables, tiras de colapso. Purgar Bootstrap y tamaños heredados de las cinco pantallas.
2. Panel de control: tres zonas + tabla de 5 columnas + panel de detalle cableado.
3. Ingreso: formulario + tabla + filtros en barra.
4. Tratamiento: pipeline + 6 tabs + tablas editables + panel de resumen.
5. Recursos: 5 tabs + matriz mensual con ajuste manual.
6. Programación: grilla única semanal + capacidad + panel de sobredemanda.
7. Importar/exportar: rediseño de la mitad real (§9.1), sin tocar endpoints.
8. Modo demostración (§9.2): `MONGO_URI_DEMO`, seed, tres endpoints, selector de entorno y franja ámbar global.
9. Catálogo de campos, redimensionado y variantes en `localStorage` con normalización.
10. Estados vacío / carga / error.
11. Si se aprueba, variantes al backend (`/api/disposiciones`).

Reglas transversales: sin emoji ni iconos, sin sombras (salvo menús flotantes), radio máximo 2 px, color solo como información, números en monoespaciada, tamaños en px explícitos, nada de librerías nuevas.
