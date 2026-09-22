# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"erp-taller" — an ERP for a workshop/service business (Chilean Spanish domain language) that tracks the flow: **Solicitud** (customer request) → **OT** (orden de trabajo / work order, with tasks, Gantt scheduling, materials, financials) → **execution/reports** (field reports with photos, supervisor portal) → **payment**.

Two independent apps in one repo, no shared package/workspace tooling:

- `erp-backend/` — Node.js + Express + Mongoose REST API (CommonJS).
- `erp-web/` — React 19 + Vite SPA (ESM), single-page app with all screens as top-level routes.

They communicate purely over HTTP; `erp-web` talks to `erp-backend` via `VITE_API_URL` (falls back to `http://localhost:5000/api`).

## Commands

### Backend (`erp-backend/`)
```bash
npm start          # node server.js — runs the API on $PORT (default 5000)
```
No hay lint ni build en el backend. `npm test` corre `node --test test/*.test.js` — el runner que trae Node, sin framework ni dependencias nuevas; por ahora cubre solo las funciones puras del login (`utils/password.js`, `utils/tokens.js`). El frontend usa vitest (`erp-web`, `npm test`).

One-off maintenance scripts live at the backend root and are run directly with `node <file>.js` (not wired into package.json). `test-db.js` is an ad hoc manual check script with a hardcoded local Mongo URI, not a real test. Destructive Mongo cleanup scripts (`borrado_total.js`, `borrarIndice.js`, `limpiar.js`, `limpiarSuministros.js`) live in `scripts/peligrosos/` (see its README) and connect using `MONGO_URI` from `.env` — they now require typing the target database name to confirm before touching anything, but still treat them as dangerous and confirm with the user before running or modifying.

Required `erp-backend/.env` variables: `MONGO_URI`, `PORT` (optional, defaults to 5000), `BREVO_API_KEY` (SMTP relay for outgoing mail), `EMAIL_FROM`. `AUTH_REQUERIDA='true'` activa el login de la SPA (ver `middlewares/sesion.js`); `SPA_URL` es el host de `erp-web`, usado para armar el link del correo de recuperación de clave. Optional: `API_KEY` — shared secret gating the highest-risk write routes (OT, contabilidad, recursos/puestos/calendarios; see `middlewares/apiKey.js`). Unset by default, which leaves those routes unprotected (with a console warning) exactly as before this was added — set it here and set the matching `VITE_API_KEY` in `erp-web/.env` to activate the gate. Not real per-person auth: it ships in the SPA build and is visible in any browser's network tab. `erp-pwa-operativa` also calls one gated route (`PUT /api/ots/:id`, used to save the informe de evaluación) — it needs the same `VITE_API_KEY` set in its own build env too, or that save fails with 401.

### Web (`erp-web/`)
```bash
npm run dev         # vite dev server
npm run build        # vite build
npm run lint          # eslint .
npm run preview       # preview production build
```
Env var: `VITE_API_URL` (base URL for the backend API, e.g. `http://localhost:5000/api`).

No automated tests exist on the frontend either; UI changes should be verified by running `npm run dev` and exercising the screen manually.

## Architecture

### Backend structure
Layered Express app under `erp-backend/src/`:
- `routes/` — one router per resource, all mounted under `/api` in `routes/index.js` (e.g. `/api/recursos`, `/api/ots`, `/api/solicitudes`, `/api/equipos`, `/api/suministros`, `/api/calendarios`, `/api/puestos`, `/api/plantillas`). `server.js` also mounts `/api/mail` (quotation emails) directly, separate from `routes/index.js`.
- `controllers/` — one file per resource, plain `exports.fn = async (req, res) => {...}` handlers. Convention: `try/catch` per handler, `res.status(...).json({ error: ... })` on failure (message key varies: `error`, `mensaje`, `message` — not standardized across the 22 existing controllers, don't assume one). `res.ok(datos, status?)` / `res.fail(status, mensaje)` (`middlewares/respuestas.js`, wired globally in `server.js`) standardize on `{ error }` for failures — use them in new controllers or ones already being touched for another reason, don't retrofit existing untouched controllers just for consistency.
- `models/` — Mongoose schemas. Note the filename casing is inconsistent (`OT.js`, `Recurso.js`, `Solicitud.js`, `Calendario.js`, `Plantilla.js` vs. lowercase `puesto.js`, `suministro.js`, `equiposHerramientas.js`) — match existing require paths exactly.
- `middlewares/auth.js` — trivial shared-secret check (`req.body.key !== "ClaveSecreta123"`), used only on the `webhook-emails` route. Not a general auth system.
- `middlewares/sesion.js` — login de la SPA de escritorio. `identificar` corre sobre toda la API y deja `req.usuario` cuando la request trae `Authorization: Bearer <token>` de una `SesionStaff` válida, sin bloquear a nadie; `requiereSesion` devuelve 401 sin ella. Aplicado en `routes/index.js` a los routers que solo usa `erp-web` (`/data`, `/recursos`, `/equipos`, `/suministros`, `/calendarios`, `/puestos`, `/plantillas`, `/finanzas`, `/contabilidad`, `/import`, `/proveedores`, `/ordenes-compra`, `/disposiciones`, `/demo`, `/clientes`) y a todo `/usuarios` salvo `/whoami`. **Quedan abiertos a propósito** los que comparten las PWAs (`/ots`, `/solicitudes`, `/portal`, `/asignaciones`, `/uploads`, `/tipos-trabajo`, `/catalogos-transversales`): cerrarlos requiere que `erp-pwa-operativa` mande su token en las llamadas que hoy van sin ninguno. Igual que `apiKey`, el gate solo bloquea de verdad con `AUTH_REQUERIDA='true'` en el `.env` — sin esa variable deja pasar con un aviso. **`GET /auth/yo` respeta el mismo interruptor**: sin sesión y con el gate apagado responde `200 {usuario: null, authRequerida: false}` en vez de 401, y el SPA entra igual que antes de que existiera el login. Sin eso, desplegar deja a la oficina frente a una pantalla de acceso que nadie puede pasar, porque las cuentas con clave se crean después (`scripts/crearAdmin.js`) — el orden correcto es desplegar, crear la cuenta, y recién ahí activar `AUTH_REQUERIDA`.
- `Usuario` es la única tabla de personas y sostiene las dos formas de entrar: `token` permanente (PWA Operativa, sin clave) y `email` + `passwordHash` (escritorio, con sesiones en `SesionStaff`). Ambos campos son opcionales. **Cualquier búsqueda por `token` debe descartar antes el valor vacío**: `findOne({ token })` con token undefined viaja como `{ token: null }` y hace match con los documentos sin ese campo, o sea con las cuentas de oficina.
- Cuentas de escritorio: alta **solo por invitación** desde la app (`cuentasController.js`, rutas `/api/cuentas`, pestaña "Cuentas de oficina" en `BodegaTokensScreen`). No hay registro abierto en la pantalla de ingreso: un correo confirma el buzón, no que la persona trabaje en el taller — quien autoriza es la oficina. Invitar crea el `Usuario` **sin `passwordHash`** (existe pero no sirve para entrar) y manda un link a `/activar?token=`, que reusa `POST /auth/restablecer`: activar una cuenta nueva y reponer una olvidada son el mismo acto (alguien que demuestra tener el buzón elige su clave), solo cambia el texto. Nadie, ni quien invita, conoce la clave de otro. Esas rutas usan `requiereSesionEstricta` y **no** `requiereSesion`: una invitación emitida mientras `AUTH_REQUERIDA` sigue apagada seguiría sirviendo después de encenderla, así que ahí dejar pasar sería regalar acceso permanente. Consecuencia buscada: sin una cuenta previa no se puede invitar desde la app, y la primera sale del script de abajo. Revocar cierra las sesiones abiertas al instante y se deshace con Reactivar (principio de vuelta atrás); nadie puede revocarse a sí mismo, para no dejar al taller sin ninguna cuenta activa.
- Primer administrador: `node scripts/crearAdmin.js` con `ADMIN_EMAIL`/`ADMIN_NOMBRE`/`ADMIN_PASSWORD` en el entorno (`--entorno=demo` para la base de demostración, `--reset` para pisar una cuenta existente). Es la única forma de crear la primera cuenta y el salvavidas si se pierde el acceso; no se borra aunque no se use a diario.
- `middlewares/upload.js` and inline multer configs in some routes — disk storage into `erp-backend/uploads/`, filename = timestamp + random suffix. Served statically at `/uploads`.
- `config/mailer.js` — nodemailer transporter via Brevo SMTP relay, used for quotation emails and supervisor-portal notifications.

**`GET /api/data`** (`dataController.getAllData`) is the primary sync endpoint: it fetches all collections (calendarios, equipos, ots, recursos, solicitudes, suministros, puestos, plantillas) in parallel and returns them as one payload. The frontend polls this endpoint (see below) rather than using per-resource fetches for its main data load.

**Domain flow / model relationships:**
- `Solicitud` (customer request, `estado` starts `'Pendiente'`) is converted into an `OT` via `otController.convertirOT` / `actualizarOT`, which upserts an `OT` document reusing the `Solicitud`'s `_id` as `solicitudId` and auto-generates `numeroOT` in the form `OT-2026-0001` (sequence scoped to the hardcoded year prefix `OT-2026-`). Deleting an `OT` resets its linked `Solicitud` back to `'Pendiente'`.
- `OT` embeds its own working data: `tareas` (scheduled tasks, each with `operarioId`/`operarioNombre` as **arrays**, supports multiple assignees), `componentes` (materials/equipment line items), `logistica` (transport line items), `reportes` (field reports with photo/comment, used by the field-report and supervisor-portal flows), `pago` (payment status subdocument), and `granTotal`.
- `Recurso` = personnel/human resource, referencing `Calendario` (a work-schedule template: weekly or rotating `tipo: 'rotativo'` shift cycles with per-day time blocks) via `calendarioId`, plus per-date manual overrides in `ajustes` (a `Map<dateISO, hours>`). Deleting a `Recurso` or `Calendario` cascades a cleanup pass over all `OT.tareas` (via `updateMany`/`arrayFilters`) so the Gantt doesn't reference dangling operarios.
- `Puesto` = job role with an hourly cost (`costoHora`), referenced by name (not by `_id`) inside `OT.tareas[].puesto`.
- `Plantilla` = a reusable task/material template that gets applied when building out an `OT`.
- `EquiposHerramientas` and `Suministro` are separate catalogs (tools/machinery vs. consumable supplies), both flow into `OT.componentes` when used on a work order.
- **Supervisor portal** (`otController.js`, functions `enviarAlSupervisor` / `supervisorPortal` / `supervisorAccion`): generates a random `tokenEjecucion` stored on the `OT`, emails a link containing it, and serves a server-rendered HTML page (no auth beyond token match: `ot.tokenEjecucion !== token` → 403) that lets a supervisor start/pause/report/finish work without a login. Treat this token as the only access control on that flow — do not assume real authentication exists there. A newer, per-person token flow exists in parallel for the PWA Operativa (`Usuario`/`Asignacion` models, `otController.accionMovil`, see `docs/estrategia-movil.md`) — this older per-OT flow stays alive only until every outstanding `tokenEjecucion` link has been used/expired and the SPA gets an admin screen to create `Usuario`/`Asignacion`; don't assume it's dead code.

### Frontend structure
`erp-web/src/App.jsx` is the composition root: it owns **all** application state (recursos, ots, solicitudes, calendarios, componentes, suministros, puestos, plantillas) via `useState`, defines every CRUD/mutation function (e.g. `crearRecurso`, `actualizarOtGlobal`, `guardarCalendarioGlobal`, `crearPuesto`, `enviarASupervisor`), and passes both state and handlers down as props to screen components — there is no context provider, Redux, or React Query; **all cross-screen data lives in `App.jsx` and flows down via props**. When adding a feature that needs new server data or mutations, add the fetch/state/handler in `App.jsx` and thread it through as a prop, following the existing naming pattern (`crearX`, `actualizarX`, `eliminarX`, `...Global`).

Data freshness: `App.jsx` fetches `/api/data` once on mount and then polls it every 30s, doing a `JSON.stringify` diff per slice before calling the corresponding setter (`syncState` helper) to avoid unnecessary re-renders. El poll manda `headerSondeo()` (`X-Sondeo: 1`) para que el backend no cuente esa llamada como actividad de la persona — si no, una pestaña abierta mantendría la sesión viva para siempre.

Acceso: `App.jsx` pregunta a `GET /api/auth/yo` al montar y guarda el resultado en `acceso` (`'verificando' | 'requiere-login' | 'adentro'`). Solo con `'requiere-login'` — es decir, cuando el backend respondió 401 porque `AUTH_REQUERIDA` está activa — renderiza `LoginScreen` en vez del router; con el gate apagado entra sin sesión y sin bloque de usuario en el nav — salvo en las rutas de `RUTAS_PUBLICAS` (`/portal`, el link que se manda a los clientes por WhatsApp, y `/restablecer`, el del correo de recuperación), que se montan solas sin el shell. `utils/sesion.js` guarda el token en **sessionStorage** (muere al cerrar el navegador; el backend agrega la ventana de inactividad de 60 min) y lo propaga por `axios.defaults`, igual que `utils/entorno.js` con el entorno — las llamadas con `fetch()` nativo sí necesitan `headerSesion()` a mano, junto a `headerEntorno()`/`headerApiKey()`. Un interceptor de axios devuelve al login ante cualquier 401 que no venga de `/auth/login` ni `/auth/yo`. No se usa cookie porque el SPA y el backend son servicios distintos de Render: sería cookie de terceros y Safari la bloquea.

Screens (`src/screens/`), each a route in the router (`react-router-dom` v7, no code-splitting):
- `IngresoScreen` (`/`) — intake of new solicitudes.
- `DashboardScreen` (`/dashboard`) — macro control view of OTs/solicitudes.
- `TratamientoScreen` (`/tratamiento`) — builds out an OT's tasks/materials/logistics, quotation PDF generation (`jspdf` + `jspdf-autotable` + `html2canvas`), triggers supervisor email / WhatsApp share.
- `GanttScreen` (`/gantt`) — scheduling view using `calendarios`/`recursos` to compute available hours per day (`obtenerHorasParaDia`, defined in `App.jsx`).
- `RecursosScreen` (`/recursos`) — CRUD for personnel, equipment, supplies, puestos, calendarios, plantillas (the "admin" screen — currently open in the IDE).
- `ReporteTerreno` (`/reporte`) — field report view for a specific OT (`?id=`), used for photo/comment reporting.

No CSS framework/UI kit: styling is a mix of inline `style` objects (see `styles` const at the bottom of `App.jsx`) and plain CSS files (`App.css`, `index.css`, `screens/index.css`). `useIsMobile` (`src/hooks/useIsMobile.js`) is the only shared hook, used to switch the nav between desktop links and a hamburger menu at a 768px breakpoint.

WhatsApp integration is a plain `wa.me` deep link built client-side (`enviarASupervisor` in `App.jsx`), not an API integration.

## Conventions to follow

- **Toda etapa tiene vuelta atrás** — principio rector de producto, ver [`docs/principio-vuelta-atras.md`](docs/principio-vuelta-atras.md). Antes de agregar un paso que cierra algo (aprobar, aceptar, finalizar, enviar), definir explícitamente cómo se deshace y hasta cuándo. Cuatro reglas: el corte lo decide quien revisa, no quien ejecuta; la vuelta atrás va donde se detecta el problema; deshacer también revierte los efectos (reservas de stock/equipos, envíos, copias congeladas), no solo el `estado`; y toda ida y vuelta queda en `OT.bitacora`. Ese documento tiene además el mapa de qué etapa se puede deshacer hoy y cuál no.
- Backend is CommonJS (`require`/`module.exports`); frontend is ESM (`import`/`export`). Don't mix.
- Domain language throughout the codebase (variables, model fields, routes, UI copy) is Spanish — match it in new code rather than introducing English identifiers.
- Mongoose models guard against recompilation with `mongoose.models.X || mongoose.model('X', schema)` in some files (`OT`, `Solicitud`, `Plantilla`) but not others (`Recurso`, `Calendario`, `EquiposHerramientas`, `Puesto`, `Suministro`) — copy the pattern of the file you're editing rather than "fixing" inconsistently across the codebase in an unrelated change.
- Controllers return raw Mongoose documents/plain JSON with ad hoc shapes (sometimes the doc directly, sometimes `{ ot: doc }`, `{ mensaje }`, `{ success, ... }`) — check the specific controller/frontend caller before assuming a response shape.
- IDs from Mongo are matched frontend-side with `String(a) === String(b)` throughout (ObjectId vs string comparisons) — follow this pattern rather than relying on `===` directly on IDs.
