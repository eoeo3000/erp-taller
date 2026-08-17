# Plan de Tipografía — ERP Taller

## 1. Diagnóstico del estado actual

### 1.1 Inventario de tamaños usados (`fontSize`)

*(Recontado sobre el estado actual del código — última actualización tras los cambios en `App.jsx`, `IngresoScreen.jsx` y `PortalClienteScreen.jsx`)*

| Valor | Ocurrencias | Uso actual (inconsistente)                                    |
|-------|-------------|----------------------------------------------------------------|
| 9px   | 5           | badges extra-pequeños (GanttScreen)                             |
| 10px  | 11          | micro-etiquetas, turnos de calendario                           |
| 11px  | 34          | chips de operario, badges estado, fechas gantt                  |
| 12px  | 82          | **el más usado** — labels, fechas, auxiliares                   |
| 13px  | 79          | **el segundo más usado** — inputs, td, labels                   |
| 14px  | 40          | texto de lectura, algunas celdas                                |
| 15px  | 19          | títulos de tarjetas, texto destacado                             |
| 16px  | 10          | rara vez, nunca en inputs                                       |
| 17px  | 1           | total bruto en cotización (PortalClienteScreen)                 |
| 18px  | 8           | subtítulos de sección                                            |
| 20px  | 6           | títulos de pantalla + logo/nav (`App.jsx`), cierre de modal      |
| 22px  | 13          | íconos/texto destacado en dashboards y detalle de solicitud (portal) |
| 24px  | 3           | h2 de pantalla (GanttScreen) + número de solicitud en toast de éxito (portal) |
| 28px  | 1           | KPI destacado en Dashboard (`kpiValue`)                          |
| 32px  | 5           | íconos grandes (tarjetas de contacto del portal)                |
| 40px  | 2           | íconos hero                                                      |

**Problema central:** el texto de lectura y los inputs usan mayoritariamente 12–13px — demasiado pequeño para accesibilidad. La base debería ser 16px, con 14px como mínimo para texto de cuerpo.

**Hallazgo adicional (unidad `rem`):** además de `px` y de números sin unidad (que React interpreta como px), aparecen **20 declaraciones en `rem`** — `0.75rem`×2, `0.85rem`×9, `0.9rem`×4, `0.95rem`×2, `1rem`×2, `1.2rem`×1 — concentradas en `RecursosScreen.jsx` (modales) y `TratamientoScreen.jsx` (resumen de cotización). Esto suma una **tercera convención de unidades** al problema de tamaños: `px` explícito, número desnudo (=px implícito) y `rem`, mezclados sin criterio. El sistema de tokens (§2–3) debe cubrir estos casos también.

### 1.2 Inventario de `fontWeight`

*(Recontado sobre el estado actual del código)*

| Valor               | Ocurrencias | Uso actual                                              |
|---------------------|-------------|-----------------------------------------------------------|
| `'bold'` (string)   | 143         | **la forma más usada de negrita**, con gran diferencia — botones, títulos, celdas en casi todas las pantallas |
| 400                 | (implícito) | texto normal                                             |
| 500                 | 6           | botones en index.css                                     |
| 600                 | 27          | semibold — labels, totales                               |
| 700 (numérico)      | 36          | bold — títulos, encabezados (mismo peso visual que `'bold'`, pero escrito distinto) |
| 800                 | 9           | extrabold — totales financieros                          |
| 900                 | 3           | heavy — números de solicitud                             |
| `'normal'` (string) | 1           | único caso explícito (TratamientoScreen)                  |

**Problema real:** no son los valores 800/900 (poco frecuentes y bien acotados) — es que la negrita se escribe de **dos formas incompatibles para el mismo resultado visual**: el keyword CSS `'bold'` (143 ocurrencias, la inmensa mayoría) y el número `700` (36 ocurrencias). Al ser literales distintos, no se pueden unificar con un solo `var(--fw-bold)` sin tocar cada sitio uno por uno; cualquier búsqueda automatizada por `fontWeight: 700` se perderá las 143 apariciones de `'bold'`.

### 1.3 Padding de inputs

| Pantalla           | Padding vertical | Font-size input |
|--------------------|------------------|-----------------|
| ContabilidadScreen | 7–8px            | 13px            |
| FinanzasScreen     | 8px              | 13px            |
| TratamientoScreen  | 8px              | 13px            |
| PortalClienteScreen| 10px             | 14px            |
| ImportExportScreen | 6px              | 13px            |

Ninguna pantalla interna llega al mínimo de 10–12px pedido, excepto el portal.

### 1.4 `fontFamily`

- `index.css` (raíz): `system-ui, Avenir, Helvetica, Arial, sans-serif` — heredado de Vite
- ContabilidadScreen: `system-ui, sans-serif` (repetido inline)
- ImportExportScreen: `system-ui, sans-serif` (repetido inline)
- PortalClienteScreen: `system-ui, -apple-system, sans-serif` (ligeramente distinto)
- Monospace: solo en códigos contables — correcto, no cambia

**Problema:** la familia tipográfica se declara 4 veces con variantes ligeramente distintas, y la raíz usa `color-scheme: light dark` con `color: rgba(255,255,255,0.87)` que fuerza texto blanco en fondo oscuro — resto en conflicto con los fondos claros (#f0f2f5, #f4f6f9) usados en las pantallas.

---

## 2. Sistema propuesto

### 2.1 Escala tipográfica

```
--fs-xs      10px   micro-etiquetas, badges
--fs-sm      12px   auxiliar, timestamps, notas al pie  ← actual 11–12 unificado
--fs-label   14px   labels de formulario, th de tablas  ← sube de 12–13
--fs-base    16px   texto de lectura, inputs            ← sube de 13
--fs-md      18px   subtítulos de sección, card titles  ← sube de 15–16
--fs-lg      20px   títulos de pantalla secundarios
--fs-xl      24px   título principal (h2 de pantalla)
--fs-hero    32px   íconos hero, números destacados
```

Ratio entre pasos: aprox. 1.125× (escala Mayor Seconda), coherente y no agresiva para una app de gestión.

### 2.2 Pesos semánticos

```
--fw-normal    400   párrafos, td normales
--fw-medium    500   texto de navegación, placeholders
--fw-semibold  600   labels, subtotales, nombres en cards
--fw-bold      700   títulos, encabezados de sección, botones primarios
--fw-heavy     800   totales financieros, números de OT/Solicitud
```

Se elimina el uso de 900 (reemplazado por 800), y `var(--fw-bold)` reemplaza tanto el numérico `700` como el keyword `'bold'` — ambos deben migrar al mismo token pese a ser literales distintos en el código actual (ver §1.2).

### 2.3 Line-height

```
--lh-tight   1.2   títulos grandes (xl, hero)
--lh-normal  1.5   texto de cuerpo y labels
--lh-relaxed 1.7   párrafos de descripción (portal, reportes)
```

### 2.4 Inputs

```
--input-fs      var(--fs-base)     /* 16px — evita zoom en iOS */
--input-py      11px               /* padding vertical mínimo */
--input-px      12px               /* padding horizontal */
--input-radius  8px
--input-border  1.5px solid #d0d7de
```

El uso de 16px en inputs es crítico: iOS Safari hace zoom automático en inputs con font-size < 16px, lo que rompe el layout móvil.

### 2.5 `font-family` unificado

```css
--font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, 'Cascadia Code', monospace;
```

Inter se carga desde Google Fonts (self-hosted o CDN). Si se prefiere zero-dependency, solo `system-ui, -apple-system, ...` también es aceptable — la diferencia visual es mínima.

---

## 3. Archivo de tokens propuesto — `src/tokens.css`

```css
/* src/tokens.css — tipografía y espaciado */
:root {
  /* Familia */
  --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', 'Courier New', monospace;

  /* Escala de tamaño */
  --fs-xs:    10px;
  --fs-sm:    12px;
  --fs-label: 14px;
  --fs-base:  16px;
  --fs-md:    18px;
  --fs-lg:    20px;
  --fs-xl:    24px;
  --fs-hero:  32px;

  /* Pesos */
  --fw-normal:   400;
  --fw-medium:   500;
  --fw-semibold: 600;
  --fw-bold:     700;
  --fw-heavy:    800;

  /* Line-height */
  --lh-tight:   1.2;
  --lh-normal:  1.5;
  --lh-relaxed: 1.7;

  /* Inputs */
  --input-fs:     var(--fs-base);
  --input-py:     11px;
  --input-px:     12px;
  --input-radius: 8px;
  --input-border: 1.5px solid #d0d7de;
}
```

Se importa en `index.css` con `@import './tokens.css';` antes de cualquier otra regla.

---

## 4. Cambios en `index.css`

```css
/* Reemplaza el bloque :root actual */
:root {
  font-family: var(--font-sans);
  font-size:   var(--fs-base);   /* 16px base global */
  line-height: var(--lh-normal);
  font-weight: var(--fw-normal);
  color: #1a2a3a;                /* oscuro único — elimina color-scheme dual */
  background-color: #f0f2f5;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  overflow-x: hidden;
}

/* Input global */
input, select, textarea {
  font-family: var(--font-sans);
  font-size:   var(--input-fs);
  padding:     var(--input-py) var(--input-px);
  border:      var(--input-border);
  border-radius: var(--input-radius);
  line-height: var(--lh-normal);
}
```

Se eliminan las reglas de `color-scheme: light dark` y el `h1 { font-size: 3.2em }` — ambas son defaults de Vite que no aplican a esta app.

---

## 5. Fase 2 — Mapa de reemplazos por pantalla

### Prioridad de cambio (impacto visual descendente)

| Prioridad | Pantalla              | Razón                                                           |
|-----------|-----------------------|-----------------------------------------------------------------|
| 🔴 Alta   | IngresoScreen         | Primera impresión, formulario público                           |
| 🔴 Alta   | TratamientoScreen     | Pantalla más usada internamente, tablas + inputs                |
| 🟡 Media  | DashboardScreen       | Muchas celdas con 11–12px                                       |
| 🟡 Media  | ContabilidadScreen    | Input 13px + `inputFiltro` 7px padding                         |
| 🟡 Media  | FinanzasScreen        | Input 13px + padding 8px                                       |
| 🟢 Baja   | GanttScreen           | Tamaños pequeños son intencionales (celda de calendario)       |
| 🟢 Baja   | RecursosScreen        | Admin interno, menos crítico                                    |
| 🟢 Baja   | ImportExportScreen    | Ya usa 13–14px, cambio menor                                    |
| ✅ OK     | PortalClienteScreen   | Ya usa 14–16px y 10–12px padding — solo armonizar con variables |

### Tabla de reemplazos concretos

| Uso semántico           | Valor actual      | Variable nueva          |
|-------------------------|-------------------|-------------------------|
| Título h2 pantalla      | 20–24px           | `var(--fs-xl)`          |
| Subtítulo de sección    | 15–18px           | `var(--fs-md)`          |
| Card title              | 14–16px bold      | `var(--fs-base) + --fw-bold` |
| Texto de cuerpo / `<p>` | 13–14px           | `var(--fs-base)`        |
| `<td>` normal           | 13px              | `var(--fs-label)`       |
| `<th>` encabezado tabla | 12px bold         | `var(--fs-sm) + --fw-bold` |
| Label formulario        | 12–13px semibold  | `var(--fs-label) + --fw-semibold` |
| Input / Select          | 13px, padding 7–8px | `var(--input-fs)`, padding `var(--input-py) var(--input-px)` |
| Badge / chip            | 11–12px           | `var(--fs-sm)`          |
| Auxiliar (fecha, nota)  | 11–12px           | `var(--fs-sm)`          |
| Micro-etiqueta          | 9–10px            | `var(--fs-xs)`          |
| Número OT/SOL destacado | 22–28px           | `var(--fs-xl)` o `var(--fs-hero)` |

### Cambios en los objetos `styles` / `s` de cada pantalla

En lugar de modificar cada `fontSize: 13` uno a uno, el enfoque será:

1. **Primero:** aplicar `@import './tokens.css'` y actualizar `index.css` (Fase 1).
2. **Luego, por pantalla:** localizar el objeto `styles`/`s` al final del archivo y reemplazar los valores del inventario por variables CSS usando `var(--fs-label)` etc.
3. Los `style={{ fontSize: 'var(--fs-sm)' }}` en JSX inline son válidos — CSS custom properties funcionan en el atributo `style` de React.
4. El bloque `input:` global en `index.css` elimina el padding duplicado en cada pantalla, reduciendo las líneas a modificar.

---

## 6. Riesgos y decisiones

| Riesgo | Decisión |
|--------|----------|
| Subir inputs de 13→16px puede romper layouts con columnas estrechas (Gantt, Contabilidad inline) | Gantt y las filas inline de Contabilidad mantienen `var(--fs-sm)` como excepción documentada |
| `color: rgba(255,255,255,0.87)` en index.css hace texto blanco en fondo blanco | Se elimina junto con `color-scheme: light dark` — la app no implementa dark mode |
| El global `button { background-color: #1a1a1a }` de index.css afecta todos los botones | Se reemplaza por `button { font-family: inherit; font-size: inherit; }` — cada pantalla ya define sus propios colores de botón |
| Cambio de 12→14px en `<td>` puede aumentar altura de filas en tablas densas | Ajustar `padding` de celda de `10px` → `8px` para compensar si es necesario |

---

## 7. Orden de ejecución

```
Fase 1 (tokens + index.css reset) — ~30 min
  ├── Crear src/tokens.css
  ├── Actualizar src/index.css
  └── Verificar que no se rompe nada visualmente

Fase 2 — pantalla por pantalla
  ├── 2a. PortalClienteScreen (armonizar, ya es la mejor base)
  ├── 2b. IngresoScreen
  ├── 2c. TratamientoScreen (mayor impacto)
  ├── 2d. DashboardScreen
  ├── 2e. ContabilidadScreen + FinanzasScreen
  ├── 2f. ImportExportScreen + RecursosScreen
  └── 2g. GanttScreen (cambios mínimos, conservar tamaños de celda)
```

---

*Documento de planificación — no toca código. Requiere aprobación antes de iniciar Fase 1.*
