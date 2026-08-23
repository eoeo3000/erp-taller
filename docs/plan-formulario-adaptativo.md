# Plan — Formulario adaptativo con catálogo de tipos de trabajo (Informes de Evaluación)

Documento de planificación, sin código. Cubre solo el Informe de Evaluación (Gap 1 de
[funcionalidades-v2.md](funcionalidades-v2.md)) — quedan fuera de esta fase los Informes de
Ejecución, el formulario de solicitud del cliente, y cualquier generación automática del
catálogo con IA (ver §14 para la ruta de extensión futura).

**Segunda versión de este documento.** La primera versión ya se implementó parcialmente
(catálogo `TipoTrabajo` plano, motor de sugerencia, motor de texto, "hallazgo como lienzo en
blanco" en la PWA). Este documento incorpora un catálogo nuevo, mucho más rico, entregado por
el dueño del negocio (`plantilla_tipos_trabajo.xlsx`, 30 tipos de trabajo, 7 hojas), que cambia
el modelo de una lista plana a un modelo de dos niveles: campos propios de cada tipo +
catálogos transversales compartidos por casi todos + sugerencias premarcadas por tipo. Todo lo
que ya se construyó en la primera fase se conserva (motor de texto, motor de sugerencia, fotos,
"lienzo en blanco", caso no cubierto) — lo que se agrega es la capa de catálogos transversales
y sugerencias, que hoy no existe.

Convención de este documento: cuando algo ya existe y se verificó leyendo el código, se dice
en presente y se cita el archivo. Cuando se propone algo nuevo, se dice en futuro/condicional.
Las ambigüedades quedan marcadas como **Requiere confirmación**.

---

## 0. Resultado de la verificación de integridad del Excel

Antes de diseñar nada, se verificó programáticamente el archivo entregado
(`plantilla_tipos_trabajo.xlsx`, la versión más reciente de varias que había en Descargas —
confirmado por fecha de modificación y por ser la única con las 7 hojas descritas). Resumen:

| Verificación | Resultado |
|---|---|
| `codigoTipo` duplicado en "Tipos de trabajo" | Ninguno — 30 códigos únicos |
| Marcador `{clave}` de una `plantillaTexto` sin campo propio ni clave transversal que lo resuelva | Ninguno — los 30 tipos resuelven el 100% de sus marcadores |
| `codigoTipo` en "Campos" que no existe en "Tipos de trabajo" | Ninguno |
| Campo `seleccionUnica` sin ninguna fila en "Opciones" | Ninguno |
| Fila en "Opciones" que no corresponde a un campo `seleccionUnica` declarado | Ninguna |
| `codigoTipo` en "Opciones" que no existe en "Tipos de trabajo" | Ninguno |
| Valor de "Sugerencias por tipo" que no existe en "Catálogos transversales" | **6 casos — ver hallazgo abajo** |
| `codigoTipo` en "Sugerencias por tipo" que no existe en "Tipos de trabajo" | Ninguno |
| `lista` usada en "Sugerencias por tipo" o "Catálogos transversales" que no está en "Índice de listas" | Ninguna |
| Valores de `condicionesNoAplicables` que no pertenecen a la lista `condicionesEntorno` | Ninguno — los 19 tipos que declaran alguna, todas válidas |
| Filas con `codigoTipo`/`clave`/`lista`/`valor` vacíos | Ninguna |

**El archivo está sano.** El único hallazgo real es el siguiente:

**Hallazgo — 6 filas de "Sugerencias por tipo" no son un valor de catálogo, son un marcador
especial.** Para los 6 tipos que incluyen `{obrasCiviles}` en su plantilla (`CAMBIO_DE_BOMBA`,
`CAMBIO_DE_MOTOR`, `CAMBIO_REDUCTOR`, `FABRICACION_SOPORTE`, `REPARACION_ESTANQUE`,
`OBRAS_CIVILES_BASE`), la hoja trae una fila con `lista=obrasCiviles`,
`valor="(aplica — seleccionar en terreno)"`, `porDefecto=No`. Ese texto entre paréntesis no es
ninguna de las 10 opciones reales de la lista `obrasCiviles` en "Catálogos transversales" (que
son "No requiere", "Reparación de base de bomba", "Nueva fundación", etc.) — es, a todas luces,
una nota del autor del Excel para señalar "este tipo usa esta lista, pero no hay un valor
premarcado sensato, se elige en terreno", no un dato de catálogo real.

Da la casualidad de que esta señal ya es redundante con otra cosa que el archivo ya dice: los 6
tipos que necesitan `obrasCiviles` son exactamente los mismos 6 cuya `plantillaTexto` incluye el
marcador `{obrasCiviles}` (verificado por conteo — ver §0 tabla, fila de marcadores). Es decir,
la plantilla de texto **ya es** la fuente de verdad de qué tipos usan qué lista transversal,
premarcada o no. La fila de "Sugerencias por tipo" con ese texto entre paréntesis no aporta
información nueva, solo la repite de una forma que no encaja en el modelo de datos (un valor de
catálogo real).

**Propuesta (marcada como Requiere confirmación en §Supuestos): al importar, estas 6 filas no
se guardan como una sugerencia premarcada** — se reconocen por patrón (valor entre paréntesis
que no matchea ningún valor real de esa lista) y se descartan silenciosamente, sin reportarlas
como error de fila. La aplicabilidad de `obrasCiviles` para esos 6 tipos queda determinada
enteramente por la presencia del marcador `{obrasCiviles}` en su `plantillaTexto` (ver §3.3 y
§5). Alternativa, si no se confirma la anterior: importar la fila igual pero jamás mostrarla
como sugerencia (mismo resultado práctico, más código de caso especial). Cualquiera de las dos
es consistente con el resto del diseño de abajo.

---

## 1. Diagnóstico del Informe de Evaluación actual

El Informe de Evaluación **ya existe**, con la primera fase del formulario adaptativo ya
construida, pero de forma desigual entre escritorio y teléfono — un hallazgo importante,
porque cambia dónde tiene que enfocarse el trabajo de esta fase.

**En la PWA Operativa** (`erp-pwa-operativa/src/screens/O5_InformeEvaluacion.jsx`), el informe
**ya es** el formulario adaptativo: no hay wizard de pasos (se eliminó en la iteración
anterior), la pantalla completa es un solo hallazgo — un cuadro de texto en blanco
(`EditorHallazgo.jsx`) que sugiere tipos de trabajo mientras se escribe, y una vez elegido un
tipo, muestra la plantilla de texto con sus espacios en blanco tocables, más fotos. Botones
"Volver" / "Guardar y salir", sin lista de hallazgos ni botón "+ Agregar hallazgo" (decisión
explícita: **un informe captura un solo hallazgo**, no varios — el modelo de datos
(`OT.informeEvaluacion.hallazgos[]`) sigue siendo un arreglo por si se decide revertir esto más
adelante, pero la pantalla de hoy solo lee/escribe la posición `[0]`).

**En escritorio** (`erp-web/src/screens/TratamientoScreen.jsx`, pestaña "0 · Informe Inicial"),
la pantalla es **de solo lectura**: muestra el estado (completo/pendiente), la cuenta de
hallazgos registrados (y cuántos quedaron como "caso no cubierto"), y una vez completo, las
listas de tareas/componentes/logística que el informe generó, con un botón "Aplicar a la OT →".
El texto en pantalla lo dice explícitamente: *"El detalle del informe (condiciones del sitio,
riesgos, hallazgos y fotos) se completa desde la aplicación del supervisor en terreno."*

**Hallazgo real, no documentado hasta ahora**: existe un archivo
`erp-web/src/screens/EditorHallazgo.jsx`, construido en paralelo al de la PWA con la misma
lógica (mismo `motorTexto`/`motorSugerencia`/`hallazgos.js` duplicados, mismo diseño de
segmentos tocables), pero **no se usa en ningún lado** — no hay ningún `import` de ese archivo
en el resto de `erp-web/src` (confirmado por búsqueda). Es código construido pero nunca
conectado a `TratamientoScreen`. Esto contradice una decisión que la primera versión de este
documento daba por confirmada (§10 de la versión anterior: *"los hallazgos se pueden editar
desde escritorio"*) — la intención existía y el componente se construyó, pero la integración a
`TratamientoScreen` nunca se hizo. Se marca en §Supuestos como una decisión que hay que retomar:
¿se conecta ahora ese componente ya construido, o se confirma que el Informe de Evaluación debe
seguir siendo exclusivo de terreno y ese archivo se da de baja?

**Consecuencia para este proyecto**: el catálogo nuevo (30 tipos, campos propios + listas
transversales + sugerencias premarcadas) se apoya sobre una base que ya funciona
(motor de sugerencia, motor de texto, fotos, caso no cubierto) — el trabajo de esta fase es
extender esa base para soportar el modelo de dos niveles, no construir el formulario adaptativo
desde cero.

---

## 2. Decisión sobre reutilizar o no el modelo `Plantilla`

**Se mantiene la decisión de la primera versión: no se reutiliza ni se extiende `Plantilla`.**

`Plantilla` (`erp-backend/src/models/Plantilla.js`) es un paquete de tareas/componentes/
logística ya armado, sin campos parametrizables — se aplica tal cual. `TipoTrabajo` (existente,
`erp-backend/src/models/TipoTrabajo.js`) es un esquema de preguntas para describir una
observación de terreno y generar texto. Los dos catálogos nuevos que agrega esta versión
(catálogos transversales, sugerencias premarcadas) son una extensión natural de `TipoTrabajo`,
no un motivo para acercarlo a `Plantilla` — siguen siendo "qué preguntar y qué texto producir",
nunca "qué tareas insertar". La razón de fondo no cambió respecto a la primera versión de este
documento.

---

## 3. Modelo de datos Mongoose propuesto

Tres piezas nuevas o extendidas: `TipoTrabajo` (extendido), `CatalogoTransversal` (nueva
colección), y el `hallazgo` capturado dentro de `OT.informeEvaluacion` (sin cambios de forma,
solo de contenido — ver §3.4).

### 3.1 `TipoTrabajo` — extendido

```
TipoTrabajo
  codigoTipo         String (requerido, único) — "CAMBIO_DE_BOMBA". NUEVO.
  nombre             String (requerido) — "Cambio de bomba"
  sinonimos          [String]
  plantillaTexto     String — con marcadores {clave}, tal como ya existe
  campos             [ver 3.2] — SOLO los campos propios de este tipo (ya no incluye
                     condiciones de entorno ni ninguna lista transversal — eso ahora se
                     resuelve aparte, ver 3.3)
  condicionesNoAplicables  [String] — NUEVO (reemplaza a la versión de la primera fase de
                     este documento, que proponía una colección `CondicionEntorno` aparte;
                     esa colección nunca se implementó, así que no hay migración de datos que
                     resolver). Valores de la lista transversal `condicionesEntorno` que no
                     tiene sentido ofrecer para este tipo — igual criterio que la primera
                     versión: lista de exclusión, no de inclusión, sobre un catálogo que por
                     defecto ofrece todo a todos.
  sugerencias        [ver 3.3.1] — NUEVO. Qué valores de qué listas transversales vienen
                     premarcados para este tipo.
  activo             Boolean, default true
```

**Por qué `codigoTipo` como llave nueva, reemplazando a `nombre`**: hoy el importador hace
upsert por `nombre` (`importarTiposTrabajo`, `erp-backend/src/controllers/
importExportController.js`). El Excel nuevo ya trae su propio código corto y estable
(`CAMBIO_DE_BOMBA`) pensado exactamente para enlazar filas entre hojas — conviene usarlo
también como llave de upsert en Mongo, no solo como columna de enlace dentro del archivo, por
dos razones: (a) si algún día se retitula un tipo ("Cambio de bomba" → "Reemplazo de bomba"),
el código no cambia y la reimportación sigue actualizando el mismo documento en vez de crear
uno duplicado; (b) las "Sugerencias por tipo" y las condiciones no aplicables se escriben
contra `codigoTipo`, así que tenerlo como campo propio (no derivado con `slugCodigo(nombre)`
como hace el importador de hoy) evita que un cambio de nombre rompa esos enlaces la próxima vez
que se reimporte. **Migración**: el catálogo real hoy en producción está vacío o con datos de
prueba (no hay indicio de catálogo real cargado en producción a la fecha de este documento) —
no se anticipa migración de datos, pero se deja como advertencia para quien implemente.

### 3.2 Campos de un `TipoTrabajo` — sin cambios de forma

Se mantiene igual que la primera versión de este documento: `clave`, `etiqueta`, `tipoDato`
(`texto | numero | seleccionUnica | seleccionMultiple | fecha | foto`), `opciones`,
`obligatorio`, `orden`. El catálogo nuevo no usa `seleccionMultiple` a nivel de campo propio en
ninguno de sus 30 tipos (las selecciones múltiples de este archivo son todas transversales,
ver 3.3) pero se conserva el valor en el enum por si algún tipo de trabajo futuro necesita un
campo propio de selección múltiple que no tenga sentido compartir con otros tipos.

**Siete campos comunes**: el archivo repite, idénticos, siete campos en los 30 tipos —
`planta` (texto), `equipoReferencial` (texto), `estandarTorque` (texto), `fechaTentativa`
(fecha), `duracionTentativa` (numero — el mismo que ya lee `hallazgos.js`,
`guardarHallazgoEnInforme`, para la duración de la tarea vinculada), `fotoActual` (foto),
`fotoEsperada` (foto). No requieren ningún concepto nuevo de modelo — son campos propios
repetidos 30 veces en la hoja "Campos", exactamente como ya funciona hoy. Se deja anotado como
mejora de conveniencia de autoría, no de modelo: una futura hoja "Campos comunes" en el Excel
evitaría repetir esas 210 filas (30 tipos × 7 campos) a mano — no se implementa en esta fase.

### 3.3 `CatalogoTransversal` — colección nueva

Reemplaza y generaliza a `CondicionEntorno`, que la primera versión de este documento proponía
como colección aparte y que **nunca llegó a implementarse** (se verificó: no existe
`erp-backend/src/models/CondicionEntorno.js` ni rastro de ella en el código actual, así que no
hay que migrar nada). El catálogo nuevo trae 9 listas transversales, no solo condiciones de
entorno: `condicionesEntorno`, `tipoEquipo`, `trabajosPrevios`, `tareasSecundarias`,
`materiales`, `tareasHabilitadoras`, `riesgos`, `obrasCiviles`, `trabajosCierre` — comunes a
casi todos los tipos de trabajo, no propias de ninguno.

```
CatalogoTransversal
  clave        String (requerido, único) — "condicionesEntorno", "riesgos", etc. — es el
               mismo nombre que aparece como marcador {clave} en las plantillas de texto
  descripcion  String — para quien administra el catálogo, no se muestra al supervisor
  seleccion    enum: unica | multiple
  valores      [ { valor: String, categoria: String } ] — embebido, mismo criterio que
               `campos` dentro de TipoTrabajo: siempre se lee junto con su lista completa,
               nunca un valor suelto. `categoria` solo la usa hoy la lista
               `tareasSecundarias` (agrupa en Desmontaje/Traslado/Taller/Montaje/Ajuste y
               verificación, ver §6) — vacía para el resto.
```

**Por qué una colección nueva y no una extensión de `TipoTrabajo.campos`**: estos valores son
literalmente los mismos para 29 o 30 de los 30 tipos de trabajo (todos menos, cuando
corresponde, `obrasCiviles`) — repetirlos como `campo.opciones` dentro de cada `TipoTrabajo`
significaría guardar y mantener sincronizadas 30 copias de la misma lista de 16 condiciones de
entorno. Es exactamente el mismo argumento que ya usaba la primera versión de este documento
para `CondicionEntorno` (§3.3 de esa versión), solo que ahora aplica a 9 listas, no a 1. La
columna `universal` de "Índice de listas" (Sí para 8 de las 9, No solo para `obrasCiviles`) es
información para quien arma el catálogo ("vas a usar esta lista en casi todos los tipos que
crees"), **no** una regla que el motor de texto tenga que aplicar en tiempo de ejecución — la
aplicabilidad real de una lista para un tipo dado queda determinada enteramente por si su
marcador `{clave}` aparece en la `plantillaTexto` de ese tipo (confirmado en la verificación de
§0: los 6 tipos con `{obrasCiviles}` son exactamente los 6 con alguna fila de "obras civiles"
pensada para ellos, ningún otro tipo la necesita). Esto simplifica el motor: no hace falta que
sepa qué lista es "universal", solo tiene que fijarse en qué marcadores trae la plantilla de
cada tipo — igual que ya hace hoy con los campos propios.

### 3.3.1 Sugerencias premarcadas — embebidas en `TipoTrabajo`, no colección aparte

```
TipoTrabajo.sugerencias   [ { lista: String, valor: String } ]
```

Cada entrada dice "para este tipo de trabajo, este valor de esta lista transversal viene
premarcado". Se guarda embebido en el propio `TipoTrabajo` (mismo criterio que `campos`: se lee
siempre junto con el tipo elegido, nunca suelto) en vez de en una colección de relación aparte
— es una lista corta por tipo (entre 20 y 50 entradas según el tipo, según la hoja real) y
siempre se consulta completa al elegir un tipo de trabajo.

**Simplificación respecto a la columna `porDefecto` del Excel**: en los datos reales
entregados, `porDefecto` es `Sí` en el 100% de las 790 filas reales (las 6 restantes son el
marcador especial de §0, no un valor real). No hay ningún caso en el archivo de "sugerencia
mostrada pero no premarcada". Por eso el modelo de arriba no guarda ese booleano: la sola
presencia de una entrada en `sugerencias[]` ya significa "premarcado". **Requiere
confirmación**: si en el futuro se necesita distinguir "premarcado" de "sugerido pero no
premarcado" (por ejemplo, una lista de materiales frecuentes que se muestran como acceso rápido
pero empiezan destildados), habría que reintroducir el booleano — no se hace ahora porque el
archivo actual no lo necesita y agregar un campo que ningún dato usa hoy sería sobre-diseño.

Solo tres listas tienen sugerencias en el archivo real: `tareasSecundarias`, `materiales`,
`riesgos` — nunca `condicionesEntorno`, `tipoEquipo`, `trabajosPrevios`, `tareasHabilitadoras`
ni `trabajosCierre` (verificado: cero filas de esas cinco listas en toda la hoja "Sugerencias
por tipo"). Tiene sentido con la naturaleza de cada lista: las tres que sí se premarcan
describen "lo que esta tarea principal típicamente arrastra" (§ Instrucciones del propio
archivo); las otras cinco son más situacionales (qué encontró el supervisor en terreno, qué
tipo de equipo es, qué había que hacer antes) y no tiene sentido asumirlas de antemano.

### 3.4 Dato capturado: `hallazgo` — sin cambios de esquema, cambia solo cómo se llena

El esquema ya existente en `OT.informeEvaluacion.hallazgos[]` (`tipoTrabajoId`, `valores`,
`textoGenerado`, `textoDescriptivo`, `textoEditadoManualmente`, `fotos`, `casoNoCubierto`,
`tareaVinculadaId`, `fecha`) **no necesita ningún campo nuevo**. La razón es que `valores` ya es
un objeto libre `clave -> valor` (`Schema.Types.Mixed`), y el motor de texto
(`generarSegmentos`/`generarTexto`) ya resuelve cualquier `{clave}` de la plantilla contra
`valores[clave]` sin que le importe si esa clave es un campo propio del tipo o una lista
transversal — así que una selección de `condicionesEntorno` se guarda como
`valores.condicionesEntorno = ['Energizado', 'A la intemperie']`, exactamente en el mismo
objeto y de la misma forma que `valores.diametro = '4 pulgadas'`. Cero cambios en
`erp-backend/src/models/OT.js`, cero cambios en `motorTexto.js`.

Lo que sí cambia es **quién resuelve qué es cada `clave`** cuando el supervisor toca un espacio
en blanco del texto — hoy `EditorHallazgo.jsx` solo busca esa clave entre
`tipoElegido.campos` (`tocarSegmento`, línea ~53: `tipoElegido?.campos.find(c => c.clave ===
clave)`); si la clave no está ahí, hoy no pasa nada al tocarla — es, en los hechos, el punto
exacto donde el catálogo nuevo rompería si se cargara tal cual sobre el código de hoy, porque
markers como `{condicionesEntorno}` o `{riesgos}` no son campos propios de ningún tipo en el
archivo nuevo. La extensión necesaria se detalla en §5.

---

## 4. Motor de sugerencia por palabras clave

**Sin cambios respecto a la primera versión.** `motorSugerencia.js`
(`erp-pwa-operativa/src/motorSugerencia.js`, duplicado en `erp-web/src/utils/`) ya implementa
exactamente lo que pedía la primera versión de este documento: normalización sin tildes,
tokenización por palabra completa, puntaje mayor para coincidencia en nombre/sinónimos que en
opciones de campo, orden por puntaje descendente con empate alfabético, tope de 5 sugerencias,
sin sugerencias si no hay coincidencias.

**No se propone que el motor busque también dentro de las listas transversales o de las
sugerencias premarcadas** (por ejemplo, que escribir "empaquetadura" sugiera "Cambio de bomba"
porque "Empaquetadura" es uno de sus materiales premarcados). Motivo: las listas transversales
son compartidas por casi todos los tipos — "Empaquetadura" es una sugerencia premarcada de
varios tipos a la vez, así que buscar ahí generaría coincidencias parejas entre muchos tipos sin
poder distinguir cuál es el correcto, degradando la precisión del buscador en vez de mejorarla.
Las opciones de campos propios (el caso que sí busca hoy) no tienen este problema porque son
específicas de cada tipo. **Requiere confirmación** si de todos modos se quiere probar esto en
el futuro — no se recomienda para esta fase.

---

## 5. Motor de texto adaptativo

El parseo de la plantilla y la generación de texto (`generarSegmentos`/`generarTexto` en
`motorTexto.js`) **no cambian** — ya separan la plantilla en segmentos de texto fijo y
segmentos de valor por `{clave}`, sin que les importe de dónde viene esa clave. El cambio real
es en la pantalla (`EditorHallazgo.jsx`, ambas copias), en el punto donde un segmento de valor
se toca para llenarlo:

**Extensión necesaria — resolver una clave contra dos fuentes, no una.** Hoy `tocarSegmento`
busca la clave solo entre `tipoElegido.campos`. Se extiende para que, si no la encuentra ahí,
la busque en el catálogo transversal ya cargado (`CatalogoTransversal`, por `clave`) y arme un
"campo virtual" con la misma forma que ya espera `HojaCampo`/`MenuSelector` (el selector que ya
existe): `{ clave, etiqueta: catalogo.descripcion, tipoDato: catalogo.seleccion === 'multiple'
? 'seleccionMultiple' : 'seleccionUnica', opciones: catalogo.valores.map(v => v.valor) }`. Con
eso, **el selector no cambia** — sigue siendo la misma hoja inferior con casillas de toque que
ya existe hoy para campos propios, ahora alimentada también por catálogos transversales. Esto
es un cambio localizado (una función de una pantalla, duplicada en dos archivos) que no toca el
motor de texto ni el modelo de datos del hallazgo.

**Exclusión de `condicionesNoAplicables`**: cuando la clave resuelta es `condicionesEntorno`, el
"campo virtual" arma sus `opciones` con `catalogo.valores` **menos** las que
`tipoElegido.condicionesNoAplicables` excluye para ese tipo — mismo mecanismo de lista de
exclusión que ya proponía la primera versión de este documento, aplicado ahora sobre el catálogo
transversal en vez de sobre una colección `CondicionEntorno` aparte.

**Requisito del motor de texto, explícito en el propio Excel (hoja Instrucciones) y ya
implementado**: toda oración cuyo marcador quede sin valor debe omitirse completa, no dejar
"Materiales y consumibles: ." colgando. **Esto ya funciona hoy** en el nivel de segmento
individual — `generarSegmentos` reemplaza un valor vacío por el marcador de "pendiente" (ver
`erp-pwa-operativa/src/motorTexto.js`, `MARCADOR_PENDIENTE`), y la pantalla ya lo pinta como un
espacio en blanco tocable, no como texto suelto. **Pero el requisito tal como lo pide el
archivo nuevo es más fuerte**: pide omitir la **oración completa** ("Materiales y consumibles: X.")
cuando su valor está vacío, no solo dejar el hueco marcado dentro de la oración — eso es
distinto de lo que hace el motor hoy, que muestra la oración igual con el hueco pendiente
resaltado (para que el supervisor vea que falta llenarlo). **Contradicción real entre este
Excel y el diseño ya construido**, y se marca así en vez de resolverse unilateralmente: el
diseño actual privilegia que el supervisor **vea** qué le falta completar mientras llena el
formulario (un hueco pendiente visible invita a llenarlo); el requisito del Excel privilegia que
el **texto final guardado** nunca muestre una oración a medio llenar. Ambos objetivos son
razonables y no son necesariamente incompatibles si se aplican en momentos distintos:
**Propuesta**: mientras el supervisor está completando el hallazgo (texto interactivo en
pantalla), se sigue mostrando cada hueco pendiente resaltado, como hoy — eso ayuda a completar.
Recién al generar el `textoDescriptivo` final que se guarda (y que se muestra de vuelta en
`TratamientoScreen`, se imprime en el PDF, etc.), el motor de texto aplicaría una segunda pasada
que elimina cualquier oración completa que todavía contenga un marcador pendiente. Esto sí es un
cambio a `motorTexto.js` (una función nueva, ejecutada solo al construir el texto final, no
sobre la vista previa en vivo). **Requiere confirmación**: cómo se define el límite de una
"oración" para efectos de esta omisión — el punto seguido (`.`) es la señal más simple y ya es
consistente con el propio patrón de la plantilla ("...en {planta}. Equipo intervenido:
{tipoEquipo} {equipoReferencial}. Condiciones de terreno: {condicionesEntorno}. ..."), pero
convendría confirmarlo antes de implementar por si alguna plantilla futura usa punto seguido
dentro de una abreviatura o número.

---

## 6. Presentación de sugerencias premarcadas al supervisor

Sección nueva, sin equivalente en la primera versión de este documento — no existía esta capa
de sugerencias premarcadas hasta el catálogo nuevo.

**Cuándo aparecen**: al elegir un tipo de trabajo (`elegirTipo` en `EditorHallazgo.jsx`), además
de limpiar `valores` como hoy, se precargan de una vez `valores.tareasSecundarias`,
`valores.materiales` y `valores.riesgos` (las únicas tres listas con sugerencias, ver §3.3.1)
con los valores que `tipoElegido.sugerencias` marca para ese `codigoTipo` — el texto generado
ya aparece con esas tres oraciones llenas desde el primer instante, no en blanco. El supervisor
no parte de una lista vacía: confirma o descarta lo que ya viene marcado (tal como pide la hoja
Instrucciones del propio Excel).

**Cómo se editan**: al tocar el espacio en blanco de `tareasSecundarias` (o `materiales`, o
`riesgos`) se abre la misma hoja inferior de selección múltiple que ya existe (`HojaCampo` en
PWA, `MenuSelector` en escritorio), con las opciones premarcadas ya con su casilla marcada — el
supervisor puede destildar lo que no aplica a este caso puntual, y marcar cualquier otra opción
de la lista completa que sí aplique pero no venía sugerida. No hay ninguna interfaz "premarcado"
separada de la interfaz "elegir manualmente" — es la misma hoja, solo que empieza con algunas
casillas ya marcadas en vez de todas vacías.

**Agrupación por categoría — solo para `tareasSecundarias`**: esta es la única de las 9 listas
que trae `categoria` en "Catálogos transversales" (Desmontaje, Traslado, Taller, Montaje, Ajuste
y verificación). La hoja inferior de esta lista específica se presenta agrupada, con un
subtítulo por categoría entre los grupos de casillas (mismo patrón visual que ya usa el resto de
la PWA para separar secciones dentro de una lista larga), en vez de una lista plana de las ~43
opciones — importa para que una lista larga siga siendo escaneable rápido en el teléfono.
`materiales` y `riesgos` no tienen categoría en el archivo (columna vacía) y se presentan como
lista plana, igual que hoy.

**Requiere confirmación**: si conviene mostrar, dentro de la hoja de selección, alguna marca
visual de "esto venía sugerido" en las opciones que el supervisor destildó (para que quede claro
que fue una decisión activa de descartarla, no un olvido) — es un detalle de diseño visual, no
de modelo de datos, que puede resolverse en la fase de implementación sin impacto en lo de
arriba.

---

## 7. Manejo de fotos

**Sin cambios — ya cumple el requisito no negociable.** `subirFoto`/`subirDataURL`
(`erp-pwa-operativa/src/api.js`) ya comprime en el cliente (máx. 1200px, JPEG calidad 0.75,
`comprimirABlob`) antes de subir, y el backend (`POST /api/uploads/foto`, mismo patrón que ya
usa `S3_Trabajo.jsx` y `O4_ReporteTerreno.jsx`) guarda el archivo real y devuelve una URL —
`EditorHallazgo.jsx` (ambas copias) ya usa exactamente este mecanismo para las fotos del
hallazgo y para los dos campos comunes de tipo foto (`fotoActual`, `fotoEsperada`). Nunca se
guarda base64 en el documento de la OT.

Este patrón se construyó, en efecto, después de un incidente real de rendimiento: una foto sin
comprimir guardada como texto base64 dentro de un documento `Solicitud` en MongoDB inflaba
`/api/data` a más de 5 MB de payload y ~56 segundos de respuesta, corregido comprimiendo y
guardando como archivo en disco (`docs/bugs-conocidos.md`, sección "Rendimiento", nota de
contexto). Un incidente equivalente, ya corregido con el mismo patrón, existe también para las
fotos de reporte de terreno (`docs/estrategia-movil.md`, línea ~169, y el comentario de
`O4_ReporteTerreno.jsx`). El catálogo nuevo no introduce ningún caso de foto que no siga ya este
patrón — nada que hacer en esta fase más allá de mantenerlo.

---

## 8. Importación del catálogo desde `ImportExportScreen` (y su exportación)

### 8.1 Las siete hojas y el orden en que se leen

El importador de hoy (`importarTiposTrabajo`, `erp-backend/src/controllers/
importExportController.js`) lee 3 hojas ("Tipos de trabajo", "Campos", "Opciones"). Se extiende
a 7, leídas en este orden (cada hoja posterior puede necesitar validar contra las ya leídas):

1. **Índice de listas** — se lee primero porque define qué claves son transversales
   (`condicionesEntorno`, `tipoEquipo`, ... 9 en total) y si cada una es de selección única o
   múltiple. Sin esto, no se puede distinguir un marcador transversal de un campo propio al
   validar las hojas siguientes.
2. **Catálogos transversales** — upsert de cada `CatalogoTransversal` por `clave` (agrupando
   las filas de esta hoja, que vienen una por valor). Cada fila valida que su `lista` exista en
   "Índice de listas" (error de fila si no).
3. **Tipos de trabajo** — igual que hoy, una fila por `codigoTipo`. Nuevo: valida que cada
   valor de `condicionesNoAplicables` (separados por coma) exista dentro de los valores ya
   cargados de la lista `condicionesEntorno` en el paso anterior.
4. **Campos** — igual que hoy: agrupados por `codigoTipo`, validando que ese `codigoTipo` exista
   en la hoja anterior.
5. **Opciones** — igual que hoy: agrupadas por `codigoTipo`+`clave` sobre los campos ya
   armados en el paso anterior.
6. **Sugerencias por tipo** — nueva: por cada fila, valida que `codigoTipo` exista (hoja 3),
   que `lista` exista (hoja 1) y que `valor` exista dentro del catálogo transversal ya cargado
   de esa lista (hoja 2) — **salvo el caso especial de §0** (valor entre paréntesis para
   `obrasCiviles`, que se descarta sin reportar error, pendiente de confirmación). Se acumula
   en un mapa `codigoTipo -> [{lista, valor}]` para adjuntar a cada `TipoTrabajo` en el paso
   final.
7. **Escritura final de "Tipos de trabajo"**: recién acá se hace el upsert de cada
   `TipoTrabajo` por `codigoTipo`, con sus `campos` (paso 4), `condicionesNoAplicables` (paso 3)
   y `sugerencias` (paso 6) ya armados en memoria — mismo motivo que ya documentaba la primera
   versión de este documento para "Opciones": los datos de las hojas relacionadas se arman en
   memoria antes de tocar la base, para no hacer un upsert incompleto que haya que corregir con
   un segundo update.

**Qué se reporta cuando una fila falla**: mismo patrón que ya usa todo el resto del sistema —
`{ fila, motivo }` acumulado en `errores[]`, sin detener el resto de la importación
(`resultado.errores` en `ImportExportScreen.jsx`, ya renderiza esto para cualquier módulo). Las
validaciones cruzadas nuevas (condición no aplicable inexistente, sugerencia con lista/valor
inexistente) usan el mismo mecanismo — un error de fila más, no una clase de error distinta.

**Comportamiento de upsert**: igual que hoy — si `codigoTipo` ya existe, se actualiza
completo (incluye reemplazar `campos`, `condicionesNoAplicables` y `sugerencias` con lo que
traiga el archivo nuevo, no una fusión parcial) — mismo criterio de "reimportar reemplaza" que
ya usa el ciclo editar-en-Excel-y-recargar para el resto de catálogos del sistema.

### 8.2 Exportación — para que el ciclo editar-y-recargar funcione

`exportarTiposTrabajo`/`plantillaTiposTrabajo` (mismo archivo) se extienden para producir las 7
hojas a partir del catálogo actual — no solo las 3 de hoy. Mismo criterio que ya usa
`agregarHojasCatalogo`: recorrer los `TipoTrabajo` ya guardados y expandir sus `campos`,
`condicionesNoAplicables` y `sugerencias` de vuelta a filas planas, más las dos hojas que hoy no
tienen contraparte de escritura ("Índice de listas", que es prácticamente estático — 9 filas
fijas — y "Catálogos transversales", que se arma recorriendo las `CatalogoTransversal`
existentes). El botón "Descargar actual" que ya existe en `ImportExportScreen.jsx` (agregado en
esta misma sesión de trabajo, reutiliza `exportarBatch`) ya sirve para esto sin cambios propios
— basta con que el `exportarBatch`/`exportarTiposTrabajo` que consume produzca las 7 hojas.

**Requiere confirmación**: si la plantilla de ejemplo que hoy genera `plantillaTiposTrabajo`
(un solo tipo, "Cambio de línea", con condiciones de entorno como campo propio — diseño de la
primera versión, ya obsoleto frente a este documento) se reemplaza por un ejemplo con el modelo
nuevo (un tipo con campos propios + referencias a alguna lista transversal + alguna sugerencia
premarcada), o si directamente se ofrece como plantilla el catálogo real de 30 tipos ya cargado
(recomendado: es más útil como punto de partida real que un ejemplo sintético, y ya existe
literalmente en el archivo que motivó este documento).

---

## 9. Pantalla de administración del catálogo

**Estado real, verificado**: la API ya tiene CRUD completo (`GET/POST/PUT/DELETE
/api/tipos-trabajo`, `tipoTrabajoController.js`) desde la primera fase, pero **ninguna pantalla
de la aplicación lo usa** para crear/editar/eliminar — la única forma real de tocar el catálogo
hoy es la importación por Excel. Lo único que sí está construido y en uso dentro de
`ImportExportScreen.jsx` es la lista de "Casos no cubiertos" (§10) y, para el catálogo en
general, únicamente los tres botones estándar (Plantilla / Descargar actual / Importar) — no
hay ninguna pantalla de edición puntual todavía, a pesar de que la primera versión de este
documento (§8) ya la daba por decidida.

**Se mantiene la decisión de ubicación**: si se construye, vive dentro de `ImportExportScreen.jsx`,
junto a los bloques ya existentes, no en `RecursosScreen.jsx` — mismo razonamiento que la
primera versión (el catálogo se alimenta principalmente por Excel, la edición puntual queda al
lado de esa misma carga).

**Alcance ampliado respecto a la primera versión**: con catálogos transversales de por medio,
"editar un tipo de trabajo" ahora también implica, potencialmente, tocar sus
`condicionesNoAplicables` (elegir de la lista `condicionesEntorno` ya cargada) y sus
`sugerencias` (marcar/desmarcar valores premarcados de `tareasSecundarias`/`materiales`/
`riesgos`) — un formulario de edición puntual más rico que el propuesto en la primera versión.
Los 9 `CatalogoTransversal` en sí (agregar un valor nuevo a `riesgos`, por ejemplo) también
necesitarían su propia sub-sección de edición simple (lista de valores por clave, agregar/
quitar), igual de simple que ya proponía la primera versión para `CondicionEntorno`.

**Requiere confirmación**: dado que ya pasó una fase entera sin que esta pantalla se
construyera (a pesar de estar "decidida"), vale la pena confirmar si de verdad se necesita antes
de construirla, o si mientras el catálogo se mantenga en el orden de 30-50 tipos, el ciclo
completo por Excel (exportar lo actual, editar en la planilla, reimportar — ya soportado por
completo, ver §8) es suficiente en la práctica y esta pantalla puede seguir esperando. Se deja
diseñada por completitud del documento, no como compromiso de que se construya en esta fase.

---

## 10. Registro de casos no cubiertos

**Ya implementado, sin cambios necesarios.** `GET /api/tipos-trabajo/casos-no-cubiertos`
(`tipoTrabajoController.casosNoCubiertos`) recorre las OT buscando hallazgos con
`casoNoCubierto: true`, y `ImportExportScreen.jsx` ya tiene la sección "Casos no cubiertos" que
lo consume y lo muestra (OT, fecha, si tenía tipo elegido, el texto). El criterio de marcado
(sin tipo elegido, o tipo elegido pero texto editado a mano) tampoco cambia con el catálogo
nuevo — sigue siendo una señal puramente informativa, sin bloqueo, exactamente como documentaba
la primera versión de este documento.

Lo único que cambiaría en la práctica es el volumen: con un catálogo de 30 tipos reales en vez
de 1-3 de prueba, se espera que la proporción de casos no cubiertos baje considerablemente una
vez cargado — es la validación de campo de que el catálogo nuevo efectivamente cubre más
situaciones reales, no un cambio de diseño.

---

## 11. Impacto en pantallas existentes

| Pantalla | Cambio |
|---|---|
| `EditorHallazgo.jsx` (ambas copias, PWA y escritorio) | Extensión de `tocarSegmento` para resolver una clave contra `CatalogoTransversal` cuando no es un campo propio (§5); precarga de sugerencias premarcadas al elegir tipo (§6); agrupación por categoría para `tareasSecundarias` (§6). El resto (lienzo en blanco, buscador, edición manual, deshacer, fotos) no cambia. |
| `O5_InformeEvaluacion.jsx` (PWA) | Sin cambios propios — ya monta `EditorHallazgo` tal cual; se beneficia automáticamente de la extensión de arriba. |
| `TratamientoScreen.jsx` (escritorio, "0 · Informe Inicial") | Sin cambios en esta fase — sigue de solo lectura. Ver §1 y §Supuestos sobre si se conecta `erp-web/src/screens/EditorHallazgo.jsx` (hoy sin uso) o se da de baja. |
| `ImportExportScreen.jsx` | El importador/exportador de "Catálogo de tipos de trabajo" pasa de 3 a 7 hojas (§8); sin cambios en su UI de botones (Plantilla/Descargar actual/Importar ya sirven tal cual). Si se decide construir §9, se agrega el bloque de administración nuevo. |
| `erp-backend` | `TipoTrabajo` extendido (`codigoTipo`, `condicionesNoAplicables`, `sugerencias`); colección nueva `CatalogoTransversal`; `importExportController.js` extendido a 7 hojas; sin cambios en `OT.js` (§3.4). |

---

## 12. Consideraciones de uso táctil

Se mantienen las de la primera versión de este documento, con una corrección de cita: el
objetivo táctil mínimo documentado para la PWA Operativa es **44×44px**
(`docs/estrategia-movil.md`, línea ~122: *"un objetivo táctil mínimo de 44×44px en cualquier
control interactivo"*) — la primera versión de este documento citaba 48px de un documento de
diseño (`design_handoff_pwa_movil`) que no se pudo verificar en esta revisión; se usa el valor
confirmado en `estrategia-movil.md`.

Lo nuevo de este documento (listas transversales con sugerencias premarcadas, agrupación por
categoría) no agrega ninguna consideración táctil distinta a las ya documentadas — sigue siendo
la misma hoja inferior con casillas de toque de siempre (§6), solo que a veces ya viene con
algunas marcadas. La agrupación por categoría de `tareasSecundarias` es, en términos de
interacción táctil, un subtítulo más dentro de la misma lista de casillas — no un componente
nuevo.

---

## 13. Fases de implementación

Dado que buena parte de la Fase A/B/D de la primera versión ya está construida (catálogo
`TipoTrabajo` básico, motor de sugerencia, motor de texto, "lienzo en blanco" en PWA, fotos,
casos no cubiertos), las fases de esta versión son más chicas y se enfocan en lo que agrega el
catálogo nuevo.

**Fase A' — Modelo de datos y carga del catálogo nuevo.** Extender `TipoTrabajo`
(`codigoTipo`, `condicionesNoAplicables`, `sugerencias`), crear `CatalogoTransversal`, extender
el importador/exportador a 7 hojas (§8). **Entregable verificable**: importar
`plantilla_tipos_trabajo.xlsx` tal cual (los 30 tipos reales) y confirmar contra la API que
quedaron los 30 `TipoTrabajo`, las 9 `CatalogoTransversal` con sus valores, y las sugerencias
correctas por tipo.

**Fase B' — Extensión del motor de texto en pantalla.** Resolver claves contra
`CatalogoTransversal` además de contra campos propios (§5); precarga de sugerencias premarcadas
(§6); agrupación por categoría de `tareasSecundarias`; la segunda pasada de "omitir oración
completa sin valor" al generar el texto final (§5, pendiente de confirmación sobre el criterio
exacto). **Entregable verificable**: elegir "Cambio de bomba" contra el catálogo real
importado en la Fase A' y ver el texto completo con sugerencias premarcadas ya llenas, listas
en blanco tocables para lo que falta, y ninguna oración colgando en el texto final guardado.

**Fase C' (opcional, ver §9) — Pantalla de administración.** Solo si se confirma que hace
falta más allá del ciclo por Excel. Sin entregable obligatorio de esta fase.

**Fase D' — Decisión sobre `TratamientoScreen`.** Resolver la pregunta de §1/§Supuestos:
conectar `erp-web/src/screens/EditorHallazgo.jsx` (ya construido, hoy sin uso) a la pestaña "0 ·
Informe Inicial", o confirmar que el informe sigue siendo exclusivo de terreno y dar de baja ese
archivo. No depende de A'/B' para decidirse, aunque si la respuesta es "conectarlo", sí depende
de que A'/B' ya estén hechas (para que el componente de escritorio también entienda catálogos
transversales).

Orden sugerido: A' primero (es la base de datos). B' depende de A'. C' y D' son independientes
entre sí y pueden ir en paralelo con B' una vez A' esté lista, aunque ambas son decisiones
pendientes de confirmación antes de construirse (§9 y §1).

---

## 14. Ruta de extensión futura (breve, no implementada en esta fase)

Sin cambios respecto a la primera versión de este documento:

- **Informes de Ejecución**: mismo catálogo, mismo motor de texto y de sugerencia, reutilizados
  para describir lo que efectivamente se hizo (no solo lo observado), probablemente con una
  `plantillaTexto` distinta por tipo para la etapa de ejecución.
- **Formulario de solicitud del cliente**: una versión reducida y pública del mismo buscador,
  sin campos técnicos.
- **Asistencia con IA para completar el catálogo**: el registro de casos no cubiertos (§10) es
  el insumo natural para esto — no se integra ninguna llamada a IA en esta fase.

---

## Supuestos, contradicciones y preguntas pendientes

**Heredadas de la primera versión, aún abiertas:**

1. Si una tarea vinculada a un hallazgo se edita directamente desde el editor de tareas de
   siempre (no desde el hallazgo), ¿esa edición corta la sincronización desde ese punto en
   adelante, o se sobrescribe la próxima vez que el hallazgo cambie? (§3.4.1 de la primera
   versión — sigue sin resolverse, es un detalle de comportamiento, no de modelo).

**Nuevas de esta versión:**

2. **§0 — las 6 filas de "Sugerencias por tipo" con el valor entre paréntesis para
   `obrasCiviles`**: ¿se descartan silenciosamente al importar (propuesta de este documento,
   por ser redundantes con la presencia del marcador en la plantilla), o se importan igual y
   simplemente nunca se muestran como sugerencia? Cualquiera de las dos es compatible con el
   resto del diseño.
3. **§1 — `erp-web/src/screens/EditorHallazgo.jsx` existe pero no se usa.** ¿Se conecta a
   `TratamientoScreen` (retomando la decisión de la primera versión de este documento, que daba
   esto por confirmado pero nunca se implementó), o se confirma que el Informe de Evaluación
   sigue siendo exclusivo de terreno y ese archivo se da de baja? Es la pregunta abierta de
   mayor impacto de este documento — cambia si hace falta trabajo en escritorio en esta fase o
   no.
4. **§5 — contradicción real entre el requisito del Excel ("toda oración sin valor se omite
   completa") y el diseño ya construido** (que muestra el hueco pendiente resaltado dentro de
   la oración, sin omitirla, mientras se completa el formulario). Propuesta de este documento:
   aplicar la omisión completa solo al generar el texto final guardado, no en la vista previa
   interactiva — pendiente de confirmar, junto con el criterio exacto para detectar el límite
   de una oración (¿el punto seguido basta?).
5. **§3.3.1 — el booleano `porDefecto`** no se modela porque el archivo real nunca lo usa en
   `No` para un valor real (solo para el marcador especial de la pregunta 2). Si se anticipa
   necesitarlo pronto (sugerencias mostradas pero no premarcadas), conviene decidirlo ahora
   antes de implementar el modelo de datos, no después.
6. **§8.2 — la plantilla de ejemplo para descargar** (`plantillaTiposTrabajo`): ¿se actualiza a
   un ejemplo con el modelo de dos niveles, o se reemplaza directamente por el catálogo real de
   30 tipos como plantilla de partida?
7. **§9 — si vale la pena construir la pantalla de administración puntual**, dado que ya pasó
   una fase entera sin que se hiciera y el ciclo por Excel parece estar cubriendo la necesidad
   real hasta ahora.

**Sin contradicciones nuevas detectadas** respecto a `funcionalidades-v2.md` más allá de la ya
documentada en la primera versión (el bloqueo de "0 · Informe Inicial" hasta estar completo, que
convive sin problema con que un hallazgo individual pueda quedar como caso no cubierto).
