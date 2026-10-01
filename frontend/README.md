# Phoebe's Crafts frontend

React/Vite frontend with a responsive admin login, session restoration, a protected
inventory dashboard, and sign-out. Inventory management and logs pages remain scaffolded.

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

## Checks

```powershell
npm run build
npm run lint
node --test --test-concurrency=1 test/auth.test.js test/dashboard.test.js
```

The automated frontend checks mock HTTP responses and do not contact MongoDB or Redis.
The existing unused React imports in the other scaffolded pages/components cause
full lint to fail; the implemented auth and dashboard files pass lint independently.

For browser verification, check empty fields, incorrect credentials, password
visibility, successful login, session restoration, sign-out, and an unavailable backend.
For the dashboard, check zero totals and the empty recent list, refresh, error states,
and session expiration. Once materials exist, compare totals and newest-first rows. Check
keyboard navigation and widths of 320, 375, 768, 1024, and 1440 pixels, plus 200%
zoom. The backend limits login to five requests per IP in fifteen minutes, including
successful attempts.
