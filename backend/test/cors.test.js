import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, mock, test } from 'node:test';

// Use isolated configuration and mock Redis so no external services are contacted.
const frontendOrigin = 'http://localhost:5173';
process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = frontendOrigin;
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD_HASH = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;
process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

const { default: redis } = await import('../src/config/upstash.js');
let limitedScope = '';
// Mock the transport because the Redis client automatically pipelines commands.
const rateLimit = mock.method(redis.client, 'request', async ({ body }) => {
  const pipelined = Array.isArray(body[0]);
  const commands = pipelined ? body : [body];
  const results = commands.map((command) => {
    assert.equal(command[0], 'eval');
    if (command[3].endsWith(`:${limitedScope}:127.0.0.1`)) {
      return { result: limitedScope === 'login' ? [6, 900] : [101, 60] };
    }
    return { result: [1, 60] };
  });
  return pipelined ? results : results[0];
});
const { default: app } = await import('../src/app.js');
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const apiOrigin = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  mock.restoreAll();
});

const request = (path, options = {}) => fetch(`${apiOrigin}${path}`, options);
const assertAllowedOrigin = (response) => {
  assert.equal(response.headers.get('access-control-allow-origin'), frontendOrigin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.match(response.headers.get('vary'), /\bOrigin\b/);
};

test('configured frontend receives credentialed CORS headers', async () => {
  const response = await request('/', { headers: { Origin: frontendOrigin } });
  assert.equal(response.status, 200);
  assertAllowedOrigin(response);
  const exposed = response.headers.get('access-control-expose-headers');
  assert.match(exposed, /Content-Disposition/i);
  assert.match(exposed, /Retry-After/i);
  assert.match(exposed, /X-RateLimit-Scope/i);
  await response.json();
});

test('preflight supports auth and inventory mutations without accessing Redis', async () => {
  const callsBefore = rateLimit.mock.callCount();
  for (const [path, method] of [
    ['/api/auth/login', 'POST'],
    ['/api/auth/logout', 'POST'],
    ['/api/inventory', 'POST'],
    ['/api/inventory/0123456789abcdef01234567', 'PUT'],
    ['/api/inventory/0123456789abcdef01234567/increase', 'PATCH'],
    ['/api/inventory/0123456789abcdef01234567', 'DELETE'],
  ]) {
    const response = await request(path, {
      method: 'OPTIONS',
      headers: {
        Origin: frontendOrigin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(response.status, 204);
    assertAllowedOrigin(response);
    assert.ok(response.headers.get('access-control-allow-methods').split(',').includes(method));
    assert.equal(response.headers.get('access-control-allow-headers').toLowerCase(), 'content-type');
  }
  assert.equal(rateLimit.mock.callCount(), callsBefore);
});

test('untrusted origins receive no cross-origin read permission', async () => {
  for (const origin of ['https://untrusted.example', 'http://localhost:5174', 'null']) {
    const response = await request('/', { headers: { Origin: origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    await response.json();
    const preflight = await request('/api/auth/login', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  }
});

test('requests without Origin remain usable by non-browser clients', async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  await response.json();
});

test('CORS preserves authentication and adds headers to unauthorized responses', async () => {
  const response = await request('/api/inventory', { headers: { Origin: frontendOrigin } });
  assert.equal(response.status, 401);
  assertAllowedOrigin(response);
  assert.equal((await response.json()).message, 'Please log in to access the inventory system');
});

test('CORS headers remain available on JSON parsing errors', async () => {
  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { Origin: frontendOrigin, 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(response.status, 400);
  assertAllowedOrigin(response);
  assert.deepEqual(await response.json(), { message: 'Invalid JSON body' });
});

test('trusted-origin middleware continues rejecting untrusted mutations', async () => {
  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await response.json(), { message: 'Requests from this origin are not allowed' });
});

test('same-origin mutations remain usable', async () => {
  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { Origin: apiOrigin, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Provide a valid username and password' });
});

test('API cooldowns include the scope and retry delay even on login requests', async () => {
  limitedScope = 'api';
  try {
    const response = await request('/api/auth/login', {
      method: 'POST', headers: { Origin: frontendOrigin, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 429);
    assertAllowedOrigin(response);
    assert.equal(response.headers.get('retry-after'), '60');
    assert.equal(response.headers.get('x-ratelimit-scope'), 'api');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { message: 'Too many requests. Please try again later.' });
  } finally { limitedScope = ''; }
});

test('login cooldowns are distinguished from the global API limit', async () => {
  limitedScope = 'login';
  try {
    const response = await request('/api/auth/login', {
      method: 'POST', headers: { Origin: frontendOrigin, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 429);
    assertAllowedOrigin(response);
    assert.equal(response.headers.get('retry-after'), '900');
    assert.equal(response.headers.get('x-ratelimit-scope'), 'login');
    await response.json();
    const other = await request('/api/inventory', { headers: { Origin: frontendOrigin } });
    assert.equal(other.status, 401);
    assert.equal(other.headers.get('x-ratelimit-scope'), null);
    await other.json();
  } finally { limitedScope = ''; }
});
