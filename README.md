# Phoebe's Crafts inventory system

React/Vite frontend and Express API deployed together as one Render Web Service.
Local development instructions are in [frontend/README.md](frontend/README.md)
and API/security documentation is in [backend/README.md](backend/README.md).

## Deploy to Render

Create a **Web Service**, select this repository, and use:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root directory | Leave empty (repository root) |
| Build command | `npm run build` |
| Start command | `npm start` |
| Health check path | `/health` |

The root `package.json` selects Node 24 (`>=24.12.0 <25`). Remove conflicting
`NODE_VERSION` overrides in Render, or use a matching Node 24 version. Build uses
both committed lockfiles and explicitly includes frontend development dependencies
so Vite is available even with `NODE_ENV=production`. The backend installs runtime
dependencies only. Commit both `package-lock.json` files; do not commit `dist`.

Configure these values in Render's protected environment settings:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGO_URI` | Production MongoDB connection string |
| `UPSTASH_REDIS_REST_URL` | Production Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Production Upstash REST token |
| `ADMIN_USERNAME` | Your admin username |
| `ADMIN_PASSWORD_HASH` | Existing valid scrypt hash, copied exactly |
| `FRONTEND_ORIGIN` | Final HTTPS origin, e.g. `https://your-service.onrender.com`, without a trailing slash |

Render supplies `PORT`; the server binds to `0.0.0.0`. Leave
`VITE_API_BASE_URL` unset so production requests use `/api` on the same origin.
Never put credentials in `VITE_` variables; they are public browser configuration.
Local `.env` files are ignored by Git and are not deployed.

Allow the selected Render region's outbound IP ranges in MongoDB Atlas network
access. Use a MongoDB deployment supporting transactions (such as Atlas), because
inventory changes and stock logs are saved together. MongoDB and Upstash must be
reachable from the deployed service; offline tests cannot verify that connection.

In production Express serves `frontend/dist` from a module-relative path, so the
launch directory does not affect asset lookup. Direct visits to `/login`,
`/dashboard`, `/inventory`, and `/logs` return React. Unknown API routes and missing
assets keep JSON 404 responses. CORS is enabled only for local development;
production frontend and API share one origin. Authentication and rate limiting
remain enforced on API routes.

The app trusts one proxy hop in production, following Render's Express guidance.
Rate-limit keys use Express's resolved client IP, not the leftmost untrusted
forwarded header value. If adding another proxy in front of Render, reassess the
trusted proxy configuration before relying on per-client limits.

`/health` reports process liveness without authentication or Redis access. It does
not report database or Redis readiness. Server startup waits for MongoDB; API
operations still fail securely when their dependencies are unavailable.

## Verify before deploying

After installing dependencies, run from the repository root:

```sh
npm run test:deployment
node --test --test-concurrency=1 backend/test/configSecurity.test.js backend/test/cors.test.js backend/test/dashboard.test.js backend/test/inventoryPagination.test.js backend/test/logs.test.js
npm run lint --prefix frontend
```

Deployment tests build the real frontend and exercise production HTTP routing,
assets, API errors, secure cookies, proxy-based rate limiting, and liveness using
mocked Redis. They use test credentials and do not contact MongoDB/Redis.

After deploying, check `/health`, log in, refresh each page URL directly, restore
the session, and sign out. Verify material creation and stock changes against the
production database when you intend to save those records.

References: [Render Web Services](https://render.com/docs/web-services),
[Render Node version selection](https://render.com/docs/node-version),
[Render proxy guidance](https://render.com/articles/how-render-handles-ddos-attacks),
[Express proxy trust](https://expressjs.com/en/guide/behind-proxies/), and
[Express 5 route syntax](https://expressjs.com/en/guide/migrating-5/).
