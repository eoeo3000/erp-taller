# Principio: toda etapa tiene vuelta atrás

Principio rector de producto, acordado con el dueño del negocio. Aplica a todo el pipeline de
la OT (Solicitud → Tratamiento → Cotización → Programación → Ejecución → Informe → Pago) y a
cualquier flujo nuevo que se agregue.

## El principio

> **Desde la etapa en la que estoy tiene que haber una forma de volver a la anterior para
> corregir**, hasta un punto de corte definido y explícito. Un paso adelante no puede ser una
> puerta de una sola vía.

El motivo es operativo, no estético: en una PyME de servicios el error se descubre **después**
de haber avanzado — falta una foto en el informe, se cargó mal un ítem de la cotización, se
cerró una OT por apuro. Si el sistema no deja volver, la única salida real es que alguien
edite la base a mano, o que se abandone la OT y se cree otra. Las dos son peores que el error
original.

## Las cuatro reglas

**1. El corte lo decide otro, no quien ejecuta la acción.**
Una etapa no puede cerrarse a sí misma. El supervisor marcando "trabajo finalizado" no puede
ser el corte de su propia capacidad de corregir: se estaría cerrando la puerta él mismo, y en
el momento en que más probable es que falte algo. El corte lo pone quien revisa (la oficina
acepta el informe), o un hecho externo e irreversible (el pago).

**2. La vuelta atrás tiene que estar donde ocurrió el problema.**
No sirve que exista en otra pantalla si quien detecta el error no la encuentra. Cada bloqueo
debe decir *qué* falta, *dónde* se arregla y, si es en otra pestaña, ofrecer el atajo.

**3. Deshacer no es solo cambiar el estado: hay que revertir lo que ese estado provocó.**
Es el error más caro de esta familia. Si avanzar reservó stock, comprometió equipos, envió algo
al cliente o congeló una copia de un documento, la vuelta atrás tiene que deshacer eso también.
Un botón que solo revierte el `estado` deja el sistema mintiendo en silencio.

**4. Toda ida y vuelta queda en la bitácora.**
`OT.bitacora` es el log de acciones (distinto de `OT.reportes`, que es evidencia de terreno).
Reabrir, cancelar, aceptar y pedir mejoras se registran ahí con fecha y autor: si una OT se
cerró y se reabrió tres veces, eso tiene que poder reconstruirse.

## Estado actual

| Etapa | Cómo se vuelve atrás | Dónde |
|---|---|---|
| Informe inicial revisado | "Cambiar revisión" | Tratamiento · Informe Inicial |
| Planificación terminada | "Cancelar y volver a planificación" (solo en `Planificada`) | Tratamiento · Cotización |
| Cotización enviada, esperando al cliente | "Cancelar aceptación" | Tratamiento · Cotización |
| Cotización aceptada por el cliente | **— sin vuelta atrás —** | ver más abajo |
| Programada | "Reprogramar" (supervisor) / volver a planificación | PWA Operativa · S3 |
| Trabajo terminado / informe | "Reabrir OT" (supervisor) + "Reabrir para correcciones" (oficina) | S3 / Tratamiento · Ejecución |
| Pagada | "Anular pago" | Tratamiento · Pago |

El corte general del supervisor es **la aceptación del informe de ejecución por parte de la
oficina** (`OT.informeFinal.revision.estado === 'Aceptado'`), y el tope duro es `Pagada`.

## Lo que falta — decisión pendiente

**Deshacer una cotización ya aceptada por el cliente.** Hoy no existe. No es solo agregar un
botón, y por eso quedó pendiente de decisión:

- Las reservas de stock y equipos se toman al pasar de `Planificada` a `Programada`, pasan a
  "En Uso" en `En Ejecución` y **se liberan recién en `Trabajo Terminado`**
  (`otController.aplicarReservaPorCambioEstado`). **No hay ninguna ruta de liberación hacia
  atrás**: un botón de "volver" sin eso dejaría equipos en `Reservado` y stock comprometido
  para siempre, en silencio — exactamente lo que prohíbe la regla 3.
- Además anula un acuerdo ya aprobado por el cliente, así que obliga a recotizar y reenviar.
- Parte del caso ya tiene camino propio: para **"faltó algo"** existe la excepción / extensión
  de cotización, que el cliente aprueba aparte sin voltear el acuerdo original. Lo que queda
  descubierto es el caso inverso: haber cobrado de más o cargado un ítem equivocado.
