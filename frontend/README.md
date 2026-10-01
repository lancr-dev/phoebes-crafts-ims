# Phoebe's Crafts frontend

React/Vite frontend with a responsive admin login, session restoration, a protected
inventory dashboard, material management, and sign-out. The logs page remains scaffolded.

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

## Checks

```powershell
npm run build
npm run lint
node --test --test-concurrency=1 test/auth.test.js test/dashboard.test.js test/inventory.test.js
```

The automated frontend checks mock HTTP responses and do not contact MongoDB or Redis.
The existing unused React imports in the other scaffolded pages/components cause
full lint to fail; the implemented auth, dashboard, and inventory files pass lint independently.

For browser verification, check empty fields, incorrect credentials, password
visibility, successful login, session restoration, sign-out, and an unavailable backend.
For the dashboard, check zero totals and the empty recent list, refresh, error states,
and session expiration. For inventory, add/edit a material, increase/decrease stock,
cancel and confirm deletion, and navigate multiple pages. Check that an invalid
quantity preserves the form and that deleting the final page's only row returns
to the preceding page. Once materials exist, compare dashboard totals and newest-first rows. Check
keyboard navigation and widths of 320, 375, 768, 1024, and 1440 pixels, plus 200%
zoom. The backend limits login to five requests per IP in fifteen minutes, including
successful attempts.
