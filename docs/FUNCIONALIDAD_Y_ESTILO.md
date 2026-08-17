# Funcionalidad y Estilo — ERP Taller

Documento de producto y diseño, sin detalle de código. Describe qué hace el sistema hoy y qué dirección visual sigue, para que cualquiera (dueño, gerencia, diseño) entienda el producto de un vistazo. Para el detalle técnico de implementación, ver [CLAUDE.md](../CLAUDE.md); para el análisis completo de vacíos de negocio, ver [funcionalidades-v2.md](funcionalidades-v2.md).

---

## 1. Funcionalidad

### 1.1 Qué es

Un sistema de gestión para una empresa de servicios (mantenimiento industrial, reparaciones, obras menores) que cubre todo el ciclo: un cliente pide un trabajo, la empresa evalúa si puede hacerlo con los recursos que realmente tiene disponibles, cotiza, ejecuta en terreno y cobra — dejando cada paso registrado.

### 1.2 Módulos existentes

**Solicitudes** — punto de entrada de pedidos de clientes (empresa, contacto, descripción, plazo, adjuntos). Existe tanto una versión interna (para cuando el pedido llega por teléfono o WhatsApp y alguien lo transcribe) como una versión pública sin login dentro del Portal del Cliente. Cada solicitud muestra cuánto tiempo lleva sin ser atendida, con un color de alerta que sube de tono cuanto más tiempo pasa.

**Órdenes de Trabajo (OT) / Tratamiento** — donde se arma el contenido real de un trabajo a partir de una solicitud. Antes de cotizar, exige completar un **Informe de Evaluación en terreno**: condiciones del sitio, riesgos, metodología, y las mismas tareas/herramientas/materiales que después formarán la OT (se cargan una vez y se trasladan a la OT, no se escriben dos veces). Desde ahí se arman tareas con fecha y responsables, se agregan equipos/herramientas y materiales, se genera la cotización en PDF y se envía al cliente por correo o WhatsApp.

**Compras** — módulo para proveedores y Órdenes de Compra. Cuando un trabajo necesita materiales que no hay en stock, se genera una Orden de Compra manualmente (nunca automática), se envía al proveedor por correo, y al marcarla como recibida el stock sube solo. Una orden de trabajo puede tener varias órdenes de compra, una por proveedor.

**Plano / Gantt** — programación visual de tareas por persona y fecha, calculando cuántas horas tiene libres cada quien según su turno (semanal o rotativo) y avisando cuando alguien queda sobrecargado.

**Recursos** — catálogos maestros: personal (con su calendario de turnos), equipos y herramientas (con su disponibilidad), materiales e insumos (con su stock y un historial de movimientos), especialidades/roles (con su costo por hora), y plantillas reutilizables de trabajos típicos.

**Ejecución en terreno (Portal Supervisor)** — el supervisor recibe un link único por correo (sin necesitar usuario ni contraseña) desde donde puede iniciar el trabajo, posponerlo, reportar avances con foto y comentario, y marcarlo terminado.

**Reporte de Terreno** — vista de los reportes de campo (fotos + comentarios) de un trabajo específico.

**Control Macro / Dashboard** — vista general de todas las solicitudes y órdenes de trabajo combinadas, con su etapa actual y totales agregados.

**Finanzas** — cuentas por cobrar, pago a personal por asistencia/horas trabajadas, resumen mensual de caja.

**Contabilidad** — plan de cuentas, libro diario, libro mayor y reportes contables básicos (balance, estado de resultados), con asientos que se generan solos desde ciertos eventos (cobros) o se cargan a mano.

**Importar/Exportar** — carga y descarga masiva por Excel de los catálogos principales.

**Portal del Cliente** — app orientada a celular, sin login, donde el cliente puede pedir un trabajo nuevo, ver el estado de sus pedidos, descargar su cotización y ver los datos de contacto de la empresa.

### 1.3 Flujos de usuario principales

**Crear una orden de trabajo**: llega una Solicitud → se hace una visita de evaluación en terreno y se completa el Informe de Evaluación (condiciones, riesgos, tareas/materiales necesarios) → esas tareas y materiales pasan a la OT y se arma la cotización → si falta stock, se genera una Orden de Compra → se envía la cotización al cliente por correo, con botones de aceptar/rechazar → si acepta, se reservan los recursos comprometidos y se programa en el Gantt → se ejecuta, se reporta y se cierra.

**Asignar un recurso**: desde el Gantt o desde la OT se elige una tarea, se le pone fecha y se le asignan uno o más responsables (una tarea admite varios operarios a la vez); el sistema descuenta esas horas de la disponibilidad de cada persona según su calendario de turno.

**Cubrir un faltante de material**: al armar la OT, si la cantidad pedida de un material supera el stock disponible, queda marcado visualmente; desde ahí se puede generar una Orden de Compra directamente, que llega prellenada con ese material y esa cantidad. El botón para programar el trabajo en el Gantt queda bloqueado hasta que el faltante se cubra (con stock propio o con una compra ya recibida).

**Seguimiento del cliente**: el cliente entra al Portal (por un link enviado por WhatsApp o correo) y busca su pedido por número de solicitud, número de OT o su nombre; ve el estado, el avance de las tareas y puede descargar su cotización.

**Ejecución en terreno**: el supervisor abre el link que le llega por correo, confirma que empieza el trabajo, va subiendo reportes con foto a medida que avanza, y lo marca terminado al finalizar.

### 1.4 Reglas de negocio importantes

- **Un solo lugar concentra la lógica**: toda la información compartida entre pantallas (solicitudes, órdenes de trabajo, recursos, catálogos) y todas las acciones que las modifican viven en un único punto central de la aplicación web, no repartidas por pantalla. Esto significa que un cambio de datos en una pantalla se refleja automáticamente en las demás.
- **La reserva de recursos es automática, no manual**: cuando el cliente acepta una cotización, las herramientas/equipos y materiales comprometidos quedan marcados como reservados solos, sin que nadie tenga que hacerlo a mano; se liberan solos cuando el trabajo termina. El personal no se "reserva" con una marca — su disponibilidad ya se calcula día a día en el Gantt.
- **El tiempo de respuesta se mide y se muestra**: cada solicitud sin atender muestra hace cuánto llegó, con un color que avisa cuando se está por pasar del plazo esperado (1-2 días).
- **No se cotiza lo que no se puede ejecutar**: el sistema empuja a verificar stock y capacidad real antes de comprometerse con el cliente, y bloquea pasos posteriores (programar en el Gantt) si esa verificación no se cumple.
- **Comunicación saliente**: los correos (cotizaciones, notificación al supervisor) se envían a través de un proveedor de correo transaccional externo; los mensajes de WhatsApp son links directos que abren la conversación con el texto ya escrito, no una integración con la API oficial de WhatsApp Business.
- **No hay login diferenciado por rol** — cualquier persona con acceso interno puede operar cualquier función; la única verificación de identidad hoy es el link único que reciben el supervisor y el cliente para sus portales respectivos. Es una limitación conocida y aceptada por ahora, no un descuido pendiente de arreglar en el corto plazo.
- **El idioma del producto** es español (Chile) en toda la aplicación, incluida la terminología de negocio (Solicitud, OT, Puesto, Suministro).

### 1.5 Qué está implementado vs. qué está pendiente

| Área | Estado |
|---|---|
| Solicitudes, OT/Tratamiento, Gantt, Ejecución en terreno, Reporte de Terreno, Dashboard básico, Finanzas, Contabilidad, Importar/Exportar, Portal del Cliente | **Implementado** — funcionalidad base en producción |
| Informe de Evaluación en terreno (previo a cotizar) | **Implementado** |
| Stock de materiales (cantidad disponible, historial de movimientos) | **Implementado** |
| Tiempo de respuesta (SLA) visible en Solicitudes y Dashboard | **Implementado** |
| Módulo de Compras (proveedores, Órdenes de Compra, envío y recepción) | **Implementado** |
| Reserva/liberación automática de herramientas y materiales | **Implementado** |
| Bloqueo de programación por falta de stock sin cubrir | **Implementado** |
| Dashboard con panel de indicadores (KPIs) y vista tabular consolidada de trabajos en curso | **Pendiente** — próxima fase |
| Control de acceso diferenciado por rol / login | **Fuera de alcance por ahora** — decisión de negocio, no una tarea olvidada |
| Paso explícito de "aprobación de condiciones en terreno" por el supervisor antes de empezar | **Fuera de alcance por ahora** |
| Soporte para varias bodegas físicas | **Fuera de alcance por ahora** — el sistema asume una sola bodega |
| Sistema de diseño unificado (tokens, componentes, íconos) | **Pendiente** — ver sección 2; hoy la interfaz no sigue ningún sistema de diseño consistente |

---

## 2. Estilo / Diseño

### 2.1 Dirección visual: Enterprise Classic

La dirección elegida es un estilo **"Enterprise Classic"**, inspirado en el **IBM Carbon Design System**: sobrio, denso, funcional — pensado para una herramienta de trabajo diario de uso interno, no para una landing page. Prioriza legibilidad y densidad de información por sobre la decoración.

Esta dirección **reemplaza** la propuesta anterior documentada en [plan-tipografia.md](plan-tipografia.md) y [plan-sistema-diseno.md](plan-sistema-diseno.md) (que proponían una inspiración Linear/Vercel/Buk, tipografía Inter e íconos `lucide-react`). Esos dos documentos quedan **superados por esta decisión** y deberían archivarse o reescribirse para no confundir a quien los lea después — ninguno de los dos, de todas formas, llegó a implementarse en el código todavía.

### 2.2 Tipografía

**IBM Plex Sans** como familia tipográfica principal en toda la aplicación — la misma familia que usa IBM Carbon, reforzando la identidad "enterprise" del producto. Reemplaza la mezcla actual de `system-ui`/`Avenir`/`Helvetica`/`Arial` que hoy conviven sin criterio entre pantallas.

### 2.3 Paleta de colores

- **Azul corporativo `#0176d3`** como color de acento único — botones primarios, links, elementos interactivos, estado activo de navegación.
- **Grises institucionales** como base de toda la interfaz: fondos, bordes, texto secundario y superficies de tarjetas/tablas se construyen sobre una escala de grises neutros (no los ~15 grises distintos y sin relación entre sí que existen hoy en el código), reservando el color solo para lo interactivo y lo semántico (estados de OT, pagos, alertas).
- Los colores de estado (Pendiente, Aprobada, Rechazada, Pagado, etc.) deben resolverse con una única tabla compartida en toda la aplicación — hoy existen cuatro implementaciones distintas e inconsistentes entre pantallas para el mismo concepto (por ejemplo, "Parcial" se ve amarillo en dos pantallas y azul en una tercera); esa contradicción debe desaparecer con esta paleta.

### 2.4 Convenciones de UI

- **Íconos: Tabler Icons** en reemplazo de los emojis usados hoy como iconografía de navegación, títulos de sección y botones (hoy no hay ninguna librería de íconos instalada — los emojis cumplen ese rol de forma inconsistente entre sistemas operativos).
- **Densidad de tablas: filas de 32–40px de alto.** Es una densidad "enterprise" — más compacta que un formulario de consumo masivo, pensada para que un usuario interno vea muchas filas de una OT, un listado de solicitudes o un historial de stock sin scroll excesivo.
- El resto de las convenciones de espaciado, tamaños de texto y radios de borde quedan por definir con el mismo criterio "Enterprise Classic" en una siguiente iteración de este documento o de un plan de ejecución dedicado.

### 2.5 Sistema de tokens CSS

**No existe todavía.** Hoy el código no tiene ningún archivo de variables de diseño: cada pantalla define sus propios colores, tamaños y sombras directamente en línea, lo que ya produjo inconsistencias reales (más de 100 colores distintos hardcodeados, varias familias de rojo/verde/azul compitiendo por el mismo significado, veinte y tantos estilos de botón distintos sin relación entre sí).

La creación de un archivo único de tokens (tipografía IBM Plex Sans, paleta de azul corporativo + grises institucionales, escalas de tamaño y densidad de tabla) que materialice esta dirección visual queda como trabajo pendiente — es la base necesaria antes de poder unificar cualquier pantalla existente.
