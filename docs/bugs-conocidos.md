# Bugs conocidos — erp-taller

Registro de defectos detectados en revisión de producto. A diferencia de [funcionalidades-v2.md](funcionalidades-v2.md) (que documenta funcionalidad que **falta**), este documento registra comportamiento que **ya existe pero funciona mal**.

**Criterio de prioridad**: los bugs de este documento van antes que cualquier gap nuevo de `funcionalidades-v2.md`. Ver la fase de estabilización agregada en [roadmap-cambios.md](roadmap-cambios.md).

Para cada bug: dónde ocurre, qué tan grave es, qué le pasa al usuario, y — cuando se pudo determinar leyendo el código — una hipótesis de causa. La hipótesis es un punto de partida para quien lo corrija, no un diagnóstico cerrado; donde no se pudo determinar con certeza, queda marcado explícitamente en vez de adivinar.

---

## Bloqueantes

Impiden operar con confianza: producen datos incorrectos o dejan partes de la pantalla fuera de alcance.

### B1 — La programación toma la fecha de cabecera de la OT, no la fecha real de cada tarea

**Dónde ocurre**: se manifiesta sobre todo en la PWA Operativa ("mi día" / "mi semana" del supervisor), y en cualquier otro lugar que muestre "cuándo es esta OT" a partir de un solo campo.

**Severidad**: Bloqueante — ya fue reportado antes y sigue ocurriendo.

**Impacto en el usuario**: una OT con tareas repartidas en varios días distintos solo aparece en la agenda del supervisor el día que coincide con la fecha de cabecera. Los demás días, con tareas reales y asignadas, la OT es invisible — el supervisor no se entera de que tiene trabajo agendado.

**Hipótesis de causa (confirmada leyendo el código)**: cada tarea de una OT tiene su propia fecha (`OT.tareas[].fecha`), y una OT puede tener tareas en fechas distintas. Pero la OT también guarda un único campo de cabecera, `OT.fechaEjecucion`, y es ese campo — no las fechas individuales de las tareas — el que se usa para decidir qué le aparece al supervisor cada día: `asignacionController.js`, función `otsSupervisadasEnFechas` (línea ~48), filtra comparando `ot.fechaEjecucion` contra el día pedido, sin mirar `tareas[].fecha` en ningún momento.

Ese campo de cabecera se llena de dos formas que pueden contradecirse entre sí:
- automáticamente, tomando la fecha de la tarea **más temprana**, cada vez que se guardan tareas sin mandar `fechaEjecucion` explícita (`otController.js`, función `actualizarOT`, comentario "se deriva sola de la primera tarea con fecha");
- manualmente, escribiéndolo a mano desde la pestaña Antecedentes de Tratamiento (`otController.js`, función que procesa `req.body.fechaEjecucion`, línea ~302) — este guardado no toca `tareas[]`, así que la derivación automática ni siquiera se activa.

En ningún caso el campo de cabecera puede representar correctamente una OT cuyas tareas caen en más de un día — es estructuralmente un solo valor tratando de resumir varias fechas. Es la razón más probable de que la corrección anterior (la derivación automática desde la primera tarea) no haya bastado: resuelve el caso de la primera fecha, pero no el de las siguientes.

**Corrección de fondo esperable**: que la PWA Operativa (y cualquier otro consumidor de "qué OT tiene esta persona hoy") filtre por `tareas[].fecha` con `operarioId`/asignación de esa persona, en vez de por `OT.fechaEjecucion`. El campo de cabecera puede seguir existiendo como resumen de referencia (por ejemplo, para ordenar OTs en una lista), pero no como fuente de verdad para la agenda diaria.

---

### B2 — El turno seleccionado desde la pantalla principal no se aplica

**Dónde ocurre**: "al seleccionar el turno desde la pantalla principal, la selección no se aplica" (síntoma reportado). Requiere confirmación de la pantalla exacta — ver más abajo.

**Severidad**: Bloqueante.

**Impacto en el usuario**: el usuario elige un turno/calendario y el sistema se comporta como si no hubiera elegido nada, sin ningún mensaje de error — la selección parece perderse en silencio.

**Hipótesis de causa**: **no se pudo confirmar con certeza leyendo el código.** El selector de turno más directo que existe hoy es el campo "Calendario" del formulario de integrante en `RecursosScreen.jsx` (línea ~291, `<select>` de `calendarioId` sobre la ficha de un `Recurso`) — a la lectura, su `onChange` está bien conectado al estado y el botón "Guardar" persiste ese estado sin problema aparente. Si el síntoma ocurre ahí, la causa no es evidente por inspección estática y requeriría reproducirlo paso a paso (por ejemplo, revisar si el `PUT` al guardar realmente incluye `calendarioId` en el cuerpo de la petición, o si hay algún caso donde el `<select>` se remonta y pierde el valor).

**Requiere confirmación**: ¿"pantalla principal" es Recursos (selector de turno de una persona), el Dashboard, o alguna otra pantalla con un selector de turno que no se identificó en esta revisión? Sin una captura de pantalla o pasos de reproducción, no se puede acotar más el origen.

---

### B3 — El scroll horizontal en Tratamiento > Tareas deja campos inaccesibles a la derecha

**Dónde ocurre**: `TratamientoScreen.jsx`, pestaña Tareas — la fila de edición de cada tarea (descripción, puesto, fecha, hora, duración, operarios asignados, y el resto de controles de esa fila).

**Severidad**: Bloqueante — si el usuario no puede llegar a un campo, no puede completar la tarea.

**Impacto en el usuario**: en pantallas angostas (o con el navegador con poco ancho), parte de los campos de cada fila de tarea queda fuera del área visible y no hay forma evidente de desplazarse hasta ellos — el usuario no puede editarlos ni ve que existan.

**Hipótesis de causa**: no se identificó con certeza un contenedor con `overflow-x` propio alrededor de esa fila de edición (la única vista de Tratamiento con scroll horizontal explícito hoy es la sección de Gantt visual dentro de la cotización, línea ~1529, no la fila de edición de tareas). Es consistente con que la fila use un layout de ancho fijo (flex/grid) sin que su contenedor padre habilite `overflow-x: auto`, de forma que el excedente simplemente queda recortado por el contenedor exterior en vez de quedar navegable con scroll — pero esto **requiere confirmación visual** (abrir la pantalla en un ancho angosto) antes de intervenir el CSS, ya que la causa exacta puede depender de qué contenedor específico esté recortando el contenido.

---

## Alta severidad

### B4 — Sin bloqueo ni indicador visual mientras se guarda (mayoría de formularios)

**Dónde ocurre**: `IngresoScreen.jsx` (crear/editar solicitud) y `RecursosScreen.jsx` (guardar integrante, y presumiblemente el resto de sus formularios) no deshabilitan el botón de guardar ni muestran ningún indicador de progreso mientras la operación está en curso.

**Severidad**: Alta — no bloquea el uso del sistema, pero expone a duplicar datos o perder cambios.

**Impacto en el usuario**: mientras se guarda, nada en pantalla indica que la operación está en curso. El usuario puede hacer doble clic en "Guardar", o navegar a otra pantalla antes de que la respuesta del servidor llegue, con riesgo de crear el mismo registro dos veces o de que un cambio no termine de guardarse.

**Hipótesis de causa (confirmada parcialmente leyendo el código)**: no es un problema sistémico en todo el código — el patrón correcto **ya existe** en una parte de la aplicación y simplemente no se replicó en el resto. `TratamientoScreen.jsx`, pestaña Antecedentes (función `TabAntecedentes`, línea ~208), sí implementa esto bien: botón con `disabled={guardando}`, opacidad reducida mientras se guarda, y texto que cambia a "Guardando…". Ese mismo patrón no aparece en `IngresoScreen.jsx` (`handleCrear`, sin ningún estado de `guardando`) ni en el buscador rápido de `disabled`/`guardando` sobre `RecursosScreen.jsx` (sin resultados).

**Corrección esperable**: replicar el patrón ya usado en `TabAntecedentes` (estado `guardando`, botón deshabilitado + texto de progreso) en `IngresoScreen` y en los formularios de `RecursosScreen` que no lo tengan. Al existir ya un ejemplo funcionando dentro del propio código, el esfuerzo es bajo — no hay que diseñar el patrón, solo aplicarlo donde falta.

### B7 — Polling de /api/data se disparaba 10-15 veces más seguido de lo previsto (CORREGIDO)

**Estado: corregido** en `feature/fix-polling-rendimiento` (agosto 2026). Se deja documentado para que quede registro de la causa — no es un bug abierto.

**Dónde ocurría**: `erp-web/src/App.jsx`, el `useEffect` que registra el polling de `/api/data` (antes en la línea ~221-250).

**Severidad**: Alta — no corrompía datos, pero multiplicaba por 10-15x la carga real sobre el backend y sobre MongoDB Atlas frente a lo que CLAUDE.md documenta (un poll cada 30 segundos).

**Impacto en el usuario**: invisible en pantalla (nadie ve un contador de requests), pero de fondo la aplicación golpeaba `/api/data` cada ~2-3 segundos en vez de cada 30, con el consiguiente gasto de ancho de banda, cómputo de servidor y conexiones concurrentes a Mongo — y era la causa directa de que cualquier lentitud de fondo (ver B5) se sintiera mucho más seguido de lo que debería.

**Causa confirmada (medida con Chrome DevTools + lectura de código)**: el `useEffect` llamaba a `cargarDatos()` al montarse, y esa función actualiza `ots`, `solicitudes`, `recursos`, `calendarios`, `componentes` y `suministros` sin comparar contra el valor anterior — siempre con una referencia nueva, aunque el contenido no cambiara. Esas mismas seis variables estaban en el array de dependencias del `useEffect`. Resultado: cada carga de datos cambiaba las dependencias del efecto, lo que hacía que React lo desmontara (`clearInterval`, que sí estaba bien puesto) y lo volviera a montar — y el nuevo montaje volvía a llamar `cargarDatos()`, reiniciando el ciclo. El `setInterval` de 30 segundos casi nunca llegaba a dispararse por sí solo, porque el efecto se destruía y recreaba antes de que pasaran los 30 segundos — el verdadero intervalo quedaba determinado por la duración de cada round-trip a `/api/data` (~500-700 ms más el ciclo de render de React), no por el valor de 30000 ms del código.

**Corrección aplicada**: la comparación `prev`/`next` se movió al interior del propio `setState` funcional de cada setter (`setter(prev => ...)`), donde React garantiza que `prev` está al día sin necesidad de leerlo del closure. Con eso, el `useEffect` ya no necesita depender de los datos que él mismo escribe — su array de dependencias quedó en `[]`, se monta una sola vez, y el `setInterval` corre cada 30 segundos de verdad. De paso se agregó una pausa cuando la pestaña está en segundo plano (`document.visibilityState !== 'visible'`), para no seguir consultando mientras nadie mira la aplicación.

---

## Rendimiento

*(No existe hoy un documento `docs/auditoria-rendimiento.md` en el repositorio — estos dos ítems se documentan aquí directamente, sin esa referencia.)*

**Nota de contexto**: en agosto de 2026 ya se identificó y corrigió un cuello de botella de rendimiento relacionado pero distinto — fotos sin comprimir, guardadas como texto base64 directamente dentro de un documento `Solicitud` en MongoDB, que llegaron a inflar `/api/data` a más de 5 MB de payload y ~56 segundos de respuesta. Se corrigió comprimiendo las fotos antes de subirlas y guardándolas como archivos en disco en vez de texto embebido en la base de datos (bajó a ~724 ms). Los dos ítems de abajo son cuellos de botella **estructurales**, presentes incluso después de esa corrección.

### B5 — Tiempo de respuesta alto al verificar solicitudes (hipótesis original descartada — causa real confirmada)

**Dónde ocurre**: `GET /api/data`, el endpoint que carga toda la aplicación de escritorio al abrir y que se vuelve a consultar cada 30 segundos (`erp-backend/src/controllers/dataController.js`, función `getAllData`).

**Severidad**: Rendimiento — no rompe funcionalidad, pero degrada la experiencia.

**Impacto en el usuario**: cada apertura de la aplicación y cada actualización automática tarda del orden de 500 ms o más — perceptible pero no bloqueante — y ese costo se pagaba muchas más veces de las necesarias mientras existió B7 (arriba).

**Hipótesis original (descartada tras medir)**: se planteó que la causa era `getAllData` sin paginación ni selección de campos, cruzando ocho colecciones sin índices. Se instrumentó temporalmente cada consulta con `console.time` y se corrió contra la base de producción real (mismo cluster de MongoDB Atlas, São Paulo). Resultado: **las colecciones son minúsculas** — entre 1 y 8 documentos cada una (`calendarios: 7, equipos: 6, ots: 3, recursos: 8, solicitudes: 7, suministros: 3, puestos: 5, plantillas: 1`, medido en agosto de 2026). A ese volumen, ordenar sin índice cuesta microsegundos en el servidor — un índice faltante no puede explicar 500+ ms por consulta. Lo confirma también que la misma consulta, corrida tres veces seguidas, tardó 1415 ms, 287 ms y 733 ms — una varianza así es la firma de latencia de red variable, no de un plan de ejecución que sería estable si el problema fuera de índices.

**Causa real confirmada**: latencia de red del *round-trip* a MongoDB Atlas en São Paulo (`sa-east-1`) — no la carga de las consultas en sí. Las 8 consultas de `getAllData` ya corren en paralelo (`Promise.all`), así que el tiempo total por request ≈ la más lenta de las 8, no la suma — eso ya estaba bien hecho. El origen de la lentitud es el costo fijo de cada ida y vuelta a un cluster remoto, agravado (mientras existió B7, arriba) por una ráfaga de consultas concurrentes cada ~2-3 segundos en vez de cada 30, saturando el *pool* de conexiones mucho más de lo que el diseño original preveía.

**Qué se corrigió y qué no**:
- Se agregaron los índices que faltaban para los campos usados en `.sort()` (`OT.createdAt`, `Solicitud.fechaCreacion`, `Plantilla.{categoria, nombre}`) — correcto como buena práctica de cara al crecimiento del volumen de datos, pero **no** es lo que explica ni corrige el tiempo medido hoy.
- Se corrigió B7 (el polling excesivo), lo que reduce drásticamente cuántas veces por minuto se paga ese costo de latencia — de ~14 veces en 35 segundos a 1 vez cada 30 segundos real.
- **Lo que no se corrigió, y no se puede corregir sin un cambio de arquitectura (fuera de alcance de esta tarea)**: el piso de ~150-700 ms por request que impone la distancia física entre donde corre el backend y el cluster de MongoDB en São Paulo. Ese piso se mantiene igual de aquí en adelante — solo se paga con mucha menos frecuencia. Si en el futuro se requiere bajarlo, las opciones son de infraestructura (acercar el backend a la región del cluster, o algún tipo de caché), no de código de aplicación.

### B6 — El portal del cliente demora en cargar

**Dónde ocurre**: requiere confirmación de a cuál de los dos portales del cliente se refiere el reporte — ver más abajo, es una distinción importante.

**Severidad**: Rendimiento.

**Impacto en el usuario**: el cliente espera más de lo razonable para ver el estado de su solicitud o cotización.

**Hipótesis de causa — verificada, con una corrección importante al planteamiento original**: hoy existen **dos** portales de cliente distintos, y la hipótesis de "descarga el bundle completo de la app interna, con librerías pesadas que no usa" solo es cierta para uno de los dos:

- **`erp-pwa-cliente/`** (aplicación aparte, desplegada como su propio sitio) — se verificó que **no** tiene `jspdf`, `html2canvas` ni `xlsx` entre sus dependencias (`erp-pwa-cliente/package.json`); es un build propio, separado del de `erp-web`. Para este portal, la hipótesis tal como está planteada **no aplica**.
- **La pestaña "Portal" dentro de `erp-web`** (`PortalClienteScreen.jsx`, ruta `/portal`) — esta sí es parte del mismo bundle que el resto de la aplicación de escritorio. Se confirmó que `erp-web` no aplica ningún code-splitting por ruta (sin `React.lazy` en `App.jsx`, sin configuración de `manualChunks` en `vite.config.js`), y que `jspdf`, `jspdf-autotable`, `html2canvas` y `xlsx` sí son dependencias de `erp-web/package.json`, usadas por otras pantallas (Tratamiento, Importar/Exportar). Cualquiera que entre a `/portal` descarga ese mismo bundle único, con esas librerías incluidas aunque esa pantalla no las use.

**Requiere confirmación**: si el reporte se refiere a la PWA standalone (`erp-pwa-cliente`), la causa no es la que se planteó y hay que investigar aparte (tamaño de imágenes, latencia de red, cold-start del backend en Render, etc.). Si se refiere a la pestaña `/portal` de `erp-web`, la corrección esperable es introducir code-splitting por ruta (`React.lazy` + `Suspense`) para que esa pantalla no cargue las librerías de las pantallas administrativas que nunca usa.
