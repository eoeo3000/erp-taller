# Estrategia de conexión móvil — erp-taller

Documento complementario de [funcionalidades-v2.md](funcionalidades-v2.md) (Gap 8). Describe cómo conectar a los tres usuarios que hoy usan o deberían usar el sistema desde un teléfono — Cliente, Supervisor, Ejecutor — mediante dos aplicaciones web instalables (PWA).

Convención de este documento: cuando se describe algo que **ya existe**, se cita el archivo y la función exacta. Cuando se **propone** algo nuevo, se dice en futuro. No se inventan cifras de costos, plazos ni adopción — donde hace falta comparar magnitudes se usan órdenes relativos (bajo / medio / alto) con el criterio explicado.

---

## 1. Diagnóstico del uso móvil actual

Hoy existen dos vías separadas para que alguien fuera de la oficina use el sistema desde un teléfono, y no comparten nada entre sí.

**Vía del supervisor de terreno.** Cuando el Planificador envía una OT al supervisor (`notificarSupervisor` en `TratamientoScreen.jsx`), el backend genera o reutiliza un token aleatorio (`crypto.randomBytes(20)`, 40 caracteres hexadecimales) guardado en `OT.tokenEjecucion`, arma un PDF y envía un correo por Brevo con un link a `/api/ots/:id/supervisor?token=...` (`otController.enviarAlSupervisor`). Ese link abre una página HTML servida directamente por el backend (`otController.supervisorPortal`), sin ningún bundle de React de por medio, con botones para iniciar, posponer (con motivo), marcar interrupción (con motivo), enviar un reporte con foto y comentario, y marcar el trabajo como terminado — todas esas acciones las procesa `otController.supervisorAccion`, y el único control de acceso es la comparación `ot.tokenEjecucion !== token`. Existe además un segundo flujo paralelo, más simple, que solo confirma el inicio (`otController.generarLinkEjecucion`, `iniciarEjecucion`, `confirmarEjecucion`, rutas `/api/ots/:id/generar-link-ejecucion` y `/api/ots/:id/iniciar-ejecucion`): revisando `erp-web/src` no hay ninguna referencia a esas tres funciones — hoy no lo llama ninguna pantalla del frontend. Es código que quedó operativo en el backend pero sin ningún punto de entrada real; se trata como huérfano en el resto de este documento (ver §11).

**Vía del cliente.** `PortalClienteScreen.jsx`, montada en `/portal`, es una pantalla de React ya mobile-first (barra de tabs inferior fija, `env(safe-area-inset-bottom)`, tipografía 14-16px): permite crear una solicitud (`POST /api/portal/solicitud`), buscar el estado de una por número o nombre (`GET /api/portal/buscar`, `portalController.buscar`), ver el detalle con cronograma y cotización, y una pestaña de contacto estática. No pide login: la solicitud se identifica por su `numeroSolicitud` (`SOL-2026-0001`) o buscando por nombre.

Aparte de estas dos, existe `ReporteTerreno.jsx` (`/reporte?id=`): una pantalla dentro de la misma SPA interna, que recibe `ots` y `actualizarOtGlobal` como props de `App.jsx` — es decir, para abrirla hay que cargar la aplicación completa (con todas las OTs de todos los clientes) y no tiene ningún control de acceso propio más allá de conocer la URL. Es una herramienta de uso interno, no un canal pensado para terceros.

**Qué funciona de este enfoque, y por qué se adoptó así:** cero fricción, cero cuentas que crear o recordar, cero instalación. El supervisor no necesita saber que existe una "app" — recibe un correo, toca un link, y ya está dentro. Eso es exactamente lo que hace que el sistema se haya podido usar en producción sin resolver antes un modelo de usuarios.

**Qué no escala, en cuatro problemas distintos:**

- **Un link por trabajo.** Cada OT enviada genera su propio correo con su propio link. Si un supervisor tiene cinco trabajos en la semana, tiene cinco correos con cinco links sin relación entre sí.
- **Ausencia de vista panorámica.** No existe ninguna pantalla que responda "¿qué tengo que hacer hoy?" — cada link abre exactamente una OT, nunca el conjunto de OTs de una persona.
- **Nada persiste entre trabajos.** Cerrado un link, no queda ningún rastro navegable de los trabajos anteriores salvo volver a buscar el correo original.
- **La revocación es por OT, no por persona.** El único mecanismo para invalidar un acceso es dejar de usar ese `tokenEjecucion` puntual; no existe ninguna forma de decir "esta persona ya no debe tener acceso a nada".

Al cliente hoy se lo atiende con el patrón inverso: no recibe un token por trabajo, busca activamente por número o nombre en `/portal`, sin necesidad de guardar ningún link.

---

## 2. Los tres usuarios móviles

### Cliente

Es externo a la operación. Abre el teléfono para saber si ya le llegó la cotización, en qué va su trabajo, o para pedir uno nuevo. En los primeros cinco segundos necesita ver el estado de su solicitud/OT y, si corresponde, un aviso claro de que hay una cotización esperando respuesta. Necesita: consultar estado, ver/descargar la cotización, y ocasionalmente enviar una solicitud nueva. Condiciones físicas: normales — oficina, casa, sin urgencia de manos libres. Frecuencia: baja y esporádica, concentrada alrededor de los momentos en que espera una respuesta (después de pedir, después de que le avisan que hay cotización).

### Supervisor

Es personal de la empresa (`Recurso` con `puesto` de supervisión) en terreno. Abre el teléfono al llegar a la faena y durante el día de trabajo. En los primeros cinco segundos necesita ver qué le toca hoy y en qué orden. Necesita: ver sus tareas del día/semana, iniciar/pausar/interrumpir un trabajo, y subir foto + comentario de avance. Condiciones físicas: sol directo (pantalla difícil de leer), guantes (dificulta tocar controles pequeños), a menudo una sola mano libre, señal intermitente (bodegas, subterráneos, zonas rurales), a veces casco o protección que dificulta sostener el teléfono cerca de la cara. Frecuencia: diaria mientras tiene trabajo asignado.

### Ejecutor

Hoy, según ya señala la Parte II del documento maestro, es un actor "implícito — no tiene vista propia". Es quien realiza la tarea física; hoy su trabajo lo documenta el Supervisor, no él mismo. Si se le da una vista propia, sus necesidades son un subconjunto más simple de las del Supervisor: ver su propia tarea del día, marcarla como hecha. Mismas condiciones físicas que el Supervisor. Frecuencia: diaria.

| Usuario | Dispositivo | Frecuencia | Tolerancia a fricción | Consecuencia de que falle |
|---|---|---|---|---|
| Cliente | teléfono personal, cualquier gama | baja, esporádica | media — puede reintentar más tarde sin costo operativo | pierde visibilidad, pero no bloquea el trabajo en curso |
| Supervisor | teléfono personal o de la empresa, condiciones adversas | diaria en días con trabajo asignado | muy baja — cada segundo de fricción se paga en terreno, con guantes, al sol | el trabajo se ejecuta igual, pero sin registro — se pierde trazabilidad |
| Ejecutor (propuesto) | igual que Supervisor | diaria | muy baja, igual que Supervisor | hoy no aplica: no tiene vista, así que no hay nada que falle todavía |

---

## 3. Comparación de estrategias

**A — Links por caso (statu quo).** Un token nuevo por OT, sin instalación, correo como canal único.
**B — PWA.** Aplicación web instalable, un token persistente por persona.
**C — Nativa.** Aplicación de tienda (App Store / Play Store), publicación y actualización por canal de tienda.

| Criterio | A — Links por caso | B — PWA | C — Nativa |
|---|---|---|---|
| Esfuerzo de construcción | bajo (ya existe) | medio — reutiliza la mayoría de la lógica de servidor ya escrita (`supervisorAccion`, `portalController`), construye un shell instalable nuevo | alto — dos bases de código nuevas (iOS/Android o un framework cross-platform), curva de aprendizaje distinta a lo que ya usa el equipo (React + Express) |
| Esfuerzo de mantención | bajo, pero crece linealmente con cada gap descrito en §1 | medio — un solo código fuente, mismo stack que el resto del proyecto | alto — releases de tienda, revisiones, versiones de SO a soportar |
| Tiempo hasta el primer uso real | inmediato (ya en producción) | corto — no hay tienda de por medio, se instala desde el navegador | largo — proceso de publicación y revisión de tienda |
| Experiencia de uso | limitada a una sola OT a la vez, sin navegación | cercana a una app nativa una vez instalada (ícono, pantalla completa) | la mejor posible, con acceso completo a APIs del sistema operativo |
| Capacidades del dispositivo | cámara vía `<input capture>` (ya usado hoy), sin GPS, sin notificaciones push, sin trabajo offline | cámara igual que hoy, GPS disponible, notificaciones push con matices (ver abajo), trabajo offline posible con más esfuerzo | acceso completo y sin matices a cámara, GPS, notificaciones, almacenamiento offline |
| Distribución | un link por correo | un link de instalación por correo/WhatsApp/QR, una sola vez por persona | tienda de aplicaciones, requiere que la persona la busque y decida instalarla |
| Actualizaciones | no aplica — es servidor puro | inmediatas, el usuario recibe la versión nueva al volver a abrir | dependen de que el usuario actualice desde la tienda, o de revisión antes de publicar |
| Qué se rompe al cambiar de teléfono | nada — el link sigue funcionando desde cualquier dispositivo | hay que reinstalar y volver a autenticar con el mismo token (o uno reemitido) | hay que volver a instalar desde la tienda y volver a iniciar sesión |

**La debilidad real de B, sin maquillar:** en iOS, instalar una PWA depende de que la persona use Safari y ejecute manualmente el gesto "Compartir → Añadir a pantalla de inicio" — no hay banner automático de instalación como en Android/Chrome. Las notificaciones push en iOS llegaron recién con Safari 16.4 y solo funcionan si la PWA ya fue instalada de esa forma manual — es decir, dependen de un paso que muchas personas nunca completan. Este es el riesgo principal de elegir PWA sobre nativa, y se retoma en §6.6 y §13.

---

## 4. Decisión: dos PWAs

**Por qué PWA y no nativa:** el resto del sistema ya es un stack Express + React sin tooling de compilación nativa (ver `CLAUDE.md`); una PWA reutiliza ese mismo conocimiento y ese mismo despliegue, mientras que una app nativa introduce un stack, un proceso de publicación y un ciclo de actualización completamente ajenos a como se construye hoy el resto del sistema. El costo de esa distancia (aprender, mantener, publicar en dos tiendas) no está justificado por las capacidades adicionales que da lo nativo, dado que ninguna de las tres personas (§2) necesita hoy algo que una PWA no pueda dar — la cámara ya se usa igual en el portal actual vía `<input capture>`.

**Por qué dos y no una:** los contextos de uso no se parecen. El Cliente abre el teléfono ocasionalmente para consultar algo puntual; el Supervisor/Ejecutor lo abre a diario, en condiciones físicas adversas, para ejecutar y registrar trabajo. Una sola aplicación obligaría al Cliente a cargar con una interfaz pensada para reportar tareas que nunca va a usar, y al equipo de terreno con una interfaz de cotizaciones y documentos que tampoco necesita — cada pantalla de más es fricción para alguien que, según §2, tiene tolerancia a la fricción muy baja (el caso del Supervisor) o ningún interés en profundizar (el caso del Cliente).

**Criterios concretos para reconsiderar esta decisión más adelante:**
- Si el número de empresas cliente crece a un orden donde justifique autenticación diferenciada por cuenta (hoy: bajo, una sola búsqueda pública alcanza).
- Si se vuelve necesaria una capacidad de dispositivo que hoy no es indispensable — por ejemplo, GPS obligatorio para verificar presencia en terreno, o notificaciones push confiables en iOS (hoy: no indispensable, ver §6.6).
- Si una proporción alta de los trabajos ocurre en zonas sin señal de forma sistemática, no ocasional (hoy: no se mide, ver §6.5).

---

## 5. PWA 1 — Portal del Cliente

### 5.1 Alcance funcional

Parte de lo que `PortalClienteScreen.jsx` ya hace: `TabSolicitud` (crear), `TabEstado` (buscar y ver detalle con cronograma), `TabDocs` (ver e imprimir la cotización), `TabContacto` (estática). Se propone añadir: notificación por correo automática cuando cambia el estado de una solicitud/OT propia (hoy el cliente tiene que volver a buscar manualmente para enterarse), instalación como PWA, e ícono de acceso directo.

### 5.2 Autenticación

Se mantiene sin login — es la decisión de fondo de §4. Pero hay un problema de privacidad que hoy ya existe y que este documento no puede dejar pasar en silencio: `portalController.buscar` arma la búsqueda con `$regex` sobre `numeroSolicitud`, `solicitante` y `empresaSolicitante` (`erp-backend/src/controllers/portalController.js`, función `buscar`). El número de solicitud es correlativo (`SOL-2026-0001`, `SOL-2026-0002`...) y la búsqueda por nombre no exige coincidencia exacta. Cualquiera que pruebe números correlativos, o busque por un nombre de empresa común, puede ver solicitudes, cotizaciones y cronogramas de otro cliente.

**Decisión: se exige correo o teléfono, además del número de solicitud/OT, para que la búsqueda devuelva resultados.** Cierra el hueco casi por completo, al costo de que el cliente tenga que tener a mano un dato adicional — más fricción en la búsqueda que hoy, pero acotada a un campo más, no a un flujo distinto.

Dos alternativas quedaron descartadas, cada una por su costo:
- **Link firmado por solicitud** (un token en la URL, entregado en el correo de confirmación al crear la solicitud). Sin fricción una vez que se tiene el link, pero si el cliente pierde el correo no tiene forma de volver a entrar sin pedirlo de nuevo — a diferencia de la búsqueda con dato adicional, que sigue siendo autoservicio.
- **Dejarlo como está.** Costo de implementación cero, pero el hueco de privacidad queda abierto y se vuelve más visible al empaquetar esto como una PWA instalable — una app con ícono propio transmite más confianza de la que el mecanismo actual sostiene.

### 5.3 Distribución

Los mismos canales que ya se usan para llegar al cliente hoy: correo (infraestructura Brevo ya existente), WhatsApp por deep link (mismo patrón `wa.me` que ya usa el sistema para el supervisor y para compartir cotizaciones), y un QR nuevo para imprimir en la orden de trabajo física o en el local.

### 5.4 Instalación

`manifest.json` propio, service worker que cachea solo los assets estáticos (no los datos — ver §6.5 sobre offline), set de íconos en los tamaños estándar de PWA.

### 5.5 Diferencias con la pantalla actual

Principalmente aditivas: instalabilidad y notificación proactiva de cambios de estado. El modelo de interacción (buscar por número/nombre) se mantiene, con el campo adicional de correo o teléfono que exige la decisión de §5.2.

### 5.6 Lenguaje visual

**Decisión: las PWA usan los tokens del rediseño de escritorio ya implementado** (`design_handoff_panel_control/README.md` §2 — color `oklch`, radio máximo 2px, tipografía Helvetica Neue/mono para números, sin sombra salvo menús flotantes), no un tercer sistema propio.

Esto corrige una lectura anterior de este mismo documento, que interpretó mal `docs/rediseno/design_handoff_panel_control/CORRECCIONES.md`: esa nota — *"Sin rediseñar por decisión del cliente: `ComprasScreen`, `FinanzasScreen`, `ContabilidadScreen`, `PortalClienteScreen`, `ReporteTerreno`. No tocarlas."* — excluye del rediseño a esas pantallas **tal como existen hoy**, para no gastar esfuerzo rehaciendo visualmente algo que iba a cambiar de estructura de todos modos (el mismo motivo que da la Fase 4 del roadmap de `funcionalidades-v2.md` para diferir el pulido visual). No es una prohibición de que código nuevo — las PWA no son `PortalClienteScreen` ni `ReporteTerreno`, son aplicaciones distintas que nacen a partir de ellas — adopte esos tokens. `plan-tipografia.md` y `plan-sistema-diseno.md` proponen un `src/tokens.css` (base 16px, familia Inter, íconos `lucide-react`) que **hoy no existe como código** — sigue siendo una propuesta pendiente de aprobación, no una fuente de verdad activa, y no compite con esta decisión.

**Lo que sí es propio de las PWA, y no se hereda del escritorio, es la escala** — no los 13px base de la densidad de escritorio (siete columnas, filas de 32-40px, pensada para mouse y hover), sino una escala tipográfica y de controles propia para móvil: mínimo 16px en todo texto de cuerpo e inputs (evita el zoom automático de Safari en iOS al enfocar un campo) y un objetivo táctil mínimo de 44×44px en cualquier control interactivo — botones, ítems de la barra de tabs, campos de formulario —, frente a los 20-30px de altura de control que usa hoy el panel de escritorio (`README.md` §2, tabla de alturas). Los colores, el radio de 2px y la tipografía monoespaciada para números viajan sin cambios; el tamaño de todo lo demás no.

**Qué patrones de escritorio no viajan al móvil, y por qué cada uno:**
- **El panel de detalle de 300px.** El propio handoff (§10) lo deja "no diseñado" para móvil y pide definición antes de implementarlo — en una PWA de una sola columna no hay donde convivir un panel lateral con la tabla; se resuelve como pantalla completa o como hoja inferior, no como panel fijo.
- **Las tablas multi-columna con scroll horizontal.** Siete columnas fijas más siete días (la grilla de Programación, §8 del handoff) no caben en un ancho de teléfono sin volverse ilegibles; en móvil cada fila se convierte en una tarjeta con la información apilada verticalmente.
- **Cualquier interacción dependiente de hover.** No existe hover en una pantalla táctil — todo estado que hoy se revela al pasar el mouse (por ejemplo el hover de fila `#f4f3ef`) necesita un equivalente visible sin gesto previo, o se descarta.

---

## 6. PWA 2 — Portal Operativo

### 6.1 Alcance por rol

**Supervisor.** Lo que ya existe en el portal por token se traslada tal cual: iniciar, posponer con motivo, marcar interrupción con motivo, enviar reporte con foto y comentario, terminar (`otController.supervisorAccion`, acciones `iniciar`/`posponer`/`interrumpir`/`reporte`/`terminar`). Lo nuevo es "mi día" y "mi semana": una vista que agrega todas las OTs asignadas a esa persona, cosa que hoy no existe en ninguna parte — cada link de hoy abre exactamente una OT.

**Ejecutor.** Rol enteramente nuevo (ver §2). Se propone una versión reducida de lo anterior: ver su tarea del día, marcarla como hecha, sin las acciones de nivel-OT (posponer, interrumpir) que hoy son responsabilidad del Supervisor.

**Ajuste (revisión de producto, agosto 2026) — backlog completo, no solo semana actual.** El alcance descrito arriba ("mi día"/"mi semana") asume que lo único pendiente de ver es la semana en curso. En la práctica, un supervisor puede acumular trabajo pendiente de semanas anteriores que nunca se cerró, y hoy no tiene forma de verlo desde la PWA — solo lo que cae dentro de la ventana de "hoy" o "esta semana". Se amplía el alcance funcional de PWA 2 para incluir una vista de **backlog**: todo lo pendiente acumulado (no solo lo de la semana actual), con la posibilidad de abrir y actuar sobre tareas de días siguientes, no únicamente las del día en curso. Esto es una ampliación de `GET /api/mi/semana` (§8) — o un endpoint nuevo equivalente, por ejemplo `GET /api/mi/pendientes` — que en vez de acotarse a una ventana de 7 días agregue todo lo que sigue sin cerrarse, ordenado por fecha. Queda pendiente de definir en implementación si esto es una pantalla nueva dentro de la PWA Operativa o una pestaña adicional sobre "mi semana" ya existente.

### 6.2 Autenticación por token persistente por persona

**Entropía:** se mantiene `crypto.randomBytes(20)` → 40 caracteres hexadecimales, exactamente la que ya usa `OT.tokenEjecucion` hoy — no se propone una cifra distinta porque no hay ningún indicio en el sistema actual de que 40 hex sea insuficiente, y usar la misma evita introducir una segunda convención de seguridad en el mismo proyecto.

**Flujo completo:**
- *Creación:* el Planificador (o quien administre) crea un `Usuario` para un `Recurso` existente; se genera el token en ese momento.
- *Envío:* correo con el link de instalación (mismo canal Brevo ya existente).
- *Primer acceso:* el link abre un prompt de instalación de la PWA; una vez instalada, aterriza directo en "mi día".
- *Sesiones siguientes:* el token queda almacenado en el dispositivo instalado — no hay que volver a autenticarse cada vez, igual que hoy no hay que volver a autenticarse dentro de un mismo link de OT.
- *Revocación:* se propone una acción explícita "regenerar token", que invalida el anterior — hoy no existe nada equivalente para un token de persona (el único precedente, `enviarAlSupervisor`, *reutiliza* el token existente en vez de reemplazarlo, ver línea 331 de `otController.js`); para el token de persona el comportamiento debe ser el opuesto, porque revocar es precisamente el caso de uso que hoy falta (§1).
- *Reemisión:* misma acción de "regenerar", con nuevo envío de correo.

**Qué pasa con los tokens por OT ya existentes:** siguen intactos y funcionando en paralelo — no se migran ni se tocan (mismo criterio "aplica hacia adelante, sin migración retroactiva" que el documento maestro ya usa para `OT.componentes[]`, Parte VIII punto 3). Conviven ambos sistemas hasta que se decida un corte (ver §12, M5).

**Expiración:** se propone que el token de persona **no expire** por tiempo — expira solo por revocación explícita. Es coherente con el modelo de "app instalada": una sesión que pide volver a autenticarse cada cierto tiempo contradice la promesa de acceso sin fricción que justifica tener una PWA en primer lugar (§2, tolerancia a fricción muy baja del Supervisor).

### 6.3 Distribución

Correo con el link de instalación y un QR equivalente para entregar en persona (por ejemplo, al momento de contratar o dar de alta a alguien).

### 6.4 Instalación

`manifest.json` y service worker propios, separados de los de la PWA Cliente (scope distinto), set de íconos.

### 6.5 Modo offline

**No entra en la primera versión.** Motivo: offline completo implica colas de reintento, resolución de conflictos entre lo que se hizo en el teléfono y lo que cambió en el servidor mientras tanto, y una superficie de pruebas mucho mayor que el resto de esta propuesta — no está justificado hasta no tener uso real de la PWA que muestre cuánto pesa el problema.

**Pero hay una consecuencia real que no se puede omitir:** hoy, tanto `supervisorAccion` (acción `reporte`) como `ReporteTerreno.jsx` suben la foto como base64 dentro de un `POST` JSON normal (`fetch` sin reintento — ver función `postJson` en el HTML servido por `supervisorPortal`, que ante un error solo hace `alert('Error: '+e.message)`). Si el supervisor toma la foto sin señal, ese envío falla y la foto se pierde, con un aviso que el usuario puede no leer con atención en pleno terreno.

**Mínimo que evita esa pérdida, y que sí debería entrar en la primera versión pese a que el offline completo no entra:** retener el envío en el dispositivo (por ejemplo, en `IndexedDB`) y reintentar automáticamente cuando vuelva la señal, en vez de depender de que la persona note el error y repita la acción manualmente. Es un mecanismo acotado (una cola de reintento simple, no sincronización bidireccional) que ataca directamente la pérdida de datos más probable del uso real en terreno.

### 6.6 Notificaciones

**Correo, no push.** Motivo: push requiere configuración de servicio (claves VAPID o equivalente) y permiso explícito del usuario, y en iOS depende de que la persona ya haya completado el gesto manual de instalación descrito en §3 — construir sobre push como canal principal hereda esa misma fragilidad. Correo ya tiene infraestructura funcionando (`config/mailer.js`, Brevo) y no depende de ningún gesto previo del usuario.

**Eventos que notifican:** asignación nueva, cambio de estado de una OT en la que la persona tiene una asignación activa.

**WhatsApp por deep link** como opción adicional, reutilizando el mismo patrón `wa.me` que ya usa `notificarSupervisor` hoy.

### 6.7 Entorno demostración

Esto merece una advertencia concreta, no genérica: **hoy el modo demostración está roto de punta a punta para el flujo de supervisor**, y cualquier PWA nueva hereda el mismo problema si no lo resuelve explícitamente.

`resolverEntorno` (`erp-backend/src/middlewares/entorno.js`) se aplica a **todas** las rutas bajo `/api`, incluida `/api/ots/:id/supervisor` — decide `demo` o `producción` leyendo el header `X-Entorno`. Ese header solo lo agrega `axios.defaults` dentro de la SPA (`erp-web/src/utils/entorno.js`), al cargar la aplicación de React. El portal del supervisor, en cambio, es una página HTML servida aparte (`otController.supervisorPortal`) que se abre directo desde el link del correo, sin pasar nunca por la SPA — y su `fetch()` interno (`postJson`, dentro del HTML) no agrega ese header en ningún caso.

Consecuencia concreta: si se envía una OT al supervisor estando en modo demo, el correo igual apunta a producción — al faltar el header, `resolverEntorno` cae a su valor por defecto, `'producción'`. Como demo y producción son dos conexiones Mongo completamente separadas (`config/conexiones.js`), el `_id` de una OT creada en demo no existe en la base de producción, y el supervisor que toca el link ve un 404 "OT no encontrada". El seed de demostración (`seeds/demo.json`) ya incluye recursos con `email`/`telefono`, así que este flujo es alcanzable con solo cargar la demo y usar el botón "Enviar OT al supervisor" — no es un caso extremo.

**Decisión: para las PWAs nuevas, el entorno se propaga por parámetro de URL desde la primera versión, no se hereda del header.** El link/QR de instalación codifica el entorno en la propia URL (`?entorno=demo` o `?entorno=produccion`); la PWA instalada guarda ese valor junto al token y lo manda como parámetro de query en cada llamada a los endpoints de §8, en vez de depender de `axios.defaults` (que no existe fuera de la SPA). Esto es lo mismo que corrige, para el flujo actual del supervisor, el punto 7 de `CORRECCIONES.md` — mismo mecanismo, aplicado desde el diseño en vez de parcheado después. La consecuencia directa es que la demo — la herramienta de venta del sistema, según el uso que se le ha dado — puede mostrar el flujo móvil completo desde el primer entregable, no solo el de escritorio.

**Usuarios de demo:** no existen hoy, porque no existe la colección `Usuario`. Si se implementa, el seed de demo debería generar también tokens de persona para los recursos que ya trae, de forma que la demo sea representativa del flujo completo y no solo del flujo de escritorio.

---

## 7. Conceptos nuevos

### 7.1 Usuario

Colección nueva. Relación con `Recurso`: un `Recurso` puede o no ser `Usuario` — no todo el personal necesita acceso móvil (por ejemplo, alguien que solo aparece en el Gantt pero nunca reporta desde terreno). Campos: nombre, `recursoId` (referencia opcional a `Recurso`), rol (`Supervisor` / `Ejecutor` — el Cliente no es `Usuario`, sigue sin cuenta según §5.2), token, fecha de creación del token, último acceso, `activo` (booleano, para revocar sin borrar el histórico). Como precedente de estilo dentro del repo, sigue el patrón de `erp-backend/src/models/DisposicionTabla.js`: Mongoose simple, sin validaciones complejas, exportado como `(conn) => conn.models.Usuario || conn.model('Usuario', UsuarioSchema)` para funcionar sobre las dos conexiones (demo/producción) igual que el resto de los modelos.

### 7.2 Asignación

Es la decisión técnica de mayor consecuencia de todo el documento — se explica aquí con su motivo y su costo, ya confirmada.

**Qué se asigna:** evaluación (ir a levantar el Informe de Evaluación del Gap 1, antes de que existan tareas), ejecución (una o más tareas de `OT.tareas`), supervisión (responsabilidad sobre una OT completa, no sobre una tarea puntual). Cada asignación tiene estado, fecha planificada y fecha real.

**Decisión confirmada: colección propia `Asignacion`, no una extensión de `OT.tareas`.**

Motivo: `OT.tareas` ya cumple simultáneamente el rol de unidad de programación en el Gantt, unidad de reporte, y línea de cotización/costeo. Una asignación de evaluación (Gap 1) no tiene ninguna tarea que la contenga — existe *antes* de que existan tareas, porque su propósito es justamente levantar la información con la que después se arman esas tareas. Forzarla dentro de `OT.tareas` obligaría a crear tareas ficticias solo para tener dónde colgar la asignación, contaminando el mismo array que alimenta el Gantt y la cotización.

**Costo de esta decisión:** ahora hay dos lugares que pueden responder "quién trabaja esto" — `OT.tareas[].operarioId` (ya existe, array de IDs de `Recurso`, alimenta el cálculo de capacidad del Gantt) y `Asignacion.usuarioId` (nuevo, alimenta el acceso móvil). Sin una regla clara, estos dos pueden divergir. Se propone: `Asignacion` es la fuente para "quién tiene acceso a esto desde el móvil"; `OT.tareas.operarioId` sigue siendo la fuente para "cuánta capacidad consume" (Gap 4) — no se fusionan, y cualquier pantalla que muestre ambas cosas junta las lee de sus dos orígenes en vez de intentar que una vector reemplace a la otra.

### 7.3 Extensión de Recurso

`+ usuarioId: ObjectId` (referencia opcional a `Usuario`) en `erp-backend/src/models/Recurso.js`. Mismo criterio de opcionalidad que en §7.1: no todo `Recurso` tiene un `Usuario` asociado.

### 7.4 Extensión de la programación

Se busca mostrar en `GanttScreen` las asignaciones de evaluación además de las tareas ya programadas, agregar un filtro por supervisor, y una vista de carga por supervisor.

**Se apoya en la corrección 4.13 de `CORRECCIONES.md`, no parte de cero.** Esa corrección ya agrega a `GanttScreen` una barra de filtros (mismo patrón visual que Ingreso §5 y Panel de control §3: fondo `#f0efeb`, 37px, input + chips) con un `<select>` de operario/supervisor que acota qué filas de OT y de capacidad se muestran. Lo que la PWA Operativa necesita, y que 4.13 no cubre, es distinto en naturaleza: no ocultar filas, sino **agregar** — una vista de carga total por supervisor (suma de horas de todas las OT donde tiene asignación activa, no una fila de Gantt a la vez) y el cruce con las asignaciones de evaluación del Gap 1, que hoy no tienen ninguna representación en `GanttScreen` porque todavía no son tareas. En consecuencia, el trabajo de este punto es: reutilizar el `<select>` de 4.13 como control de filtro compartido, y construir aparte el panel de carga agregada que 4.13 no resuelve por sí solo.

---

## 8. Endpoints

Convención del repo: rutas en plural bajo `/api`, un router por dominio (`erp-backend/src/routes`).

| Método | Ruta | Quién la usa | Qué devuelve | Respeta `X-Entorno` |
|---|---|---|---|---|
| `POST` | `/api/usuarios` | Planificador (desde la SPA) | el `Usuario` creado, sin el token en claro salvo la primera vez | sí — pasa por `resolverEntorno` como el resto de `/api` |
| `GET` | `/api/usuarios` | Planificador | listado de usuarios (nombre, rol, activo, último acceso) | sí |
| `POST` | `/api/usuarios/:id/token` | Planificador | nuevo token, invalida el anterior, dispara el correo de reenvío | sí |
| `POST` | `/api/usuarios/:id/desactivar` | Planificador | confirmación; `activo: false` | sí |
| `GET` | `/api/mi/dia?token=&entorno=` | PWA Operativa (dispositivo instalado, sin sesión de SPA) | asignaciones del día para el `Usuario` del token | **debe leerse del parámetro `entorno` de la URL, no del header** — ver el problema descrito en §6.7; si se resuelve por header como hoy, se repite el mismo bug |
| `GET` | `/api/mi/semana?token=&entorno=` | PWA Operativa | asignaciones de la semana | mismo criterio que la fila anterior |
| `POST` | `/api/asignaciones` | Planificador | la `Asignacion` creada, dispara el correo de §9 | sí |
| `GET` | `/api/asignaciones?usuarioId=&otId=` | Planificador, PWA Operativa | listado filtrable | sí (SPA) / vía parámetro `entorno` (PWA, igual que arriba) |
| `PUT` | `/api/asignaciones/:id` | Planificador, PWA Operativa | actualiza estado / fecha real | igual criterio mixto que arriba |

---

## 9. Correos

Toda plantilla nueva reutiliza la infraestructura Brevo ya configurada (`erp-backend/src/config/mailer.js`, `process.env.BREVO_API_KEY`, `EMAIL_FROM`), sin HTML decorativo — texto simple con un botón, como ya hacen `enviarAlSupervisor` y `mailRoutes.js` hoy.

**Asignación nueva.** Se dispara al crear una `Asignacion`. Asunto: "Nueva asignación: OT [número]". Dice qué trabajo es y cuándo está planificado. Lleva el link de instalación de la PWA Operativa (o, si la persona ya la tiene instalada, un link que abre directo esa asignación dentro de la app).

**Cambio de estado (Cliente).** Se dispara en las transiciones de estado relevantes para el cliente — parcialmente ya existe hoy en la forma del correo de cotización con botones Aceptar/Rechazar (`mailRoutes.js`, `enviar-cotizacion`); se extiende el mismo patrón a otras transiciones (por ejemplo, "Trabajo Terminado"). Lleva el link al Portal del Cliente.

**Renovación de acceso.** Se dispara al regenerar el token de un `Usuario` (§6.2). Asunto: "Tu acceso fue renovado". Lleva el nuevo link; dejar claro que el anterior ya no funciona.

---

## 10. Infraestructura

**Hosting y rutas.** El sistema ya tiene un solo backend Express y un solo frontend Vite/React desplegados (ver conversación de despliegue de este mismo proyecto en Render). La opción de menor costo operativo es servir ambas PWAs como builds adicionales dentro del mismo repositorio, bajo subrutas del dominio ya existente (`/portal` ya existe hoy; se propone `/operativo` para la nueva) — no subdominios nuevos, que obligarían a gestionar DNS y certificados adicionales sin ningún beneficio funcional a cambio.

**HTTPS.** Ya provisto por el hosting actual — las PWA lo requieren de forma estricta para poder instalarse y usar service workers, así que no hay trabajo adicional aquí.

**Manifest y service workers.** Un `manifest.json` y un service worker por PWA, con `scope` distinto para que no se pisen entre sí ni con la SPA principal.

**Íconos.** Tamaños estándar de PWA: 192×192 y 512×512 px como mínimo, con una variante "maskable" para que Android no recorte mal el ícono en launchers que aplican máscaras de forma.

---

## 11. Impacto en el sistema actual

*(Actualizado tras ejecutar M0-M4 — ver §12. Lo que sigue es el estado real verificado, no la proyección original.)*

**Retirado (M4):** `otController.generarLinkEjecucion`, `iniciarEjecucion` y `confirmarEjecucion`, y sus rutas (`/api/ots/:id/generar-link-ejecucion`, `/api/ots/:id/iniciar-ejecucion`). Confirmado sin llamador en ningún frontend antes de borrar — eliminación limpia, sin código de compatibilidad dejado atrás.

**Se mantiene, deliberadamente no retirado:** `enviarAlSupervisor` / `supervisorPortal` / `supervisorAccion` (portal HTML por `tokenEjecucion`). El plan original (ver M5 más abajo, tal como quedó escrito antes de ejecutar) asumía que esto se podía retirar apenas la PWA Operativa existiera. Al intentar el corte en M4 se verificaron las dos condiciones que el propio criterio de corte exige, y ninguna se cumple hoy:
- **Links en circulación de verdad:** consultando producción (no demo) hay `OT-2026-0002` y `OT-2026-0003`, ambas en estado `Programada` con `tokenEjecucion` activo — links ya enviados por correo que nadie ha abierto todavía. Retirar el portal ahora los rompe.
- **No hay reemplazo operable:** M1 fue backend puro ("no escribas interfaz"). Hoy no existe ninguna pantalla en la SPA de escritorio para que el planificador cree un `Usuario` o una `Asignacion` — el único acceso a ese backend es vía API directa (como se hizo para verificar M1-M3). Aunque no hubiera links pendientes, retirar el botón "Enviar OT al supervisor" de `TratamientoScreen` hoy dejaría a la empresa sin ninguna forma de notificar a un supervisor.

Queda documentado en el código (`otController.js`, comentario sobre `enviarAlSupervisor`) para que no se lea como código muerto olvidado.

**Se agregó, aditivo:** `Usuario`, `Asignacion`, `SesionPortal` (esta última no estaba en el plan original de este documento — se agregó en M1 para sostener la sesión de 30 días de la PWA Cliente, con hash de token en vez de token en claro), los endpoints de §8, más `POST /api/portal/emitir-token` (tampoco estaba planeado aquí — hizo falta en M3 para el "link firmado" que C1 exige) y la extensión de `otPublica()` con `reportes[]` (faltaba por completo; sin eso, C4 no tenía de dónde leer fotos). `Recurso.usuarioId` según §7.3. Dos aplicaciones nuevas, `erp-pwa-operativa/` y `erp-pwa-cliente/`, cada una con su propio build/manifest/service worker.

**Qué pasa con los links de token por OT ya enviados y en circulación:** siguen funcionando sin cambios — no se invalidó ningún `tokenEjecucion` ni se tocó `supervisorPortal`. Coexisten con la PWA Operativa hasta que las dos condiciones de arriba se resuelvan (ver M4 en §12).

---

## 12. Roadmap

*(Estado real tras la ejecución — cada hito lista lo que efectivamente se entregó, no la proyección.)*

**M0 — hecho.** Prerrequisito de entorno: `resolverEntorno` acepta `?entorno=` en la URL además del header; `enviarAlSupervisor`/`supervisorPortal`/`supervisorAccion`/`iniciarEjecucion` (antes de su retiro) propagaban el parámetro igual que el token. Verificado contra producción y demo con aislamiento real entre bases.

**M1 — hecho.** Modelos `Usuario`, `Asignacion`, `SesionPortal` + `Recurso.usuarioId`. Endpoints de creación/revocación/reemisión de token, `mi-dia`/`mi-semana` (filtrados por rol: ejecutor solo ve `ejecucion`; supervisor ve `ejecucion`+`supervision`+`evaluacion`), `acceso`/`mis-solicitudes`/`emitir-token` del lado cliente. Sin interfaz, tal como pedía el prompt — verificado por API directa.

**M2 — hecho.** PWA Operativa (`erp-pwa-operativa/`, pantallas O1-O6), servida en `/operativo/`. `otController.aplicarAccionOT` extraído de `supervisorAccion` y reutilizado por el nuevo `PUT /api/ots/:id/accion-movil` (autenticado por `Usuario` + `Asignacion`, no por `tokenEjecucion`). Cola de reportes en IndexedDB para reintento sin señal.

**M3 — hecho.** PWA Cliente (`erp-pwa-cliente/`, pantallas C1-C6), servida en `/cliente/`. Reescrita sobre los tokens del handoff, no envuelta sobre `PortalClienteScreen`. Etapas en lenguaje de cliente reutilizando el mismo `MAPA_ETAPA` que ya usan `DashboardScreen`/`TratamientoScreen`.

**M4 — parcialmente hecho.** El código huérfano (`generarLinkEjecucion`/`iniciarEjecucion`/`confirmarEjecucion`) se retiró. El retiro del portal HTML **no** se ejecutó — bloqueado por los dos motivos de §11. Falta, en un paso posterior no cubierto todavía:
1. Una pantalla en la SPA (probablemente dentro de `RecursosScreen` o nueva) para que el planificador cree/revoque `Usuario` y arme `Asignacion` sin pasar por la API a mano — sin esto, el botón "Enviar OT al supervisor" no tiene con qué reemplazarse.
2. Que `OT-2026-0002` y `OT-2026-0003` (o las que estén activas al momento de reintentar el corte) terminen su ciclo con el link ya emitido, o se decida migrarlas a mano a una `Asignacion`.

Recién con esas dos condiciones resueltas se puede volver a intentar el retiro de `enviarAlSupervisor`/`supervisorPortal`/`supervisorAccion`.

**Dependencia con el roadmap general:** M1 dependía de que el modelo de `Usuario` quedara resuelto en la fase anterior del roadmap general de `funcionalidades-v2.md`, tal como ya lo declaraba el Gap 8 de ese documento (Parte IV) — condición ya cumplida antes de ejecutar M1.

---

## 13. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación | Cómo nos enteraríamos |
|---|---|---|---|---|
| No adopción por usuarios no técnicos | media | alto — todo el valor de la PWA depende de que se use en vez del portal HTML actual | mantener el portal HTML en paralelo durante toda la transición (§11); acompañar la instalación en persona, no solo por correo | caída o estancamiento sostenido del uso de la PWA frente al portal HTML, medible por origen de las acciones registradas |
| Instalación en iOS (gesto manual, sin banner automático) | alta | media | instrucciones explícitas paso a paso junto al link de instalación; considerar un video corto | proporción baja de dispositivos iOS marcados como "instalado" frente a Android |
| Pérdida o robo del teléfono con el token dentro | baja-media | alto — acceso indefinido si nadie lo revoca a tiempo | acción de revocar simple y expuesta (§6.2/§7.1); dejar claro en el onboarding que hay que avisar para revocar | aviso del propio usuario o de un tercero; no hay forma técnica de detectarlo automáticamente dentro del alcance de este documento |
| Intercepción del correo con el link/token | baja | alto | el nivel de exposición no cambia respecto de hoy — el correo ya es el canal del token por OT; esta propuesta no lo empeora, pero tampoco lo mejora | — |
| Reenvío del link a un tercero | media | media-alta | el token queda ligado a una persona completa, no a un solo trabajo — reenviarlo da acceso a todo "mi día" de esa persona, lo cual es un riesgo *mayor* que hoy, donde un link reenviado solo expone una OT puntual | mismo mecanismo de revocación de §6.2; ningún otro control adicional en el alcance de este documento |
| Crecimiento del número de usuarios | baja, para el tamaño de PyME descrito en la Parte I de `funcionalidades-v2.md` | baja | ninguna mitigación específica dentro de este alcance | criterio de reconsideración ya declarado en §4 |

Nótese que el riesgo de "reenvío del link a un tercero" es, explícitamente, **peor** con el modelo de token por persona que con el modelo actual de token por OT — es el costo directo de resolver el problema de revocación de §1, y se documenta como tal en vez de presentarlo como una mejora sin contrapartida.
