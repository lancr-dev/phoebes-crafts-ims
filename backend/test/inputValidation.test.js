import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { after, mock, test } from 'node:test';
import mongoose from 'mongoose';
import Inventory from '../src/models/Inventory.js';
import InventoryLog from '../src/models/InventoryLog.js';
import HttpError from '../src/utils/HttpError.js';
import { parseInventoryInput, parseQuantity, parseInventoryFilter, parsePagination, validateId } from '../src/utils/inventoryValidation.js';
import { parseClearLogsInput } from '../src/utils/logValidation.js';
import { MAX_STOCK } from '../../shared/inputValidation.mjs';

const id = '0123456789abcdef01234567';
const material = { itemName: 'Cotton yarn', category: 'Yarn', stock: 12 };
const invalid = (operation) => assert.throws(operation, (error) => error instanceof HttpError && error.status === 400);

test('create and partial update trim labels and enforce the fifty-character boundary', () => {
  for (const field of ['itemName', 'category']) {
    const label = 'é'.repeat(50);
    assert.equal(parseInventoryInput({ ...material, [field]: ` ${label} ` })[field], label);
    assert.deepEqual(parseInventoryInput({ [field]: label }, { partial: true }), { [field]: label });
    for (const value of ['a'.repeat(51), '', '  ', null, 42, [], {}, 'Yarn\nThread', 'Yarn\u0000', '\u200b']) {
      invalid(() => parseInventoryInput({ ...material, [field]: value }));
      invalid(() => parseInventoryInput({ [field]: value }, { partial: true }));
    }
  }
  assert.deepEqual(parseInventoryInput({ itemName: 'Ribbon', category: 'Thread' }), { itemName: 'Ribbon', category: 'Thread', stock: 0 });
});

test('stock and adjustment inputs reject coercion, fractions, negatives, and amounts above capacity', () => {
  for (const stock of [0, MAX_STOCK]) {
    assert.equal(parseInventoryInput({ ...material, stock }).stock, stock);
    assert.deepEqual(parseInventoryInput({ stock }, { partial: true }), { stock });
  }
  for (const stock of [-1, 0.5, MAX_STOCK + 1, Infinity, NaN, '12', true, null, [], {}, Number.MAX_SAFE_INTEGER]) {
    invalid(() => parseInventoryInput({ ...material, stock }));
    invalid(() => parseInventoryInput({ stock }, { partial: true }));
  }
  for (const quantity of [1, MAX_STOCK]) assert.equal(parseQuantity({ quantity }), quantity);
  for (const quantity of [0, -1, 0.5, MAX_STOCK + 1, Infinity, NaN, '1', true, null, [], {}]) {
    invalid(() => parseQuantity({ quantity }));
  }
});

test('malformed bodies and empty updates fail while server-owned fields are excluded', () => {
  for (const body of [undefined, null, [], true, 'material']) {
    invalid(() => parseInventoryInput(body));
    invalid(() => parseQuantity(body));
  }
  invalid(() => parseInventoryInput({}, { partial: true }));
  invalid(() => parseInventoryInput({ status: 'In Stock' }, { partial: true }));
  assert.deepEqual(parseInventoryInput({ ...material, status: 'Out of Stock', _id: id, createdAt: 'private' }), material);
});

test('filters, pagination, IDs, and log confirmations reject ambiguous or malformed inputs', () => {
  assert.deepEqual(parseInventoryFilter({ category: '  Beads.* (small)  ' }), { category: 'Beads.* (small)' });
  for (const category of ['a'.repeat(51), ['Yarn', 'Thread'], { $ne: '' }, ' ', 'Yarn\nThread']) {
    invalid(() => parseInventoryFilter({ category }));
  }
  for (const page of ['0', '01', '-1', '1e3', '1.5', ['1', '2'], '9'.repeat(30)]) invalid(() => parsePagination({ page }));
  for (const value of ['../private', { $ne: '' }, null, 'a'.repeat(23)]) invalid(() => validateId(value));
  const boundary = { confirm: 'CLEAR', throughId: id, throughCreatedAt: '2025-10-01T08:00:00.000Z' };
  assert.ok(parseClearLogsInput(boundary).$or);
  for (const body of [null, [], {}, { ...boundary, confirm: 'clear' }, { ...boundary, throughId: { $ne: '' } },
    { ...boundary, throughCreatedAt: '2025-02-30T08:00:00.000Z' }, { ...boundary, throughCreatedAt: '9999-01-01T00:00:00.000Z' }]) {
    invalid(() => parseClearLogsInput(body));
  }
});

test('Mongoose validation also enforces label and stock bounds without a database', async () => {
  await new Inventory({ ...material, itemName: 'a'.repeat(50), category: 'b'.repeat(50), stock: MAX_STOCK }).validate();
  for (const fields of [{ itemName: 'a'.repeat(51) }, { category: 'b'.repeat(51) }, { itemName: 'Yarn\nThread' },
    { category: '\u200b' }, { stock: MAX_STOCK + 1 }, { stock: -1 }, { stock: 1.5 }]) {
    await assert.rejects(new Inventory({ ...material, ...fields }).validate(), mongoose.Error.ValidationError);
  }
});

test('historical movement records remain readable and valid outside the new input limits', async () => {
  await new InventoryLog({ inventoryId: id, itemName: 'a'.repeat(60), actionType: 'REMOVE',
    quantity: MAX_STOCK + 1, previousStock: MAX_STOCK + 1, newStock: 0 }).validate();
});

// Mock external storage, preserving the real routes, services, and model validation.
process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD_HASH = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;
process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
const { credentialVersion, sessionCookieName } = await import('../src/config/auth.js');
const { default: redis } = await import('../src/config/upstash.js');
const token = 'd'.repeat(64);
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
const saves = [];
const movements = [];
let currentItem = new Inventory({ _id: id, ...material });
const transaction = mock.method(mongoose.connection, 'transaction', async (operation) => operation({}));
mock.method(Inventory, 'findById', () => ({ session: async () => currentItem }));
mock.method(Inventory.prototype, 'save', async function () {
  await this.validate();
  saves.push(this.toObject());
  return this;
});
mock.method(InventoryLog, 'create', async (entries) => {
  for (const entry of entries) await new InventoryLog(entry).validate();
  movements.push(...entries);
  return entries;
});
const { adjustStock } = await import('../src/services/inventoryService.js');
const { default: app } = await import('../src/app.js');
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  mock.restoreAll();
});
const request = (path, method, body, authenticated = true) => fetch(`${origin}${path}`, {
  method, headers: { Origin: process.env.FRONTEND_ORIGIN, 'Content-Type': 'application/json',
    ...(authenticated ? { Cookie: `${sessionCookieName}=${token}` } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

test('invalid create/update/adjustment payloads return 400 before any transaction', async () => {
  const before = transaction.mock.callCount();
  for (const [path, method, body] of [
    ['/api/inventory', 'POST', { ...material, itemName: 'a'.repeat(51) }],
    ['/api/inventory', 'POST', { ...material, category: 'a'.repeat(51) }],
    ['/api/inventory', 'POST', { ...material, stock: MAX_STOCK + 1 }],
    ['/api/inventory', 'POST', { ...material, stock: '12' }],
    ['/api/inventory', 'POST', []],
    [`/api/inventory/${id}`, 'PUT', { category: 'a'.repeat(51) }],
    [`/api/inventory/${id}`, 'PUT', { itemName: { $ne: '' } }],
    [`/api/inventory/${id}`, 'PUT', { stock: MAX_STOCK + 1 }],
    [`/api/inventory/${id}`, 'PUT', {}],
    [`/api/inventory/${id}/increase`, 'PATCH', { quantity: MAX_STOCK + 1 }],
    [`/api/inventory/${id}/decrease`, 'PATCH', { quantity: 0 }],
    [`/api/inventory/${id}/decrease`, 'PATCH', { quantity: '2' }],
  ]) {
    const response = await request(path, method, body);
    assert.equal(response.status, 400, path);
    assert.equal(typeof (await response.json()).message, 'string');
  }
  assert.equal(transaction.mock.callCount(), before);
});

test('API creation and updates accept the exact limits and preserve movement consistency', async () => {
  const response = await request('/api/inventory', 'POST', { itemName: 'a'.repeat(50), category: 'b'.repeat(50), stock: MAX_STOCK });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).stock, MAX_STOCK);
  assert.equal(movements.at(-1).quantity, MAX_STOCK);
  currentItem = new Inventory({ _id: id, ...material });
  const updated = await request(`/api/inventory/${id}`, 'PUT', { itemName: 'a'.repeat(50), stock: MAX_STOCK });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).itemName.length, 50);
  assert.equal(movements.at(-1).previousStock, 12);
  assert.equal(movements.at(-1).newStock, MAX_STOCK);
});

test('increase capacity is checked against current transaction stock without partial writes', async () => {
  currentItem = new Inventory({ _id: id, ...material, stock: MAX_STOCK - 1 });
  const accepted = await request(`/api/inventory/${id}/increase`, 'PATCH', { quantity: 1 });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).stock, MAX_STOCK);
  const before = [saves.length, movements.length];
  const denied = await request(`/api/inventory/${id}/increase`, 'PATCH', { quantity: 1 });
  assert.equal(denied.status, 400);
  assert.deepEqual(await denied.json(), { message: 'Stock limit exceeded' });
  assert.deepEqual([saves.length, movements.length], before);
  assert.equal(currentItem.stock, MAX_STOCK);
});

test('decreases permit the full stock amount and reject insufficient stock without writes', async () => {
  currentItem = new Inventory({ _id: id, ...material, stock: MAX_STOCK });
  const accepted = await request(`/api/inventory/${id}/decrease`, 'PATCH', { quantity: MAX_STOCK });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).stock, 0);
  const before = [saves.length, movements.length];
  const denied = await request(`/api/inventory/${id}/decrease`, 'PATCH', { quantity: 1 });
  assert.equal(denied.status, 400);
  assert.deepEqual(await denied.json(), { message: 'Insufficient stock' });
  assert.deepEqual([saves.length, movements.length], before);
  assert.equal(currentItem.stock, 0);
});

test('services reject invalid adjustment quantities and directions before opening a transaction', () => {
  const before = transaction.mock.callCount();
  for (const quantity of [0, -1, 1.5, MAX_STOCK + 1, '1']) invalid(() => adjustStock(id, quantity, 1));
  for (const direction of [0, 2, 'increase']) invalid(() => adjustStock(id, 1, direction));
  assert.equal(transaction.mock.callCount(), before);
});

test('invalid credentials fail validation before password work or session writes', async () => {
  for (const body of [{ username: 'a'.repeat(101), password: 'p' }, { username: 'admin\nname', password: 'p' },
    { username: {}, password: 'p' }, { username: 'admin', password: true },
    { username: 'admin', password: 'é'.repeat(513) }, { username: 'admin', password: '' }]) {
    const response = await request('/api/auth/login', 'POST', body, false);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: 'Provide a valid username and password' });
  }
});

test('input validation preserves authentication and trusted-origin enforcement', async () => {
  const denied = await request('/api/inventory', 'POST', material, false);
  assert.equal(denied.status, 401);
  await denied.json();
  const untrusted = await fetch(`${origin}/api/inventory`, {
    method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json', Cookie: `${sessionCookieName}=${token}` },
    body: JSON.stringify(material),
  });
  assert.equal(untrusted.status, 403);
  await untrusted.json();
});
