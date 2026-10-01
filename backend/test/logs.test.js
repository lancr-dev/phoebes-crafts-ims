import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { after, mock, test } from 'node:test';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD_HASH = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;
process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
const { credentialVersion, sessionCookieName } = await import('../src/config/auth.js');
const { default: redis } = await import('../src/config/upstash.js');
const token = 'c'.repeat(64);
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

const { default: InventoryLog } = await import('../src/models/InventoryLog.js');
const { default: Inventory } = await import('../src/models/Inventory.js');
const boundary = { throughId: '0123456789abcdef01234567', throughCreatedAt: '2025-10-01T08:00:00.000Z' };
const log = { _id: boundary.throughId, createdAt: boundary.throughCreatedAt, itemName: 'Original yarn name', actionType: 'ADD', quantity: 12, previousStock: 0, newStock: 12 };
let aggregateResult = [{ logs: [log], totals: [{ totalLogs: 21 }], latest: [{ _id: boundary.throughId, createdAt: boundary.throughCreatedAt }] }];
const aggregate = mock.method(InventoryLog, 'aggregate', async () => {
  if (aggregateResult instanceof Error) throw aggregateResult;
  return aggregateResult;
});
let deletedCount = 21;
const deletion = mock.method(InventoryLog, 'deleteMany', async () => {
  if (deletedCount instanceof Error) throw deletedCount;
  return { deletedCount };
});
mock.method(Inventory, 'deleteMany', () => { throw new Error('Inventory must not be modified'); });
mock.method(Inventory, 'updateMany', () => { throw new Error('Stock must not be modified'); });
mock.method(InventoryLog, 'countDocuments', async () => 21);
let cursorValues = [log];
let cursorIndex = 0;
const cursor = {
  async next() { const value = cursorValues[cursorIndex++]; if (value instanceof Error) throw value; return value ?? null; },
  async close() {},
};
const close = mock.method(cursor, 'close');
const queryCalls = [];
const find = mock.method(InventoryLog, 'find', (filter) => {
  queryCalls.push(['filter', filter]);
  return {
    populate(...args) { queryCalls.push(['populate', ...args]); return this; },
    select(value) { queryCalls.push(['select', value]); return this; },
    sort(value) { queryCalls.push(['sort', value]); return this; },
    skip(value) { queryCalls.push(['skip', value]); return this; },
    limit(value) { queryCalls.push(['limit', value]); return Promise.resolve([log]); },
    lean() { return this; },
    cursor(value) { queryCalls.push(['cursor', value]); cursorIndex = 0; return cursor; },
  };
});
const { default: app } = await import('../src/app.js');
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mock.restoreAll();
});
const request = (path, { method = 'GET', body, authenticated = true, trusted = true } = {}) => fetch(`${origin}/api/inventory/logs/${path}`, {
  method,
  headers: { Origin: trusted ? process.env.FRONTEND_ORIGIN : 'https://untrusted.example', 'Content-Type': 'application/json',
    ...(authenticated ? { Cookie: `${sessionCookieName}=${token}` } : {}) },
  ...(body && { body: JSON.stringify(body) }),
});

test('listing, exporting, and clearing require an admin session before database access', async () => {
  const before = [aggregate.mock.callCount(), find.mock.callCount(), deletion.mock.callCount()];
  for (const [path, method] of [['all?paginated=true', 'GET'], ['export', 'GET'], ['all', 'DELETE']]) {
    const response = await request(path, { method, authenticated: false });
    assert.equal(response.status, 401);
    await response.json();
  }
  assert.deepEqual([aggregate.mock.callCount(), find.mock.callCount(), deletion.mock.callCount()], before);
});

test('logs return twenty-per-page metadata and a global clearing boundary on page two', async () => {
  const response = await request('all?paginated=true&page=2&limit=20');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { logs: [log], currentPage: 2, pageSize: 20, totalLogs: 21, totalPages: 2, clearThrough: boundary });
  const pipeline = aggregate.mock.calls.at(-1).arguments[0];
  assert.deepEqual(pipeline[0], { $sort: { createdAt: -1, _id: -1 } });
  assert.deepEqual(pipeline[1].$facet.logs.slice(0, 2), [{ $skip: 20 }, { $limit: 20 }]);
  assert.deepEqual(pipeline[1].$facet.latest, [{ $limit: 1 }, { $project: { createdAt: 1 } }]);
});

test('empty history returns zero totals and no clearing boundary', async () => {
  aggregateResult = [{ logs: [], totals: [], latest: [] }];
  const response = await request('all?paginated=true');
  assert.deepEqual(await response.json(), { logs: [], currentPage: 1, pageSize: 20, totalLogs: 0, totalPages: 0, clearThrough: null });
});

test('older list clients retain their original response structure', async () => {
  const response = await request('all?page=2&limit=20');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { logs: [log], currentPage: 2, totalLogs: 21, totalPages: 2 });
});

test('bad pagination and incomplete clearing boundaries fail before querying or deleting', async () => {
  const before = [aggregate.mock.callCount(), deletion.mock.callCount()];
  for (const path of ['all?paginated=false', 'all?paginated=true&page=0', 'all?paginated=true&limit=101']) {
    const response = await request(path);
    assert.equal(response.status, 400);
    await response.json();
  }
  for (const body of [{}, { confirm: 'CLEAR' }, { confirm: 'CLEAR', ...boundary, throughId: 'invalid' },
    { confirm: 'CLEAR', ...boundary, throughCreatedAt: 'not-a-date' },
    { confirm: 'CLEAR', ...boundary, throughCreatedAt: '2999-01-01T00:00:00.000Z' }]) {
    const response = await request('all', { method: 'DELETE', body });
    assert.equal(response.status, 400);
    await response.json();
  }
  assert.deepEqual([aggregate.mock.callCount(), deletion.mock.callCount()], before);
});

test('clearing rejects untrusted browser origins even with an admin session', async () => {
  const calls = deletion.mock.callCount();
  const response = await request('all', { method: 'DELETE', body: { confirm: 'CLEAR', ...boundary }, trusted: false });
  assert.equal(response.status, 403);
  await response.json();
  assert.equal(deletion.mock.callCount(), calls);
});

test('confirmed clearing removes only history through the captured date and ID', async () => {
  const response = await request('all', { method: 'DELETE', body: { confirm: 'CLEAR', ...boundary } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: 'Inventory logs cleared successfully', deletedCount: 21 });
  const filter = deletion.mock.calls.at(-1).arguments[0];
  assert.deepEqual(filter, { $or: [
    { createdAt: { $lt: new Date(boundary.throughCreatedAt) } },
    { createdAt: new Date(boundary.throughCreatedAt), _id: { $lte: new mongoose.Types.ObjectId(boundary.throughId) } },
  ] });
});

test('repeated clearing of the same captured history is harmless', async () => {
  deletedCount = 0;
  const response = await request('all', { method: 'DELETE', body: { confirm: 'CLEAR', ...boundary } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deletedCount, 0);
});

test('export streams saved names and the same captured boundary with a bounded cursor', async () => {
  const response = await request(`export?${new URLSearchParams(boundary)}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /inventory-logs.json/);
  assert.deepEqual(await response.json(), [log]);
  assert.deepEqual(find.mock.calls.at(-1).arguments[0], deletion.mock.calls.at(-1).arguments[0]);
  assert.ok(queryCalls.some(([method, value]) => method === 'cursor' && value.batchSize === 100));
  assert.ok(close.mock.callCount() > 0);
});

test('an export cursor failure before headers returns sanitized JSON and closes the cursor', async () => {
  cursorValues = [new Error('private database string')];
  const logError = mock.method(console, 'error', () => {});
  const before = close.mock.callCount();
  try {
    const response = await request('export');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'An unexpected server error occurred' });
    assert.equal(close.mock.callCount(), before + 1);
  } finally { logError.mock.restore(); }
});

test('clear failures never return successful counts or expose database details', async () => {
  deletedCount = new Error('private database string');
  const logError = mock.method(console, 'error', () => {});
  try {
    const response = await request('all', { method: 'DELETE', body: { confirm: 'CLEAR', ...boundary } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'An unexpected server error occurred' });
  } finally { logError.mock.restore(); }
});
