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
authentication and trusted-origin checks. `Content-Disposition`, `Retry-After`,
and `X-RateLimit-Scope` are exposed for downloads and rate-limit handling.

The global limiter allows 100 API requests per IP per minute. The login route also
allows 5 attempts per IP per fifteen minutes, including successful attempts. A
`429` includes `Retry-After` in seconds and `X-RateLimit-Scope: api` or `login` so
the frontend can pause the appropriate requests. These responses use
`Cache-Control: no-store` to avoid reusing stale cooldowns. Redis failure still returns 503 and does
not bypass rate limiting. Limits and authentication remain enforced on the backend.

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

## Inventory pagination API

`GET /api/inventory?paginated=true&page=1&limit=20` requires the admin session and
returns `{ items, currentPage, pageSize, totalItems, totalPages }`. Items contain
`_id`, `itemName`, `category`, `stock`, and `status`, sorted newest first by
`createdAt` and `_id`. One aggregation selects the page and counts the same input.
An empty collection returns no items and zero total pages. Requests beyond the
last page return an empty list with accurate totals so the frontend can recover
after deletions. `page` must be a positive integer and `limit` is capped at 100.

The metadata response is opt-in. Omitting `paginated` preserves the existing array
response for older clients; an invalid `paginated` value returns 400. Existing
create/edit/delete/stock routes and transactional stock history remain unchanged.

An optional `category` query parameter filters by the exact stored category
(after trimming whitespace) before sorting, counting, and pagination. It works
with both response formats. Blank and repeated category parameters return 400;
labels are literal string matches, not regular expressions or MongoDB operators.
The inventory model declares a compound category/createdAt/ID index for this query.

`GET /api/inventory/categories` requires the admin session and returns
`{ categories: ["Beads", "Yarn"] }`, containing the distinct stored categories
across the full inventory, sorted alphabetically. Empty inventory returns an empty
array. The route is registered before `/:id`.

## Inventory logs API

`GET /api/inventory/logs/all?paginated=true&page=1&limit=20` returns
`{ logs, currentPage, pageSize, totalLogs, totalPages, clearThrough }`. The log
fields are `_id`, `createdAt`, `itemName`, `actionType` (`ADD`/`REMOVE`), `quantity`,
`previousStock`, and `newStock`. One aggregation selects and counts the same input,
sorted by `createdAt` and `_id` descending. `clearThrough` contains `throughId`
and `throughCreatedAt` for the newest record globally, including when viewing a
later page. It is null for empty history. Saved names are used without looking up
current inventory names. Omitting `paginated` preserves the original list response.

`GET /api/inventory/logs/export` still streams a JSON array through a bounded cursor.
Supplying `throughId` and `throughCreatedAt` limits the export to the same captured
history. The frontend uses this data for PDF generation. Without a boundary, the
original full JSON export and populated inventory references remain available.

`DELETE /api/inventory/logs/all` now supports the requested Clear logs action;
bulk deletion was previously disabled. It requires the existing admin session and
trusted-origin checks plus a JSON body containing `confirm: "CLEAR"`, `throughId`,
and an ISO UTC `throughCreatedAt`. Invalid or missing boundaries fail before
deletion. Only records ordered at or before that date/ID are deleted, preserving
newer stock movements. The response contains `message` and `deletedCount`.
Repeating a request for the same boundary is safe. This permanently deletes
history only and does not alter inventory stock. No schema migration is required.

Run the configuration security, CORS, dashboard, pagination, and logs checks with:

```sh
node --test --test-concurrency=1 test/configSecurity.test.js test/cors.test.js test/dashboard.test.js test/inventoryPagination.test.js test/logs.test.js
```

These checks mock Redis and database operations and do not modify live data.
