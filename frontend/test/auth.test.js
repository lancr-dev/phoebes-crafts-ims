import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { validateLogin } from '../src/utils/validateLogin.js';
import { getAuthError } from '../src/utils/authErrors.js';

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
});
after(() => vite.close());

const { default: apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js');
const { getCurrentAdmin, loginAdmin, logoutAdmin } = await vite.ssrLoadModule('/src/services/authApi.js');
const { default: AuthContext } = await vite.ssrLoadModule('/src/auth/AuthContext.js');
const { default: LoginPage } = await vite.ssrLoadModule('/src/pages/LoginPage.jsx');

test('required credentials and username limits match the backend', () => {
  assert.deepEqual(validateLogin({ username: ' ', password: '' }), {
    username: 'Enter your username.', password: 'Enter your password.',
  });
  assert.deepEqual(validateLogin({ username: ' admin ', password: ' password ' }), {});
  assert.deepEqual(validateLogin({ username: 'a'.repeat(100), password: 'p' }), {});
  assert.ok(validateLogin({ username: 'a'.repeat(101), password: 'p' }).username);
});

test('password validation counts UTF-8 bytes without trimming the password', () => {
  assert.deepEqual(validateLogin({ username: 'admin', password: ' ' }), {});
  assert.deepEqual(validateLogin({ username: 'admin', password: 'a'.repeat(1024) }), {});
  assert.ok(validateLogin({ username: 'admin', password: 'a'.repeat(1025) }).password);
  assert.deepEqual(validateLogin({ username: 'admin', password: 'é'.repeat(512) }), {});
  assert.ok(validateLogin({ username: 'admin', password: 'é'.repeat(513) }).password);
});

test('login validation rejects malformed values and multiline usernames without throwing', () => {
  for (const values of [null, {}, { username: 42, password: true }, { username: {}, password: [] }]) {
    const errors = validateLogin(values);
    assert.ok(errors.username);
    assert.ok(errors.password);
  }
  assert.ok(validateLogin({ username: 'admin\nname', password: 'p' }).username);
  assert.deepEqual(validateLogin({ username: 'admin', password: ' password ' }), {});
});

test('rate-limit errors direct users to the shared countdown without stale minute estimates', () => {
  assert.equal(getAuthError({ response: { status: 429, headers: { 'retry-after': '61' } } }),
    'Too many requests. Please try again when the countdown finishes.');
  assert.equal(getAuthError({ response: { status: 429, headers: { 'retry-after': '60' } } }),
    'Too many requests. Please try again when the countdown finishes.');
  assert.equal(getAuthError({ response: { status: 429 } }),
    'Too many requests. Please try again when the countdown finishes.');
});

test('connection, timeout, credentials, and service failures have useful messages', () => {
  assert.match(getAuthError({}, { offline: true }), /offline/);
  assert.match(getAuthError({ code: 'ECONNABORTED' }), /too long/);
  assert.match(getAuthError({ code: 'ERR_NETWORK' }), /reach the server/);
  assert.match(getAuthError({ response: { status: 401 } }), /username or password/);
  assert.match(getAuthError({ response: { status: 403 } }), /Access from this address/);
  assert.match(getAuthError({ response: { status: 503 } }), /temporarily unavailable/);
  assert.equal(getAuthError(new Error('private detail'), { action: 'sign out' }),
    "Couldn't sign out. Please try again.");
});

test('auth API uses cookie credentials, timeouts, and the backend contracts', async () => {
  const requests = [];
  apiClient.defaults.adapter = async (config) => {
    requests.push(config);
    return { data: { admin: { username: 'admin' } }, status: 200, headers: {}, config };
  };
  const credentials = { username: 'admin', password: ' password ' };
  assert.deepEqual(await loginAdmin(credentials), { username: 'admin' });
  const signal = new AbortController().signal;
  assert.deepEqual(await getCurrentAdmin(signal), { username: 'admin' });
  await logoutAdmin();
  assert.deepEqual(requests.map(({ method, url }) => [method, url]), [
    ['post', '/auth/login'], ['get', '/auth/me'], ['post', '/auth/logout'],
  ]);
  for (const config of requests) {
    assert.equal(config.withCredentials, true);
    assert.equal(config.timeout, 10000);
  }
  assert.deepEqual(JSON.parse(requests[0].data), credentials);
  assert.equal(requests[1].signal, signal);
});

test('malformed successful responses cannot create authenticated state', async () => {
  apiClient.defaults.adapter = async (config) => ({ data: { admin: {} }, status: 200, headers: {}, config });
  await assert.rejects(loginAdmin({ username: 'admin', password: 'p' }), /Invalid authentication response/);
  await assert.rejects(getCurrentAdmin(), /Invalid authentication response/);
});

test('login renders labeled, accessible controls and masks the password', () => {
  const auth = { admin: null, isChecking: false, sessionError: '', signIn: async () => {} };
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: auth }, createElement(LoginPage))));
  assert.equal((markup.match(/<h1\b/g) || []).length, 1);
  assert.match(markup, /<main\b/);
  assert.match(markup, /<label for="username">Username<\/label>/);
  assert.match(markup, /autoComplete="username"/);
  assert.match(markup, /type="password"/);
  assert.match(markup, /autoComplete="current-password"/);
  assert.match(markup, /aria-label="Show password"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, />Sign in<\/span>/);
});

test('login prevents submission while the initial session is being checked', () => {
  const auth = { admin: null, isChecking: true, sessionError: '', signIn: async () => {} };
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: auth }, createElement(LoginPage))));
  assert.match(markup, /type="submit" disabled=""/);
  assert.match(markup, /Checking session/);
});
