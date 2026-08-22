# Handoff: modo supervisor de la PWA Operativa

Repositorio destino: `eoeo3000/erp-taller`, rama `docs/funcionalidades-v2`.
Prototipo: `prototipo.html` (se abre en cualquier navegador; es la sección **2a** del documento, arriba de todo).
Antecedente: `docs/rediseno/design_handoff_pwa_movil/` — mismas dos PWA, mismos tokens. Este documento agrega el **modo supervisor**, que ahí no existía.
Fidelidad: **alta**. Medidas, porcentajes, colores y copy son definitivos salvo donde se diga lo contrario.

---

## 1. Qué se construye

No es una app nueva. Es una segunda pestaña dentro de la PWA Operativa que ya se especificó:

```
Token de una persona  →  ¿es supervisor de alguna OT vigente?
                         sí  →  abre en "Mi panel"   (pestañas: Mi panel · Mi día)
                         no  →  abre en "Mi día"     (sin pestañas)
```

Un supervisor de terreno también ejecuta con sus manos, así que **no** se separan las apps: serían dos instalaciones y dos tokens para la misma persona. La pestaña *Mi día* es exactamente la pantalla O2 del handoff anterior, sin cambios.

Seis pantallas, en el prototipo rotuladas S1–S6:

| | Pantalla | Para qué |
|---|---|---|
| S1 | Mi panel | Entrada. Cuatro accesos con conteo + seguridad y equipo |
| S2 | Mi semana | Calendario de la semana: horas en horizontal, días en filas. Detectar cruces |
| S3 | Trabajo (OT) | Tablero de tareas de la OT, ingreso por tarea, cierre |
| S4 | Sin informe inicial | Solicitudes sin supervisor: asignarse y agendar la visita |
| S5 | Mis informes | Informes iniciales propios: pendientes y enviados |
| S6 | Solicitudes ejecutadas | Archivo de consulta, sin acciones |

---

## 2. Tokens y escala

Idénticos a `design_handoff_pwa_movil/README.md` §2 y §3 — no se repiten acá para que no existan dos fuentes de verdad. Lo que este modo agrega:

```
fila de día seleccionada     #f2f1ec        gutter del día seleccionado #1c1d1b (texto #fff)
barra de trabajo cerrado     #e6e4dd  borde izq #a3a29a
barra en curso               oklch(0.48 0.10 250 / .18)  borde izq oklch(0.48 0.10 250)
barra pendiente              #f0efeb  borde izq #c2c0b8
barra de visita              oklch(0.55 0.11 65 / .20)   borde izq oklch(0.55 0.11 65)
recuadro de cruce            1.5px solid oklch(0.52 0.13 25), sin relleno
línea de hora actual         2px solid rgba(28,29,27,.45)
casilla de tarea             26×26, borde 1.5px rgba(0,0,0,.28); hecha: borde y glifo × en oklch(0.48 0.10 155)
```

Reglas que no se negocian: sin iconos ni emoji, sin sombras, radio máximo 2 px, objetivo táctil 48 px (acción principal 56 px), cifras en monoespaciada, el color siempre acompañado de palabra.

---

## 3. S1 · Mi panel

Orden vertical exacto:

1. **Encabezado** (fondo blanco): nombre y puesto de la persona; debajo las pestañas `Mi panel` (activa, subrayado `inset 0 -2px 0 #1c1d1b`) y `Mi día`, y a la derecha la fecha de hoy en mono.
2. **Selector de semana**: `Semana` + flechas ‹ › de 44 px + rango `17–23 ago` en mono + `Ver` (acento). Lleva a S2.
3. **Banda de resumen** `#f0efeb`: nº de trabajos vivos en mono 17, personas, y a la derecha `1 cruce` en `oklch(0.52 0.13 25)` — solo el número y la palabra, sin explicación.
4. **Por dónde entrar** — las cuatro entradas, cada una con conteo mono 21 px, título 16 px y una o dos líneas de contexto:

| Entrada | Conteo | Borde izq | Contexto |
|---|---|---|---|
| Hoy en terreno | 2 | `oklch(0.48 0.10 250)` | qué OT está en ejecución y cuál no ha partido |
| Solicitudes sin informe inicial | 3 | `oklch(0.55 0.11 65)` | «sin supervisor · puedo asignármelas» + antigüedad de la más vieja |
| Informes iniciales míos sin enviar | 2 | `oklch(0.52 0.13 25)` | estado de llenado + el que lleva más días |
| Solicitudes ejecutadas | 9 | `#d6d4cd` | «solo para revisar · últimos 30 días» |

5. **Seguridad y equipo** — tres filas de 68 px:
   - `Color del mes · amarillo`: chip 26×26 `oklch(0.82 0.16 95)` con borde, y la regla en palabras (lo revisado en el mes lleva cinta de ese color; otro color queda fuera de servicio). El color del mes es dato de configuración, no calculado.
   - `Reflexión de seguridad`: tema del día, duración, y si ya se registró con el equipo (`No registrada con el equipo` en rojo) + botón `Registrar` de 48 px.
   - `Chat interno`: con quién y sobre qué, contador de no leídos en chip acento, chevron.

**Pendiente de decisión antes de implementar el chat**: si el hilo es por OT (recomendado: en terreno la conversación es sobre un trabajo) o por persona, y si la oficina lo lee desde el ERP de escritorio. Sin eso resuelto, la fila queda como enlace inerte.

---

## 4. S2 · Mi semana — geometría exacta

Esta pantalla es la que más se equivoca al implementar. La regla de fondo: **nada en px sobre el eje de tiempo**. El ancho del teléfono varía y el marco escala; toda posición horizontal va en porcentaje.

```
canaleta de días        44px   (columna fija a la izquierda: LUN 17, MAR 18, …)
eje                     24 h, 00–23, una celda por hora con flex:1  (nunca width fija)
1 hora                  100/24 = 4.1667 %
rejilla                 dos capas: 12.5% (cada 3 h, rgba(0,0,0,.075)) y 4.1667% (cada hora, rgba(0,0,0,.032))
línea de hora actual    left: calc(48.958% + 22px)   ← 11:45; la constante es 44px × (1 − 0.48958)
                        vive en un envoltorio que contiene SOLO las filas con turno (lun–vie)
marca 11:45             celda de la hora 11 invertida (#1c1d1b, número blanco) + el minuto en la banda de resumen
```

Fórmula general para cualquier hora `h` dentro de una fila: `left = h × 4.1667 %`. Para la línea vertical sobre el conjunto de filas: `calc(h × 4.1667% + 44px × (1 − h/24))`.

**Filas**: una por día. Alto 50 px con un carril, 96 px con dos (y 142 px con tres), carriles de 42 px separados 8 px. Sábado y domingo: 38 px, fondo `#f6f5f2`, texto `Sin turno`, y la rejilla también los cruza.

**Barras y rótulos**: la barra NO lleva texto. A 24 h una barra de 2 h mide ~15 px; el rótulo va **fuera**, alineado a la derecha justo antes de que empiece la barra (`right: calc((24 − hInicio) × 4.1667% + 5px)`), en el mismo carril. Ahí sobra ancho porque la carga real vive entre 08:30 y 17:00. Formato del rótulo: `0007` en mono 12 + cliente en 12.5 + horas en mono 11.5 atenuado.

**Cruce**: dos carriles del mismo día con solape de hora y direcciones distintas → recuadro rojo sin relleno que cubre exactamente el solape y **los dos carriles** (`top:2px;height:90px` en una fila de 96). Se detecta en el cliente sobre la semana ya cargada: mismo `operarioId`, misma `fecha`, rangos que se solapan, direcciones distintas. El supervisor **no** reprograma: la oficina lo hace.

**Entrar a la OT**: doble toque sobre la barra. Gesto sin rótulo = gesto que nadie descubre, así que hay que mostrar una línea de ayuda la primera vez que se abre la semana y no volver a mostrarla (bandera en `localStorage`).

Semana de referencia dibujada en el prototipo (17–23 ago 2026, hoy martes 18, 11:45): `5 trabajos · 38 h`, que es la suma exacta de las barras — lun 6, mar 6+2, mié 6, jue 8+4+2, vie 2+2.

---

## 5. S3 · Trabajo — tablero de la OT

El eje **no** son horas: es la **duración completa de la OT**, una columna por día, para que se vea el panorama entero de una vez.

```
canaleta izquierda   60px  (30 de casilla + 12 de gap + 18 de padding de fila)
eje                  5 columnas de día (LUN 17 … VIE 21), la de hoy con fondo #f2f1ec
unidad interna       jornada de 10 h (08–18) por día → 5 días = 50 unidades
posición             left = ((día × 10) + (hora − 8)) / 50 × 100 %
rejilla              20% (borde de día) + 10% (media jornada)
línea de ahora       dentro de CADA carril de 22 px, nunca en un envoltorio sobre las filas
                     (un contenedor posicionado con z-index crea contexto de apilado y se pinta
                     encima de las notas y los campos de texto — ese bug ya ocurrió)
```

**Una fila por tarea**, y cada fila lleva, en este orden:

1. Casilla 26×26 a la izquierda — marca **realizada**. Hecha: borde y `×` en verde, nombre tachado y en `#8a8981`.
2. Nombre de la tarea (15/600) y a la derecha su rango en mono 12 (`mar 09–15`).
3. Las **personas** asignadas, 13 px; si la tarea está en curso se agrega `· en curso`.
4. El carril de 22 px con su barra.
5. El **ingreso de lo realizado**: si está pendiente, campo `Qué se hizo…` de 44 px + botón `Foto` de 78×44. Si ya se registró, el texto guardado con miniatura 44×34 y `hora · n fotos`.

No hay acción global de «ingresar lo realizado»: se ingresa tarea por tarea, que es como se trabaja en terreno.

**Pie**: `Guardar lo ingresado` (56 px, negro) · `Ver informe` (48 px) · `Trabajo finalizado · informe final` (52 px, **apagado** `#f0efeb`/`#a3a29a` mientras queden tareas sin marcar, con la línea que dice cuántas faltan).

**Versión canónica de la OT del prototipo** — cualquier pantalla que la muestre usa estos mismos números:

| # | Tarea | Persona | Cuándo | h | Estado |
|---|---|---|---|---|---|
| 1 | Diagnóstico inicial en terreno | Patricia Elgueta | lun 17, 09–15 | 6 | hecha |
| 2 | Montaje de canalización | Manuel Zúñiga | mar 18, 09–15 | 6 | en curso · cruce 13:30–15:00 |
| 3 | Conexionado de tablero | Manuel Zúñiga | mié 19, 08:30–14:30 | 6 | pendiente |
| 4 | Pruebas y entrega al cliente | Jorge Huenchullán | jue 20, 08:30–10:30 | 2 | pendiente |
| 5 | Cierre y entrega de informe | Camila Reyes | vie 21, 09–11 | 2 | pendiente |

Total `5 días · 5 tareas · 22 h`; avance `1 de 5 tareas` y `6 / 22 h`.

**Pendiente de decisión**: al tocar `Trabajo finalizado`, ¿la OT se cierra en el acto o queda «lista para facturar» esperando a la oficina? Y falta un estado **no realizada con motivo**, porque hoy una tarea cancelada por el cliente bloquea el cierre para siempre.

---

## 6. S4 · Sin informe inicial

Lista de solicitudes sin supervisor, ordenadas por antigüedad, con borde izquierdo ámbar cuando llevan más de un día. Cada una: número, días esperando, título, cliente y comuna, y el motivo en 14 px. Acción `Asignármela y agendar visita`.

Al tocarla se abre una **hoja inferior** (no un diálogo del navegador) con: día y hora en campos de 52 px, una banda `#f0efeb` que dice cuántas horas libres tiene ese día y si choca con algo suyo, y `Confirmar y asignarme` (56 px) + `Cancelar` (48 px).

Un solo `PUT`: asigna supervisor, crea la visita de evaluación con fecha y hora, y saca la solicitud de la bandeja de los demás. Sin confirmación de oficina. Si dos supervisores la abren a la vez gana el primero, y el segundo ve «ya la tomó Camila» — hay que devolver 409 y ese texto.

---

## 7. S5 · Mis informes · S6 · Ejecutadas

**S5**: pendientes arriba, con barra de progreso de pasos (`2 de 4 pasos`), qué falta y por qué importa («la oficina no puede cotizar sin esto»), acción `Continuar informe` / `Abrir informe`. Debajo, `Enviados este mes` con su desenlace (`Cotizada`, `En oficina`) — así el supervisor ve que su trabajo sirvió para algo.

**S6**: archivo puro. Banda que lo dice explícitamente («Solo consulta · el cierre lo hace la oficina»), agrupado por `Esta semana` / mes, cada fila con OT, cliente, fecha de cierre, horas y nº de fotos. Al abrir: tareas, horas reales y fotos. **Nada editable.**

---

## 8. Lo que falta en el dato — leer antes de codificar

| Punto | Situación |
|---|---|
| **Supervisor a nivel de OT** | Hoy se deduce de `tareas[].puesto === 'Supervisor'` (ver `DashboardScreen.jsx:145` y `:349`). Así no se puede consultar «mis OT» sin recorrer todas las tareas de todas las OT. Es el mismo campo que pide la pestaña Antecedentes de Mejoras v3: agregarlo una vez sirve a las dos cosas |
| **`calcularHorasDia`** | `App.jsx:355` resta en crudo y da minutos negativos en turnos que cruzan medianoche → la capacidad sale 0 o negativa. Mientras no se arregle (punto 6 de `CORRECCIONES.md`), las horas por día de S2 y el `6 / 22 h` de S3 muestran cifras falsas |
| **`actualizarProgresoTarea`** | `App.jsx` usa `oTs.find(...)`, variable inexistente (el estado es `ots`): guardar evidencia desde terreno lanza `ReferenceError`. Hay que arreglarlo antes de conectar el ingreso por tarea de S3 |
| **Ingreso por tarea** | `ReporteTerreno.jsx` guarda evidencia por OT, no por tarea. Se necesita `tareas[].registro = { texto, fotos[], hora, autor }` |
| **Cruces** | Cálculo en el cliente, sin endpoint nuevo. Requiere `tareas[].horaInicio` / `horaFin` reales: hoy hay `fecha` y `duracion`, que no bastan para detectar solape |
| **Sin señal** | La semana y el detalle se leen del caché; marcar tareas, escribir notas y asignarse una solicitud entran a la misma cola local que las fotos de la PWA Operativa |

---

## 9. Orden sugerido

1. Campo supervisor en la OT + `horaInicio`/`horaFin` en tarea. Sin esto, S2 y S3 no se pueden alimentar.
2. Arreglar `calcularHorasDia` y `actualizarProgresoTarea` (bugs conocidos, no cosméticos).
3. S1 y S2 — leen datos, no escriben. Se puede verificar contra el prototipo sin tocar el backend.
4. S3 con `tareas[].registro` y el marcado de realizada.
5. S4 con su `PUT` único y el 409.
6. S5 y S6, que son listados sobre datos que ya existen.
