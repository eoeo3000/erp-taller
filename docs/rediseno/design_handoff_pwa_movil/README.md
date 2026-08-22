# Handoff: PWA móviles de erp-taller

Repositorio destino: `eoeo3000/erp-taller`, rama `docs/funcionalidades-v2`.
Documento base: `docs/estrategia-movil.md` (Gap 8). Este archivo es la especificación visual y de comportamiento; el prototipo navegable es `PWA Movil.dc.html`, que se abre en cualquier navegador.
Fidelidad: **alta**. Medidas, colores y copy son definitivos salvo donde se indique.

---

## 1. Dos aplicaciones, no una

| | PWA Operativa | PWA Cliente |
|---|---|---|
| Quién | Supervisor y ejecutor | Contacto de la empresa cliente |
| Acceso | Token persistente por persona | Teléfono + N° de cualquiera de sus solicitudes |
| Frecuencia | Varias veces al día, en terreno | Ocasional, para saber cómo va |
| Punto de partida | `otController.supervisorPortal`, `ReporteTerreno.jsx` | `PortalClienteScreen.jsx`, `portalController` |
| Pantallas | O1–O6 | C1–C6 |

No se fusionan: el cliente no debe cargar con la interfaz operativa, ni el supervisor con la de seguimiento.

---

## 2. Tokens — los mismos del escritorio

Copiados de `docs/rediseno/design_handoff_panel_control/README.md` §2. No se introduce un tercer lenguaje visual, y **no** se hereda el estilo actual de `PortalClienteScreen.jsx` (tarjetas con sombra, emoji, radios grandes): esa pantalla quedó fuera del rediseño de escritorio por alcance, no porque su estilo esté aprobado. Refactorizarla a PWA incluye alinearla a esta tabla.

```
fondo pantalla     #f6f5f2
superficie         #ffffff
franja / apoyo     #f0efeb
encabezado tabla   #e4e2dc
texto principal    #1a1a18
texto secundario   #3a3a35   #57564f
texto atenuado     #6b6a63   #75746e   #8a8981
deshabilitado      #a3a29a   #c9c7c0
acción primaria    #1c1d1b   (texto #fff)
línea fina         rgba(0,0,0,.06)   bloques rgba(0,0,0,.10)   zonas rgba(0,0,0,.12)

en curso           oklch(0.48 0.10 250)
listo / pagado     oklch(0.48 0.10 155)
atención / demora  oklch(0.55 0.11 65)
detenido / vencido oklch(0.52 0.13 25)

familia UI         "Helvetica Neue", Helvetica, Arial, sans-serif
familia numérica   ui-monospace, Menlo, monospace
radio máximo       2px          sombras: ninguna
```

El color nunca es el único portador del estado: siempre acompaña a una palabra.

---

## 3. Escala tipográfica móvil — propia, no heredada

El 13 px base del escritorio es densidad de planilla. En terreno, con guantes y sol directo, no se lee.

| px / peso | Uso |
|---|---|
| 20 / 700 | Título de pantalla |
| 17 / 600 mono | Cifras, montos, horas, N° de OT destacado |
| 16 / 600 | Título de tarjeta, texto de botón primario |
| 15 / 400 | Cuerpo. **Mínimo absoluto** |
| 13.5–14 / 400 | Secundario, una línea de apoyo |
| 13 / 400 mono | Fechas y horas en línea |
| 11 / 700, .13em, mayúsculas | Versalita de sección |

## 4. Reglas de interacción

- Objetivo táctil mínimo **48 px**. Acción primaria **56 px**, anclada al pie sobre `#fff` con `border-top: 1px solid rgba(0,0,0,.12)`.
- Una sola acción primaria por pantalla.
- Confirmaciones destructivas en hoja inferior, nunca en `window.confirm`.
- Sin iconos ni emoji. Los glifos `× · ▪ ‹` son texto monoespaciado, igual que en el escritorio. No incorporar una librería de iconos.
- Una columna. Ninguna tabla horizontal: cada fila se vuelve bloque de dos líneas.
- Rieles de chips con `overflow-x: auto` y `flex-wrap: nowrap` — nunca recortados.
- Marca de estado en la fila: barra izquierda de 3 px del color del estado.

---

## 5. PWA Operativa

### O1 · Primer acceso
Se llega desde el link del correo. Saludo con el nombre, ficha de tres campos (persona, puesto, emitido), aviso de instalación ("menú del navegador → Añadir a pantalla de inicio") sobre `#f0efeb` con borde izquierdo ámbar de 2 px, botón primario **Entrar a mi día**, y nota al pie sobre revocación si se pierde el teléfono.
Mensaje clave, textual: *"Este link es tu acceso permanente. No caduca al terminar un trabajo y no necesitas clave."*

### O2 · Mi día
Encabezado 52 px: título, fecha mono, enlace **Mi semana** a la derecha.
Franja de resumen `#f0efeb`: número de asignaciones en mono 17 px, horas planificadas, y a la derecha en ámbar el conteo de reportes sin enviar (se omite si es cero).
Lista de asignaciones, una tarjeta por asignación, barra izquierda de 3 px por estado:
- N° de OT mono + estado en versalita 12/700 + hora a la derecha.
- Descripción 16/600, cliente y dirección 13.5.
- Tarea del día y sus horas.
- Botones: **Continuar** + **Reportar** si está en ejecución; **Iniciar trabajo** si está programada; **Levantar informe** si es una visita de evaluación.
Cierra con una línea atenuada: *"Después de las 16:00 no hay más asignaciones. La programación la hace la oficina."*

### O3 · Trabajo en curso
Barra superior con `‹`, N° de OT mono 15/600 y estado a la derecha.
Bloque de identificación (descripción, cliente y contacto, dirección). Franja `#f0efeb` con dos cifras: **En obra desde** (hora + tiempo transcurrido) y **Planificado**.
Sección Tareas: filas de 56 px mínimo, glifo `×` verde para completada (con `line-through` y texto atenuado) o `·` gris; nombre 15, asignados y horas 13; botón **Listo** de 44 px en la tarea abierta.
Sección Reportes de hoy: miniatura 56×42 px, texto 14, y pie mono con hora y estado de envío — `enviado` en atenuado, `en cola, sin señal` en ámbar.
Pie: **Reportar avance** + **Interrupción** (texto en rojo) de 48 px, y **Terminar trabajo** de 56 px.

### O4 · Reporte de terreno
Corresponde a lo que hoy hace `ReporteTerreno.jsx`, reordenado.
Zona de foto de 220 px ("Tomar foto" / "o elegir de la galería"), tira de miniaturas 64×48 con el conteo del reporte, campo de texto de 120 px mínimo con contador `124 / 400` y la advertencia **Se ve en el portal del cliente**, y dos opciones de 52 px: *Avance normal* / *Requiere decisión de la oficina*.
Pie: aviso ámbar cuando no hay señal — *"El reporte queda en el teléfono y se envía solo al recuperar conexión."* — y **Guardar y enviar**.

### O5 · Informe de evaluación
Cuatro pasos, con barra de progreso de 3 px dividida en cuatro segmentos y contador `2 / 4` en la barra superior. El paso ilustrado es Riesgos: opciones de 52 px con glifo `×` / `·`, campo libre "Otro riesgo", y fotos del sitio 76×60 con botón **Agregar**. Pie con **Atrás** (120 px) + **Siguiente**.
Los cuatro pasos siguen el modelo existente `OT.informeEvaluacion`: condiciones del sitio, riesgos, metodología, recursos observados.

### O6 · Mi semana
Solo consulta. Franja con `38 / 44 h` mono y el porcentaje de capacidad. Una fila de 64 px por día: día y horas en mono a la izquierda (52 px), contenido a la derecha en dos líneas. El día actual lleva barra izquierda negra de 3 px; el día sobrecargado muestra las horas en rojo y la línea *"Sobre mi capacidad de 11 h · Avisar a la oficina"*. Sábado sobre `#f6f5f2`.
Cierra: *"La semana la arma la oficina. Aquí solo se consulta y se avisa."*

---

## 6. PWA Cliente

### C1 · Acceso
**El identificador es el teléfono, no el número de solicitud.** Ese es el cambio que permite pasar a C2:

1. **Teléfono registrado** (campo activo) — identifica a la empresa.
2. **N° de cualquiera de sus solicitudes** — segundo factor; solo prueba que ese teléfono es suyo.

Del par, el backend deriva la empresa y devuelve **todas** sus solicitudes y OT. Aviso azul: quien llega por el link de WhatsApp o correo ya está identificado y entra directo al listado. Botón **Ver mis trabajos** y, secundario, **Pedir un servicio nuevo**.

Reglas de privacidad, no negociables:
- Un solo mensaje de error para teléfono inexistente, solicitud inexistente y par que no coincide. Nunca decir cuál de los dos falló.
- Sin el segundo factor, un teléfono suelto abriría la cartera completa de un cliente.
- Sesión en el dispositivo acotada (30 días sugeridos) y revocable desde la oficina.

### C2 · Mis solicitudes — pantalla de entrada
Encabezado con el nombre de la empresa y el contacto, enlace **Salir**.
Riel de chips (scroll horizontal): `Todas n` / `En curso n` / `Por pagar n` / `Cerradas n`; el activo en negro con texto blanco.
Una tarjeta de 96 px mínimo por solicitud u OT, barra izquierda de 3 px por estado: número mono + fecha a la derecha, descripción 15.5/600, y una línea de estado en palabra + dato útil ("Llegamos el 19-08", "Saldo $ 67.800", "$ 113.000 · 20-07", "Presupuesto no aceptado"). Las que están en ejecución llevan barra de avance de 3 px.
Pie: **Pedir un servicio nuevo**.

### C3 · Estado del trabajo
Bloque de identificación, franja `#f0efeb` con el estado en 20/700 del color correspondiente y una línea en lenguaje de cliente ("Nuestro equipo llega el 19-08-2026, en la mañana").
**Recorrido**: las ocho etapas de `ETAPAS_VISUAL` en vertical, filas de 48 px, glifo `×` para cumplidas, `▪` para la actual (fila sobre `#f6f5f2`, texto 700) y `·` para las pendientes; fecha mono a la derecha cuando existe. Nombres en lenguaje de cliente: *Presupuesto aceptado*, no *Aprobada*. `Rechazada` ocupa el lugar de la etapa actual, en rojo.
Presupuesto: total aceptado en mono 17/600. Pie: **Escribir a la oficina**.

### C4 · Avance con fotos
Franja con "En ejecución · 2 de 3 tareas listas" y barra de progreso de 4 px. Un bloque por reporte, en orden inverso: hora mono + autor, foto de 190 px de alto a ancho completo, comentario 14.5. Cierra: *"Las fotos las sube el equipo en terreno. Se publican al momento, sin edición."*
Origen real: `ot.reportes[]`. Definir compresión y ancho máximo antes de publicar.

### C5 · Cuenta y pago
Franja con **Saldo pendiente** en mono 26/600 y la línea del anticipo. Detalle en filas de 52 px (concepto + subtítulo a la izquierda, monto mono a la derecha) y fila **Total** de 56 px sobre `#f6f5f2`. Documentos: dos filas de 56 px con **Ver PDF** en azul.
Pie: **Datos para transferir** y la nota *"No se cobra en línea. El pago se registra en la oficina al recibir la transferencia."* No hay pasarela de pago.

### C6 · Pedir un servicio
Dos pasos. Paso 1: texto libre con placeholder de ejemplo, urgencia en tres opciones de 52 px (*Puede esperar* / *Esta semana* / *Detiene la producción*), foto opcional de 96 px. Pie: **Siguiente: sus datos**.
Alimenta el mismo modelo `Solicitud` que `IngresoScreen.jsx`, con `origen: 'Portal'`.

---

## 7. Backend

Conceptos nuevos, según §7 de la estrategia: `Usuario` (token persistente por persona), `Asignacion` (colección propia). `Recurso` gana `usuarioId` opcional.

Reglas que aplican a **todo** endpoint nuevo:

1. **El entorno viaja en la URL, no en el header.** Las PWA se abren fuera de la SPA y nunca envían `X-Entorno`. Ver punto 7 de `CORRECCIONES.md`: `resolverEntorno` debe aceptar `req.query.entorno`, y cada link y formulario propaga el parámetro. Sin esto, la demo queda fuera de la operación móvil.
2. Rutas en plural bajo `/api`, un router por dominio en `erp-backend/src/routes`, siguiendo el patrón de `DisposicionTabla`.
3. Correos por la infraestructura Brevo existente (`config/mailer.js`). Sin HTML decorativo.
4. Entropía de tokens igual a la que ya usa el repo: `crypto.randomBytes(20)` → 40 hex.

## 8. Qué NO entra en la primera versión

- Modo offline completo. Solo la **cola de envío** de reportes: la foto y el comentario se retienen en el dispositivo y se reintentan. Sin esto, una foto tomada sin señal se pierde, y hoy eso ya ocurre en terreno.
- Notificaciones push. Se notifica por correo, y por WhatsApp con deep link.
- Pago en línea.
- Vista de ejecutor separada de la de supervisor: misma app, distintas acciones según el puesto.
