# Phoebe's Crafts frontend

React/Vite frontend with a responsive admin login, session restoration, a protected
inventory dashboard, material management, stock movement logs, and sign-out.

## Run locally

Start the backend in one terminal:

```powershell
cd backend
npm run dev
```

Start the frontend in another terminal, from the repository root:

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173/login`. Vite uses a strict port so its origin stays
aligned with `FRONTEND_ORIGIN=http://localhost:5173` in the backend configuration.
Use the existing admin credentials configured in the backend.

Development API requests default to `http://localhost:5001/api`. To change this,
create `frontend/.env.local`, set `VITE_API_BASE_URL`, and restart Vite.
This URL is public configuration; never put backend secrets into a `VITE_` variable.
Production defaults to `/api` unless an API URL is supplied at build time. The
production host must serve API requests and fall back to `index.html` for frontend
routes. Keep the frontend and API on the same site for `SameSite=Strict` cookies.

## Authentication

- `services/apiClient.js` centralizes the API URL, cookie credentials, and timeout.
- `services/authApi.js` implements `/auth/login`, `/auth/me`, and `/auth/logout`.
- `auth/AuthProvider.jsx` restores the server session and owns authentication state.
- `components/ProtectedRoute.jsx` guards frontend routes. The backend still enforces
  authorization for API access.
- No passwords or session tokens are persisted in browser storage.

A successful login redirects to `/dashboard` (also accessible through `/`).
Refreshing restores the server session. Signing out returns to `/login`.

## Dashboard

The dashboard calls `GET /api/inventory/dashboard` through the shared Axios client.
The authenticated backend endpoint uses one MongoDB aggregation to return counts
for all materials and the six most recently created materials. It follows the
backend's saved stock statuses and returns only the recent fields needed by the UI.

The response contains `summary` (`totalMaterials`, `inStockMaterials`,
`lowStockMaterials`, `outOfStockMaterials`) and `recentMaterials` (each material's
`_id`, `itemName`, `category`, `stock`, `status`, and `createdAt`).

An empty inventory displays four zero counts and an empty-state message. No sample
records are created. Loading and failed requests remain distinct from empty data.
Refresh updates the dashboard; a failed refresh retains and labels the last loaded
values. Expired sessions return to login. React Hot Toast supplies refresh, error,
session-expiration, and sign-out feedback.

On desktop, the dashboard uses sidebar navigation and a four-column totals layout.
Narrow layouts place navigation above the page, use two columns for totals, and
stack recent material rows while retaining the name, category, stock, and status.

## Inventory

Open the Inventory navigation tab or `/inventory`. The page loads twenty materials
at a time, newest first, with previous/next controls and a total count. Empty,
loading, and failed requests have distinct states.

Filter by category opens a labeled category selector sourced from the full
inventory. Selecting a stored category applies an exact, case-sensitive server
filter and returns to page one. Paging and refresh retain the selection; Clear
filter or All categories restores the full list. Counts and pagination describe
only matching materials. A category with no remaining materials has a distinct
empty state. Category choices refresh after adding, editing, deleting, or using
Refresh. If a saved material falls outside the selected category, the success
message explains how to find it. A failed category lookup can be retried without
blocking the unfiltered inventory page.

Add materials with a name, category, and nonnegative whole starting stock. Edit
changes the name and category only; the increase/decrease controls accept a positive
whole quantity. This avoids replacing stock with an old value during a metadata
edit. The backend validates stock, computes status, and records changes in transactions.
Decrease is disabled for zero stock. Deletion requires confirmation and keeps stock
history. Adding returns to page one; deleting the last row on a final page returns
to the remaining last page.

Axios requests use the existing session cookie. Duplicate submissions are blocked;
uncertain results require closing the dialog to refresh before submitting again.
Expired sessions return to login. Dialogs use native modal focus handling, Escape,
visible field labels, and inline errors. On narrow screens, each table row stacks
into a material entry with all four actions available.

## Inventory logs

Open Inventory logs in navigation or `/logs`. Twenty records appear per page,
newest first, with date/time, the saved material name, Stock in/Stock out, quantity,
and before/after quantities. Times use `Asia/Manila` (UTC+08:00). The saved name is
retained after a material is renamed or deleted. Narrow layouts stack rows and keep
all six columns' information visible.

Download PDF exports the entire history captured when the page loaded, across all
pages. It requests the existing streamed JSON export through the captured newest
record, validates it, and creates a landscape A4 report with repeated headers and
page numbers. An export fails visibly if history was cleared before the report was
received. The PDF libraries and font load only when downloading; generating very
large reports uses browser memory in proportion to the exported history.

PDF generation uses jsPDF and jsPDF-AutoTable. The bundled Noto Sans Regular font
comes from <https://github.com/notofonts/noto-fonts> and retains its SIL Open Font
License in `src/assets/NotoSans-LICENSE.txt`.

Clear logs opens a confirmation dialog for the captured history, across all pages.
It does not change materials or stock quantities. The backend requires the admin
session, trusted browser origin, explicit confirmation, and a date/ID boundary;
newer history is kept. Duplicate submissions are blocked. After a failed clear,
closing the dialog refreshes history before another attempt. Empty or unavailable
history disables both export and clearing. Expired sessions return to login.

## Checks

```powershell
npm run build
npm run lint
node --test --test-concurrency=1 test/auth.test.js test/dashboard.test.js test/inventory.test.js test/logs.test.js
```

The automated frontend checks mock HTTP responses and do not contact MongoDB or Redis.
The checks cover authentication, dashboards, materials, logs, API contracts,
pagination, validation, semantic rendering, and real PDF generation. Full lint
includes every implemented page and component.

For browser verification, check empty fields, incorrect credentials, password
visibility, successful login, session restoration, sign-out, and an unavailable backend.
For the dashboard, check zero totals and the empty recent list, refresh, error states,
and session expiration. For inventory, add/edit a material, increase/decrease stock,
cancel and confirm deletion, and navigate multiple pages. Check that an invalid
quantity preserves the form and that deleting the final page's only row returns
to the preceding page. For logs, check a Stock in and Stock out movement, Manila
timestamps, pagination beyond twenty records, and downloading a PDF with all pages.
Confirm clearing only when you intend to remove that history; test cancelling first
and confirm stock quantities stay unchanged. Once materials exist, compare
dashboard totals and newest-first rows. Check
keyboard navigation and widths of 320, 375, 768, 1024, and 1440 pixels, plus 200%
zoom. The backend limits login to five requests per IP in fifteen minutes, including
successful attempts.
