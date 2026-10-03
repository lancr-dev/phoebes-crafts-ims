import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mock, test } from 'node:test';
import mongoose from 'mongoose';
import connectMongoDB from '../src/config/db.js';
import logger from '../src/config/logger.js';

process.env.NODE_ENV = 'production';
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD_HASH = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;
process.env.FRONTEND_ORIGIN = 'https://crafts.example';
const { sessionCookieName, sessionCookieOptions } = await import('../src/config/auth.js');

test('environment files and variants are ignored', () => {
  const privatePaths = [
    '.env', '.env.production',
    'backend/.env', 'backend/.env.production', 'backend/.env.staging', 'backend/.env.production.local',
    'frontend/.env', 'frontend/.env.production', 'frontend/.env.local', 'frontend/.env.test',
    '.env.example', 'backend/.env.example', 'frontend/.env.example',
  ];
  const output = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    input: privatePaths.join('\n') + '\n', encoding: 'utf8',
  });
  assert.deepEqual(output.trim().split(/\r?\n/), privatePaths);
});

test('production session cookies are HTTP-only, HTTPS-only, and restricted to the host', () => {
  assert.ok(sessionCookieName.startsWith('__Host-'));
  assert.equal(sessionCookieOptions.httpOnly, true);
  assert.equal(sessionCookieOptions.secure, true);
  assert.equal(sessionCookieOptions.sameSite, 'strict');
  assert.equal(sessionCookieOptions.path, '/');
  assert.equal(Object.hasOwn(sessionCookieOptions, 'domain'), false);
});

test('database connection failures do not log credentials or raw error messages', async () => {
  const failure = new Error('mongodb://test-user:private-test-password@database.example');
  const connect = mock.method(mongoose, 'connect', async () => { throw failure; });
  const log = mock.method(logger, 'error', () => {});
  try {
    await assert.rejects(connectMongoDB(), (error) => error === failure);
    assert.deepEqual(log.mock.calls[0].arguments, ['MongoDB connection failed', { event: 'database.connection_failed', error_type: 'Error' }]);
    assert.equal(JSON.stringify(log.mock.calls.map((call) => call.arguments)).includes('private-test-password'), false);
  } finally {
    connect.mock.restore();
    log.mock.restore();
  }
});

test('successful database startup does not log the configured host', async () => {
  const connect = mock.method(mongoose, 'connect', async () => ({ connection: { host: 'private-database.example' } }));
  const log = mock.method(logger, 'info', () => {});
  try {
    await connectMongoDB();
    assert.deepEqual(log.mock.calls[0].arguments, ['MongoDB connected', { event: 'database.connected' }]);
  } finally {
    connect.mock.restore();
    log.mock.restore();
  }
});
