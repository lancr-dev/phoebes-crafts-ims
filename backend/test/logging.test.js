import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { after, test } from 'node:test';
import express from 'express';
import winston from 'winston';
import { Logtail } from '@logtail/node';
import logger, { createAppLogger, parseIngestingHost } from '../src/config/logger.js';
import { createLogSanitizer, describeError } from '../src/utils/logSanitization.js';
import requestLogger from '../src/middleware/requestLogger.js';
import errorHandler from '../src/middleware/errorHandler.js';
import { installServerLifecycle } from '../src/utils/serverLifecycle.js';

const capture = (records) => new winston.transports.Stream({ stream: new Writable({
  objectMode: true,
  write(info, _encoding, callback) {
    records.push(JSON.parse(info[Symbol.for('message')]));
    callback();
  },
}) });

const remoteEnv = {
  NODE_ENV: 'production', BETTER_STACK_SOURCE_TOKEN: 'offline-source-token',
  BETTER_STACK_INGESTING_HOST: 'logs.example.invalid', ADMIN_PASSWORD_HASH: 'private-password-hash',
};

test('ingesting hosts accept a bare hostname or HTTPS origin and reject unsafe URLs', () => {
  assert.equal(parseIngestingHost('logs.example.invalid'), 'https://logs.example.invalid');
  assert.equal(parseIngestingHost(' https://logs.example.invalid/ '), 'https://logs.example.invalid');
  for (const host of ['', 'http://logs.example.invalid', 'https://user:password@logs.example.invalid', 'https://logs.example.invalid/path', 'https://logs.example.invalid?token=secret', 'https://logs.example.invalid#fragment']) {
    assert.throws(() => parseIngestingHost(host));
  }
});

test('console and Better Stack receive the same structured redacted event', async () => {
  const records = [];
  const remote = [];
  const client = { log: async (...args) => { remote.push(args); }, flush: async () => {} };
  const logging = createAppLogger({ env: remoteEnv, transports: [capture(records)], createLogtail: (token, options) => {
    assert.equal(token, remoteEnv.BETTER_STACK_SOURCE_TOKEN);
    assert.equal(options.endpoint, 'https://logs.example.invalid');
    assert.equal(options.captureStackContext, false);
    assert.equal(options.throwExceptions, true);
    return client;
  } });
  try {
    const cycle = {};
    cycle.self = cycle;
    logging.logger.info('Action completed offline-source-token', {
      event: 'test.action', body: { password: 'unknown-secret' }, headers: { cookie: 'private-cookie' },
      metadata: { source_token: 'private-source', value: 'private-password-hash', cycle },
      failure: new Error('mongodb://user:private-test-password@database.example'),
    });
    assert.equal(await logging.flushLogs(), true);
    assert.equal(records.length, 1);
    assert.equal(records[0].service, 'phoebes-crafts-api');
    assert.equal(records[0].environment, 'production');
    assert.ok(Number.isFinite(Date.parse(records[0].timestamp)));
    assert.equal(records[0].metadata.cycle.self, '[CIRCULAR]');
    assert.deepEqual(records[0].failure, { error_type: 'Error' });
    const payload = JSON.stringify([records, remote]);
    for (const secret of ['offline-source-token', 'private-password-hash', 'private-cookie', 'private-source', 'private-test-password', 'unknown-secret']) {
      assert.equal(payload.includes(secret), false, secret);
    }
    assert.equal(remote[0][0], records[0].message);
    assert.equal(remote[0][2].event, 'test.action');
  } finally { logging.logger.close(); }
});

test('sanitization bounds nested context and strips inline credentials and raw error stacks', () => {
  const sanitize = createLogSanitizer({});
  const result = sanitize({ message: 'Bearer private-bearer mongodb+srv://user:pass@db.example password=other-secret',
    stack: 'private-stack', array: Array.from({ length: 200 }, (_, i) => i) });
  assert.equal(result.array.length, 20);
  assert.equal(result.stack, '[REDACTED]');
  assert.doesNotMatch(JSON.stringify(result), /private-bearer|other-secret|user:pass|private-stack/);
});

test('error diagnostics retain safe application locations and known configuration reasons', () => {
  const error = new Error('FRONTEND_ORIGIN must be an exact HTTP origin (HTTPS in production)');
  error.stack = 'Error: private-message\n at start (C:\\private-user\\backend\\src\\server.js:18:9)\n at config (file:///private-user/backend/src/config/auth.js:47:11)\n at external (/private-user/node_modules/client/index.js:1:1)';
  error.code = 'INVALID_CONFIG';
  assert.deepEqual(describeError(error), {
    error_type: 'Error', error_code: 'INVALID_CONFIG', error_reason: 'frontend_origin_invalid',
    error_frames: ['src/server.js:18:9', 'src/config/auth.js:47:11'],
  });
  assert.doesNotMatch(JSON.stringify(describeError(error)), /private-user|private-message|node_modules/);
  const sanitize = createLogSanitizer({ BETTER_STACK_SOURCE_TOKEN: ' padded-private-token ' });
  assert.equal(sanitize('padded-private-token'), '[REDACTED]');
});

test('configured log levels filter lower-priority events', () => {
  const records = [];
  const logging = createAppLogger({ env: { LOG_LEVEL: 'warn' }, transports: [capture(records)] });
  try {
    logging.logger.info('Filtered event');
    logging.logger.warn('Warning event');
    logging.logger.error('Error event');
    assert.deepEqual(records.map((record) => record.level), ['warn', 'error']);
  } finally { logging.logger.close(); }
});

test('missing or invalid remote configuration preserves console output without exposing config', () => {
  const warnings = [];
  const records = [];
  const logging = createAppLogger({ env: { ...remoteEnv, BETTER_STACK_INGESTING_HOST: 'http://private.invalid' },
    transports: [capture(records)], reportFailure: (record) => warnings.push(record),
    createLogtail: () => { assert.fail('Invalid config must not create a remote client'); } });
  logging.logger.info('Console remains available', { event: 'test.console' });
  assert.equal(records.length, 1);
  assert.equal(warnings[0].event, 'logging.configuration_invalid');
  assert.doesNotMatch(JSON.stringify(warnings), /offline-source-token|private.invalid/);
  logging.logger.close();
});

test('Node test context prevents remote delivery even with configured production credentials', () => {
  const logging = createAppLogger({ env: { ...remoteEnv, NODE_TEST_CONTEXT: 'child-v8' }, transports: [capture([])],
    createLogtail: () => { assert.fail('Tests must not send real telemetry'); } });
  logging.logger.info('Offline test');
  logging.logger.close();
});

test('actual Logtail SDK failures are caught, redacted, and throttled without losing console logs', async () => {
  const records = [];
  const warnings = [];
  const logging = createAppLogger({ env: remoteEnv, transports: [capture(records)], reportFailure: (record) => warnings.push(record),
    createLogtail: (token, options) => {
      const client = new Logtail(token, { ...options, batchInterval: 20, retryCount: 0 });
      client.setSync(async () => { throw new Error('offline-source-token private-delivery-failure'); });
      return client;
    } });
  try {
    logging.logger.error('First application error', { event: 'test.error' });
    assert.equal(await logging.flushLogs(), false);
    logging.logger.error('Second application error', { event: 'test.error' });
    assert.equal(await logging.flushLogs(), false);
    assert.equal(records.length, 2);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].event, 'logging.delivery_failed');
    assert.doesNotMatch(JSON.stringify(warnings), /offline-source-token|private-delivery-failure/);
  } finally { logging.logger.close(); }
});

test('flushing waits for deliveries already in flight and times out safely', async () => {
  let complete;
  const client = { log: () => new Promise((resolve) => { complete = resolve; }), flush: async () => {} };
  const warnings = [];
  const logging = createAppLogger({ env: remoteEnv, transports: [capture([])], createLogtail: () => client,
    reportFailure: (record) => warnings.push(record) });
  try {
    logging.logger.info('Pending delivery');
    const pendingFlush = logging.flushLogs(1000);
    await delay(5);
    complete();
    assert.equal(await pendingFlush, true);
    client.flush = () => new Promise(() => {});
    assert.equal(await logging.flushLogs(10), false);
    assert.equal(warnings[0].event, 'logging.delivery_failed');
  } finally {
    client.flush = async () => {};
    logging.logger.close();
  }
});

const requests = [];
logger.clear();
logger.add(capture(requests));
logger.silent = false;
logger.level = 'debug';
const app = express();
app.use(requestLogger);
app.use(express.json());
app.get('/work/:id', async (req, res) => {
  await delay(req.params.id === 'first' ? 15 : 1);
  logger.info('Work completed', { event: 'test.work' });
  res.json({ requestId: req.requestId });
});
app.get('/failure', () => { throw new Error('mongodb://user:private-request-password@db.invalid'); });
let streamClosed;
const closedStream = new Promise((resolve) => { streamClosed = resolve; });
app.get('/stream', (_req, res) => {
  res.once('close', streamClosed);
  res.write('open stream');
});
app.post('/api/auth/login', (_req, res) => res.status(401).json({ message: 'Invalid credentials' }));
app.use(errorHandler);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  logger.silent = true;
  logger.clear();
});

test('concurrent requests have isolated IDs, correlated events, and one completion each', async () => {
  const before = requests.length;
  const responses = await Promise.all(['first', 'second'].map((id) => fetch(`${origin}/work/${id}?token=private-query`, {
    headers: { 'X-Request-ID': 'private-forged-request-id' },
  })));
  const ids = await Promise.all(responses.map(async (response) => {
    const { requestId } = await response.json();
    assert.equal(response.headers.get('x-request-id'), requestId);
    assert.match(requestId, /^[a-f0-9-]{36}$/);
    return requestId;
  }));
  assert.notEqual(ids[0], ids[1]);
  const entries = requests.slice(before);
  for (const id of ids) {
    assert.equal(entries.filter((entry) => entry.request_id === id && entry.event === 'test.work').length, 1);
    const completed = entries.filter((entry) => entry.request_id === id && entry.event === 'http.request.completed');
    assert.equal(completed.length, 1);
    assert.equal(completed[0].route, '/work/:id');
    assert.equal(completed[0].level, 'debug');
  }
  assert.doesNotMatch(JSON.stringify(entries), /private-query|private-forged-request-id/);
});

test('auth failures log status and duration without request headers, bodies, or usernames', async () => {
  const before = requests.length;
  const response = await fetch(`${origin}/api/auth/login?token=private-query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'private-cookie', Authorization: 'Bearer private-auth' },
    body: JSON.stringify({ username: 'private-user', password: 'private-password' }),
  });
  assert.equal(response.status, 401);
  await response.json();
  const entries = requests.slice(before);
  const completed = entries.filter((entry) => entry.event === 'http.request.completed');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].level, 'warn');
  assert.equal(completed[0].route, '/api/auth/login');
  assert.equal(completed[0].status_code, 401);
  assert.ok(completed[0].duration_ms >= 0);
  assert.doesNotMatch(JSON.stringify(entries), /private-query|private-cookie|private-auth|private-user|private-password/);
});

test('unhandled HTTP errors retain safe responses and correlate sanitized diagnostics', async () => {
  const before = requests.length;
  const response = await fetch(`${origin}/failure`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: 'An unexpected server error occurred' });
  const entries = requests.slice(before);
  assert.equal(entries.filter((entry) => entry.event === 'http.request_failed').length, 1);
  assert.equal(entries.filter((entry) => entry.event === 'http.request.completed').length, 1);
  assert.equal(entries[0].request_id, response.headers.get('x-request-id'));
  assert.doesNotMatch(JSON.stringify(entries), /private-request-password|mongodb:/);
});

test('aborted responses produce exactly one correlated warning', async () => {
  const before = requests.length;
  const response = await fetch(`${origin}/stream`);
  const id = response.headers.get('x-request-id');
  await response.body.cancel();
  await closedStream;
  const entries = requests.slice(before).filter((entry) => entry.request_id === id);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, 'http.request.aborted');
  assert.equal(entries[0].status_code, 499);
  assert.equal(entries[0].level, 'warn');
});

test('shutdown drains requests, disconnects MongoDB, flushes logs, and removes handlers once', async () => {
  const operations = [];
  const fakeServer = new EventEmitter();
  fakeServer.close = (callback) => { operations.push('close'); callback(); };
  const processHandle = Object.assign(new EventEmitter(), { exit: (code) => operations.push(`exit:${code}`) });
  const database = { connection: new EventEmitter(), disconnect: async () => operations.push('disconnect') };
  const log = { info: () => {}, warn: () => {}, error: () => {} };
  const lifecycle = installServerLifecycle(fakeServer, {
    processHandle, database, log, flush: async () => operations.push('flush'),
  });
  await lifecycle.shutdown('SIGTERM');
  await lifecycle.shutdown('SIGINT');
  assert.deepEqual(operations, ['close', 'disconnect', 'flush', 'exit:0']);
  assert.equal(processHandle.listenerCount('SIGTERM'), 0);
  assert.equal(database.connection.listenerCount('error'), 0);
});

test('failed HTTP shutdown still disconnects the database and exits with failure', async () => {
  const operations = [];
  const fakeServer = new EventEmitter();
  fakeServer.close = (callback) => callback(new Error('private-close-failure'));
  const processHandle = Object.assign(new EventEmitter(), { exit: (code) => operations.push(`exit:${code}`) });
  const errors = [];
  const lifecycle = installServerLifecycle(fakeServer, {
    processHandle, database: { connection: new EventEmitter(), disconnect: async () => operations.push('disconnect') },
    log: { info: () => {}, warn: () => {}, error: (...args) => errors.push(args) },
    flush: async () => operations.push('flush'),
  });
  await lifecycle.shutdown('server_error', 1);
  assert.deepEqual(operations, ['disconnect', 'flush', 'exit:1']);
  assert.doesNotMatch(JSON.stringify(errors), /private-close-failure/);
});

test('fatal runtime failures flush safe diagnostics and exit unsuccessfully', async () => {
  for (const event of ['uncaughtException', 'unhandledRejection']) {
    const operations = [];
    const errors = [];
    const fakeServer = new EventEmitter();
    fakeServer.close = (callback) => { operations.push('close'); callback(); };
    let exited;
    const exit = new Promise((resolve) => { exited = resolve; });
    const processHandle = Object.assign(new EventEmitter(), {
      exit: (code) => { operations.push(`exit:${code}`); exited(); },
    });
    const lifecycle = installServerLifecycle(fakeServer, {
      processHandle, database: { connection: new EventEmitter(), disconnect: async () => operations.push('disconnect') },
      log: { info: () => {}, warn: () => {}, error: (...args) => errors.push(args) },
      flush: async () => operations.push('flush'),
    });
    try {
      processHandle.emit(event, new Error('private-fatal-password'));
      await exit;
      assert.deepEqual(operations, ['close', 'disconnect', 'flush', 'exit:1']);
      assert.equal(errors[0][1].event, event === 'uncaughtException' ? 'process.uncaught_exception' : 'process.unhandled_rejection');
      assert.doesNotMatch(JSON.stringify(errors), /private-fatal-password/);
      assert.equal(processHandle.listenerCount(event), 0);
    } finally { lifecycle.dispose(); }
  }
});

test('a stalled HTTP drain is terminated by the shutdown deadline', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { EventEmitter } from 'node:events';
    import { installServerLifecycle } from './src/utils/serverLifecycle.js';
    const server = new EventEmitter();
    server.close = () => {};
    // Model a connection that keeps the server alive but never finishes.
    setInterval(() => {}, 30000);
    const write = (_message, context) => console.log(JSON.stringify(context));
    const lifecycle = installServerLifecycle(server, {
      shutdownTimeoutMs: 20,
      log: { info: write, warn: write, error: write },
      database: { connection: new EventEmitter(), disconnect: async () => {} },
      flush: async (timeout) => console.log(JSON.stringify({ flush_timeout: timeout })),
    });
    void lifecycle.shutdown('SIGTERM');
  `], { cwd: new URL('..', import.meta.url), env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 5000 });
  assert.ifError(child.error);
  assert.equal(child.status, 1);
  const records = child.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(records.some((record) => record.event === 'server.shutdown_timeout'));
  assert.ok(records.some((record) => record.flush_timeout === 1000));
});
