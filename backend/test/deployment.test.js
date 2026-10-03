import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { after, mock, test } from 'node:test';

// Supply isolated production configuration; no real credentials or services are used.
process.env.NODE_ENV = 'production';
process.env.FRONTEND_ORIGIN = 'https://crafts.example';
process.env.ADMIN_USERNAME = 'test-admin';
const salt = '0'.repeat(32);
const passwordHash = scryptSync('offline-password', Buffer.from(salt, 'hex'), 64, {
  N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024,
}).toString('hex');
process.env.ADMIN_PASSWORD_HASH = `scrypt$32768$8$3$${salt}$${passwordHash}`;
process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

// Build first with npm run test:deployment from the repository root.
const frontendDist = new URL('../../frontend/dist/', import.meta.url);
const indexHtml = await readFile(new URL('index.html', frontendDist), 'utf8');
const { default: redis } = await import('../src/config/upstash.js');
const counters = new Map();
const sessions = new Map();
let redisUnavailable = false;
const redisTransport = mock.method(redis.client, 'request', async ({ body }) => {
  if (redisUnavailable) throw new Error('Offline test: Redis unavailable');
  const pipelined = Array.isArray(body[0]);
  const commands = pipelined ? body : [body];
  const results = commands.map((command) => {
    if (command[0] === 'set') {
      sessions.set(command[1], command[2]);
      return { result: 'OK' };
    }
    if (command[0] === 'get') return { result: sessions.get(command[1]) ?? null };
    if (command[0] === 'del') return { result: Number(sessions.delete(command[1])) };
    assert.equal(command[0], 'eval');
    const key = command[3];
    const count = (counters.get(key) || 0) + 1;
    counters.set(key, count);
    return { result: [count, Number(command[4])] };
  });
  return pipelined ? results : results[0];
});
const { default: app } = await import('../src/app.js');
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const apiOrigin = `http://127.0.0.1:${server.address().port}`;
const request = (path, options = {}) => fetch(`${apiOrigin}${path}`, options);

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  mock.restoreAll();
});

test('production starts from the repository root and serves React on direct page visits', async () => {
  for (const path of ['/', '/login', '/dashboard', '/inventory', '/logs', '/unknown-page']) {
    const response = await request(path, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(await response.text(), indexHtml);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const response = await request('/dashboard', { method: 'HEAD', headers: { Accept: 'text/html' } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('production serves the built JavaScript, CSS, and original logo', async () => {
  const scriptPath = /src="(\/assets\/[^\"]+\.js)"/.exec(indexHtml)?.[1];
  const stylePath = /href="(\/assets\/[^\"]+\.css)"/.exec(indexHtml)?.[1];
  assert.ok(scriptPath, 'The built page must reference its JavaScript bundle');
  assert.ok(stylePath, 'The built page must reference its stylesheet');
  for (const [path, type] of [[scriptPath, /javascript/], [stylePath, /text\/css/], ['/pb-logo.png', /image\/png/]]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), type);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(path.slice(1), frontendDist)));
  }
});

test('unknown API routes return JSON 404 instead of the React page', async () => {
  for (const path of ['/api', '/api/not-a-route', '/api/auth/not-a-route']) {
    const response = await request(path, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), { message: 'Route not found' });
  }
});

test('inventory API stays protected with secure production cookies', async () => {
  const response = await request('/api/inventory', { headers: { Accept: 'text/html' } });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Please log in to access the inventory system' });
  assert.match(response.headers.get('set-cookie'), /__Host-phoebes_admin_session=/);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(response.headers.get('set-cookie'), /Secure/);
  assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
});

test('missing assets, non-HTML requests, and unsupported page methods remain 404', async () => {
  for (const path of ['/assets/missing.js', '/assets/missing', '/missing.png', '/.env']) {
    const response = await request(path, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 404, path);
    assert.deepEqual(await response.json(), { message: 'Route not found' });
  }
  for (const options of [{ headers: { Accept: 'application/json' } }, { method: 'POST' }]) {
    const response = await request('/dashboard', options);
    assert.equal(response.status, 404);
    await response.json();
  }
});

test('production JSON parsing failures reach the sanitized error handler', async () => {
  const response = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Invalid JSON body' });
});

test('HTTPS same-origin mutations work and untrusted origins remain rejected', async () => {
  const response = await request('/api/auth/login', {
    method: 'POST', headers: { Host: 'crafts.example', Origin: 'https://crafts.example', 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Provide a valid username and password' });
  for (const headers of [{ Origin: 'https://untrusted.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const rejected = await request('/api/auth/logout', { method: 'POST', headers });
    assert.equal(rejected.status, 403);
    assert.deepEqual(await rejected.json(), { message: 'Requests from this origin are not allowed' });
  }
});

test('production login issues a secure session, restores it, and revokes it on sign-out', async () => {
  const headers = { Host: 'crafts.example', Origin: 'https://crafts.example', 'X-Forwarded-For': '203.0.113.20' };
  const login = await request('/api/auth/login', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'offline-password' }),
  });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { message: 'Logged in successfully', admin: { username: 'test-admin' } });
  const cookieHeader = login.headers.get('set-cookie');
  assert.match(cookieHeader, /^__Host-phoebes_admin_session=[a-f0-9]{64};/);
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /Secure/);
  assert.match(cookieHeader, /SameSite=Strict/);
  const authenticatedHeaders = { ...headers, Cookie: cookieHeader.split(';')[0] };
  const current = await request('/api/auth/me', { headers: authenticatedHeaders });
  assert.equal(current.status, 200);
  assert.deepEqual(await current.json(), { admin: { username: 'test-admin' } });
  const logout = await request('/api/auth/logout', { method: 'POST', headers: authenticatedHeaders });
  assert.equal(logout.status, 200);
  await logout.json();
  const expired = await request('/api/auth/me', { headers: authenticatedHeaders });
  assert.equal(expired.status, 401);
  await expired.json();
  assert.equal(sessions.size, 0);
});

test('production uses distinct client IP buckets and ignores spoofed earlier forwarded entries', async () => {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Forwarded-For': `198.51.100.${attempt}, 203.0.113.10`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, attempt <= 5 ? 400 : 429);
    if (attempt === 6) {
      assert.equal(response.headers.get('x-ratelimit-scope'), 'login');
      assert.equal(response.headers.get('retry-after'), '900');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    await response.json();
  }
  const otherClient = await request('/api/auth/login', {
    method: 'POST', headers: { 'X-Forwarded-For': '203.0.113.11', 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(otherClient.status, 400);
  await otherClient.json();
  assert.equal(counters.get('phoebes:rate-limit:login:203.0.113.10'), 6);
  assert.equal(counters.get('phoebes:rate-limit:login:203.0.113.11'), 1);
});

test('health and frontend stay reachable when Redis fails, while APIs fail securely', async () => {
  const log = mock.method(console, 'error', () => {});
  redisUnavailable = true;
  try {
    const callsBefore = redisTransport.mock.callCount();
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const page = await request('/login', { headers: { Accept: 'text/html' } });
    assert.equal(page.status, 200);
    assert.equal(await page.text(), indexHtml);
    assert.equal(redisTransport.mock.callCount(), callsBefore);
    const api = await request('/api/inventory');
    assert.equal(api.status, 503);
    assert.deepEqual(await api.json(), { message: 'The service is temporarily unavailable. Please try again later.' });
  } finally {
    redisUnavailable = false;
    log.mock.restore();
  }
});

test('server entry point waits for MongoDB and binds the supplied port on all interfaces', async () => {
  const { default: mongoose } = await import('mongoose');
  const startupEvents = [];
  const connect = mock.method(mongoose, 'connect', async () => { startupEvents.push('database'); });
  const listen = mock.method(app, 'listen', (port, host, callback) => {
    startupEvents.push('listen');
    assert.equal(port, '10000');
    assert.equal(host, '0.0.0.0');
    callback();
    return new EventEmitter();
  });
  const log = mock.method(console, 'log', () => {});
  const previousPort = process.env.PORT;
  process.env.PORT = '10000';
  try {
    await import('../src/server.js');
    assert.deepEqual(startupEvents, ['database', 'listen']);
  } finally {
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    connect.mock.restore();
    listen.mock.restore();
    log.mock.restore();
  }
});
