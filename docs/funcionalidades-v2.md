# Funcionalidades v2 — erp-taller

Documento maestro que integra: (I) el contexto de negocio, (II) el modelo de proceso deseado, (III) lo que el sistema hace hoy, (IV) los vacíos entre ambos, (V) la propuesta técnica de integración y (VI) un roadmap por fases.

Este documento es una **propuesta pendiente de aprobación**. No reemplaza a [`funcionalidades.md`](FUNCIONALIDADES.md), que se mantiene intacto como referencia del estado actual hasta que esta v2 sea aprobada y aquel se archive. No se modificó ni ejecutó código para producir este documento — es puramente de análisis y planificación.

Las secciones marcadas **[Detalle técnico]** están dirigidas a quien vaya a implementar; el resto está escrito para lectura de negocio (dueño, gerencia, planificadores).

---

## Parte I — Contexto de negocio

### 1. Propósito del sistema

Software de gestión para empresas de servicios que reciben solicitudes de clientes, evalúan su capacidad interna real (personal, herramientas, insumos) y responden con cotizaciones que **comprometen recursos concretos**, no promesas genéricas. El sistema existe para que lo que se cotiza sea lo que efectivamente se puede ejecutar, y para que cada paso — desde que llega la solicitud hasta que se cobra — quede registrado y sea consultable.

### 2. Tipo de empresa objetivo

PyMEs de servicios: mantenimiento industrial, reparaciones, obras menores. El rasgo distintivo de este segmento es que **una misma persona cumple varios roles operativos** (quien planifica también programa y compra). El sistema debe funcionar bien en ese escenario concentrado sin bloquear el crecimiento hacia una empresa mediana donde esos roles se separan en personas distintas.

### 3. Principios rectores

- **SLA de respuesta**: entre 1 y 2 días desde que llega la solicitud hasta que se envía la cotización.
- **Compromiso realista**: no se cotiza lo que no se puede ejecutar — la cotización refleja disponibilidad real de personal, herramientas e insumos.
- **Trazabilidad**: cada compromiso queda ligado a recursos concretos; cada compra queda ligada a la OT que la originó.
- **HH (horas-hombre) como métrica central de decisión**: la capacidad se mide y se compara en horas-hombre, no en "personas disponibles" de forma abstracta.

---

## Parte II — Modelo del proceso

### 4. Actores del proceso

| Actor | Qué hace | Qué necesita ver | Documentos que produce | Documentos que consume | Cuándo se le notifica |
|---|---|---|---|---|---|
| **Cliente** (externo) | Envía la solicitud inicial; acepta o rechaza la cotización; recibe la entrega del trabajo | Estado de su solicitud/OT, cotización, cronograma cuando ya está programado | Solicitud | Cotización, informe de ejecución (resumen) | Al recibir la cotización (correo con Aceptar/Rechazar); al finalizar la entrega |
| **Planificador** | Trata la solicitud, hace el Informe de Evaluación en terreno, arma la cotización, aprueba internamente antes de enviarla al cliente, decide qué solicitudes se toman. **En PyME cumple además los roles de Programador y Comprador.** | Todas las solicitudes pendientes con su antigüedad (SLA), disponibilidad real de personal/herramientas/insumos, estado de las OCs en curso | Informe de Evaluación, Cotización, Orden de Compra (rol Comprador), Programación en Gantt (rol Programador) | Solicitud del cliente, catálogo de recursos, stock | Al ingresar una solicitud nueva; cuando el stock bloquea una programación |
| **Supervisor de terreno** | Aprueba las condiciones en terreno antes de iniciar, ejecuta y documenta el trabajo, llena el Informe de Ejecución | Tareas programadas de la OT asignada, Informe de Evaluación previo (condiciones esperadas) | Informe de Ejecución (reportes con foto/comentario) | Informe de Evaluación, tareas planificadas | Al asignársele una OT programada (link del Portal Supervisor por correo) |
| **Ejecutor/Operario** | Realiza las tareas físicas del trabajo | Su propia tarea asignada (descripción, fecha, duración) | — (su trabajo lo documenta el Supervisor) | Tareas planificadas | Implícito — hoy no tiene vista propia (ver Gap relacionado en Parte IV) |

### 5. Documentos del proceso

| Documento | Cuándo se genera | Quién lo produce | Quién lo consume | Contenido | Relación con otros documentos |
|---|---|---|---|---|---|
| **Solicitud** | Cuando el cliente pide un trabajo | Cliente (o quien recibe el pedido por WhatsApp/correo/llamada y lo transcribe) | Planificador | Datos de contacto, descripción del requerimiento, plazo sugerido, adjuntos | Origen de todo — de ella nace la OT |
| **Informe de Evaluación** *(nuevo, no existe hoy)* | Siempre, antes de cotizar — tras la visita de levantamiento en terreno | Planificador | Planificador (para cotizar), Supervisor (como referencia de qué esperar en terreno) | Condiciones del sitio, riesgos, metodología, fotos — **más tareas, herramientas/componentes y logística estructurados** (mismos campos que la OT: descripción, puesto, duración, cantidad, precio) | Bloquea el armado de la Cotización hasta estar completo; sus tareas/componentes/logística se **pasan directamente a la OT** al aplicarlo (mismo mecanismo que ya existe hoy para aplicar una Plantilla) |
| **Cotización** | Tras completar el Informe de Evaluación y planificar la OT | Planificador | Cliente (decide aceptar/rechazar) | Propuesta económica (materiales, mano de obra, logística, IVA) y Gantt propuesto | Nace de la OT; si se acepta, la OT pasa a `Planificada` y se reservan recursos |
| **OT (Orden de Trabajo)** | Al aceptar la cotización el cliente | Sistema (a partir de la Solicitud + lo armado en Tratamiento) | Planificador, Supervisor, Finanzas | Tareas, componentes, logística, informe de evaluación, informe de ejecución, estado de pago | Congela los recursos comprometidos; referencia a las OCs generadas para cubrir faltantes |
| **Informe de Ejecución** | Durante y al cierre de la ejecución en terreno | Supervisor | Cliente (resumen), Planificador (cierre) | Actividad por actividad: qué se hizo, cómo quedó, foto/comentario — anclado a las tareas planificadas | Cierra el ciclo de la OT (`Con Informe` → `Pagada`) |

### 6. Flujo completo end-to-end

```
CLIENTE                  PLANIFICADOR                    SUPERVISOR / EJECUTOR         SISTEMA
  |                           |                                    |                        |
  |--(1) Envía Solicitud----->|                                    |                        |  Solicitud creada, estado Pendiente
  |                           |                                    |                        |  fechaHoraSolicitud arranca el SLA
  |                           |                                    |                        |
  |                           |--(2) Visita de levantamiento------------------------------->|
  |                           |<-(2) Informe de Evaluación----------------------------------|  condiciones, riesgos, metodología
  |                           |     (mismo Planificador en PyME)                            |  + tareas/componentes/logística
  |                           |                                    |                        |  (misma estructura que la OT)
  |                           |                                    |                        |
  |                           |--(3) Verifica stock/capacidad------------------------------>|  ¿Alcanza el stock?
  |                           |                                    |                        |
  |                           |        [NO alcanza] ---(3a) Genera Orden de Compra--------->|  OC: Emitida -> enviada a Proveedor
  |                           |                                    |                        |
  |                           |                         Proveedor despacha, se recibe        |
  |                           |                                    |                        |  Ingreso a bodega, OC: Recibida
  |                           |                                    |                        |  stockActual sube, stockReservado baja
  |                           |                                    |                        |
  |                           |--(4) Aplica el Informe a la OT,----------------------------->|  OT: Planificada
  |                           |    arma Cotización (Gantt + $)                              |  (tareas/recursos ya definidos)
  |                           |--(5) Confirma y envía* ----------------------------------->|  *el mismo Planificador aprueba
  |<-(6) Cotización enviada---|                                    |                        |  correo con botones Aceptar/Rechazar
  |                           |                                    |                        |
  |--(7a) Rechaza------------>|                                    |                        |  OT: Rechazada (cierre)
  |                           |                                    |                        |
  |--(7b) Acepta------------->|                                    |                        |  OT: Aprobada
  |                           |                                    |                        |  Recursos: Disponible -> Reservado
  |                           |--(8) Programa en Gantt------------------------------------->|  OT: Programada
  |                           |                                    |                        |  (bloqueado si faltan insumos sin OC cubierta)
  |                           |                                    |                        |
  |                           |                        (9) Aprueba condiciones en terreno    |
  |                           |                                    |                        |
  |                           |                        (10) Ejecuta las tareas------------->|  OT: En Ejecución
  |                           |                                    |                        |  Recursos: Reservado -> En Uso
  |                           |                                    |                        |
  |                           |                        (11) Llena Informe de Ejecución------>|  OT: Trabajo Terminado -> Con Informe
  |                           |                                    |                        |  Recursos: En Uso -> Disponible
  |                           |                                    |                        |
  |<-(12) Entrega -------------------------------------------------|                        |
  |--(13) Paga------------------------------------------------------------------------------>|  OT: Pagada
```

### 7. Estados y transiciones

**Solicitud** (`erp-backend/src/models/Solicitud.js`) — hoy `estado` es un campo de texto libre, no un enum cerrado; en la práctica solo se usa `Pendiente` como valor inicial y se cambia manualmente desde el Dashboard. Una vez que existe una OT vinculada, la pantalla muestra el estado de la **OT**, no el de la Solicitud — la Solicitud queda congelada en el estado que tenía al momento de convertirse.

**OT** (`erp-backend/src/models/OT.js`, enum cerrado hoy — **cambio propuesto**, ver Parte V):

```
Pendiente -> Tratada -> Planificada -> [Aprobada | Rechazada] -> Programada -> En Ejecución -> Trabajo Terminado -> Con Informe -> Pagada
```

**Decisión confirmada (2026-08-16)**: se agregan `Aprobada` y `Rechazada` al enum, entre `Planificada` (cotización armada, lista para enviar) y `Programada` (agendada en Gantt), para representar explícitamente la respuesta del cliente a la cotización. `Rechazada` es un estado terminal (cierra la OT); `Aprobada` habilita pasar a `Programada` y dispara la reserva de recursos (Gap 4).

**Recursos (personal)** — hoy **no existen estados** (gap, ver Parte IV Gap 4). Propuesto: `Disponible / Reservado / En Uso`.

**Herramientas/Equipos** (`EquiposHerramientas`) — ya tiene estado hoy: `Disponible / En Uso / Mantenimiento / Reparación`. Propuesto: agregar `Reservado`.

**Insumos** (`Suministro`) — hoy **no existe ningún concepto de stock** (gap, ver Parte IV Gap 2). Propuesto: cantidades (`stockActual`, `stockReservado`), no un estado único, porque un insumo es una cantidad, no un ítem individual.

**Órdenes de Compra** — no existen hoy (gap, ver Parte IV Gap 3). Propuesto: `Emitida -> Aceptada por proveedor -> En tránsito -> Recibida -> Pagada`.

### 8. Conceptos clave del dominio

- **Reserva/congelamiento de recursos**: al aceptar la cotización, los recursos comprometidos (HH de personal, herramientas asignadas, insumos) dejan de estar libres para otras OTs — pasan a `Reservado` hasta que empieza la ejecución (`En Uso`) y se liberan al cerrar la OT.
- **Control de stock por bodega**: los insumos se descuentan de una bodega física al usarse y se reponen mediante Órdenes de Compra recibidas.
- **OC asociada a OT**: una Orden de Compra siempre nace de una OT específica (o de su Informe de Evaluación); una OT puede tener **varias** OCs, una por proveedor.
- **Bloqueo de programación hasta cumplir stock**: una OT no puede pasar a `Programada` si tiene componentes cuya cantidad pedida supera el stock disponible y no hay una OC que lo cubra.
- **SLA de respuesta con umbrales visuales**: el tiempo transcurrido desde que ingresó la Solicitud se muestra con un código de color (verde/amarillo/rojo) mientras siga sin cotización enviada.

---

## Parte III — Implementación actual

*(Reorganización por área funcional del contenido de [funcionalidades.md](FUNCIONALIDADES.md); ver ese documento para el detalle original completo.)*

### 9. Módulos existentes

**Captación**
- `IngresoScreen` (`/`) — intake de Solicitudes nuevas (empresa, contacto, descripción, plazo, adjuntos).
- `PortalClienteScreen` (`/portal`, pestaña "Solicitar") — mismo intake pero público, sin login, genera `numeroSolicitud` autogenerado.

**Planificación y cotización**
- `TratamientoScreen` (`/tratamiento`) — arma tareas, componentes y logística de una OT a partir de una Solicitud; aplica Plantillas; genera cotización en PDF; envía por correo o WhatsApp.

**Programación / capacidad**
- `GanttScreen` (`/gantt`) — programación visual por operario y fecha; calcula horas disponibles combinando `Calendario` + ajustes manuales; detecta y resalta sobrecarga de capacidad.

**Ejecución en terreno**
- Portal Supervisor (HTML servido por el backend, sin pantalla en `erp-web`) — token aleatorio `OT.tokenEjecucion`, permite iniciar/pausar/reportar/finalizar sin login.
- `ReporteTerreno` (`/reporte?id=`) — vista de reportes de campo (fotos + comentarios) de una OT.

**Control macro**
- `DashboardScreen` (`/dashboard`) — pipeline visual por etapa, 4 KPIs (`Solicitudes Pendientes`, `OTs Activas`, `Horas Planificadas`, `OTs Pendientes de Pago`), filtros, acciones de eliminar OT / actualizar estado de Solicitud.

**Administración de catálogos**
- `RecursosScreen` (`/recursos`) — CRUD de Personal, Calendarios, Equipos/Herramientas, Suministros, Puestos, Plantillas.

**Finanzas y contabilidad**
- `FinanzasScreen` (`/finanzas`) — cuentas por cobrar, pago a personal (`RegistroPagoRecurso`), resumen mensual.
- `ContabilidadScreen` (`/contabilidad`) — plan de cuentas, libro diario, libro mayor, reportes (balance de comprobación, estado de resultados, balance general) sobre `CuentaContable`/`AsientoContable`.

**Datos masivos**
- `ImportExportScreen` (`/importexport`) — exportación/importación por Excel de Recursos, Suministros, Equipos, Puestos, OTs, Solicitudes.

**Cara al cliente**
- `PortalClienteScreen` (`/portal`) — pestañas "Mis Pedidos" (búsqueda de estado), "Documentos" (cotización), "Contacto".

### 10. Comunicaciones salientes

- **Correo (Brevo/SMTP)**: cotizaciones al cliente (con botones Aceptar/Rechazar embebidos), notificación al supervisor con el link del portal de ejecución.
- **WhatsApp**: deep link `wa.me` generado en el frontend (sin API de WhatsApp Business), usado para resúmenes y el link del Portal del Cliente/reporte.

### 11. Sincronización de datos

El frontend no usa store global ni websockets: `App.jsx` carga `GET /api/data` al montar (trae calendarios, equipos, ots, recursos, solicitudes, suministros, puestos y plantillas de una vez) y hace polling cada 30s, aplicando solo los cambios detectados por diff. Finanzas, Contabilidad e Importar/Exportar consultan sus propios endpoints bajo demanda, fuera de ese polling global.

### 12. Referencia a arquitectura técnica

Para convenciones de código, estructura de carpetas y patrones a seguir, ver [CLAUDE.md](../CLAUDE.md). Para el estado y plan de la tipografía y el sistema de diseño visual (fuera del alcance funcional de este documento), ver [plan-tipografia.md](plan-tipografia.md) y [plan-sistema-diseno.md](plan-sistema-diseno.md) — ambos documentos de planificación visual, no tocados por este análisis.

---

## Parte IV — Gap Analysis

### Gap 1 — Informe de Evaluación

**Descripción**: hoy no existe ningún registro del levantamiento en terreno previo a cotizar. `TratamientoScreen` va directo de la Solicitud a armar tareas/componentes, sin capturar condiciones del sitio, riesgos ni metodología.

**Decisión confirmada (2026-08-16)**: el Informe de Evaluación no es solo texto libre — debe permitir ingresar **los mismos campos que la OT**: tareas (descripción, puesto, duración), herramientas/componentes (cantidad, tipo) y logística, además de los campos cualitativos (condiciones del sitio, riesgos, metodología, fotos). Esto es estructuralmente idéntico a lo que hoy ya hace una `Plantilla` (mismos sub-schemas `tareas[]`/`componentes[]`/`logistica[]`) — se reutiliza el mismo patrón: se cargan en el Informe durante la visita, y luego se **aplican a la OT** con una acción explícita (análoga al botón "Aplicar Plantilla" que ya existe hoy), donde el Planificador completa lo que falta (fecha, hora, operario por tarea — igual que hoy se completa después de aplicar una Plantilla).

**Solución propuesta**: nueva pestaña 1 "Informe Inicial" en `TratamientoScreen`, que bloquea el acceso a la pestaña de Tareas hasta estar completa con los campos mínimos: fecha del levantamiento, responsable, condiciones del sitio (texto + fotos), tareas/herramientas/componentes/logística identificados (estructurados), riesgos, metodología. Un botón "Aplicar a la OT" copia esas tareas/componentes/logística a los arrays reales de la OT, igual que hoy hace aplicar una Plantilla.

**Impacto de negocio**: alto — es la base del principio rector "compromiso realista"; sin esto, la cotización se sigue armando "a ojo". Al quedar estructurado (no solo texto), además evita reescribir dos veces la misma información (una en el informe, otra en la OT).

**Esfuerzo estimado**: M — más grande que un formulario de texto simple, pero reutiliza los mismos editores de tareas/componentes/logística que ya existen hoy en `TratamientoScreen` y en la aplicación de Plantillas, en vez de construirlos desde cero.

**Pantallas afectadas**: `TratamientoScreen`.

**Dependencias**: ninguna — puede implementarse primero, de forma independiente. La validación de stock sobre los componentes cargados en el Informe (Gap 2b) se beneficia de hacerse desde esta misma pestaña, no solo más adelante en Tareas.

### Gap 2 — Gestión de stock y validación en OT

**Descripción**: `Suministro` no tiene ningún campo de cantidad (ni `stockActual` ni equivalente). `TratamientoScreen` permite agregar cualquier cantidad de cualquier componente sin cruzar contra disponibilidad real.

**Solución propuesta**, en 3 partes:
- a) En Recursos (pestaña Suministros): columna Stock actual, edición manual, historial de movimientos.
- b) En Tratamiento (pestañas Equipos/Herramientas y Suministros Directos): mostrar stock disponible por línea, alerta visual si la cantidad pedida excede el stock.
- c) Botón "Programar" bloqueado si hay faltantes de stock sin OC recibida que los cubra.

**Regla de negocio**: la OT solo puede pasar a `Programada` si cumple con el stock (directamente o vía OC ya recibida).

**Impacto de negocio**: alto — evita comprometer al cliente con materiales que no están.

**Esfuerzo estimado**: M (conjunto de las 3 partes).

**Pantallas afectadas**: `RecursosScreen`, `TratamientoScreen`, `GanttScreen` (el bloqueo de "Programar" vive ahí o en Tratamiento, a definir en implementación).

**Dependencias**: la parte (c) depende de que exista el Gap 3 (Órdenes de Compra) para que "sin OC recibida que los cubra" tenga sentido; las partes (a) y (b) son independientes.

### Gap 3 — Módulo de Compras (nuevo módulo completo)

**Descripción**: no existe ningún concepto de Proveedor ni de Orden de Compra en el sistema — ni modelos, ni rutas, ni pantallas.

**Componentes**:
- CRUD de Proveedores (nombre, contacto, correo, tipo de insumo, RUT si aplica).
- Generación **manual** de OCs asociadas a una OT (el Planificador/Comprador decide cuándo generar la OC — no es automático).
- Envío de OC por correo al proveedor (reutiliza la infraestructura Brevo existente).
- Ingreso de insumos recibidos (mueve stock a bodega).
- Estados de OC: `Emitida`, `Aceptada por proveedor`, `En tránsito`, `Recibida`, `Pagada`.
- Una OT puede tener varias OCs (una por proveedor).

**Impacto de negocio**: alto — es el mecanismo que cierra el ciclo "no cotizar lo que no se puede ejecutar" cuando falta stock.

**Esfuerzo estimado**: L — es un módulo nuevo completo (modelos, rutas, controladores, pantalla).

**Pantallas afectadas**: nueva pantalla de Compras; `TratamientoScreen` (botón "Generar OC" desde un componente faltante); `DashboardScreen`/Finanzas (OCs pendientes de pago, ver Gap 7).

**Dependencias**: Gap 2 (necesita que `Suministro` tenga stock para saber qué falta).

### Gap 4 — Sistema de reserva y congelamiento de recursos

**Descripción**: ni `Recurso` (personal) ni `Suministro` tienen ningún campo de estado/disponibilidad más allá de lo que ya existe en `EquiposHerramientas` (`Disponible/En Uso/Mantenimiento/Reparación`).

**Decisión confirmada (2026-08-16)**: para **Personal**, la reserva **no** se modela con un campo de estado global en `Recurso` — se apoya en la programación por fecha que ya usa `GanttScreen` (`Calendario` + `ajustes` + tareas ya asignadas en `OT.tareas`). Una persona reservada para el martes sigue disponible el lunes; un campo único `Disponible/Reservado/En Uso` en el documento de `Recurso` no puede representar eso. El campo de estado explícito con esos tres valores aplica solo a **Herramientas/Equipos** e **Insumos**, que sí son recursos de ítem/cantidad finita sin calendario propio.

**Solución propuesta**:
- **Herramientas/Equipos**: se agrega `Reservado` al enum ya existente de `EquiposHerramientas.estado`.
- **Insumos**: se usa `Suministro.stockReservado` (Gap 2/3) — reservar es incrementar ese número, no cambiar un estado.
- **Personal**: no requiere cambio de schema. La "reserva" queda dada implícitamente por la existencia de tareas con fecha y operario asignado dentro de una OT en estado `Planificada` o posterior (`Planificada`, `Aprobada`, `Programada`, ...). **Decisión confirmada (2026-08-16)**: la capacidad comprometida en `GanttScreen` se calcula desde `Planificada` en adelante — una OT en `Tratada` (todavía en armado, sin cotización lista) no consume capacidad; desde que llega a `Planificada` (tareas y recursos ya definidos, cotización armada) sí se considera comprometida, incluso antes de que el cliente responda.
- En los tres casos: al aceptar la cotización del cliente, herramientas e insumos pasan a `Reservado`; al iniciar la ejecución, pasan a `En Uso`; al terminar la OT, liberan a `Disponible`.

**Impacto de negocio**: alto — sin esto, dos OTs pueden comprometer la misma herramienta o el mismo insumo sin que el sistema lo detecte.

**Esfuerzo estimado**: S (se redujo respecto a la estimación original al no requerir cambios de schema en `Recurso`).

**Pantallas afectadas**: `TratamientoScreen` (disparo de la reserva al aceptar cotización), `GanttScreen` (validar el punto de capacidad señalado arriba), `RecursosScreen` (ver estado de herramientas/insumos).

**Dependencias**: Gap 2 y Gap 3 (la reserva de insumos necesita que el stock exista primero).

### Gap 5 — SLA de respuesta (versión simple)

**Descripción**: no hay ninguna visualización de cuánto tiempo lleva una Solicitud sin respuesta.

**Decisión confirmada (2026-08-16)**: el SLA mide el tiempo que la Solicitud lleva **sin tratar** (es decir, mientras la OT vinculada no exista o siga sin llegar a `Tratada`), no el tiempo hasta el envío efectivo de la cotización. No se requiere ningún timestamp nuevo.

**Solución propuesta**: usar el timestamp ya existente al ingresar la Solicitud (`fechaHoraSolicitud`) y mostrar el tiempo transcurrido en cada solicitud sin tratar con colores por umbral: verde (menos de 24 horas), amarillo (24–48 horas), rojo (más de 48 horas). Deja de contar (o se congela) en cuanto la OT llega a `Tratada`. Se muestra en la pantalla de Solicitudes y en el Panel de Control Macro.

**Impacto de negocio**: medio-alto — hace visible el cumplimiento del principio rector de SLA de 1-2 días.

**Esfuerzo estimado**: S.

**Pantallas afectadas**: `IngresoScreen`, `DashboardScreen`.

**Dependencias**: ninguna — puede implementarse en paralelo con el Gap 1.

### Gap 6 — Vista tabular consolidada de OTs con actividades

**Descripción**: hoy el Dashboard muestra el pipeline por etapa pero no una tabla operativa con el detalle de cada OT en un solo vistazo.

**Solución propuesta**: nueva sección dentro del Panel de Control Macro. Tabla con columnas: N° OT, Cliente, Actividad principal, Recursos asignados (personal + herramientas + insumos, resumido), Estado, Fecha comprometida, Faltantes de stock, Acción rápida. Filtros: por estado, cliente, planificador, rango de fechas.

**Impacto de negocio**: medio — mejora la visibilidad operativa diaria, no desbloquea un proceso de negocio nuevo por sí sola.

**Esfuerzo estimado**: M.

**Pantallas afectadas**: `DashboardScreen`.

**Dependencias**: Gap 2 (la columna "Faltantes de stock" necesita que el stock exista).

### Gap 7 — Dashboard mejorado y consolidado

**Descripción**: el Dashboard actual tiene 4 KPIs fijos (`Solicitudes Pendientes`, `OTs Activas`, `Horas Planificadas`, `OTs Pendientes de Pago`) sin relación con OCs (que no existen hoy) ni con el nuevo flujo de evaluación.

**Solución propuesta**: reorganización del Panel de Control Macro en una sola pantalla apilada verticalmente:
- Zona superior: 5 KPIs destacados en bloques horizontales — Solicitudes pendientes (número + tiempo promedio), Solicitudes tratadas (esperando respuesta cliente), Solicitudes ejecutadas, OCs pendientes de pago (número + monto total), OTs pendientes de pago (número + monto total).
- Zona media: pipeline visual por etapa (mejorado del actual).
- Zona inferior: vista tabular operativa (Gap 6).

Cada KPI es clickeable para filtrar la vista tabular inferior. Aprovechar mejor los espacios existentes, layout más denso pero organizado.

**Impacto de negocio**: medio — visibilidad gerencial, no bloquea operación.

**Esfuerzo estimado**: S–M.

**Pantallas afectadas**: `DashboardScreen`.

**Dependencias**: Gap 3 (KPI de OCs pendientes de pago necesita que existan las OCs), Gap 6 (comparte la misma pantalla).

---

## Parte V — Propuesta de integración

### Cambios en modelo de datos [Detalle técnico]

**Nuevas colecciones:**

```
Proveedor
  nombre: String (requerido)
  contacto: String
  correo: String
  telefono: String
  tipoInsumo: String
  rut: String (opcional)

OrdenCompra
  numeroOC: String (autogenerado, mismo patrón que numeroOT/numeroSolicitud)
  proveedorId: ObjectId ref Proveedor
  otId: ObjectId ref OT
  items: [{ suministroId: ObjectId ref Suministro, descripcion: String, cantidad: Number, precioUnitario: Number }]
  estado: enum ['Emitida','Aceptada por proveedor','En tránsito','Recibida','Pagada']
  fechaEmision: Date
  fechaRecepcion: Date
  total: Number

MovimientoStock
  suministroId: ObjectId ref Suministro
  tipo: enum ['Ingreso','Salida','Ajuste','Reserva','Liberación']
  cantidad: Number
  fecha: Date
  otId: ObjectId ref OT (opcional — no todo movimiento nace de una OT)
  ordenCompraId: ObjectId ref OrdenCompra (opcional)
  motivo: String
  usuario: String

InformeEvaluacion — embebido en OT (OT.informeEvaluacion), no colección aparte
  fecha: Date
  responsable: String
  condicionesSitio: String
  fotos: [String]
  recursosObservados: String
  riesgos: String
  metodologia: String
  completo: Boolean (gatilla el bloqueo de la pestaña Tareas)
  -- estructurado igual que la OT, decisión confirmada 2026-08-16 (ver Gap 1):
  tareas: [{ descripcion: String, puesto: String, duracion: Number }]
  componentes: [{ codigo: String, descripcion: String, cantidad: Number, precio: Number, tipo: String }]
  logistica: [{ descripcion: String, cantidad: Number, unidad: String, precio: Number }]
  -- al "aplicar" el Informe a la OT (mismo patrón que aplicar una Plantilla), estos tres arrays
  -- se copian a OT.tareas/OT.componentes/OT.logistica, donde se completan fecha/hora/operario
```

**Cambios en colecciones existentes:**

```
Solicitud
  (sin cambios de schema — fechaHoraSolicitud ya cumple el rol de "fecha de ingreso" para el SLA)

Suministro
  + stockActual: Number, default 0
  + stockReservado: Number, default 0
  + bodega: String (opcional, bodega única en MVP)

EquiposHerramientas
  ~ estado: agregar 'Reservado' al enum existente

Recurso
  (sin cambios de schema — decisión confirmada 2026-08-16, ver Gap 4: la reserva de personal
   se apoya en la programación por fecha que ya usa GanttScreen, no en un campo estado global)

OT
  + informeEvaluacion: (embebido, ver arriba)
  + ordenesCompra: [ObjectId ref OrdenCompra]
  ~ componentes[]: agregar suministroId/equipoId de referencia (hoy solo guarda "codigo" como copia
    de texto). Decisión confirmada 2026-08-16: se acepta el cambio; aplica solo hacia adelante,
    las OTs ya creadas quedan sin esa referencia retroactiva.
  ~ estado: agregar 'Aprobada' y 'Rechazada' al enum existente, entre 'Planificada' y 'Programada'
    (decisión confirmada 2026-08-16, ver Parte II.7)
```

### Cambios en API [Detalle técnico]

| Endpoint | Método | Propósito |
|---|---|---|
| `/api/proveedores` | GET, POST | Listar / crear proveedores |
| `/api/proveedores/:id` | PUT, DELETE | Editar / eliminar proveedor |
| `/api/ordenes-compra` | GET, POST | Listar / crear OC |
| `/api/ordenes-compra/:id` | PUT | Editar OC / cambiar estado |
| `/api/ordenes-compra/:id/enviar` | POST | Envía la OC por correo al proveedor (Brevo) |
| `/api/ordenes-compra/:id/recibir` | POST | Marca `Recibida`, genera `MovimientoStock` de tipo Ingreso, actualiza `Suministro.stockActual` |
| `/api/suministros/:id/stock` | PUT | Ajuste manual de stock (genera `MovimientoStock` tipo Ajuste) |
| `/api/movimientos-stock` | GET | Historial filtrable por `suministroId` |
| `/api/ots/:id/informe-evaluacion` | PUT | Guarda/actualiza el Informe de Evaluación de una OT |
| `/api/dashboard/tabla-operativa` | GET | Datos agregados para la vista tabular del Gap 6 (fuera del polling de `/api/data` — ver nota) |

**Nota de rendimiento**: la vista tabular del Gap 6 y los KPIs de OCs (Gap 7) requieren cruces entre OT, Suministro y OrdenCompra que son costosos de recalcular cada 30 segundos dentro del payload único de `/api/data`. Se propone un endpoint separado, consultado bajo demanda (mismo patrón que Finanzas/Contabilidad hoy), no agregado al polling global.

### Cambios en UI/UX (funcional, sin proponer estética)

| Cambio | Pantalla | Descripción funcional |
|---|---|---|
| Pestaña "Informe Inicial" (con tareas/componentes/logística estructurados) | TratamientoScreen | Primera pestaña del flujo; bloquea "Tareas" hasta completarse |
| Botón "Aplicar a la OT" | TratamientoScreen | Copia tareas/componentes/logística del Informe a la OT, mismo patrón que aplicar Plantilla |
| Confirmación antes de enviar cotización | TratamientoScreen | Paso de confirmación del propio Planificador (no bloquea a otro actor) antes del botón "Enviar" |
| Columna Stock + historial | RecursosScreen (Suministros) | Ver y editar cantidad disponible por insumo |
| Alerta de stock insuficiente | TratamientoScreen (Equipos/Suministros) | Aviso visual por línea si la cantidad pedida excede el stock |
| Botón "Programar" con bloqueo | TratamientoScreen o GanttScreen | Deshabilitado + mensaje si hay faltantes sin cubrir |
| Pantalla nueva de Compras | nueva ruta `/compras` | CRUD Proveedores, CRUD OCs, acción enviar/recibir |
| Indicador de reserva de recursos | RecursosScreen, GanttScreen | Estado visible por recurso/herramienta |
| Badge de SLA con color | IngresoScreen, DashboardScreen | Tiempo transcurrido + color por umbral |
| Tabla operativa consolidada | DashboardScreen | Nueva sección con filtros |
| 5 KPIs + layout reorganizado | DashboardScreen | Reemplaza los 4 KPIs actuales |

### Dependencias, esfuerzo y prioridad (resumen)

| Gap | Depende de | Esfuerzo | Prioridad de negocio |
|---|---|---|---|
| 1. Informe de Evaluación | — | M | Alta |
| 2. Stock y validación | — (parte c depende del Gap 3) | M | Alta |
| 3. Módulo de Compras | Gap 2 | L | Alta |
| 4. Reserva de recursos | Gap 2, Gap 3 | M | Media |
| 5. SLA de respuesta | — | S | Media |
| 6. Vista tabular consolidada | Gap 2 | M | Media |
| 7. Dashboard consolidado | Gap 3, Gap 6 | S–M | Baja–Media |

---

## Parte VI — Roadmap sugerido

### Fase 1 — Fundamentos operativos

**Entregables**: sistema de stock básico (Gap 2, parte a: stock en Recursos), Informe de Evaluación (Gap 1), SLA de respuesta (Gap 5).

**Qué desbloquea**: el proceso de negocio real empieza a reflejarse en el sistema — se levanta información en terreno antes de cotizar, y se puede ver cuánto tiempo lleva cada solicitud sin respuesta.

**Esfuerzo total estimado**: M+M+S.

**Dependencias con otras fases**: ninguna — es la base de todo lo demás.

**Riesgos**: bajo. Los tres gaps son aditivos (campos y pantallas nuevas), no modifican flujos existentes de forma destructiva.

### Fase 2 — Módulo Compras y reserva de recursos

**Entregables**: módulo Compras completo (Gap 3), reserva/congelamiento de recursos (Gap 4), validación de stock en Tratamiento (Gap 2, partes b y c).

**Qué desbloquea**: gestión completa del ciclo compra → reserva → ejecución; es la fase que materializa el principio rector "no cotizar lo que no se puede ejecutar".

**Esfuerzo total estimado**: L+M+M.

**Dependencias con otras fases**: requiere que la Fase 1 (stock básico) esté cerrada.

**Riesgos**: medio-alto. Es la fase más grande (módulo nuevo completo) y la que más decisiones de diseño de datos requiere resolver antes de empezar — ver Parte VII, varios puntos "Requiere confirmación" caen aquí (referencia de `componentes[]` a `Suministro`, modelo de reserva de personal).

### Fase 3 — Control macro consolidado

**Entregables**: Dashboard rediseñado con KPIs (Gap 7), vista tabular operativa (Gap 6).

**Qué desbloquea**: visibilidad panorámica para toma de decisiones gerenciales.

**Esfuerzo total estimado**: M+(S–M).

**Dependencias con otras fases**: requiere Fase 2 cerrada (los KPIs de OCs y la columna de faltantes de stock necesitan que Compras y Stock ya existan).

**Riesgos**: bajo — es principalmente agregación y presentación de datos que ya existirían en Fases 1-2.

### Fase 4 — Optimizaciones y pulido

**Entregables**: alineación con [plan-tipografia.md](plan-tipografia.md) y [plan-sistema-diseno.md](plan-sistema-diseno.md), mejoras de UX según feedback de uso real, documentación de usuario final.

**Esfuerzo total estimado**: variable, depende del alcance que se apruebe de los planes de diseño (ambos ya tienen su propio roadmap por fases independiente).

**Dependencias con otras fases**: idealmente después de la Fase 2, para no rediseñar visualmente pantallas que todavía van a cambiar de estructura (p. ej. Tratamiento gana una pestaña nueva en Fase 1).

**Riesgos**: bajo — es la fase más discrecional y diferible sin costo funcional.

---

## Parte VII — Contradicciones detectadas

1. **Modelo de actores sin modelo de permisos**: el proceso de negocio describe actores con responsabilidades diferenciadas (Cliente, Planificador, Supervisor, Ejecutor), pero el sistema no tiene modelo de usuarios ni autenticación real. La única verificación existente es un middleware de clave compartida (`middlewares/auth.js`, usado solo en un webhook) y el token aleatorio del Portal Supervisor. Hoy, cualquier persona con acceso a las URLs internas puede operar como cualquier rol. Ningún Gap del listado (1-7) cubre esto explícitamente.

2. **(Resuelto 2026-08-16)** ~~"Aprobación interna antes de enviar cotización" no existe hoy~~: confirmado que la aprobación la hace el propio Planificador — no es un actor distinto esperando a otro. Se resuelve como un paso de confirmación en la misma pantalla (ver Parte V, UI/UX), no como un nuevo estado de OT ni un flujo de espera entre personas.

3. **(Resuelto 2026-08-16)** ~~"Aprueba condiciones en terreno" no tiene equivalente explícito~~: el Supervisor de terreno, según el proceso descrito, aprueba las condiciones antes de iniciar. El Portal Supervisor actual (`otController.supervisorAccion`) permite iniciar/pausar/reportar/finalizar, pero no hay un paso separado de "veto de condiciones" antes de arrancar. **Decisión confirmada**: queda fuera de alcance de este roadmap, igual que el control de acceso por rol (decisión 2) — no se agrega ningún paso nuevo al Portal Supervisor.

4. **El campo `fechaIngreso` propuesto para el Gap 5/Parte V ya existe**: `Solicitud.fechaHoraSolicitud` (con `default: Date.now`) cumple exactamente ese rol hoy. No se requiere agregar un campo nuevo — es una simplificación respecto a lo solicitado originalmente, marcada en la Parte V.

---

## Parte VIII — Decisiones confirmadas y preguntas abiertas

### Decisiones confirmadas (2026-08-16, primera ronda)

1. **Modelo de reserva de Personal**: se apoya en la programación por fecha que ya usa `GanttScreen` (`Calendario` + `ajustes` + `OT.tareas`), sin agregar un campo `estado` global a `Recurso`. El campo `estado` explícito (`Disponible/Reservado/En Uso`) queda reservado para Herramientas/Equipos e Insumos. Ver Gap 4 y Parte V actualizados.

2. **Alcance del control de acceso**: queda **fuera de alcance de este roadmap por ahora**. La Contradicción 1 de la Parte VII (ausencia de modelo de usuarios/roles) se documenta como una limitación conocida y aceptada, no como un Gap a resolver en esta ronda.

3. **Referencia de `OT.componentes[]` al catálogo real**: se acepta agregar `suministroId`/`equipoId` a cada línea de `componentes`. Aplica solo hacia adelante — las OTs ya creadas quedan sin esa referencia retroactiva, sin plan de migración de datos históricos.

### Decisiones confirmadas (2026-08-16, segunda ronda)

4. **Paso de "aprobación interna"**: lo hace el propio Planificador (mismo actor que arma la cotización, no un tercero). Se resuelve como un paso de confirmación en `TratamientoScreen` antes de enviar, no como un nuevo estado de OT ni un flujo de espera. Ver Gap 4/Parte V y Contradicción 2 (Parte VII, ahora resuelta).

5. **Alcance del SLA**: mide el tiempo que la Solicitud lleva **sin tratar**, usando `fechaHoraSolicitud` (sin campo nuevo). Se congela al llegar a `Tratada`. Ver Gap 5 actualizado.

6. **Estructura del Informe de Evaluación**: estructurado, no texto libre — incluye tareas, herramientas/componentes y logística con los mismos campos que la OT, para poder "pasarse" directamente a la OT al aplicarlo (mismo mecanismo que aplicar una Plantilla hoy). Ver Gap 1 y Parte V actualizados.

7. **Multi-bodega**: una sola bodega para el alcance actual (`Suministro.bodega` como campo de texto simple). Confirmado, sin cambios respecto a lo asumido.

8. **Transición de rechazo del cliente**: se agregan `Aprobada` y `Rechazada` al enum de `OT.estado`, entre `Planificada` y `Programada`. Ver Parte II.7 y Parte V actualizadas.

9. **Capacidad del Gantt**: cuenta la capacidad comprometida desde `Planificada` en adelante (`Planificada`, `Aprobada`, `Programada`, ...) — una OT todavía en `Tratada` no consume capacidad. Ver Gap 4 actualizado.

10. **"Aprueba condiciones en terreno" (Supervisor)**: queda **fuera de alcance de este roadmap**, igual que el control de acceso por rol (decisión 2). No se agrega ningún paso nuevo al Portal Supervisor. Ver Contradicción 3, Parte VII (resuelta).

### Preguntas abiertas

Ninguna — las 7 preguntas planteadas en las dos rondas de revisión quedaron resueltas.
