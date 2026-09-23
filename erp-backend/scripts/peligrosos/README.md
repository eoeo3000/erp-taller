# Scripts destructivos

Conectan directo a `MONGO_URI` (leído del `.env` en `erp-backend/`) y modifican o borran datos
sin pasar por la API ni por los controladores. Correr siempre desde `erp-backend/`:

```bash
node scripts/peligrosos/<script>.js
```

Todos piden confirmación interactiva antes de tocar la base de datos: hay que escribir el
nombre exacto de la base a la que apunta `MONGO_URI` (se puede saltar con `--confirm` para
quien ya confirmó a mano y solo quiere repetir el comando). Ver `_confirmar.js`.

**Probar siempre primero contra un backup o un entorno de staging** — desde ahora hay respaldos de verdad: `node scripts/respaldo.js` antes de correr cualquiera de estos.

| Script | Qué hace |
|---|---|
| `borrado_total.js` | Elimina por completo (`dropCollection`) toda colección cuyo nombre contenga `"solicitud"` u `"ot"`. |
| `limpiar.js` | Vacía (`deleteMany`) las colecciones `solicitudes`/`solicituds` y `ots`, sin borrar las colecciones en sí. |
| `limpiarSuministros.js` | Vacía (`deleteMany`) la colección `suministros`. |
| `restaurar.js` | Vacía y vuelve a llenar las colecciones que vengan en un respaldo. Guarda un respaldo del estado actual antes de pisar nada (`--sin-respaldo-previo` lo salta) y avisa si el respaldo viene de una base distinta a la que se va a restaurar. Ver [`docs/respaldos.md`](../../../docs/respaldos.md). |
| `borrarIndice.js` | Elimina el índice `patente_1` de la colección `suministros` (para desbloquear un índice corrupto/obsoleto). |

`_confirmar.js` no es un script ejecutable — es el guard compartido que importan los otros cuatro.
