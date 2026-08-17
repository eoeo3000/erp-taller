# Plan de Sistema de Diseño — ERP Taller

*Documento de planificación — no toca código. Requiere aprobación antes de iniciar cualquier fase.*
*Depende de y extiende [plan-tipografia.md](plan-tipografia.md) — comparte el mismo `src/tokens.css`, no crea un sistema paralelo. Ver §4.*

---

## 1. Diagnóstico del estado actual

Inventario extraído directamente del código (`erp-web/src`, 11 pantallas + `App.jsx`, ~8.700 líneas), no de capturas de pantalla.

### 1.1 Paleta de color: sin sistema

**128 colores hexadecimales distintos** están hardcodeados en `style={{ }}` inline a lo largo del código. No existe ni un archivo de tokens ni una constante compartida — cada pantalla define los suyos.

Los 20 más repetidos:

| Color | Ocurrencias | Rol aparente |
|-------|-------------|---------------|
| `#ddd` | 45 | borde gris genérico |
| `#555` | 45 | texto secundario |
| `#27ae60` | 45 | verde éxito/positivo |
| `#3498db` | 37 | azul primario (links, acentos) |
| `#2c3e50` | 37 | texto oscuro / azul-gris (Dashboard, Finanzas) |
| `#888` | 35 | texto auxiliar |
| `#e74c3c` | 34 | rojo error/negativo |
| `#eee` | 32 | borde/fondo muy claro |
| `#1a2a3a` | 25 | azul-marino oscuro (header, textos fuertes) |
| `#c62828` | 23 | rojo error (alterno — Portal/Contabilidad) |
| `#2e7d32` | 22 | verde éxito (alterno — Portal/Contabilidad) |
| `#8e44ad` | 18 | púrpura (estado "Programada") |
| `#e0e0e0` | 16 | borde/fondo gris claro |
| `#1565c0` | 16 | azul (alterno — Portal) |
| `#f0f2f5` | 13 | fondo de página |
| `#f39c12` | 11 | naranja/ámbar (advertencia, "En Ejecución") |
| `#f8f9fa`, `#ecf0f1`, `#f0f0f0`, `#fafafa`, `#f9f9f9` | ~40 combinadas | 5 grises de fondo casi idénticos sin relación entre sí |

**El problema no es la cantidad de colores — es que hay 2 o 3 familias completas de rojo/verde/azul compitiendo por el mismo significado** (`#27ae60` vs `#2e7d32` para "verde éxito"; `#e74c3c` vs `#c62828` para "rojo error"; `#3498db` vs `#1565c0` vs `#2c3e50` para "azul"), dependiendo de qué pantalla se mire. No hay una escala de grises: hay al menos 9 grises de fondo distintos (`#f0f2f5`, `#f8f9fa`, `#ecf0f1`, `#f4f6f9`, `#f0f0f0`, `#fafafa`, `#f9f9f9`, `#f8fafc`, `#f1f5f9`) que deberían ser 3 o 4 pasos de una misma escala.

### 1.2 Colores de estado: contradicciones reales entre pantallas

El caso más grave: **el mismo estado tiene colores distintos según qué pantalla lo dibuja.**

**Estado de pago (`OT.pago.estado`: Pendiente / Parcial / Pagado)** — 4 implementaciones independientes, todas inline:

| Pantalla | Pendiente | Parcial | Pagado |
|----------|-----------|---------|--------|
| `PortalClienteScreen` (línea 350) | naranja `#e67e22` | naranja `#e67e22` (mismo bucket) | verde `#27ae60` |
| `DashboardScreen` (líneas 142-143, 231-232, duplicado 2×) | rojo bootstrap `#f8d7da`/`#721c24` | amarillo bootstrap `#fff3cd`/`#856404` | verde bootstrap `#d4edda`/`#155724` |
| `TratamientoScreen` (línea 1910) | rojo `#e74c3c` | naranja `#f39c12` | verde `#27ae60` |
| `FinanzasScreen` (`BADGE_PAGO`, líneas 10-14) | amarillo `#fff3cd`/`#856404` | **azul** `#cce5ff`/`#004085` | verde `#d4edda`/`#155724` |

"Parcial" es **amarillo en 2 pantallas y azul en la tercera**. Ningún componente comparte la definición.

**Estado de OT** (`Pendiente → Tratada → Planificada → Programada → En Ejecución → Trabajo Terminado → Con Informe → Pagada`): `DashboardScreen` tiene su propia tabla `ETAPAS` con 8 colores; `PortalClienteScreen` tiene otra tabla `INFO_OT` con un subconjunto de esos mismos estados en colores distintos (p. ej. "En Ejecución" es `#f39c12` en Dashboard pero `#27ae60` en Portal). Ninguna se reutiliza.

**Estado de Solicitud**, **estado de Equipo** (`Disponible/En Uso/Mantenimiento/Reparación`, en `RecursosScreen`) y **anulación de asiento contable**: cada uno con su propio mini-mapa de color inline, sin relación con los anteriores.

### 1.3 Sombras: sin escala de elevación

**~30 valores de `boxShadow` distintos**, ninguno reutilizado más de 3 veces. Blur, spread y opacidad varían sin patrón:

```
'0 2px 4px rgba(0,0,0,0.05)'   '0 1px 4px rgba(0,0,0,.05)'   '0 4px 12px rgba(0,0,0,0.15)'
'0 4px 12px rgba(0,0,0,0.1)'   '0 2px 8px rgba(0,0,0,0.08)'   '0 20px 60px rgba(0,0,0,0.3)'
'0 8px 40px rgba(0,0,0,.25)'   '0 8px 32px rgba(0,0,0,.18)'   '0 5px 15px rgba(0,0,0,0.3)'
... (+20 más, cada uno ligeramente distinto)
```

No hay una noción de "elevación baja / media / alta" — cada desarrollador (o cada sesión) inventó su propia sombra al escribir cada card/modal.

### 1.4 Bordes y radios: unidades y valores mezclados

`borderRadius` aparece en **17 valores distintos** (`0, 3, 4, 4px, 5px, 6, 6px, 8, 8px, 10, 10px, 12, 12px, 14, 15px, 20, 20px`), mezclando número desnudo y string con `px` para el mismo valor (`8` y `'8px'` conviven). Los más usados son 8px (41), 4px (31) y 6px (28) — cercanos entre sí pero sin una escala declarada.

Los colores de borde tienen el mismo problema que los grises de fondo: `#ddd` (34), `#e0e0e0` (6), `#eee` (5), `#ccc` (5), más de una decena de grises adicionales usados 1-2 veces cada uno (`#ced4da`, `#dee2e6`, `#dcdfe6`, `#e8ecf0`, `#e9ecef`, `#c3e6c3`...) que son, a simple vista, "casi el mismo gris" pero nunca el mismo valor.

### 1.5 Header: no tiene degradado, pero es oscuro y pesado

Corrección al diagnóstico esperado: el header actual (`App.jsx`, `styles.nav`) **no usa `linear-gradient`** — no se encontró ningún degradado en todo el código. Es un fondo sólido `#1a2a3a` (azul-marino) con `boxShadow: '0 2px 10px rgba(0,0,0,0.3)'`. El problema real no es un degradado sino que:
- Es oscuro, mientras el resto de la app usa fondos claros (`#f0f2f5`, `#f4f6f9`) — el header queda como un elemento ajeno, no integrado.
- La sombra es pesada (blur 10px, opacidad 0.3) comparada con el resto de la UI, que usa sombras mucho más sutiles.
- El logo usa `#3498db` y los links `white` — dos colores que no aparecen definidos en ningún lugar como "colores de marca".

### 1.6 Emojis en lugar de íconos

**289 líneas con al menos un emoji**, en los 11 archivos de pantalla + `App.jsx`. No hay ninguna librería de íconos instalada (`lucide-react`, `react-icons`, etc. no están en `package.json`). Los emojis cumplen simultáneamente el rol de:
- Íconos de navegación (`📥 SOLICITUDES`, `📊 CONTROL MACRO`, `🛠️ RECURSOS` en el nav de `App.jsx`)
- Íconos de sección/título (`📅 Cronograma`, `💰 Propuesta Económica` en `PortalClienteScreen`)
- Íconos de acción en botones (`🖨️ Imprimir`, `📤 Enviar Solicitud`, `🗑️` eliminar)
- Indicadores de estado (`✅`/`⬜` tarea completada, `⚠️` alerta de sobrecarga)

Esto es inconsistente visualmente (el emoji se renderiza distinto según SO/navegador — Windows, macOS y Android muestran glifos distintos para el mismo emoji) y no es accesible (lectores de pantalla los anuncian de forma impredecible, y no se pueden dar `aria-label` separados de forma consistente).

`TratamientoScreen` (2.392 líneas, la pantalla más grande) concentra 71 líneas con emoji; `RecursosScreen` (1.724 líneas) tiene 42; `PortalClienteScreen` tiene 32 pese a ser la pantalla de cara al cliente.

### 1.7 Componentización: no existe

No hay carpeta `src/components/`. Cada pantalla define su propio objeto `styles`/`s` local con sus propias variantes de botón y card:

- **Botones**: al menos 20 nombres distintos de botón repartidos por pantalla (`btnPrimario`, `btnPrimary`, `btnSecundario`, `btnTratar`, `btnEdit`, `btnPortal`, `btnAddSmall`, `btnDeleteRow`, `btnCloseModal`, `btnSuccessFinal`, `btnSuccessInactivo`, `btnPlanificar`, `btnInactivo`, `btnMas`, `btnEliminar`, `btnCamara`, `btnEnviar`, `btn(bg) => {...}` como función en `FinanzasScreen`/`ContabilidadScreen`...). Cada uno con su propio padding, radio, tamaño de fuente y paleta.
- **Cards/paneles**: `card`, `Card`, `seccion`, `panel` — 10 definiciones locales distintas, sin relación entre sí (algunas con sombra, otras con borde, otras con ambos).
- **Badges de estado**: ver §1.2 — 4+ implementaciones ad hoc para el mismo concepto.

Esto significa que un cambio de estilo (p. ej. "todos los botones primarios deberían ser azul Vercel en vez de verde") hoy requiere editar 20+ sitios distintos a mano, sin ninguna garantía de no olvidar uno.

### 1.8 Resumen del diagnóstico

| Dimensión | Estado actual | Riesgo |
|-----------|----------------|--------|
| Paleta | 128 colores hardcodeados, sin escala de grises | Alto — cambios de marca son inviables hoy |
| Estados (badges) | 4 mapas de color distintos para "pago", con contradicciones reales | Alto — el usuario ve información contradictoria entre pantallas |
| Sombras | ~30 valores únicos, sin escala | Medio — ruido visual, inconsistencia sutil pero constante |
| Bordes/radios | 17 valores de radio, decenas de grises de borde | Medio |
| Header | Oscuro, pesado, aislado del resto de la app | Medio — primera impresión |
| Íconos | 289 líneas con emoji, 0 librería de íconos | Medio-alto — percepción de "no profesional" |
| Componentes | 0 componentes compartidos (20+ botones, 10+ cards ad hoc) | Alto — cualquier mejora visual hoy no escala |

---

## 2. Propuesta de sistema de diseño mínimo

Inspiración: **Linear** (neutros fríos, acentos mínimos, bordes de 1px muy sutiles), **Vercel Dashboard** (escala de grises precisa, sombras casi imperceptibles, tipografía como jerarquía principal — coherente con el [plan de tipografía](plan-tipografia.md)), **Buk** (badges de estado pastel legibles, cards con aire generoso, sensación "producto de gestión de personas" adecuada a un ERP).

No se propone una librería de componentes (Material UI, Ant Design, etc.) ni Tailwind — mantiene la decisión existente del proyecto de CSS-in-JS con `style={{ }}` inline (ver `CLAUDE.md`), solo la organiza. Esto minimiza el riesgo de migración y es coherente con "sistema mínimo".

### 2.1 Paleta de colores

Un solo acento (azul, porque ya es el color dominante real: `#3498db`/`#1565c0`/`#2980b9` combinados suman más de 60 usos) + escala de grises neutra + 4 colores semánticos, cada uno con un par "fondo sutil / texto fuerte" listo para badges — resolviendo directamente la contradicción de §1.2.

```css
/* Grises — reemplaza los ~15 grises de fondo/borde/texto dispersos */
--gray-50:   #f8f9fb;   /* fondo de página (reemplaza #f0f2f5, #f4f6f9, #f8f9fa...) */
--gray-100:  #f1f3f6;   /* fondo de hover, filas alternas */
--gray-200:  #e4e7ec;   /* bordes por defecto (reemplaza #ddd, #eee, #e0e0e0...) */
--gray-300:  #d0d5dd;   /* bordes de input */
--gray-400:  #98a2b3;   /* texto deshabilitado, íconos secundarios */
--gray-500:  #667085;   /* texto auxiliar (reemplaza #888, #999, #aaa...) */
--gray-600:  #475467;   /* texto secundario (reemplaza #555, #666...) */
--gray-700:  #344054;   /* texto de cuerpo fuerte */
--gray-800:  #1d2939;   /* títulos, texto primario */
--gray-900:  #101828;   /* máximo contraste, header claro-sobre-oscuro puntual */

/* Acento — un único azul, 3 pasos */
--accent-50:  #eff6ff;
--accent-500: #2563eb;  /* acento primario: botones, links, focus ring */
--accent-600: #1d4ed8;  /* hover/active del acento */

/* Semánticos — cada uno resuelve una de las contradicciones de §1.2 */
--success-bg: #ecfdf3;  --success-text: #067647;   /* Pagado / Disponible / Aprobada */
--warning-bg: #fffaeb;  --warning-text: #b54708;   /* Parcial / Pendiente / En Ejecución */
--danger-bg:  #fef3f2;  --danger-text:  #b42318;   /* Rechazada / vencido / En Uso crítico */
--info-bg:    #eff8ff;  --info-text:    #175cd6;   /* Planificada / Programada / En Proceso */

/* Superficie */
--surface:        #ffffff;
--surface-sunken:  var(--gray-50);
--border-default:  var(--gray-200);
--shadow-color:    rgba(16, 24, 40, 0.08);  /* un único color base de sombra */
```

**Mapa de resolución de estados** (reemplaza las 4 tablas contradictorias de §1.2 por una sola fuente de verdad):

| Estado | Semántico | Aplica a |
|--------|-----------|----------|
| Pendiente | `warning` | Solicitud, OT, pago |
| Tratada / Planificada / En Proceso | `info` | OT, Solicitud |
| Programada | `info` | OT |
| En Ejecución | `warning` | OT (trabajo en curso, aún no cerrado) |
| Trabajo Terminado / Con Informe | `success` (tono atenuado) | OT |
| Pagada / Pagado / Aprobada / Disponible | `success` | OT, pago, Solicitud, Equipo |
| Parcial | `warning` | pago |
| Rechazada / En Uso (equipo con alta demanda) | `danger` | Solicitud, Equipo |

### 2.2 Escala de sombras (elevación)

Reemplaza los ~30 valores únicos de §1.3 por 3 niveles, todos sobre el mismo `--shadow-color`:

```css
--shadow-sm: 0 1px 2px var(--shadow-color);                          /* filas, chips */
--shadow-md: 0 2px 8px var(--shadow-color);                          /* Card por defecto */
--shadow-lg: 0 8px 24px rgba(16, 24, 40, 0.12);                      /* modales, dropdowns */
```

### 2.3 Radios y bordes

```css
--radius-sm: 6px;   /* badges, chips */
--radius-md: 8px;   /* inputs, botones — ya definido como --input-radius en plan-tipografia.md */
--radius-lg: 12px;  /* cards, modales */
```

### 2.4 Componentes propuestos

Todos en `erp-web/src/components/` (carpeta nueva), como componentes React livianos que consumen los tokens de §2.1-2.3 y los de tipografía ya aprobados — no CSS nuevo por fuera del sistema de variables.

**`<Badge estado="Pagado" dominio="pago" />`**
Un solo componente que resuelve el mapa de §2.1. Recibe el string de estado (`Pendiente`, `Programada`, `Pagado`...) y un `dominio` opcional (`ot` | `solicitud` | `pago` | `equipo`) solo para los pocos casos donde el mismo texto de estado tiene semánticas distintas según el dominio; internamente usa una única tabla de resolución en `components/estadoTokens.js`. Reemplaza las 4+ implementaciones de §1.2 y las de OT/Solicitud/Equipo.

**`<Button variant="primary|secondary|ghost|danger" size="sm|md" icon={<IconX/>} />`**
Reemplaza los 20+ `btn*` de §1.7. `primary` = fondo `--accent-500`; `secondary` = borde `--border-default` + fondo `--surface`; `ghost` = sin fondo/borde, solo texto + hover sutil; `danger` = `--danger-text` sobre `--danger-bg`. Acepta un ícono de `lucide-react` a la izquierda del texto (ver §2.5), reemplazando el emoji que hoy antecede al texto del botón en casi todos los `btnPrimario`/`btnEnviar`/etc.

**`<Card padding="md|lg" />`**
`background: var(--surface)`, `border: 1px solid var(--border-default)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-md)`. Reemplaza `card`/`Card`/`seccion`/`panel` de §1.7. Sin sombra pesada tipo Bootstrap-card — solo el borde de 1px hace la mayor parte del trabajo visual (patrón Linear), la sombra es de refuerzo.

**Header (`App.jsx`, no un componente nuevo, un rediseño del `styles.nav` existente)**
`background: var(--surface)` (blanco), `border-bottom: 1px solid var(--border-default)` en vez de `boxShadow`, texto/links en `--gray-700` con estado activo en `--accent-500` (reemplaza el actual `color: isActive ? '#3498db' : 'white'`, que deja de tener sentido sobre fondo claro). El logo pasa de texto azul sobre navy a texto `--gray-900` + un ícono `lucide-react` (`Wrench` o `LayoutGrid`) en `--accent-500`, sin depender de contraste blanco/oscuro.

### 2.5 Reemplazo de emojis por `lucide-react`

Se agrega `lucide-react` como dependencia nueva de `erp-web` (única dependencia nueva que introduce este plan). Mapa de los emojis más repetidos (cubre el nav completo de `App.jsx` y los títulos de sección más usados; el resto se completa pantalla por pantalla en fase de ejecución con el mismo criterio):

| Emoji actual | Ícono lucide-react | Uso |
|---------------|---------------------|-----|
| 📥 | `Inbox` | Solicitudes |
| 📊 | `LayoutDashboard` | Control Macro / Dashboard |
| 📅 | `Calendar` | Gantt / cronograma |
| 🛠️ / 🔧 | `Wrench` | Recursos / Tratamiento / logo |
| 💵 / 💰 | `DollarSign` | Finanzas / cotización |
| 📚 | `BookOpen` | Contabilidad |
| 📤 | `Upload` | Importar/Exportar (enviar) |
| 📷 | `Camera` | Reporte de terreno |
| 🌐 | `Globe` | Portal del cliente |
| 🔍 | `Search` | Buscar |
| ✅ | `CheckCircle2` | Completado / éxito |
| ❌ | `XCircle` | Error / rechazo |
| ⚠️ | `AlertTriangle` | Alertas (sobrecarga Gantt, errores de importación) |
| 🗑️ | `Trash2` | Eliminar |
| ✏️ | `Pencil` | Editar |
| ✉️ / 📧 | `Mail` | Correo |
| 📱 | `Smartphone` | WhatsApp/teléfono |
| 🏢 | `Building2` | Empresa (Portal — Contacto) |
| 📍 | `MapPin` | Dirección |
| 🕐 | `Clock` | Horario / pendiente |
| ⏳ | `Loader2` (animado) | Cargando |

Los emojis usados como contenido real del dato (no como ícono decorativo — por ejemplo si algún reporte de terreno permite al usuario escribir emojis en su comentario) **no se tocan**: este plan solo reemplaza emojis puestos por el código como decoración/ícono.

---

## 3. Priorización — regla 80/20

Ordenado por relación impacto visual / esfuerzo, no por dependencia técnica (eso está en §4-5).

### 🔴 Máximo impacto, mínimo esfuerzo (hacer primero)

1. **Tokens de color + sombra + radio en `tokens.css`** — un solo archivo, ya se va a crear para tipografía (§4). Añadir estas variables no cuesta una segunda migración de archivo.
2. **Header claro** — es un solo objeto (`styles.nav` en `App.jsx`, ~35 líneas) y es lo primero que ve cualquier usuario en cada pantalla. Cambia la percepción general de la app sin tocar ninguna pantalla individual.
3. **`<Badge>` aplicado a estado de OT/Solicitud/pago** — resuelve la contradicción real de §1.2 (información visualmente inconsistente hoy) y toca solo 4-5 puntos de uso concretos (Dashboard, Portal, Finanzas, Tratamiento), no las 11 pantallas.

Estas tres cosas, juntas, son quizás 1 día de trabajo y cambian la primera impresión de la app más que cualquier otra fase.

### 🟡 Impacto medio, esfuerzo medio

4. **`<Button>`** — impacto alto (se usa en todas partes) pero esfuerzo mayor porque hay 20+ sitios a migrar, uno por uno, sin poder automatizarlo con buscar/reemplazar (cada `btn*` tiene props ligeramente distintas).
5. **`<Card>`** — mismo patrón que Button pero con menos variantes (10 vs 20), esfuerzo menor.

### 🟢 Impacto visible pero esfuerzo alto y disperso

6. **Reemplazo de emojis por `lucide-react`** — 289 líneas en 11 archivos. Alto volumen, pero cada cambio es mecánico y de bajo riesgo (import + reemplazo 1:1). Se beneficia de hacerse *después* de Button/Card porque muchos emojis viven dentro de esos componentes y se resuelven solos al migrar el componente contenedor.
7. **Limpieza de colores/sombras/radios hardcoded restantes** (todo lo que no quedó cubierto por Header/Badge/Button/Card) — cola larga, bajo riesgo, se puede hacer de forma incremental sin bloquear nada más.

---

## 4. Compatibilidad con el plan de tipografía

Este plan **no introduce un segundo archivo de tokens ni un segundo criterio de ejecución** — extiende el `src/tokens.css` y el orden de pantallas ya definidos en [plan-tipografia.md](plan-tipografia.md):

- Los tokens de color/sombra/radio de §2.1-2.3 se añaden al **mismo bloque `:root` de `src/tokens.css`** propuesto en la §3 de plan-tipografia.md, no a un archivo separado.
- `--radius-md: 8px` reutiliza exactamente el valor ya fijado como `--input-radius` en plan-tipografia.md §2.4 — no se redefine.
- `<Button>` y `<Badge>` usan las variables `--fw-bold`, `--fs-label`, etc. ya definidas por el plan de tipografía en vez de declarar su propio `fontWeight`/`fontSize`.
- El orden de migración pantalla-por-pantalla de §5 de plan-tipografia.md (Portal → Ingreso → Tratamiento → Dashboard → Contabilidad/Finanzas → ImportExport/Recursos → Gantt) se reutiliza tal cual para este plan, para no tocar cada pantalla dos veces en dos PRs separados.
- Ninguna decisión de este plan contradice la de tipografía: el plan de tipografía ya elimina `color-scheme: light dark` y el `color: rgba(255,255,255,0.87)` de `index.css` (§4 de ese plan) — precondición necesaria para que el header claro de §2.4 de este documento se vea correctamente. **Este plan depende de que la Fase 1 del plan de tipografía se ejecute primero o en el mismo PR.**

---

## 5. Fases y entregables

Cada fase es un PR independiente y revisable por separado. Fase 0 asume que la Fase 1 de `plan-tipografia.md` (tokens.css + reset de `index.css`) ya se ejecutó o se ejecuta en el mismo PR.

```
Fase 0 — Fundamentos (≈1 día)
  ├── Añadir tokens de color/sombra/radio a src/tokens.css (§2.1-2.3)
  ├── Rediseñar el header (App.jsx → styles.nav) a fondo claro
  ├── Crear components/estadoTokens.js con el mapa único de §2.1
  └── Entregable: la app carga con header claro y tokens disponibles;
      nada más cambia visualmente todavía (bajo riesgo, fácil de revisar)

Fase 1 — Badge de estados (≈1-2 días)
  ├── Crear components/Badge.jsx
  ├── Migrar: DashboardScreen (ETAPAS + colorEstadoSol + badge de pago ×2),
  │           PortalClienteScreen (INFO_OT + badge de pago),
  │           FinanzasScreen (BADGE_PAGO),
  │           TratamientoScreen (selector de estado de pago),
  │           RecursosScreen (estado de Equipo)
  └── Entregable: un único componente de estado en toda la app;
      la contradicción "Parcial amarillo vs azul" (§1.2) queda resuelta

Fase 2 — Button (≈2-3 días, el más disperso)
  ├── Crear components/Button.jsx (variantes primary/secondary/ghost/danger)
  ├── Migrar pantalla por pantalla, mismo orden que plan-tipografia.md §5:
  │     IngresoScreen → TratamientoScreen → DashboardScreen →
  │     ContabilidadScreen + FinanzasScreen → ImportExportScreen +
  │     RecursosScreen → GanttScreen → PortalClienteScreen
  └── Entregable: los 20+ btn* ad hoc quedan reemplazados; se puede
      revisar y mergear pantalla por pantalla si el PR único es muy grande

Fase 3 — Card (≈1 día)
  ├── Crear components/Card.jsx
  ├── Migrar los 10 contenedores card/Card/seccion/panel existentes
  └── Entregable: superficies visuales consistentes (borde + sombra sutil)

Fase 4 — Íconos lucide-react (≈2-3 días, alto volumen/bajo riesgo)
  ├── npm install lucide-react (erp-web)
  ├── Reemplazar emojis de navegación (App.jsx) y títulos de sección
  │     usando el mapa de §2.5
  ├── Completar el resto pantalla por pantalla (289 líneas totales,
  │     la mayoría ya tocadas en Fase 2/3 al migrar Button/Card)
  └── Entregable: cero emojis decorativos remanentes; se puede partir
      en sub-PRs por pantalla sin riesgo de romper nada

Fase 5 — Limpieza final (≈1-2 días, cola larga)
  ├── Barrer colores/sombras/radios hardcoded que no fueron tocados
  │     por Header/Badge/Button/Card (inputs sueltos, tablas, modales)
  └── Entregable: `grep -r "#[0-9a-fA-F]\{3,6\}"` sobre erp-web/src
      solo devuelve resultados dentro de components/ y tokens.css
```

**Orden recomendado de ejecución:** Fase 0 y Fase 1 primero (regla 80/20 de §3) — son el salto visual más grande. Fase 2 y 4 pueden avanzar en paralelo por pantalla una vez existan `Button` e íconos base. Fase 3 y 5 son de limpieza y pueden diferirse sin afectar la percepción visual del cambio.
