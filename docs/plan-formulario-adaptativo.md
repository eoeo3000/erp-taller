# Plan — Formulario adaptativo con catálogo de tipos de trabajo (Informes de Evaluación)

Documento de planificación, sin código. Cubre solo el Informe de Evaluación (Gap 1 de
[funcionalidades-v2.md](funcionalidades-v2.md)) — quedan fuera de esta fase los Informes de
Ejecución, el formulario de solicitud del cliente, y cualquier generación automática del
catálogo con IA (ver §13 para la ruta de extensión futura).

Convención de este documento: cuando algo ya existe y se verificó leyendo el código, se dice
en presente y se cita el archivo. Cuando se propone algo nuevo, se dice en futuro/condicional.
Las ambigüedades quedan marcadas como **Requiere confirmación**.

---

## 1. Diagnóstico del Informe de Evaluación actual

El Informe de Evaluación **ya existe**, pero como dos implementaciones separadas y con
alcance distinto — un hallazgo importante para lo que sigue, porque el formulario adaptativo
tendría que vivir principalmente en la que hoy es más pobre.

**En el escritorio** (`erp-web/src/screens/TratamientoScreen.jsx`), es la pestaña **"0 ·
Informe Inicial"**, la primera del flujo de Tratamiento, y bloquea el acceso a "1 · Tareas" y
las pestañas siguientes hasta marcarse `completo` (con la excepción de OTs que ya traían
contenido de antes de que existiera esta pestaña, para no exigirles completarlo en
retroactivo). Captura:

- Cuatro campos cualitativos de texto libre: fecha, responsable, condiciones del sitio,
  riesgos, metodología, recursos observados.
- Fotos del sitio (arreglo simple de URLs).
- **Tareas, componentes y logística estructurados** — los mismos tres sub-esquemas que ya
  usa `Plantilla` (descripción/puesto/duración; código/descripción/cantidad/precio/tipo;
  descripción/cantidad/unidad/precio) — con un botón "Aplicar a la OT" que los copia a los
  arreglos reales de la OT, exactamente como ya funciona "Aplicar Plantilla" hoy.

**En la PWA Operativa** (`erp-pwa-operativa/src/screens/O5_InformeEvaluacion.jsx`), es un
asistente de 4 pasos que captura **solo** los cuatro campos cualitativos (condiciones del
sitio, riesgos — con una lista de riesgos comunes seleccionables más "otro riesgo" en texto
libre —, metodología, recursos observados) más fotos. **No captura tareas, componentes ni
logística** — esa parte del modelo existe en `OT.informeEvaluacion` pero la pantalla móvil no
la usa en absoluto. En terreno, hoy solo se puede levantar la mitad cualitativa del informe.

**Consecuencia para este proyecto**: el formulario adaptativo (búsqueda por palabras clave,
campos dinámicos, texto generado) tiene sentido principalmente como una forma más rápida y
completa de llenar la parte de texto libre — hoy "condiciones del sitio" o el campo donde el
supervisor describiría "cambié la cañería de 4 pulgadas" son cuadros de texto en blanco.

**Decisión confirmada: cada hallazgo se "encasilla" directamente en una tarea.** A diferencia
de lo que este documento asumía en su primera versión, el formulario adaptativo **sí** alimenta
`informeEvaluacion.tareas[]` — un hallazgo no es un dato aparte que coexiste con las tareas, es
la forma nueva y más rica de generar cada tarea. El mecanismo exacto queda detallado en §3.4 y
§10.1: cada hallazgo mantiene sincronizada una tarea propia (descripción = texto generado,
duración tentativa si el tipo de trabajo la define), y esa tarea sigue el mismo camino que ya
existe hoy ("Aplicar a la OT") sin cambios en ese último paso.

---

## 2. Decisión sobre reutilizar o no el modelo `Plantilla`

**Decisión: no se reutiliza ni se extiende `Plantilla`. Se crea un modelo nuevo.**

`Plantilla` (`erp-backend/src/models/Plantilla.js`) es un **paquete de trabajo ya armado**:
un conjunto concreto de tareas, componentes y logística que el Planificador aplica de una vez
a una OT ("este tipo de trabajo típicamente lleva estas 5 tareas y estos 3 materiales"). Es
una entidad plana, sin campos parametrizables ni opciones por campo — se usa tal cual está
guardada.

Lo que pide este proyecto es distinto en su naturaleza: no es "qué conjunto de tareas
insertar", es "qué preguntas hacerle al supervisor sobre lo que está viendo, y cómo convertir
sus respuestas en una frase". Cada tipo de trabajo del catálogo nuevo necesita: una lista de
campos propios (no siempre los mismos: "cambio de línea" pide diámetro y material, otro tipo
de trabajo podría pedir otra cosa), opciones válidas por campo, sinónimos para que la búsqueda
lo encuentre, y una plantilla de **texto**, no de tareas. Ninguno de esos cuatro conceptos
existe en `Plantilla` hoy, y agregarlos ahí mezclaría dos responsabilidades que hoy están sanas
por estar separadas: "qué tareas insertar" (uso ya establecido de `Plantilla`, con sus propios
consumidores en `TratamientoScreen`) y "cómo redactar una observación de terreno" (lo nuevo).

Se propone un modelo separado, aquí llamado **`TipoTrabajo`** (nombre de trabajo, no de
colección — el nombre final de la colección es una decisión de implementación menor). Ver
§3.

**Extensión futura señalada, no implementada ahora**: una vez elegido un `TipoTrabajo` y
llenados sus campos, podría sugerirse opcionalmente una `Plantilla` relacionada (si existiera
un vínculo entre ambos catálogos) para acelerar además el armado de tareas/componentes. No se
diseña ni se implementa en esta fase — se deja anotado como posibilidad, igual de barata de
agregar después precisamente porque los dos modelos quedan desacoplados ahora.

---

## 3. Modelo de datos

Tres piezas de datos distintas, coherente con las "tres piezas separadas" de arquitectura del
encargo: el catálogo (configuración), el motor de texto (lógica, sin estado propio) y el
motor de sugerencia (lógica, sin estado propio). Acá se detalla solo lo que sí es dato.

### 3.1 Catálogo: `TipoTrabajo`

Colección nueva, uno por cada tipo de trabajo del catálogo ("Cambio de línea", y los que se
agreguen después).

```
TipoTrabajo
  nombre            String (requerido) — "Cambio de línea"
  sinonimos         [String] — palabras o frases alternativas para que la búsqueda lo
                    encuentre ("cañería", "tubería", "línea de proceso")
  plantillaTexto    String — la plantilla con marcadores:
                    "Cambio de línea de {diametro} {material}, {trazado}, transporta
                     {fluido}, en {planta}"
  campos            [ver 3.2] — los campos propios de este tipo, en el orden en que
                    deben mostrarse
  condicionesNoAplicables  [ObjectId ref CondicionEntorno] — condiciones del catálogo
                    transversal (§3.3) que no tiene sentido ofrecer para este tipo de
                    trabajo (ver justificación en 3.3)
  activo            Boolean, default true — para retirar un tipo del catálogo sin borrar
                    el historial de informes que ya lo usaron
```

### 3.2 Campos de un `TipoTrabajo` (sub-documento embebido, no colección aparte)

```
Campo
  clave             String — el nombre que aparece entre llaves en la plantilla de texto
                    ("diametro", "material", "planta"); debe ser único dentro del mismo
                    TipoTrabajo
  etiqueta          String — lo que ve el supervisor ("Diámetro", "Material")
  tipoDato          enum: texto | numero | seleccionUnica | seleccionMultiple | fecha | foto
  opciones          [String] — solo aplica a seleccionUnica/seleccionMultiple ("4 pulgadas",
                    "6 pulgadas", "8 pulgadas" / "inoxidable", "carbono", "PVC")
  obligatorio       Boolean — si falta, la plantilla de texto deja ese marcador visualmente
                    incompleto (ver §5) pero no bloquea guardar el informe completo
  orden             Number — posición en el formulario
```

**Por qué embebido y no colección propia**: los campos no se reutilizan entre tipos de
trabajo distintos (el campo "diámetro" de "Cambio de línea" no es el mismo objeto que un
eventual "diámetro" de otro tipo, aunque se llamen igual) y siempre se leen junto con su
`TipoTrabajo` completo, nunca sueltos — el mismo criterio que ya sigue el proyecto con los
sub-esquemas de `Plantilla` (`tareas`, `componentes`, `logistica`), que tampoco son
colecciones aparte.

### 3.3 Condiciones del entorno — catálogo transversal, no por tipo de trabajo

**Evaluación pedida**: la lista de ejemplo (pretil de ácido, polución, inundado, ambiente
ácido, a la intemperie, excavación, pretil, apertura de línea, bloqueo de línea, energizado,
alineación) describe el **lugar y las circunstancias de la faena**, no algo propio de
"cambiar una línea" en particular. Un "cambio de línea" y, por ejemplo, una reparación de
motor pueden darse igual de bien en un ambiente ácido o a la intemperie. Son transversales.

**Decisión**: catálogo propio, plano, **no anidado dentro de `TipoTrabajo`**:

```
CondicionEntorno
  nombre    String (requerido) — "Ambiente ácido"
  activo    Boolean, default true
```

Cada hallazgo capturado (ver 3.4) guarda una lista de condiciones seleccionadas de este
catálogo único, sin importar qué `TipoTrabajo` se haya elegido. Esto evita repetir la misma
lista de 11 condiciones dentro de cada tipo de trabajo del catálogo — y si mañana se agrega un
tipo de trabajo número 40, las condiciones de entorno ya existen, no hay que volver a
cargarlas.

**Decisión confirmada: sí se puede marcar una condición como "no aplica" para cierto tipo de
trabajo.** Se modela como una lista de exclusión, no de inclusión: por defecto todas las
condiciones del catálogo transversal están disponibles para todos los tipos de trabajo (así el
catálogo de condiciones no hay que volver a asociarlo tipo por tipo), y cada `TipoTrabajo`
guarda solo las que decide **excluir** (`condicionesNoAplicables`, §3.1) — una lista casi
siempre corta, más cómoda de mantener que tener que marcar manualmente qué condiciones sí
aplican en cada uno de los tipos de trabajo del catálogo. En la pantalla/formulario, al elegir
un tipo de trabajo, la lista de condiciones de entorno que se ofrece es el catálogo completo
menos las excluidas por ese tipo.

### 3.4 Dato capturado: `hallazgos[]` dentro de `OT.informeEvaluacion`

Una visita de evaluación puede levantar más de una observación (dos tramos de cañería
distintos, un motor y una línea). Se agrega un arreglo nuevo al esquema ya existente de
`OT.informeEvaluacion` — **aditivo**, no reemplaza nada de lo que ya hay ahí (`condicionesSitio`,
`riesgos`, `metodologia`, `recursosObservados`, `tareas`, `componentes`, `logistica` siguen
existiendo tal cual):

```
OT.informeEvaluacion.hallazgos[]
  tipoTrabajoId          ObjectId ref TipoTrabajo, opcional — vacío si el supervisor nunca
                         eligió un tipo del catálogo (ver "caso no cubierto", §9)
  valores                Objeto libre clave -> valor, una entrada por cada campo.clave del
                         TipoTrabajo elegido (o vacío si no hay tipo elegido)
  condicionesEntorno     [ObjectId ref CondicionEntorno]
  textoGenerado          String — lo que produce el motor de texto a partir de la plantilla
                         y los valores; se recalcula solo mientras textoEditadoManualmente
                         sea false (ver §5, y la función de deshacer más abajo)
  textoDescriptivo       String — el texto final vigente (igual a textoGenerado mientras no
                         se edite a mano; distinto una vez editado)
  textoEditadoManualmente Boolean, default false — ver §5
  fotos                  [String] — URLs de archivo, nunca base64 (ver §6)
  casoNoCubierto         Boolean, default false — ver §9
  tareaVinculadaId       String — id del sub-documento de `informeEvaluacion.tareas[]` que
                         este hallazgo mantiene sincronizado (ver 3.4.1)
  fecha                  Date, default ahora
```

**Por qué embebido en la OT y no colección propia**: mismo criterio que ya usa el resto de
`informeEvaluacion` y que `Plantilla`/`OT.tareas` — es información que solo tiene sentido
leída junto con la OT a la que pertenece, no se consulta suelta desde ningún otro lugar del
sistema salvo el listado de "casos no cubiertos" (§9), que puede recorrer todas las OT
igualmente bien con una consulta filtrando por el campo anidado.

### 3.4.1 Sincronización hallazgo → tarea

**Decisión confirmada**: cada hallazgo mantiene sincronizada una fila propia en
`informeEvaluacion.tareas[]` (el mismo arreglo que ya existe y que el botón "Aplicar a la OT"
ya copia a `OT.tareas[]`, sin cambios en ese último paso):

- Al crear un hallazgo, se agrega una tarea nueva con `descripcion = textoDescriptivo` y
  `duracion` tomada de `valores.duracionTentativa` si el tipo de trabajo elegido define un
  campo con esa clave (como en el ejemplo de "Cambio de línea", §7) — o `0` si no hay ese dato.
  El `_id` de esa tarea queda guardado en `hallazgo.tareaVinculadaId`.
- Mientras el hallazgo no se edite manualmente en su texto (§5), cualquier cambio en los
  campos que cambie `textoDescriptivo` actualiza también la `descripcion` de su tarea
  vinculada.
- **Eliminar un hallazgo elimina también su tarea vinculada** (no quedan tareas huérfanas sin
  hallazgo de origen). Fecha, hora, operario y puesto de la tarea se siguen completando aparte,
  igual que hoy — el hallazgo nunca los toca, solo la descripción y, cuando aplica, la
  duración tentativa.
- Una tarea agregada directamente en el editor de tareas de siempre (sin pasar por un
  hallazgo) simplemente no tiene `tareaVinculadaId` — convive sin problema con las que sí vienen
  de un hallazgo; no todas las tareas del informe tienen por qué nacer de un hallazgo.

**Requiere confirmación**: qué pasa si alguien edita directamente la `descripcion` de una
tarea vinculada desde el editor de tareas de siempre (no desde el hallazgo) — este documento
no resuelve si esa edición manual debe "ganarle" a la sincronización automática del hallazgo
(dejando de sincronizarse desde ahí, similar a como una edición manual del texto corta la
sincronización en §5) o si debe sobrescribirse la próxima vez que el hallazgo cambie. Se marca
como un detalle a resolver en la fase de implementación, no como una decisión de modelo de
datos — cualquiera de las dos opciones usa el mismo esquema de arriba.

---

## 4. Motor de sugerencia por palabras clave

**Objetivo**: instantáneo (sin esperar al servidor mientras se escribe) y sin dependencias
externas nuevas — nada de librerías de búsqueda difusa ni servicios de terceros.

**Cómo funciona**: el catálogo completo de `TipoTrabajo` (con sus nombres y sinónimos) se trae
una sola vez al abrir el informe — es un catálogo chico (decenas a un par de cientos de
entradas, no miles), del mismo orden de magnitud que `Puestos` o `Plantillas`, que el sistema
ya maneja hoy completos en memoria sin problema.

1. **Normalización**: tanto el texto que escribe el supervisor como el nombre/sinónimos de
   cada tipo de trabajo se pasan a minúscula y sin tildes, y se separan en palabras sueltas
   (tokens).
2. **Puntaje por coincidencia**: por cada tipo de trabajo, se cuenta cuántas palabras del
   texto escrito aparecen entre sus palabras de nombre+sinónimos **y también entre las
   opciones de sus campos** (decisión confirmada: sí se busca ahí también — así, escribir
   "inoxidable" sugiere "Cambio de línea" porque "inoxidable" es una opción del campo material
   de ese tipo, aunque la palabra no esté en su nombre ni en sus sinónimos). Una coincidencia
   en nombre/sinónimos vale más que una coincidencia dentro de una opción de campo (el nombre
   del tipo de trabajo es la señal más directa; una opción de campo es un indicio más indirecto
   y varios tipos de trabajo distintos podrían compartir la misma opción, por ejemplo
   "inoxidable" en más de un tipo). Coincidencia de palabra completa vale más que una
   coincidencia parcial, para que "línea" no dispare cualquier tipo de trabajo que contenga
   esas letras en otra palabra.
3. **Orden de resultados**: de mayor a menor puntaje; empate se resuelve alfabéticamente.
4. **Umbral**: se muestran hasta 5 sugerencias con puntaje mayor a cero. Se corta ahí para no
   saturar la pantalla en un teléfono.
5. **Sin coincidencias**: si ninguna palabra escrita coincide con ningún tipo de trabajo del
   catálogo, no se muestra lista de sugerencias — se invita a seguir en texto libre
   directamente (ver §9, ahí se marca automáticamente como caso no cubierto si se guarda así).

Este cálculo puede vivir enteramente en el navegador/teléfono, sobre el catálogo ya
descargado — no necesita ida y vuelta al servidor mientras el supervisor escribe, que es lo
que hace que se sienta instantáneo incluso con mala señal en terreno.

---

## 5. Motor de texto adaptativo

Un único renderizador, sin variantes por tipo de trabajo — lee la plantilla de texto del
`TipoTrabajo` elegido y los valores ya capturados, y hace dos cosas: producir el texto final
completo, y producir la misma información dividida en **segmentos** para que la pantalla
pueda pintar cada valor de forma distinta al texto fijo.

**Parseo de la plantilla**: la plantilla ("Cambio de línea de {diametro} {material},
{trazado}, transporta {fluido}, en {planta}") se recorre una sola vez identificando los
tramos entre marcadores `{clave}` como texto literal, y cada `{clave}` como un segmento de
valor que debe resolverse contra `valores[clave]`.

**Renderizado de valores interactivos**: cada segmento de valor se reemplaza por el valor ya
capturado si existe, o por un marcador visual de "pendiente" si el campo todavía no se llenó
(por ejemplo, subrayado vacío) — sin bloquear la vista previa por campos incompletos, para que
el supervisor vea cómo va quedando el texto a medida que completa el formulario, no solo al
final. La pantalla pinta cada segmento de valor de forma distinguible del texto fijo (por
ejemplo, con un fondo o subrayado propio — la decisión visual exacta es de diseño, no de este
documento) y lo hace tocable: tocar un segmento de valor abre el mismo selector que ese campo
tiene en el formulario (lista de opciones, o el teclado si es texto/número), y al elegir, el
texto se vuelve a generar con el nuevo valor en su lugar — sin que el supervisor tenga que ir
a buscar el campo en el formulario de más arriba.

**Edición manual del texto**: el supervisor puede tocar el texto y escribir libremente
(agregar una frase que los campos no cubren, corregir redacción). En el momento en que edita
el texto de forma libre (no a través de tocar un segmento de valor y elegir una opción), se
marca `textoEditadoManualmente = true` para ese hallazgo y **desde ahí en adelante el texto
deja de regenerarse automáticamente cuando cambian los campos** — los segmentos de valor
interactivos también dejan de resaltarse, porque una vez que el supervisor edita libremente ya
no hay forma confiable de saber qué parte del texto sigue representando cuál campo. Es una
decisión deliberada de simplicidad: intentar mantener sincronizados un texto editado a mano y
un conjunto de campos estructurados es una fuente conocida de errores sutiles (el texto dice
una cosa, el campo guarda otra) — se prefiere que la persona elija un modo u otro para ese
hallazgo puntual, no los dos a la vez. Los valores de los campos capturados **no se pierden**
al activarse `textoEditadoManualmente` — quedan guardados igual en `valores`, solo que el texto
ya no se recalcula desde ellos.

**Decisión confirmada — función "Deshacer edición"**: se agrega un botón que descarta lo
escrito a mano y vuelve a generar el texto desde `plantillaTexto` + `valores` (que nunca se
pierden mientras el hallazgo exista), volviendo `textoEditadoManualmente` a `false` y
reactivando los segmentos interactivos. Aparece solo cuando `textoEditadoManualmente` es
`true` — mientras el texto sigue generado por plantilla, no hay nada que deshacer.

**Decisión confirmada — eliminar un hallazgo**: cualquier hallazgo se puede eliminar por
completo desde la misma pantalla donde se creó (mobile o escritorio, ver §10). Al eliminarlo,
se elimina también su tarea vinculada (§3.4.1) — no es una eliminación parcial de un lado
solamente.

---

## 6. Manejo de fotos — cumpliendo el requisito crítico

**Regla, sin excepción**: toda foto de un hallazgo se comprime en el cliente antes de subir y
se guarda como archivo real en disco, nunca como texto base64 dentro del documento de la OT.
El proyecto ya tiene exactamente este patrón funcionando para otro flujo — `subirFoto` /
`subirDataURL` en `erp-pwa-operativa/src/api.js`, más el endpoint `POST /api/uploads/foto`
(`erp-backend/src/routes/uploadRoutes.js`) — construido después de un incidente real idéntico
en espíritu al que describe `docs/bugs-conocidos.md`: una sola foto guardada como base64
dentro del documento de una OT hacía que **cualquier** consulta que trajera esa OT completa
(no solo la pantalla del informe) tardara varios segundos, medido directamente contra la base
de datos.

**Para este proyecto**: `fotos` en cada hallazgo (§3.4) es un arreglo de URLs, del mismo tipo
que ya produce `subirFoto`. No se propone ningún mecanismo nuevo de subida — se reutiliza el
que ya existe, tal cual, en el mismo punto donde hoy el supervisor agrega fotos en la PWA
(`agregarFotoSitio` de `O5_InformeEvaluacion.jsx` ya sigue este patrón para las fotos generales
del informe; los hallazgos usan el mismo mecanismo para sus propias fotos).

**Fotos referencial y "de lo esperado"**: la lista de campos de ejemplo para "Cambio de línea"
incluye dos campos de tipo foto ("foto referencial del estado actual", "foto de lo esperado").
Se modelan como dos `campo` más de `tipoDato: foto` dentro del `TipoTrabajo` — cada uno guarda
una URL (no un arreglo, a diferencia de `hallazgo.fotos` que sí es un arreglo para fotos
libres/adicionales). Mismo mecanismo de subida, mismo requisito: nunca base64.

---

## 7. Estructura del Excel para importar/exportar el catálogo

Carga vía Importar/Exportar como vía principal de esta fase — no hay generación automática
dentro de la aplicación (eso es responsabilidad de una eventual fase de IA, fuera de alcance,
ver §13).

Un `TipoTrabajo` tiene una relación uno-a-muchos con sus campos, y cada campo tiene una
relación uno-a-muchos con sus opciones — no cabe cómodo en una sola hoja plana sin repetir
muchísimas celdas o inventar una sintaxis de "opciones separadas por punto y coma" difícil de
editar a mano. Se proponen **tres hojas**, unidas por una columna de código de tipo de trabajo
en común (no un ObjectId de Mongo, que no es algo cómodo de escribir a mano en Excel — un
código de texto corto, legible, que la persona que arma el Excel define ella misma):

### Hoja 1 — "Tipos de trabajo"

Una fila por tipo de trabajo.

| codigoTipo | nombre | sinonimos | plantillaTexto | condicionesNoAplicables |
|---|---|---|---|---|
| CAMBIO_LINEA | Cambio de línea | cañería, tubería, línea de proceso | Cambio de línea de {diametro} {material}, {trazado}, transporta {fluido}, en {planta} | Energizado |

- `codigoTipo`: identificador corto en mayúsculas, sin espacios (igual criterio que ya usa el
  proyecto para `codigo` de `Suministro`/`EquiposHerramientas`) — es la clave que las otras dos
  hojas usan para decir "este campo/esta opción es de este tipo de trabajo".
- `condicionesNoAplicables`: opcional, una celda con los nombres de condiciones de entorno
  (Hoja 4) que no tiene sentido ofrecer para este tipo de trabajo, separados por coma — vacío
  significa que las 11 condiciones del catálogo transversal quedan todas disponibles (ver
  §3.3).
- `sinonimos`: una sola celda, palabras separadas por coma — más cómodo de escribir a mano que
  una hoja aparte solo para sinónimos, y la cantidad de sinónimos por tipo es pequeña (unas
  pocas palabras, no una lista larga).
- `plantillaTexto`: el texto con los marcadores `{clave}` tal cual se van a definir en la Hoja
  2 — se arma mirando ambas hojas a la vez, por eso importa que las claves coincidan
  exactamente entre las dos.

### Hoja 2 — "Campos"

Una fila por campo de cada tipo de trabajo (varias filas por cada fila de la Hoja 1).

| codigoTipo | clave | etiqueta | tipoDato | obligatorio | orden |
|---|---|---|---|---|---|
| CAMBIO_LINEA | diametro | Diámetro | seleccionUnica | Sí | 1 |
| CAMBIO_LINEA | material | Material | seleccionUnica | Sí | 2 |
| CAMBIO_LINEA | trazado | Trazado | seleccionUnica | No | 3 |
| CAMBIO_LINEA | fluido | Fluido que transporta | seleccionUnica | Sí | 4 |
| CAMBIO_LINEA | planta | Área o planta | texto | Sí | 5 |
| CAMBIO_LINEA | equipoReferencial | Equipo referencial | texto | No | 6 |
| CAMBIO_LINEA | fechaTentativa | Fecha de ejecución tentativa | fecha | No | 7 |
| CAMBIO_LINEA | duracionTentativa | Duración tentativa | numero | No | 8 |
| CAMBIO_LINEA | fotoActual | Foto referencial del estado actual | foto | No | 9 |
| CAMBIO_LINEA | fotoEsperada | Foto de lo esperado | foto | No | 10 |

`tipoDato` es texto libre en la celda, pero solo se aceptan los seis valores del §3.2 — el
importador rechaza (con el mismo reporte de fila+error que ya usa el resto de importaciones
del sistema, ver `resultado.errores` en `ImportExportScreen.jsx`) cualquier fila con un
`tipoDato` no reconocido.

### Hoja 3 — "Opciones"

Una fila por cada opción válida de cada campo de tipo `seleccionUnica`/`seleccionMultiple`
(no aplica a campos de texto/número/fecha/foto, que no tienen opciones fijas).

| codigoTipo | clave | opcion |
|---|---|---|
| CAMBIO_LINEA | diametro | 2 pulgadas |
| CAMBIO_LINEA | diametro | 4 pulgadas |
| CAMBIO_LINEA | diametro | 6 pulgadas |
| CAMBIO_LINEA | material | inoxidable |
| CAMBIO_LINEA | material | carbono |
| CAMBIO_LINEA | material | PVC |
| CAMBIO_LINEA | trazado | línea recta |
| CAMBIO_LINEA | trazado | con codos |
| CAMBIO_LINEA | fluido | agua |
| CAMBIO_LINEA | fluido | ácido |
| CAMBIO_LINEA | fluido | vapor |

**Por qué tres hojas y no una por conveniencia de llenado**: quien arma el catálogo fuera del
sistema piensa naturalmente "estos son mis tipos de trabajo" (hoja 1), "estos son los campos de
cada uno" (hoja 2, unas pocas filas repetibles por copiar/pegar) y "estas son las opciones de
cada campo" (hoja 3, la más larga, pero la más mecánica de llenar — es la típica lista donde
Excel permite pegar una columna larga sin pensar en estructura). Separarlas así evita celdas
gigantes con listas incrustadas y facilita el copiar/pegar masivo en la hoja 3, que es la que
más crece.

**Hoja 4 — "Condiciones de entorno"** (referenciada desde la columna `condicionesNoAplicables`
de la Hoja 1), una fila por condición, para cargar el catálogo del §3.3 con el mismo
mecanismo:

| nombre |
|---|
| Pretil de ácido |
| Polución |
| Inundado |
| Ambiente ácido |
| A la intemperie |
| Excavación |
| Apertura de línea |
| Bloqueo de línea |
| Energizado |
| Alineación |

**Comportamiento de importación** (mismo patrón que el resto del sistema, `importExportController.js`):
si `codigoTipo` ya existe, se actualiza (upsert) — igual que hoy `Suministro`/`Puesto` por
`codigo`/`nombre`; nunca crea duplicados por reimportar el mismo archivo corregido. Filas con
error (por ejemplo, una fila de Hoja 2 que referencia un `codigoTipo` que no existe en Hoja 1,
o un `tipoDato` no reconocido) se omiten y se listan en el reporte, sin detener el resto de la
importación — mismo comportamiento que ya tienen todos los módulos actuales.

**Exportación**: mismo criterio — un archivo con las tres (o cuatro, si se incluyen
condiciones de entorno) hojas, generado desde el catálogo actual, que sirve tanto para respaldo
como para partir de una base ya cargada al armar el próximo lote de tipos de trabajo nuevos.

---

## 8. Pantalla de administración del catálogo

Complementaria a la carga masiva — para ediciones puntuales sin tener que rearmar y resubir un
Excel completo por, por ejemplo, agregar una sola opción nueva a un campo existente.

**Decisión confirmada: vive dentro de `ImportExportScreen.jsx`**, no en `RecursosScreen.jsx`
como se había propuesto en la primera versión de este documento — junto a los bloques que ya
existen ahí (Entorno de trabajo, Uso de disco, Juego de demostración, Exportar, Importar). Tiene
sentido de todos modos: el catálogo se alimenta principalmente por Excel (§7), así que la
edición puntual queda al lado de donde ya se hace la carga masiva, no en una pantalla aparte
que la persona tendría que ir a buscar. Se agrega como un bloque nuevo de esa misma pantalla,
con el mismo estilo visual que los bloques ya existentes (`styles.bloque` en el archivo actual).

Contenido del bloque:

- Lista de tipos de trabajo del catálogo (nombre, cantidad de campos, activo/inactivo).
- Formulario de edición de un tipo: nombre, sinónimos, plantilla de texto, condiciones de
  entorno no aplicables (§3.3), y una lista editable de sus campos (agregar/quitar campo, y
  por cada campo de tipo selección, agregar/quitar opciones) — un formulario anidado, del
  mismo orden de complejidad que ya maneja `TratamientoScreen` para editar tareas/componentes
  de un informe.
- Una sub-sección separada para el catálogo de condiciones de entorno (lista simple, sin
  campos ni opciones anidadas — es solo nombre + activo).
- La lista de **casos no cubiertos** (ver §9) vive aquí también, como su propia sub-sección,
  para que quien administra el catálogo tenga en un solo lugar tanto el catálogo como la señal
  de qué le falta cubrir.

**Decisión confirmada: sin control de acceso diferenciado.** Consistente con que el resto del
sistema no tiene modelo de permisos (Contradicción 1 de `funcionalidades-v2.md`), cualquiera
con acceso a `ImportExportScreen` puede editar el catálogo — sin un rol especial de
"administrador de catálogo".

---

## 9. Registro de casos no cubiertos

**Cuándo se marca**: un hallazgo queda `casoNoCubierto = true` en cualquiera de estos dos
casos, sin que el supervisor tenga que marcarlo a mano ni el sistema lo bloquee:

1. El supervisor escribió texto y guardó el hallazgo **sin haber elegido ningún tipo de
   trabajo del catálogo** (`tipoTrabajoId` queda vacío) — típicamente porque el motor de
   sugerencia no encontró coincidencias, o porque el supervisor decidió no usar ninguna de las
   sugeridas.
2. El supervisor eligió un tipo de trabajo del catálogo, pero **editó el texto generado a
   mano** (`textoEditadoManualmente = true`, ver §5) — señal de que la plantilla no alcanzó a
   describir del todo lo que vio, aunque el tipo elegido fuera el correcto.

En ambos casos, el informe **se guarda igual, completo, sin ningún bloqueo** — el requisito es
explícito: "sin bloqueo en terreno, sin automatismo". La marca es puramente informativa para
quien administra el catálogo.

**Dónde se revisa**: en la sub-sección de "Casos no cubiertos" de la pantalla de
administración del catálogo (§8), un listado con: OT/número, fecha, el texto que escribió el
supervisor (o el texto final si eligió un tipo y lo editó), y si tenía o no un tipo de trabajo
asociado. Quien administra el catálogo lee esos casos y decide si conviene agregar un tipo de
trabajo nuevo, una opción nueva a un campo existente, o un sinónimo nuevo — la decisión y la
carga siguen siendo manuales, vía la misma pantalla de administración o vía un nuevo lote de
Excel.

**Sin automatismo real, para que quede explícito**: el sistema no intenta adivinar a qué tipo
de trabajo podría corresponder un caso no cubierto, no propone sinónimos nuevos, no agrupa
casos similares entre sí. Es una lista plana para lectura humana. Cualquier inteligencia sobre
esos datos es exactamente lo que se deja para la extensión futura de IA (§13).

---

## 10. Impacto en pantallas existentes

| Pantalla | Cambio |
|---|---|
| `O5_InformeEvaluacion.jsx` (PWA Operativa) | Uso principal del formulario adaptativo — nueva sección/paso para agregar hallazgos: buscador con sugerencias, formulario de campos dinámico según el tipo elegido, vista previa de texto interactiva, fotos por hallazgo. Los 4 pasos cualitativos existentes (condiciones del sitio, riesgos, metodología, recursos observados) **no se tocan** — siguen como narrativa general de la visita, independiente de los hallazgos puntuales. |
| `TratamientoScreen.jsx` (escritorio, pestaña "0 · Informe Inicial") | Se agrega una sección **editable** (no solo de lectura — ver decisión abajo) con la misma lista de hallazgos que ya capturó el supervisor: buscador, campos dinámicos y texto interactivo, igual que en el teléfono — el Planificador puede agregar, corregir o eliminar un hallazgo desde el escritorio, no solo verlo. La sección de tareas/componentes/logística estructurados ya existente **no cambia** en esta fase, más allá de que las tareas que nacen de un hallazgo (§3.4.1) ahora también pueden aparecer ahí. |
| `ImportExportScreen.jsx` | Nuevo módulo en las listas de Exportar e Importar ("Catálogo de tipos de trabajo", plantilla de 3-4 hojas, §7), más el bloque de administración puntual del catálogo (§8) y la lista de casos no cubiertos (§9), todo en la misma pantalla. |
| `erp-backend` | Modelos nuevos `TipoTrabajo` y `CondicionEntorno`; extensión de `OT.informeEvaluacion` con `hallazgos[]` y de `tareas[]` con `tareaVinculadaId`/su contraparte; rutas de catálogo (CRUD), importación/exportación del catálogo, y consulta de casos no cubiertos. |

**Decisión confirmada: los hallazgos se pueden editar desde escritorio.** Se descarta la idea
de que `TratamientoScreen` solo muestre los hallazgos en modo lectura — el mismo componente de
formulario adaptativo (buscador + campos + texto interactivo) se reutiliza en escritorio y en
la PWA, ya que la lógica (motores de §4 y §5) no depende de la pantalla donde corre. El
Planificador puede así completar en oficina un hallazgo que el supervisor dejó a medias, o
corregir uno antes de aplicar el informe a la OT.

---

## 11. Consideraciones de uso táctil

El supervisor usa esto en terreno, en un teléfono, muchas veces con guantes o sol directo
sobre la pantalla (mismas condiciones físicas ya documentadas en `estrategia-movil.md` para el
resto de la PWA Operativa) — el texto con valores interactivos es la parte más delicada de
construir bien, porque mezcla lectura de texto corrido con objetivos táctiles precisos.

- **Cada segmento de valor es un objetivo táctil generoso**, no un enlace de texto plano: se
  pinta como un pequeño bloque con relleno propio (padding), no solo una palabra subrayada —
  el ancho lo da el propio texto, pero el alto debe acercarse al objetivo táctil mínimo que ya
  usa el resto de la PWA (48 px, ver `docs/rediseno/design_handoff_pwa_movil`), no el alto de
  una línea de texto normal.
- **El selector se abre como hoja inferior, no como un menú flotante pequeño** junto al texto
  tocado — mismo patrón que ya usa esta misma PWA para elegir una semana en S2 (input nativo
  de fecha) o para agendar una visita en S4 (hoja inferior). Un menú angosto pegado al punto
  exacto donde se tocó es difícil de acertar con el dedo y peor con guantes.
- **El buscador de tipos de trabajo usa el teclado nativo del teléfono**, sin autocompletado
  agresivo que tape la lista de sugerencias — las sugerencias aparecen debajo del campo de
  texto, en una lista de filas altas (mismo alto de fila que ya usa el resto de la PWA para
  listas táctiles), no como una grilla compacta.
- **Los campos de selección múltiple (condiciones de entorno) son casillas de toque, no un
  `<select multiple>` nativo** — los `<select multiple>` son notoriamente difíciles de usar en
  móvil; se prefieren filas con casilla, mismo patrón ya usado en O5 para la lista de riesgos
  comunes.
- **La vista previa del texto se actualiza sin recargar la pantalla ni perder la posición de
  scroll** — importante porque el supervisor puede estar completando varios hallazgos uno
  tras otro; perder el lugar en la pantalla cada vez que cambia un campo sería una fricción
  real en el uso repetido.

---

## 12. Fases de implementación

Cada fase entrega algo usable o verificable por sí sola, sin depender de que la fase siguiente
ya exista.

**Fase A — Modelo de datos y carga del catálogo.** `TipoTrabajo`, `CondicionEntorno`,
extensión de `OT.informeEvaluacion` con `hallazgos[]`. Endpoints de importación/exportación de
catálogo (§7) y un endpoint de solo lectura para listar el catálogo. **Entregable
verificable**: se puede cargar un catálogo real vía Excel y confirmarlo consultando la API
directamente, sin ninguna pantalla nueva todavía.

**Fase B — Motor de sugerencia y motor de texto (lógica pura).** Las dos piezas de lógica de
§4 y §5, construidas y probables con datos de ejemplo sin estar conectadas a ninguna pantalla
todavía — son funciones sin estado que reciben catálogo + texto/valores y devuelven resultado,
así que se pueden verificar con casos de prueba concretos antes de tocar ninguna interfaz.
**Entregable verificable**: dado un catálogo de ejemplo y una entrada de texto, el motor
devuelve las sugerencias esperadas; dado un tipo de trabajo y valores parciales, el motor
devuelve el texto con los segmentos correctos.

**Fase C — Bloque de administración del catálogo (`ImportExportScreen`).** CRUD de tipos de
trabajo (incluidas sus condiciones no aplicables) y condiciones de entorno, más la lista de
casos no cubiertos (todavía vacía, porque nadie ha generado hallazgos aún). **Entregable
verificable**: el catálogo se puede gestionar sin tocar Excel ni la base de datos directamente.

**Fase D — Formulario adaptativo, como componente compartido.** El flujo completo — buscar,
elegir tipo, llenar campos, ver el texto interactivo, deshacer una edición manual, eliminar un
hallazgo, agregar fotos — construido de forma que ambas pantallas de la Fase E lo reutilicen
sin duplicar lógica (solo cambia el envoltorio visual táctil vs. escritorio, ver §11).
**Entregable verificable**: un hallazgo real se puede levantar de principio a fin contra datos
de prueba, antes de decidir en qué pantalla se monta primero.

**Fase E — Integración en las dos pantallas de uso.** `O5_InformeEvaluacion` (PWA Operativa) y
la pestaña "0 · Informe Inicial" de `TratamientoScreen` (escritorio) montan el mismo
componente de la Fase D, cada una con su propio flujo de guardado. **Entregable verificable**:
un hallazgo creado en el teléfono se ve y se puede seguir editando desde el escritorio, y
viceversa.

Orden sugerido: A y B pueden avanzar en paralelo (una es datos, la otra es lógica pura sobre
datos de ejemplo). C depende de A. D depende de A y B. E depende de A, B y D.

---

## 13. Ruta de extensión futura (breve, no implementada en esta fase)

- **Informes de Ejecución**: el mismo catálogo de `TipoTrabajo`, el mismo motor de texto y el
  mismo motor de sugerencia podrían reutilizarse para describir **lo que efectivamente se
  hizo**, no solo lo observado en la evaluación — probablemente con una plantilla de texto
  distinta por tipo de trabajo para la etapa de ejecución ("Se cambió línea de {diametro}
  {material}..." en pasado, con datos reales en vez de tentativos), reutilizando el mismo
  `TipoTrabajo` como catálogo base. No se diseña el detalle acá.
- **Formulario de solicitud del cliente**: una versión reducida y de cara pública del mismo
  buscador (sin campos técnicos que el cliente no sabría llenar) podría ayudar a que la
  solicitud inicial ya venga con algo más de estructura que un texto libre, mejorando de paso
  la calidad de lo que el Planificador recibe antes incluso de la visita. Requeriría decidir
  qué subconjunto de campos tiene sentido exponer a alguien externo al taller.
- **Asistencia con IA para completar el catálogo**: el registro de casos no cubiertos (§9) es,
  sin quererlo, el insumo ideal para esto — con suficientes casos acumulados, un modelo de
  lenguaje podría sugerir tipos de trabajo nuevos, sinónimos adicionales, u opciones de campo
  que la persona a cargo del catálogo no había pensado. No se integra ninguna llamada a IA en
  esta fase; el diseño de arriba no depende de que esto exista y no se ve afectado si nunca se
  construye.

---

## Supuestos, contradicciones y preguntas pendientes

**Actualización**: las seis preguntas de la primera versión de este documento ya se
resolvieron y quedan reflejadas en el cuerpo del documento. Se listan aquí solo como registro
de qué se decidió y dónde:

1. **Tareas**: sí — cada hallazgo mantiene sincronizada una tarea propia en
   `informeEvaluacion.tareas[]` (§3.4.1).
2. **Condiciones "no aplica"**: sí — cada `TipoTrabajo` puede excluir condiciones del catálogo
   transversal (§3.1, §3.3).
3. **Búsqueda en opciones de campos**: sí — el motor de sugerencia también busca ahí, con
   menor peso que nombre/sinónimos (§4).
4. **Deshacer / eliminar**: ambas — botón "Deshacer edición" que vuelve al texto generado por
   plantilla, y eliminación completa de un hallazgo (junto con su tarea vinculada) (§5).
5. **Dónde vive la administración del catálogo**: dentro de `ImportExportScreen`, no en
   `RecursosScreen` (§8).
6. **Permisos sobre el catálogo**: ninguno diferenciado — cualquiera con acceso a la pantalla
   puede editarlo (§8).
7. **Hallazgos editables desde escritorio**: sí — el mismo componente de formulario adaptativo
   se monta tanto en la PWA como en `TratamientoScreen` (§10).

**Contradicción/tensión detectada, no resuelta**: `funcionalidades-v2.md` (Gap 1) describe el
Informe de Evaluación como algo que **bloquea** el avance a la pestaña de Tareas hasta estar
`completo` — eso ya está implementado así hoy en `TratamientoScreen`. Este documento, en
cambio, es explícito en que un hallazgo con caso no cubierto **nunca bloquea nada** en
terreno. Ambas cosas pueden convivir sin contradicción real (una es "el informe en su
conjunto debe marcarse completo para poder avanzar", la otra es "un hallazgo individual dentro
del informe puede quedar con texto libre sin tipo de trabajo asociado y aun así el informe
completo se guarda") — pero vale la pena dejarlo dicho explícitamente para que no se
interprete como que se está aflojando el bloqueo ya decidido para Gap 1.

**Pregunta pendiente nueva** (surgida al resolver la pregunta 1 de la ronda anterior — ver
§3.4.1): si una tarea vinculada a un hallazgo se edita directamente desde el editor de tareas
de siempre (no desde el hallazgo), ¿esa edición manual debe cortar la sincronización desde ese
punto en adelante (igual criterio que la edición manual del texto en §5), o debe
sobrescribirse la próxima vez que el hallazgo cambie? Es un detalle de comportamiento, no de
modelo de datos — ambas opciones usan el mismo esquema ya definido.
