# Funcionalidades de erp-taller

Resumen funcional de la aplicación: qué hace cada módulo, qué flujo de negocio cubre y qué pantallas/endpoints lo implementan. Para convenciones técnicas y arquitectura de código ver [CLAUDE.md](../CLAUDE.md).

## Flujo central del negocio

```
Solicitud (cliente pide un trabajo)
   → OT / Orden de Trabajo (se cotiza, planifica y agenda)
      → Ejecución en terreno (portal supervisor, reportes con fotos)
         → Informe / Cierre
            → Cobro y pago (finanzas, contabilidad)
```

Una `OT` recorre el siguiente ciclo de estados (`erp-backend/src/models/OT.js`):

`Pendiente` → `Tratada` → `Planificada` → `Programada` → `En Ejecución` → `Trabajo Terminado` → `Con Informe` → `Pagada`

Este pipeline es visible como línea de tiempo en el Dashboard y como badges de estado en el Portal del Cliente.

## Módulos (pantallas de `erp-web`)

### 📥 Solicitudes — `IngresoScreen` (`/`)
Punto de entrada de nuevas solicitudes de clientes. Formulario de intake (empresa, contacto, descripción, plazo, adjuntos) que crea una `Solicitud`. Permite liberar manualmente una solicitud de vuelta a "Pendiente" y disparar el envío del link del Portal del Cliente.

### 📊 Control Macro — `DashboardScreen` (`/dashboard`)
Vista general de todas las Solicitudes/OTs combinadas, con:
- Pipeline visual por etapa (Solicitud → Tratamiento → Planificada → Programada → Ejecución → Terminado → Con Informe → Pagada), cada una con color propio.
- Filtros (todos / solo OTs / etc.) y total de horas planificadas agregadas.
- Acciones para eliminar una OT (libera la solicitud asociada) y actualizar el estado de una solicitud manualmente.

### 🛠️ Tratamiento — `TratamientoScreen` (`/tratamiento`)
Donde se arma el contenido real de una OT a partir de una solicitud:
- **Tareas**: descripción, puesto/especialidad requerida, duración, fecha/hora, uno o varios operarios asignados (`operarioId`/`operarioNombre` son arrays, así que una tarea admite múltiples responsables).
- **Componentes**: materiales/equipos con cantidad y precio.
- **Logística**: ítems de transporte/traslado.
- Aplicación de **Plantillas** (`Plantilla`) para precargar tareas/componentes/logística típicos de un tipo de trabajo.
- Generación de **cotización en PDF** (`jspdf` + `jspdf-autotable` + `html2canvas`) y envío por correo (vía Brevo) o por WhatsApp (link `wa.me` armado en el cliente).
- Envío del trabajo al **Portal Supervisor** (genera token de ejecución y manda el link por email).

### 📅 Plano / Gantt — `GanttScreen` (`/gantt`)
Programación visual de tareas por operario y fecha:
- Calcula horas disponibles por día por recurso (`obtenerHorasParaDia`, en `App.jsx`) combinando el `Calendario` asignado (turno semanal o rotativo) con ajustes manuales por fecha.
- Detecta y resalta **sobrecarga de capacidad**: compara horas de tareas asignadas vs. horas disponibles del recurso ese día/semana, marcando en rojo cuando la carga supera la capacidad.
- Panel de alerta listando los recursos que superan su capacidad disponible en el rango visible.

### 🧾 Portal Supervisor (sin pantalla en `erp-web` — HTML servido por el backend)
Flujo de ejecución en terreno sin login, protegido solo por un token aleatorio (`OT.tokenEjecucion`):
- El backend genera el token, arma un PDF/resumen y lo envía por correo al supervisor (`otController.enviarAlSupervisor`).
- El link abre una página HTML server-rendered (`otController.supervisorPortal`) donde el supervisor puede: iniciar la ejecución, posponer, marcar interrupciones, subir reportes (foto + comentario) y finalizar tareas — sin necesidad de credenciales, todo por `?token=`.
- Las acciones quedan registradas como `OT.reportes[]` (fecha, comentario, foto, usuario).

### 📷 Reporte de Terreno — `ReporteTerreno` (`/reporte?id=`)
Vista de reportes de campo de una OT específica (fotos + comentarios), usada tanto desde el ERP interno como enlazada desde comunicaciones al cliente/supervisor.

### 🛠️ Recursos — `RecursosScreen` (`/recursos`)
Pantalla administrativa/CRUD central para los catálogos maestros:
- **Personal (`Recurso`)**: alta/edición/borrado, asignación de `Calendario` (turno), ajustes manuales de horas por fecha, registro de ausencias.
- **Calendarios (`Calendario`)**: turnos semanales o rotativos (ciclo de N días con bloques horarios `inicio`/`fin` por día).
- **Equipos y Herramientas (`EquiposHerramientas`)**: catálogo de maquinaria/herramientas/instrumentos con estado (Disponible/En Uso/Mantenimiento/Reparación).
- **Suministros (`Suministro`)**: catálogo de insumos/repuestos/transporte con código único y precio.
- **Puestos (`Puesto`)**: especialidades/roles con costo por hora, usados para tarificar tareas.
- **Plantillas (`Plantilla`)**: combos reutilizables de tareas + componentes + logística para aplicar rápido en Tratamiento.
- Borrar un `Recurso` o `Calendario` limpia en cascada las referencias colgantes en `OT.tareas` para no romper el Gantt.

### 💵 Finanzas — `FinanzasScreen` (`/finanzas`)
Gestión de flujo de caja operativo, con tres vistas:
- **Cuentas por cobrar**: saldo pendiente/pagado por OT (derivado de `OT.pago` y `granTotal`), filtrable por estado de pago.
- **Pago a personal**: registro diario de asistencia/horas trabajadas por recurso (`RegistroPagoRecurso`), selección múltiple para marcar como pagado en lote (fecha, método de pago), agrupación de pendientes/pagados por persona.
- **Resumen mensual**: totales agregados por mes.

### 📚 Contabilidad — `ContabilidadScreen` (`/contabilidad`)
Módulo contable de partida doble sobre `CuentaContable` y `AsientoContable`:
- **Plan de cuentas**: CRUD de cuentas (tipo Activo/Pasivo/Patrimonio/Ingreso/Gasto, naturaleza Deudora/Acreedora, jerarquía por `padreId`).
- **Libro diario**: listado de asientos filtrable por fecha/tipo, creación manual de asientos con líneas debe/haber múltiples, anulación de asientos (genera reversa, no borra el historial).
- **Libro mayor**: movimientos de una cuenta específica en un rango de fechas.
- **Reportes**: balance de comprobación, estado de resultados, balance general.
- Los asientos pueden originarse automáticamente (`origen.tipo`: `OT`, `PagoPersonal`, `Ajuste`) o crearse manualmente; cada uno queda trazado a su documento de origen.

### 📤 Importar/Exportar — `ImportExportScreen` (`/importexport`)
Utilidad de datos masivos vía Excel (`xlsx` en el backend):
- **Exportar**: selección múltiple de módulos (Recursos, Suministros, Equipos, Puestos, OTs, Solicitudes) a un único archivo batch, o exportación individual; las OTs admiten filtro por rango de fecha y estado.
- **Importar**: carga de Excel por módulo (Recursos/Suministros/Equipos/Puestos) con reporte de filas insertadas y filas con error.
- **Plantillas vacías**: descarga de un Excel de ejemplo con las columnas esperadas por módulo.

### 🌐 Portal del Cliente — `PortalClienteScreen` (`/portal`)
App orientada a mobile, de cara al cliente final, sin login (no comparte sesión con el ERP interno), con navegación por tabs inferiores:
- **Solicitar**: mismo tipo de formulario de intake que `IngresoScreen`, pero público — crea una `Solicitud` con `numeroSolicitud` autogenerado (`SOL-2026-0001`) y origen `Portal Web`.
- **Mis Pedidos**: búsqueda por número de solicitud, número de OT o nombre; muestra estado con badge, barra de progreso de tareas completadas y cronograma cuando la OT ya fue programada.
- **Documentos**: búsqueda y visualización/impresión de la cotización (desglose de materiales, mano de obra, logística, IVA 19% y total) de una OT ya cotizada.
- **Contacto**: datos fijos de la empresa (dirección, WhatsApp, correo, horario).
- El backend solo expone campos públicos de la OT (`portalController.otPublica`) — nunca el documento completo — para no filtrar información interna al cliente.

## Comunicaciones salientes

- **Correo (Brevo/SMTP)**: cotizaciones al cliente (con botones de Aceptar/Rechazar embebidos que cambian el estado de la OT), notificación al supervisor con el link del portal de ejecución.
- **WhatsApp**: deep link `wa.me` generado en el frontend (sin API de WhatsApp Business), usado para compartir resúmenes y el link del portal del cliente/reporte.

## Sincronización de datos

El frontend no usa un store global ni websockets: `App.jsx` carga `GET /api/data` (que trae de una vez calendarios, equipos, ots, recursos, solicitudes, suministros, puestos y plantillas) al montar y hace polling cada 30s, aplicando solo los cambios detectados por diff. Finanzas, Contabilidad e Importar/Exportar no participan de este polling global: cada una consulta sus propios endpoints (`/api/finanzas/*`, `/api/contabilidad/*`, `/api/import/*`) bajo demanda.
