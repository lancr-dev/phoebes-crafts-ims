import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { after, mock, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD_HASH = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;
process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

const { credentialVersion, sessionCookieName } = await import('../src/config/auth.js');
const { default: redis } = await import('../src/config/upstash.js');
const token = 'a'.repeat(64);
const sessionKey = `phoebes:session:${createHash('sha256').update(token).digest('hex')}`;

mock.method(redis.client, 'request', async ({ body }) => {
  const pipelined = Array.isArray(body[0]);
  const results = (pipelined ? body : [body]).map(([command, key]) => {
    if (command === 'eval') return { result: [1, 60] };
    assert.equal(command, 'get');
    assert.equal(key, sessionKey);
    return { result: JSON.stringify({ credentialVersion, expiresAt: Date.now() + 60000 }) };
  });
  return pipelined ? results : results[0];
});

const { default: Inventory } = await import('../src/models/Inventory.js');
let aggregationResult;
const aggregate = mock.method(Inventory, 'aggregate', async () => {
  if (aggregationResult instanceof Error) throw aggregationResult;
  return aggregationResult;
});
const { default: app } = await import('../src/app.js');
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const apiOrigin = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mock.restoreAll();
});

const request = (path = '/api/inventory/dashboard', authenticated = true) => fetch(`${apiOrigin}${path}`, {
  headers: {
    Origin: process.env.FRONTEND_ORIGIN,
    ...(authenticated ? { Cookie: `${sessionCookieName}=${token}` } : {}),
  },
});

test('dashboard requires a session before querying inventory', async () => {
  const calls = aggregate.mock.callCount();
  const response = await request(undefined, false);
  assert.equal(response.status, 401);
  assert.equal(aggregate.mock.callCount(), calls);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  await response.json();
});

test('dashboard route returns global counts and recent materials with credentials', async () => {
  const summary = { totalMaterials: 26, inStockMaterials: 15, lowStockMaterials: 8, outOfStockMaterials: 3 };
  const recentMaterials = Array.from({ length: 5 }, (_, index) => ({
    _id: (index + 1).toString(16).padStart(24, '0'),
    itemName: `Material ${index + 1}`,
    category: 'Craft supplies',
    stock: 12,
    status: 'In Stock',
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 5 - index)).toISOString(),
  }));
  aggregationResult = [{ summary: [summary], recentMaterials }];
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), process.env.FRONTEND_ORIGIN);
  assert.deepEqual(await response.json(), { summary, recentMaterials });
  const [pipeline] = aggregate.mock.calls.at(-1).arguments;
  assert.deepEqual(pipeline[0], { $sort: { createdAt: -1, _id: -1 } });
  assert.deepEqual(pipeline[1].$facet.recentMaterials[0], { $limit: 5 });
});

test('an empty inventory returns zero totals and an empty recent list', async () => {
  aggregationResult = [{ summary: [], recentMaterials: [] }];
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    summary: { totalMaterials: 0, inStockMaterials: 0, lowStockMaterials: 0, outOfStockMaterials: 0 },
    recentMaterials: [],
  });
});

test('database failure returns a sanitized error rather than zero analytics', async () => {
  aggregationResult = new Error('private database information');
  const log = mock.method(console, 'error', () => {});
  try {
    const response = await request();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'An unexpected server error occurred' });
  } finally {
    log.mock.restore();
  }
});

test('existing inventory ID validation remains unchanged', async () => {
  const calls = aggregate.mock.callCount();
  const response = await request('/api/inventory/not-an-id');
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Invalid inventory item ID' });
  assert.equal(aggregate.mock.callCount(), calls);
});
