import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mock, test } from 'node:test';
import mongoose from 'mongoose';
import connectMongoDB from '../src/config/db.js';

process.env.NODE_ENV = 'production';
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD_HASH = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;
process.env.FRONTEND_ORIGIN = 'https://crafts.example';
const { sessionCookieName, sessionCookieOptions } = await import('../src/config/auth.js');

test('private environment variants are ignored while safe templates remain shareable', () => {
  const privatePaths = [
    '.env', '.env.production',
    'backend/.env', 'backend/.env.production', 'backend/.env.staging', 'backend/.env.production.local',
    'frontend/.env', 'frontend/.env.production', 'frontend/.env.local', 'frontend/.env.test',
  ];
  const templates = ['.env.example', 'backend/.env.example', 'frontend/.env.example'];
  const output = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    input: [...privatePaths, ...templates].join('\n') + '\n', encoding: 'utf8',
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
  const log = mock.method(console, 'error', () => {});
  const exit = mock.method(process, 'exit', () => {});
  try {
    await connectMongoDB();
    assert.equal(exit.mock.callCount(), 1);
    assert.deepEqual(exit.mock.calls[0].arguments, [1]);
    assert.deepEqual(log.mock.calls[0].arguments, ['MongoDB connection failed', { name: 'Error' }]);
    assert.equal(JSON.stringify(log.mock.calls).includes('private-test-password'), false);
  } finally {
    connect.mock.restore();
    log.mock.restore();
    exit.mock.restore();
  }
});

test('successful database startup does not log the configured host', async () => {
  const connect = mock.method(mongoose, 'connect', async () => ({ connection: { host: 'private-database.example' } }));
  const log = mock.method(console, 'log', () => {});
  try {
    await connectMongoDB();
    assert.deepEqual(log.mock.calls[0].arguments, ['MongoDB connected']);
  } finally {
    connect.mock.restore();
    log.mock.restore();
  }
});
