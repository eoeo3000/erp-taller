# Roadmap de cambios — erp-taller

Resumen ejecutivo. Versión detallada y técnica en [funcionalidades-v2.md](funcionalidades-v2.md).

---

## 1. Resumen ejecutivo

Hoy el sistema cubre bien el ciclo administrativo: solicitud, cotización, programación, ejecución con reportes, y cobro. Lo que falta es lo que conecta la cotización con la realidad operativa: **no hay levantamiento en terreno antes de cotizar, no hay control de stock de insumos, y no hay compras a proveedores**. En la práctica, hoy se puede cotizar y comprometer un trabajo sin verificar si realmente hay materiales o personal disponible para hacerlo.

Se propone incorporar cuatro piezas — Informe de Evaluación previo, control de stock, módulo de Compras, y reserva de recursos — más mejoras de visibilidad (SLA de respuesta, tablero consolidado). El trabajo se organiza en 4 fases entregables de forma independiente, de 1 a 3 semanas cada una según alcance, con la fase más grande (Compras) en el medio del camino.

No se requiere frenar el uso actual del sistema para hacer este trabajo — todos los cambios son aditivos sobre lo que ya existe.

---

## 2. Los 5 cambios más impactantes

1. **Informe de Evaluación obligatorio antes de cotizar.** Hoy se cotiza directo desde la solicitud, sin dejar registro de qué se vio en terreno. Esto es la causa más probable de cotizaciones que después no calzan con la realidad del trabajo.

2. **Control de stock de insumos.** Hoy el catálogo de materiales no sabe cuánto hay disponible — se puede prometer un material que no está en bodega sin que el sistema lo avise.

3. **Módulo de Compras a proveedores.** Cuando falta stock, hoy no hay ninguna forma de generar y hacer seguimiento a una orden de compra desde el sistema — se maneja fuera, sin trazabilidad hacia la OT que la originó.

4. **Reserva de recursos al aceptar la cotización.** Hoy nada impide que el mismo personal, herramienta o insumo se comprometa dos veces en OTs distintas al mismo tiempo.

5. **Visibilidad de SLA de respuesta.** Hoy no hay ninguna señal de cuánto tiempo lleva una solicitud sin respuesta — el objetivo de negocio de responder en 1-2 días no se puede verificar ni gestionar hoy.

---

## 3. Roadmap por fases

**Actualización (revisión de producto, agosto 2026): se agrega una Fase 0 de estabilización, antes de cualquier feature nueva.** Se detectó una tanda de bugs — tres de ellos bloqueantes — registrados en [bugs-conocidos.md](bugs-conocidos.md). El criterio es simple: no tiene sentido seguir agregando funcionalidad nueva sobre una base que hoy produce datos incorrectos (fecha de programación equivocada) o deja partes de una pantalla inaccesibles. La Fase 0 va antes de la Fase 1 original, sin excepción.

```
Fase 0             Fase 1                Fase 2                    Fase 3                 Fase 4
Estabilización     Fundamentos            Compras y reserva          Control macro          Pulido
                   operativos             de recursos                consolidado

- B1, B2, B3       - Informe de           - Módulo de Compras        - Dashboard con        - Alineación
  (bloqueantes)      Evaluación             (proveedores + OCs)         5 KPIs                 visual
- B4 (alta         - Stock básico         - Reserva de recursos      - Tabla operativa       - UX según uso
  severidad)       - SLA de respuesta      - Validación de stock                               real
- B5, B6                                     en cotización
  (rendimiento,
  si el volumen
  de datos ya
  lo justifica)

  variable, según    ~1-2 semanas            ~2-3 semanas               ~1-2 semanas           variable
  alcance de cada
  bug (ver detalle
  en bugs-conocidos.md)
```

La Fase 0 no tiene dependencias — puede (y debe) empezar de inmediato, en paralelo a que se termine de aprobar el resto de este roadmap. La Fase 1 puede avanzar sin esperar a que la Fase 0 esté 100% cerrada, siempre que los tres bloqueantes (B1, B2, B3) ya estén resueltos — B4, B5 y B6 no bloquean el inicio de la Fase 1 pero se recomienda no dejarlos indefinidamente abiertos.

La Fase 2 depende de que la Fase 1 esté cerrada. La Fase 3 depende de la Fase 2 (sus KPIs nuevos necesitan que existan las Compras y el Stock). La Fase 4 es la más flexible y se puede diferir sin costo operativo.

### Gaps nuevos de la revisión de agosto de 2026 — dónde entran

Estos gaps (detalle completo en [funcionalidades-v2.md](funcionalidades-v2.md), Parte IV.A) no tenían un lugar definido en el roadmap original de 4 fases. Se priorizan así, para ubicarlos en las fases de arriba según su prioridad de negocio:

| Gap | Prioridad | Fase sugerida |
|---|---|---|
| 13 — Dependencias entre tareas | Alta | Fase 1 o 2, a definir junto con el resto de Programación |
| 14 — Edición de solicitud antes de evaluación | Alta | Fase 1 — esfuerzo bajo (S), regla de negocio simple sobre algo que ya existe |
| 15 — Configuración de identidad de empresa | Media | Fase 2 o 3 |
| 16 — Ajuste de tablas (Solicitudes) | Baja | Fase 3 o 4 — reutiliza un patrón ya construido, esfuerzo bajo, pero no es urgente |
| 18 — Rediseño Importar/Exportar | Baja | Fase 4, junto con el resto del pulido visual |

**Gap 17 no aparece en esta tabla**: se verificó en la Fase 1 de la revisión de producto que la asignación de trabajos al personal ya está completamente implementada (modelo y pantalla) — no hay nada que priorizar.

---

## 4. Riesgos principales y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El módulo de Compras (Fase 2) es el más grande y el que más decisiones de diseño de datos requiere resolver antes de empezar | Ya resueltas todas las decisiones de diseño de datos pendientes (ver sección 5) — no debería haber bloqueos de diseño una vez iniciada |
| Cambiar cómo se guardan los materiales de una OT (para poder cruzar con stock) no aplica retroactivamente a OTs ya creadas | **Decidido**: se acepta el corte "hacia adelante", sin migración de datos históricos |
| Bloquear la programación por falta de stock puede frenar operación si el catálogo de stock no está bien cargado al arrancar | Cargar y validar el stock inicial antes de activar el bloqueo, no el mismo día |
**Decidido y fuera de alcance de este roadmap**:
- El sistema no tiene login/roles diferenciados por actor — cualquiera con acceso interno puede operar cualquier función. Se acepta esa limitación por ahora; no se agrega como Gap a resolver en esta ronda.
- El Supervisor no tendrá un paso explícito de "aprobar condiciones en terreno" antes de iniciar la ejecución — el Portal Supervisor se mantiene tal como está.

---

## 5. Requisitos previos antes de empezar

Ya decidido:
- Reserva de personal: se apoya en la programación por fecha que ya existe en el Gantt, sin campo de estado nuevo. La capacidad comprometida se cuenta desde el estado `Planificada` en adelante.
- Control de acceso por rol: queda fuera de alcance de este roadmap por ahora.
- Referencia de materiales de OT al catálogo real: aceptada, aplica solo hacia adelante.
- Aprobación interna de la cotización: la hace el propio Planificador, como paso de confirmación en pantalla — no un flujo de espera entre personas.
- SLA: mide el tiempo que la solicitud lleva sin tratar (no el tiempo hasta el envío de la cotización).
- Informe de Evaluación: estructurado (tareas, herramientas, componentes, logística — mismos campos que la OT), no texto libre.
- Bodega: una sola bodega para el alcance actual.
- Rechazo del cliente: se agregan los estados `Aprobada` y `Rechazada` a la OT.
- Aprobación de condiciones en terreno por el Supervisor: fuera de alcance, no se toca el Portal Supervisor.

Pendiente:
- Aprobación de este documento y de [funcionalidades-v2.md](funcionalidades-v2.md) para iniciar la Fase 1.

No quedan preguntas de diseño abiertas — el detalle completo de todas las decisiones está en la Parte VIII de [funcionalidades-v2.md](funcionalidades-v2.md).
