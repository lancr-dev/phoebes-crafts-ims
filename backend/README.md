# Backend browser access

Keep `MONGO_URI`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`ADMIN_USERNAME`, and `ADMIN_PASSWORD_HASH` in the backend environment only.
Configure local values in `backend/.env`. All `.env` and
`.env.*` files are ignored by Git. Store a scrypt password
hash rather than a plaintext admin password. In production, supply these through
the host's protected environment settings and set `NODE_ENV=production` so session
cookies require HTTPS. Values prefixed with `VITE_` are exposed to the browser and
must contain only public frontend configuration.

Set the frontend's exact origin in `backend/.env`:

```dotenv
FRONTEND_ORIGIN=http://localhost:5173
```

Restart the backend after changing this setting. Use the actual port printed by
Vite and omit a trailing slash. In production, use the frontend's HTTPS origin.
If the setting is absent, cross-origin browser access is disabled.

CORS permits that origin with cookie credentials and handles preflight requests
before authentication and rate limiting. API requests still require the existing
authentication and trusted-origin checks. `Content-Disposition` and `Retry-After`
are exposed for downloads and rate-limit handling.

The frontend must send credentials (`withCredentials: true` in Axios or
`credentials: 'include'` in fetch). The session cookie uses `SameSite=Strict`, so
the frontend and API must share the same site. For local development, use
`localhost` for both rather than mixing it with `127.0.0.1`.

Run the offline CORS integration checks with:

```sh
node --test test/cors.test.js
```

## Dashboard API

`GET /api/inventory/dashboard` requires the existing admin session. It returns
`summary` with `totalMaterials`, `inStockMaterials`, `lowStockMaterials`, and
`outOfStockMaterials`, plus `recentMaterials` with the six newest materials by
`createdAt` and `_id`. Each recent material contains `_id`, `itemName`, `category`,
`stock`, `status`, and `createdAt`.

The totals count material records across the full inventory, using the saved stock
status calculated by the inventory model. Stock updates do not change the order of
recently created materials. An empty collection returns zero totals and an empty
recent list. Database failures use the existing error handler.

Run the configuration security, CORS, and dashboard route checks with:

```sh
node --test --test-concurrency=1 test/configSecurity.test.js test/cors.test.js test/dashboard.test.js
```

These checks mock Redis and inventory aggregation and do not modify the database.
