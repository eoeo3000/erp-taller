# Prompt de revisión — docs/estrategia-movil.md

Corrige cuatro puntos de `docs/estrategia-movil.md` sin rehacer el documento. Cópialo tal cual en una sesión de Claude Code sobre este repositorio.

---

```
Revisa docs/estrategia-movil.md sobre los cuatro puntos de abajo, sin
reescribir ninguna otra sección. Antes de editar, lee completos:
  - docs/estrategia-movil.md (el documento a corregir)
  - docs/funcionalidades-v2.md, Gap 8 (contexto del documento)
  - docs/rediseno/design_handoff_panel_control/CORRECCIONES.md completo —
    en particular el punto 7 y la corrección 4.13, ambos agregados después
    de la versión actual de estrategia-movil.md, así que ese documento
    todavía no los refleja
  - docs/rediseno/design_handoff_panel_control/README.md §2 (tokens) y §10

1. Reescribe la sección 5.6 ("Lenguaje visual", dentro de "PWA 1 — Portal
   del Cliente"). Hoy declara que ninguna fuente de tokens gobierna las PWA
   y que se sigue el patrón ad hoc de PortalClienteScreen. Esa lectura
   quedó revisada: las PWA usan los tokens ya implementados del rediseño de
   escritorio (README.md §2 — color oklch, radio máximo 2px, tipografía
   Helvetica Neue/mono, sin sombra salvo menús flotantes), no un tercer
   sistema propio. Corrige también el argumento que llevó a la conclusión
   anterior: CORRECCIONES.md excluye a PortalClienteScreen y ReporteTerreno
   del rediseño como pantallas ya existentes ("no tocarlas"), no como una
   prohibición de que código nuevo (las PWA) adopte esos tokens — son cosas
   distintas y el documento las confundió.

   Lo que SÍ es propio de las PWA, y no se hereda del escritorio, es la
   escala: no los 13px base de la densidad de escritorio, sino una escala
   tipográfica y de controles pensada para móvil — mínimo 16px en texto de
   cuerpo e inputs (evita el zoom automático de Safari en iOS) y un
   objetivo táctil mínimo de 44×44px en todo control interactivo (botones,
   ítems de tab bar, campos de formulario), frente a los 20-30px de altura
   de control que usa hoy el panel de escritorio (README.md §2, tabla de
   alturas).

   Declara con una lista explícita qué patrones de escritorio no viajan al
   móvil y por qué cada uno: el panel de detalle de 300px (el propio
   handoff, §10, lo deja "no diseñado" para móvil y pide definición antes
   de implementarlo), las tablas multi-columna con scroll horizontal, y
   cualquier interacción que dependa de hover (no existe en touch).

2. Corrige la sección 7.4 ("Extensión de la programación"). Hoy declara que
   GanttScreen no tiene ninguna barra de filtros y que el filtro por
   supervisor sería "enteramente nuevo, sin base". Eso ya no es exacto:
   CORRECCIONES.md agregó la corrección 4.13, que introduce una barra de
   filtros en GanttScreen (mismo patrón visual que Ingreso/Panel de
   control: fondo #f0efeb, 37px, input + chips) con un selector de
   operario/supervisor. Reescribe 7.4 apoyándote en esa base en vez de
   partir de cero: especifica qué cambia entre lo que ya cubre 4.13 (el
   selector acota qué filas de OT/capacidad se muestran) y lo que necesita
   la PWA Operativa de este documento (una vista de carga agregada por
   supervisor, no solo ocultar filas — ver §6.1 y §7.2).

3. Incorpora estas cuatro decisiones como confirmadas, no como opciones
   abiertas, en cada punto donde corresponda:
   - §5.2: se exige correo o teléfono, además del número de solicitud/OT,
     para buscar en el Portal del Cliente. Dejar las otras dos alternativas
     de la comparación original (si quedan) solo como opciones descartadas
     con una línea de motivo, no como decisión pendiente.
   - §6.7 y §8: el entorno se propaga por parámetro de query (`entorno=`)
     desde la primera versión de las PWA — no queda pospuesto ni
     condicionado. Ajusta la tabla de endpoints de §8 si describía esto
     como algo a decidir.
   - §7.2: la colección `Asignacion` queda confirmada. Puedes conservar la
     explicación del motivo y el costo (son información real, no
     indecisión), pero sin presentarla como "la decisión de mayor
     consecuencia, sujeta a revisión".
   - §12: M5 (retiro del portal HTML por token de OT una vez la PWA cubra
     el 100% de los casos) queda confirmado como parte del roadmap.
   Si el documento repite en algún resumen las cuatro preguntas abiertas
   del reporte de la sesión anterior, elimínalas o reescríbelas como
   decisiones ya tomadas — no las dejes como abiertas en ninguna parte.

4. NO implementes en este mismo cambio la corrección de enrutamiento del
   punto 7 de CORRECCIONES.md (el link del supervisor aterrizando en
   producción desde demo). Es un cambio de código real sobre
   erp-backend/src/controllers/otController.js y
   erp-backend/src/middlewares/entorno.js, con su propio riesgo de romper
   el flujo de supervisor en producción si se hace mal — va en un commit
   aparte, dedicado solo a eso, con su propia verificación manual (enviar
   una OT a supervisor desde demo y desde producción, confirmar que cada
   una resuelve contra su propia base). Este prompt solo toca
   docs/estrategia-movil.md.

Restricciones: no toques ninguna sección de estrategia-movil.md más allá de
las cuatro anteriores (5.6, 7.4, y los cuatro puntos de decisión del punto
3). No toques funcionalidades-v2.md ni CORRECCIONES.md — ya están
actualizados. No escribas código en este cambio (ver punto 4). Al terminar,
reporta en el chat qué quedó igual en 5.6/7.4 porque ya era correcto y qué
cambió — no reescribas por reescribir donde el texto original ya reflejaba
la decisión corregida.
```
