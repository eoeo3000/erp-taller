# Plan: Módulo de Contabilidad General

**Fecha:** 2026-08-10  
**Alcance:** Contabilidad de gestión interna (no formal SII). Partida doble, plan de cuentas chileno PyME, libro diario/mayor, balance general y estado de resultados. Asientos automáticos gatillados por eventos del ERP + asientos manuales.

---

## 1. Eventos del ERP que generan asientos contables

Analizando los controllers y modelos existentes, los eventos con impacto económico son:

### 1.1 Eventos con asiento automático obligatorio

| # | Evento | Controller / función | Asiento resultante |
|---|--------|---------------------|-------------------|
| A | OT marcada como **Pagada** (`pago.estado → 'Pagado'`) | `otController.actualizarOT` cuando `req.body.pago.estado === 'Pagado'` | **Debe** Caja/Banco · **Haber** Ingresos por Servicios |
| B | **Pago de OT anulado** (`pago.anulado = true`) | `otController.actualizarOT` cuando `req.body.pago.anulado === true` | Reversa exacta del asiento A (Debe y Haber invertidos) |
| C | **Personal marcado como pagado** (`marcarPagado`) | `finanzasController.marcarPagado` | **Debe** Gasto Mano de Obra · **Haber** Caja/Banco |

### 1.2 Eventos con asiento automático opcional (Fase posterior)

| # | Evento | Asiento resultante |
|---|--------|--------------------|
| D | OT → **En Ejecución** (supervisor confirma inicio) | **Debe** Trabajos en Curso · **Haber** N/A (memo WIP) |
| E | Componentes/logística cargados a OT | **Debe** Costo de Materiales · **Haber** Inventario (si se gestiona stock) |
| F | OT → **Trabajo Terminado** | Cierre del Trabajos en Curso hacia Costo de Servicios |

> **Nota:** Los eventos D, E y F requieren que el sistema gestione inventario y activos WIP, lo que agrega complejidad significativa. Se recomienda diferirlos para después de que las fases 1–5 estén estables.

### 1.3 Eventos que NO generan asiento automático

- **Crear Solicitud:** es solo intake comercial, sin valor económico aún.  
- **Crear Recurso / Equipo / Suministro (catálogo):** son altas en catálogos, no transacciones.  
- **Crear RegistroPagoRecurso** (`crearRegistroPago`): registra la asistencia pero el hecho económico ocurre en `marcarPagado` (evento C).  
- **Cambios de estado de OT** (Planificada → Programada → En Ejecución): flujo operativo sin impacto contable directo hasta la ejecución/pago.

---

## 2. Plan de cuentas — Estándar chileno PyME

Jerarquía de 3 niveles. Código con notación `X.Y.Z` (nivel 1 = tipo, nivel 2 = grupo, nivel 3 = cuenta operativa).

```
1. ACTIVO                               (naturaleza Deudora)
  1.1 Activo Circulante
    1.1.1  Caja
    1.1.2  Banco
    1.1.3  Cuentas por Cobrar Clientes
    1.1.4  Documentos por Cobrar
    1.1.5  Inventario de Materiales
    1.1.6  Trabajos en Curso (WIP)
    1.1.7  IVA Crédito Fiscal
    1.1.8  Otros Activos Circulantes
  1.2 Activo Fijo
    1.2.1  Maquinaria y Equipos
    1.2.2  Herramientas
    1.2.3  Vehículos
    1.2.4  Depreciación Acumulada (naturaleza Acreedora — cuenta contraria)

2. PASIVO                               (naturaleza Acreedora)
  2.1 Pasivo Circulante
    2.1.1  Cuentas por Pagar Proveedores
    2.1.2  Remuneraciones por Pagar
    2.1.3  IVA Débito Fiscal
    2.1.4  Retenciones por Pagar (Honorarios)
    2.1.5  Otros Pasivos Circulantes
  2.2 Pasivo No Circulante
    2.2.1  Préstamos Bancarios Largo Plazo

3. PATRIMONIO                           (naturaleza Acreedora)
  3.1  Capital Inicial
  3.2  Utilidades Acumuladas
  3.3  Resultado del Ejercicio (cuenta de cierre)

4. INGRESOS                             (naturaleza Acreedora)
  4.1  Ingresos Operacionales
    4.1.1  Ingresos por Servicios (OTs)
    4.1.2  Otros Ingresos Operacionales
  4.2  Ingresos No Operacionales
    4.2.1  Intereses Ganados
    4.2.2  Otros Ingresos No Operacionales

5. COSTOS Y GASTOS                      (naturaleza Deudora)
  5.1  Costo de Servicios Prestados
    5.1.1  Costo de Materiales Directos
    5.1.2  Costo de Mano de Obra Directa
    5.1.3  Costo de Transporte y Logística
  5.2  Gastos de Administración y Ventas
    5.2.1  Remuneraciones Administración
    5.2.2  Honorarios
    5.2.3  Arriendos
    5.2.4  Servicios Básicos (luz, agua, gas)
    5.2.5  Comunicaciones y Telefonía
    5.2.6  Útiles de Oficina
    5.2.7  Mantención y Reparaciones
    5.2.8  Seguros
    5.2.9  Otros Gastos Administración
  5.3  Gastos Financieros
    5.3.1  Intereses Bancarios
    5.3.2  Comisiones Bancarias
```

**Regla de naturaleza:**
- Cuenta Deudora: saldo normal en **Debe**. Aumenta con Debe, disminuye con Haber.
- Cuenta Acreedora: saldo normal en **Haber**. Aumenta con Haber, disminuye con Debe.

---

## 3. Arquitectura del módulo

### 3.1 Modelos Mongoose (backend)

#### `CuentaContable.js`
```
Colección: cuentascontables
Campos:
  codigo       String  unique  "1.1.1"
  nombre       String  required
  tipo         enum ['Activo','Pasivo','Patrimonio','Ingreso','Gasto']
  naturaleza   enum ['Deudora','Acreedora']
  nivel        Number  (1, 2 o 3 — derivado del código)
  padreId      ObjectId ref:CuentaContable  nullable (null = raíz)
  activa       Boolean default true
  descripcion  String  default ''
  timestamps
```

Convención: seguir el patrón `mongoose.models.X || mongoose.model('X', schema)` (ya usado en OT.js, Solicitud.js, Plantilla.js).

#### `AsientoContable.js`
```
Colección: asientoscontables
Campos:
  numeroAsiento  String  unique  "ASI-2026-0001"
  fecha          String  required  "YYYY-MM-DD"
  descripcion    String  required
  tipo           enum ['automatico','manual']
  origen: {
    tipo         enum ['OT','PagoPersonal','Manual','Ajuste']
    referenciaId ObjectId  (id de OT o RegistroPago, null si manual)
    referenciaNro String   (ej: "OT-2026-0012", para mostrar sin lookup)
  }
  lineas: [{
    cuentaId     ObjectId ref:CuentaContable
    cuentaCodigo String   (snapshot al momento del asiento)
    cuentaNombre String   (snapshot)
    debe         Number   default 0
    haber        Number   default 0
    glosa        String   default ''
  }]
  totalDebe      Number   (suma de lineas.debe — calculado al guardar)
  totalHaber     Number   (suma de lineas.haber — calculado al guardar)
  estado         enum ['vigente','anulado']  default 'vigente'
  anulacion: {
    fechaAnulacion     String
    motivoAnulacion    String
    asientoReversaId   ObjectId ref:AsientoContable
  }
  creadoPor      String   default 'Sistema'
  timestamps
```

**Invariante de partida doble:** `totalDebe === totalHaber` — validar en el controller antes de guardar.

**Correlativo:** mismo patrón que OT. Buscar `{ numeroAsiento: { $regex: /^ASI-2026-/ } }`, extraer el secuencial del último, incrementar, formatear `ASI-2026-${n.toString().padStart(4,'0')}`.

### 3.2 Rutas y controllers (backend)

Archivo nuevo: `src/routes/contabilidadRoutes.js`  
Archivo nuevo: `src/controllers/contabilidadController.js`  
Montar en `src/routes/index.js`: `router.use('/contabilidad', contabilidadRoutes)`

#### Rutas propuestas

```
GET    /api/contabilidad/cuentas                  → getCuentas (árbol completo)
POST   /api/contabilidad/cuentas                  → crearCuenta
PUT    /api/contabilidad/cuentas/:id              → actualizarCuenta
DELETE /api/contabilidad/cuentas/:id              → eliminarCuenta (solo si sin movimientos)

GET    /api/contabilidad/asientos                 → getAsientos (query: ?desde=&hasta=&tipo=&cuentaId=)
POST   /api/contabilidad/asientos                 → crearAsientoManual
POST   /api/contabilidad/asientos/automatico      → crearAsientoAutomatico (uso interno, llamado desde otros controllers)
PUT    /api/contabilidad/asientos/:id/anular      → anularAsiento (genera asiento reversa)

GET    /api/contabilidad/mayor/:cuentaId          → getLibroMayor (query: ?desde=&hasta=)
GET    /api/contabilidad/balance-comprobacion     → getBalanceComprobacion (query: ?hasta=)
GET    /api/contabilidad/balance-general          → getBalanceGeneral (query: ?hasta=)
GET    /api/contabilidad/estado-resultados        → getEstadoResultados (query: ?desde=&hasta=)
```

#### Funciones internas del controller

- `generarNumeroAsiento()` — correlativo ASI-2026-XXXX (async, igual a lógica de OT).
- `crearAsientoAutomatico(tipo, referenciaId, referenciaNro, lineas, fecha, descripcion)` — función auxiliar llamada desde `finanzasController` y `otController`. No es un endpoint HTTP; es una función exportada que otros controllers importan.
- `validarPartidaDoble(lineas)` — suma debe vs haber, lanza error si no igualan.

### 3.3 Integración con controllers existentes

**`otController.actualizarOT`** — al detectar cambio `pago.estado === 'Pagado'`:
```
const { crearAsientoAutomatico } = require('./contabilidadController');
await crearAsientoAutomatico('OT', ot._id, ot.numeroOT, [
  { cuenta: '1.1.2', debe: monto, haber: 0, glosa: `Cobro OT ${ot.numeroOT}` },
  { cuenta: '4.1.1', debe: 0, haber: monto, glosa: `Ingreso OT ${ot.numeroOT}` }
], fechaPago, `Cobro servicios ${ot.numeroOT}`);
```

**`otController.actualizarOT`** — al detectar `pago.anulado === true`:
```
// Buscar el asiento original de esta OT y generar reversa automática
await anularAsientoPorReferencia('OT', ot._id, motivo);
```

**`finanzasController.marcarPagado`** — después de `RegistroPago.updateMany(...)`:
```
// Suma totalDia de los registros pagados
await crearAsientoAutomatico('PagoPersonal', null, `PAGO-${fechaPago}`, [
  { cuenta: '5.1.2', debe: totalManoObra, haber: 0, glosa: 'Pago mano de obra' },
  { cuenta: '1.1.2', debe: 0, haber: totalManoObra, glosa: `Pago personal ${fechaPago}` }
], fechaPago, `Pago personal ${fechaPago}`);
```

### 3.4 Frontend (erp-web)

Archivo nuevo: `src/screens/ContabilidadScreen.jsx`  
Sin nuevo estado global en App.jsx — la pantalla maneja su propio estado local con `useState`/`useEffect` (igual que FinanzasScreen que ya usa este patrón: llama directo a la API, no depende de props de App.jsx).

Agregar en App.jsx:
- `import ContabilidadScreen from './screens/ContabilidadScreen'`
- `<NavLink to="/contabilidad">📒 CONTABILIDAD</NavLink>` (desktop y mobile)
- `<Route path="/contabilidad" element={<ContabilidadScreen API={API} />} />`

#### Tabs de ContabilidadScreen

| Tab | Contenido |
|-----|-----------|
| **Plan de Cuentas** | Tabla agrupada por tipo, con código/nombre/naturaleza. Botón "Nueva Cuenta". Modal para crear/editar. No eliminar si tiene movimientos. |
| **Libro Diario** | Tabla de asientos con filtros de fecha y tipo. Fila expandible que muestra las líneas (debe/haber por cuenta). Botón "Nuevo Asiento Manual" abre modal con líneas dinámicas. Botón "Anular" por asiento. |
| **Libro Mayor** | Selector de cuenta, rango de fechas. Tabla de movimientos de esa cuenta con columnas: Fecha / Asiento / Glosa / Debe / Haber / Saldo acumulado. |
| **Reportes** | Sub-selector: Balance de Comprobación / Estado de Resultados / Balance General. Tablas con totales. Botón imprimir (window.print). |

---

## 4. Reportes contables — lógica de cálculo

### Balance de Comprobación
Para cada cuenta con movimientos, sumar todos los Debe y todos los Haber de sus asientos vigentes. Mostrar: Código / Cuenta / Total Debe / Total Haber / Saldo Deudor / Saldo Acreedor. Verificar: ΣDebe total = ΣHaber total.

### Estado de Resultados
```
Ingresos Operacionales     = Σ saldos cuentas tipo 4.1.x (naturaleza Acreedora → saldo = Haber - Debe)
(-) Costo de Servicios     = Σ saldos cuentas 5.1.x
(-) Gastos Administración  = Σ saldos cuentas 5.2.x
(-) Gastos Financieros     = Σ saldos cuentas 5.3.x
= Resultado del Ejercicio
```

### Balance General
```
ACTIVOS
  Activo Circulante         = Σ saldos cuentas 1.1.x
  Activo Fijo               = Σ saldos cuentas 1.2.x (neto de depreciación)
  Total Activos

PASIVOS + PATRIMONIO
  Pasivo Circulante         = Σ saldos cuentas 2.1.x
  Pasivo No Circulante      = Σ saldos cuentas 2.2.x
  Patrimonio                = Σ saldos cuentas 3.x + Resultado del Ejercicio
  Total Pasivo + Patrimonio

Verificación: Total Activos = Total Pasivo + Patrimonio
```

---

## 5. Fases de implementación

Cada fase termina con algo probable de forma independiente. No se requiere avanzar a la siguiente sin validar la anterior.

---

### FASE 1 — Plan de Cuentas
**Entregable:** CRUD completo del plan de cuentas. Sin asientos todavía.

Backend:
- Modelo `CuentaContable.js`
- Controller: `getCuentas`, `crearCuenta`, `actualizarCuenta`, `eliminarCuenta`
- Rutas y montaje en `routes/index.js`
- Script de seed: `seedCuentas.js` que inserta las ~35 cuentas del plan estándar

Frontend:
- Tab "Plan de Cuentas" en `ContabilidadScreen.jsx`
- Tabla agrupada por tipo con árbol visual (indent por nivel)
- Modal para crear/editar cuenta
- Ruta `/contabilidad` en App.jsx

**Prueba:** abrir `/contabilidad`, ver las cuentas del plan cargadas, crear una cuenta nueva, editarla, verificar que aparece en el árbol.

---

### FASE 2 — Libro Diario con asientos manuales
**Entregable:** Crear asientos manuales con validación de partida doble.

Backend:
- Modelo `AsientoContable.js`
- Controller: `getAsientos`, `crearAsientoManual`, `anularAsiento`, `generarNumeroAsiento`
- Rutas correspondientes

Frontend:
- Tab "Libro Diario"
- Tabla de asientos (fecha, número, descripción, tipo, total, estado)
- Fila expandible con líneas (cuenta / debe / haber / glosa)
- Modal "Nuevo Asiento Manual": selector de cuenta por código/nombre, campo debe/haber, botón "+" para agregar líneas, validación visual de que debe = haber antes de guardar
- Botón "Anular" por asiento con confirmación + motivo

**Prueba:** crear un asiento manual de 2 líneas (ej: registro de gasto de electricidad), verificar correlativo ASI-2026-0001, anularlo, verificar que genera ASI-2026-0002 como reversa.

---

### FASE 3 — Asientos automáticos por eventos del ERP
**Entregable:** Pagos de OT y pagos de personal generan asientos automáticamente.

Backend:
- Función `crearAsientoAutomatico(...)` exportada desde `contabilidadController.js`
- Integración en `otController.actualizarOT`: detectar `pago.estado → 'Pagado'` y `pago.anulado → true`
- Integración en `finanzasController.marcarPagado`
- Función `anularAsientoPorReferencia(tipo, referenciaId, motivo)` para reversas automáticas

**Prueba:**
1. Marcar una OT como Pagada en TratamientoScreen → ir a Libro Diario → debe aparecer ASI automático.
2. Anular ese pago → debe aparecer un segundo asiento reversa.
3. Marcar personal como pagado en FinanzasScreen → debe aparecer ASI de gasto personal.

---

### FASE 4 — Libro Mayor
**Entregable:** Ver todos los movimientos de una cuenta con saldo acumulado.

Backend:
- Controller: `getLibroMayor(cuentaId, desde, hasta)` — query en `AsientoContable.lineas` donde `cuentaId` match, ordena por fecha, calcula saldo acumulado corriendo.

Frontend:
- Tab "Libro Mayor"
- Selector de cuenta (dropdown o búsqueda por código/nombre)
- Selector de rango de fechas
- Tabla: Fecha / N° Asiento / Descripción / Glosa línea / Debe / Haber / Saldo
- Saldo inicial (movimientos previos al rango) + saldo corriente

**Prueba:** seleccionar cuenta "1.1.2 Banco", verificar que aparecen los cobros de OT y pagos de personal registrados en Fase 3 con saldos coherentes.

---

### FASE 5 — Reportes: Balance de Comprobación, Estado de Resultados, Balance General
**Entregable:** Reportes contables completos con verificación aritmética.

Backend:
- Controller: `getBalanceComprobacion(hasta)`, `getEstadoResultados(desde, hasta)`, `getBalanceGeneral(hasta)`
- Lógica de agregación: `$unwind` de lineas, `$group` por cuentaId, `$lookup` a CuentaContable

Frontend:
- Tab "Reportes"
- Sub-selector de tipo de reporte
- Balance de Comprobación: tabla con totales y verificación ΣDebe = ΣHaber
- Estado de Resultados: ingresos / costos / gastos / resultado
- Balance General: activos / pasivos / patrimonio / verificación A = P + Pat
- CSS `@media print` para imprimir limpio (ocultar nav y tabs)

**Prueba:** ingresar datos de prueba (al menos 1 cobro OT, 1 gasto personal, 1 asiento manual de gasto), verificar que los 3 reportes cuadran entre sí.

---

## 6. Consideraciones y decisiones de diseño

### Snapshots de cuenta en asientos
Las líneas del asiento guardan `cuentaCodigo` y `cuentaNombre` en el momento de creación. Esto permite que el libro diario/mayor sea históricamente correcto aunque luego se renombre una cuenta.

### Cuentas parametrizables para asientos automáticos
Las cuentas usadas en asientos automáticos (ej: "1.1.2 Banco" para cobros) no deben estar hardcodeadas en el código. Propuesta: guardar en una colección `ConfigContabilidad` con un documento singleton `{ cuentaCobros, cuentaPagos, cuentaIngresos, cuentaGastoPersonal }` editable desde la pantalla de contabilidad.

### Sin inventario valorizado en Fase 1-5
Los componentes y logística de OT (`ot.componentes`, `ot.logistica`) tienen precios pero el sistema no gestiona stock. Para las fases iniciales, el costo de materiales se registra como asiento manual o como parte del asiento automático de la OT pagada (costo estimado). La gestión de inventario WIP (evento D/E/F del punto 1.2) queda para una fase posterior.

### Asientos vs. Módulo Finanzas
El módulo `FinanzasScreen` existente (Cuentas por Cobrar, Pago de Personal, Resumen Mensual) sigue operando de forma independiente. El módulo de contabilidad no reemplaza ese módulo; lo complementa. Finanzas = gestión operativa de flujo de caja. Contabilidad = registro formal de partida doble. Ambos pueden coexistir, y los asientos automáticos son el puente entre los dos.

### Anulación de asientos
Un asiento nunca se modifica ni elimina. Solo se anula (campo `estado: 'anulado'`) generando un asiento de reversa automático con el mismo monto pero debe/haber invertidos. Esto garantiza integridad del libro diario. Aplica a asientos manuales y automáticos por igual.
