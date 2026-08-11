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
There is no lint/test/build script for the backend (`npm test` is a stub). No test framework is configured anywhere in the repo.

One-off maintenance scripts live at the backend root and are run directly with `node <file>.js` (not wired into package.json): `borrado_total.js`, `borrarIndice.js`, `limpiar.js`, `limpiarSuministros.js` are destructive Mongo cleanup scripts that connect using `MONGO_URI` from `.env` — treat them as dangerous, confirm with the user before running or modifying. `test-db.js` is an ad hoc manual check script with a hardcoded local Mongo URI, not a real test.

Required `erp-backend/.env` variables: `MONGO_URI`, `PORT` (optional, defaults to 5000), `BREVO_API_KEY` (SMTP relay for outgoing mail), `EMAIL_FROM`.

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
- `controllers/` — one file per resource, plain `exports.fn = async (req, res) => {...}` handlers. Convention: `try/catch` per handler, `res.status(...).json({ error: ... })` on failure (message key varies: `error`, `mensaje`, `message` — not standardized, don't assume one).
- `models/` — Mongoose schemas. Note the filename casing is inconsistent (`OT.js`, `Recurso.js`, `Solicitud.js`, `Calendario.js`, `Plantilla.js` vs. lowercase `puesto.js`, `suministro.js`, `equiposHerramientas.js`) — match existing require paths exactly.
- `middlewares/auth.js` — trivial shared-secret check (`req.body.key !== "ClaveSecreta123"`), used only on the `webhook-emails` route. Not a general auth system; most routes are unauthenticated.
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
- **Supervisor portal** (`otController.js`, functions `enviarAlSupervisor` / `supervisorPortal` / `supervisorAccion` / `iniciarEjecucion`): generates a random `tokenEjecucion` stored on the `OT`, emails a link containing it, and serves a server-rendered HTML page (no auth beyond token match: `ot.tokenEjecucion !== token` → 403) that lets a supervisor start/pause/report/finish work without a login. Treat this token as the only access control on that flow — do not assume real authentication exists there.

### Frontend structure
`erp-web/src/App.jsx` is the composition root: it owns **all** application state (recursos, ots, solicitudes, calendarios, componentes, suministros, puestos, plantillas) via `useState`, defines every CRUD/mutation function (e.g. `crearRecurso`, `actualizarOtGlobal`, `guardarCalendarioGlobal`, `crearPuesto`, `enviarASupervisor`), and passes both state and handlers down as props to screen components — there is no context provider, Redux, or React Query; **all cross-screen data lives in `App.jsx` and flows down via props**. When adding a feature that needs new server data or mutations, add the fetch/state/handler in `App.jsx` and thread it through as a prop, following the existing naming pattern (`crearX`, `actualizarX`, `eliminarX`, `...Global`).

Data freshness: `App.jsx` fetches `/api/data` once on mount and then polls it every 30s, doing a `JSON.stringify` diff per slice before calling the corresponding setter (`syncState` helper) to avoid unnecessary re-renders.

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

- Backend is CommonJS (`require`/`module.exports`); frontend is ESM (`import`/`export`). Don't mix.
- Domain language throughout the codebase (variables, model fields, routes, UI copy) is Spanish — match it in new code rather than introducing English identifiers.
- Mongoose models guard against recompilation with `mongoose.models.X || mongoose.model('X', schema)` in some files (`OT`, `Solicitud`, `Plantilla`) but not others (`Recurso`, `Calendario`, `EquiposHerramientas`, `Puesto`, `Suministro`) — copy the pattern of the file you're editing rather than "fixing" inconsistently across the codebase in an unrelated change.
- Controllers return raw Mongoose documents/plain JSON with ad hoc shapes (sometimes the doc directly, sometimes `{ ot: doc }`, `{ mensaje }`, `{ success, ... }`) — check the specific controller/frontend caller before assuming a response shape.
- IDs from Mongo are matched frontend-side with `String(a) === String(b)` throughout (ObjectId vs string comparisons) — follow this pattern rather than relying on `===` directly on IDs.
