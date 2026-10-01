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
const token = 'b'.repeat(64);
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
let aggregationResult = [{ items: [], totals: [] }];
const aggregate = mock.method(Inventory, 'aggregate', async () => {
  if (aggregationResult instanceof Error) throw aggregationResult;
  return aggregationResult;
});
let categoryNames = ['Yarn', 'Ribbon', 'Beads'];
const distinct = mock.method(Inventory, 'distinct', async () => {
  if (categoryNames instanceof Error) throw categoryNames;
  return [...categoryNames];
});
const legacyItems = [{ _id: '0123456789abcdef01234567', itemName: 'Yarn', category: 'Thread', stock: 12, status: 'In Stock' }];
const legacyCalls = [];
const find = mock.method(Inventory, 'find', () => ({
  sort(value) { legacyCalls.push(['sort', value]); return this; },
  skip(value) { legacyCalls.push(['skip', value]); return this; },
  limit(value) { legacyCalls.push(['limit', value]); return Promise.resolve(legacyItems); },
}));
const { default: app } = await import('../src/app.js');
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mock.restoreAll();
});
const request = (query, authenticated = true) => fetch(`${origin}/api/inventory${query}`, {
  headers: { Origin: process.env.FRONTEND_ORIGIN, ...(authenticated ? { Cookie: `${sessionCookieName}=${token}` } : {}) },
});

test('paginated inventory requires authentication before querying', async () => {
  const calls = aggregate.mock.callCount();
  const response = await request('?paginated=true', false);
  assert.equal(response.status, 401);
  assert.equal(aggregate.mock.callCount(), calls);
  await response.json();
});

test('page two returns bounded items, total count, and page metadata in one query', async () => {
  aggregationResult = [{ items: legacyItems, totals: [{ totalItems: 21 }] }];
  const findCalls = find.mock.callCount();
  const response = await request('?paginated=true&page=2&limit=20');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { items: legacyItems, currentPage: 2, pageSize: 20, totalItems: 21, totalPages: 2 });
  assert.equal(find.mock.callCount(), findCalls);
  assert.deepEqual(aggregate.mock.calls.at(-1).arguments[0], [
    { $sort: { createdAt: -1, _id: -1 } },
    { $facet: {
      items: [{ $skip: 20 }, { $limit: 20 }, { $project: { itemName: 1, category: 1, stock: 1, status: 1 } }],
      totals: [{ $count: 'totalItems' }],
    } },
  ]);
});

test('empty inventory has zero totals and defaults to twenty per page', async () => {
  aggregationResult = [{ items: [], totals: [] }];
  const response = await request('?paginated=true');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], currentPage: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
});

test('a removed last page retains requested page and accurate totals for client recovery', async () => {
  aggregationResult = [{ items: [], totals: [{ totalItems: 20 }] }];
  const response = await request('?paginated=true&page=2');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], currentPage: 2, pageSize: 20, totalItems: 20, totalPages: 1 });
});

test('existing clients continue receiving an array without the opt-in parameter', async () => {
  const calls = aggregate.mock.callCount();
  const response = await request('?page=2&limit=20');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), legacyItems);
  assert.equal(aggregate.mock.callCount(), calls);
  assert.deepEqual(legacyCalls, [['sort', { createdAt: -1, _id: -1 }], ['skip', 20], ['limit', 20]]);
});

test('invalid and unbounded pagination fails before querying the database', async () => {
  const calls = aggregate.mock.callCount();
  for (const query of ['?paginated=false', '?paginated=true&page=0', '?paginated=true&page=1.5', '?paginated=true&limit=101', '?paginated=true&page=9007199254740991&limit=20', '?paginated=true&paginated=true']) {
    const response = await request(query);
    assert.equal(response.status, 400, query);
    await response.json();
  }
  assert.equal(aggregate.mock.callCount(), calls);
});

test('inventory failures return sanitized errors rather than empty success', async () => {
  aggregationResult = new Error('private database connection string');
  const log = mock.method(console, 'error', () => {});
  try {
    const response = await request('?paginated=true');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'An unexpected server error occurred' });
  } finally { log.mock.restore(); }
});

test('category filtering matches before sorting, counting, and paginating', async () => {
  aggregationResult = [{ items: legacyItems, totals: [{ totalItems: 21 }] }];
  const response = await request('?paginated=true&page=2&limit=20&category=Yarn');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: legacyItems, currentPage: 2, pageSize: 20, totalItems: 21, totalPages: 2 });
  const pipeline = aggregate.mock.calls.at(-1).arguments[0];
  assert.deepEqual(pipeline.slice(0, 2), [{ $match: { category: 'Yarn' } }, { $sort: { createdAt: -1, _id: -1 } }]);
  assert.deepEqual(pipeline[2].$facet.items.slice(0, 2), [{ $skip: 20 }, { $limit: 20 }]);
  assert.deepEqual(pipeline[2].$facet.totals, [{ $count: 'totalItems' }]);
});

test('category labels with regex characters are literal matches and whitespace is trimmed', async () => {
  aggregationResult = [{ items: [], totals: [] }];
  const response = await request(`?paginated=true&category=${encodeURIComponent('  Beads.* (small)  ')}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).totalItems, 0);
  assert.deepEqual(aggregate.mock.calls.at(-1).arguments[0][0], { $match: { category: 'Beads.* (small)' } });
  const legacy = await request('?category=Yarn');
  assert.equal(legacy.status, 200);
  await legacy.json();
  assert.deepEqual(find.mock.calls.at(-1).arguments[0], { category: 'Yarn' });
});

test('empty or repeated category parameters fail before querying', async () => {
  const calls = aggregate.mock.callCount();
  for (const query of ['?paginated=true&category=', '?paginated=true&category=%20%20', '?paginated=true&category=Yarn&category=Beads']) {
    const response = await request(query);
    assert.equal(response.status, 400);
    await response.json();
  }
  assert.equal(aggregate.mock.callCount(), calls);
});

test('category discovery requires a session and is routed before inventory IDs', async () => {
  const calls = distinct.mock.callCount();
  const denied = await request('/categories', false);
  assert.equal(denied.status, 401);
  await denied.json();
  assert.equal(distinct.mock.callCount(), calls);
  const response = await request('/categories');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { categories: ['Beads', 'Ribbon', 'Yarn'] });
  assert.deepEqual(distinct.mock.calls.at(-1).arguments, ['category']);
});

test('category discovery returns an empty list for an empty inventory and fails safely', async () => {
  categoryNames = [];
  const empty = await request('/categories');
  assert.deepEqual(await empty.json(), { categories: [] });
  categoryNames = new Error('private database information');
  const log = mock.method(console, 'error', () => {});
  try {
    const response = await request('/categories');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'An unexpected server error occurred' });
  } finally { log.mock.restore(); }
});
