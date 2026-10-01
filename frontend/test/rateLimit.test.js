import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { createRateLimitStore, getRetryDeadline } from '../src/services/rateLimitStore.js';

test('Retry-After supports seconds and HTTP dates with safe fallback delays', () => {
  const now = Date.UTC(2026, 9, 1);
  assert.equal(getRetryDeadline('61', 'api', now), now + 61000);
  assert.equal(getRetryDeadline(' 60 ', 'api', now), now + 60000);
  assert.equal(getRetryDeadline(new Date(now + 120000).toUTCString(), 'api', now), now + 120000);
  for (const value of [undefined, '', '-1', '12.5', 'invalid', 'Infinity', '9'.repeat(30)]) {
    assert.equal(getRetryDeadline(value, 'api', now), now + 60000);
    assert.equal(getRetryDeadline(value, 'login', now), now + 900000);
  }
  assert.equal(getRetryDeadline('0', 'api', now), now + 1000);
  assert.equal(getRetryDeadline(new Date(now - 1000).toUTCString(), 'api', now), now + 1000);
});

test('cooldowns use absolute deadlines, retain the longest delay, and expire without subscribers', () => {
  let now = 10000;
  const store = createRateLimitStore({ now: () => now });
  store.block('api', '60');
  assert.deepEqual(store.getCooldown('api'), { scope: 'api', seconds: 60 });
  now += 10000;
  store.block('api', '5');
  assert.equal(store.getCooldown('api').seconds, 50);
  store.block('api', '80');
  assert.equal(store.getCooldown('api').seconds, 80);
  now += 80001;
  assert.equal(store.getCooldown('api').seconds, 0);
});

test('login requests respect both limits while ordinary requests ignore the login cooldown', () => {
  let now = 1000;
  const store = createRateLimitStore({ now: () => now });
  store.block('login', '900');
  store.block('api', '60');
  assert.deepEqual(store.getCooldown('login'), { scope: 'login', seconds: 900 });
  assert.deepEqual(store.getCooldown('api'), { scope: 'api', seconds: 60 });
  now += 60000;
  assert.equal(store.getCooldown('api').seconds, 0);
  assert.equal(store.getCooldown('login').seconds, 840);
});

test('countdown subscriptions stop timers and catch up after a background tab resumes', () => {
  let now = 1000;
  let scheduled;
  const cancelled = [];
  const store = createRateLimitStore({
    now: () => now,
    schedule: (callback, delay) => { assert.equal(delay, 1000); scheduled = callback; return 1; },
    cancel: (id) => cancelled.push(id),
  });
  let updates = 0;
  const unsubscribe = store.subscribe(() => { updates++; });
  const initial = store.getSnapshot();
  assert.equal(store.getSnapshot(), initial);
  store.block('api', '60');
  assert.equal(updates, 1);
  now += 59001;
  scheduled();
  assert.equal(store.getSnapshot().api, 1);
  now += 1000;
  scheduled();
  assert.equal(store.getSnapshot().api, 0);
  assert.equal(updates, 3);
  store.block('login', '900');
  unsubscribe();
  assert.ok(cancelled.length > 0);
});

const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
after(() => { mock.restoreAll(); return vite.close(); });
const { default: apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js');
const { rateLimitStore } = await vite.ssrLoadModule('/src/services/rateLimitStore.js');
const { default: RateLimitNotice } = await vite.ssrLoadModule('/src/components/RateLimitNotice.jsx');
const { default: LoginPage } = await vite.ssrLoadModule('/src/pages/LoginPage.jsx');
const { default: AuthContext } = await vite.ssrLoadModule('/src/auth/AuthContext.js');
const { default: InventoryModal } = await vite.ssrLoadModule('/src/components/InventoryModal.jsx');
const { default: AppLayout } = await vite.ssrLoadModule('/src/components/AppLayout.jsx');
let clock = 2000000000000;
mock.method(Date, 'now', () => clock);
const throw429 = (config, scope, retryAfter) => {
  throw { config, response: { status: 429, headers: { 'x-ratelimit-scope': scope, 'retry-after': retryAfter } } };
};

test('a server API limit blocks reads, login, mutations, sign-out, and export without sending or replaying them', async () => {
  let calls = 0;
  apiClient.defaults.adapter = async (config) => { calls++; return throw429(config, 'api', '60'); };
  await assert.rejects(apiClient.get('/inventory/dashboard'), (error) => error.response.status === 429);
  for (const [method, url] of [
    ['get', '/inventory'], ['get', '/inventory/categories'], ['get', '/auth/me'], ['post', '/auth/login'],
    ['post', '/auth/logout'], ['post', '/inventory'], ['put', '/inventory/id'], ['patch', '/inventory/id/increase'],
    ['delete', '/inventory/id'], ['delete', '/inventory/logs/all'], ['get', '/inventory/logs/export'],
  ]) {
    await assert.rejects(apiClient.request({ method, url }), (error) => {
      assert.equal(error.isClientRateLimited, true);
      assert.equal(error.response.headers['retry-after'], '60');
      return error.response.status === 429;
    });
  }
  assert.equal(calls, 1);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(apiClient.get('/inventory', { signal: cancelled.signal }), (error) => error.code === 'ERR_CANCELED');
  assert.equal(calls, 1);
  clock += 60001;
  apiClient.defaults.adapter = async (config) => { calls++; return { config, status: 200, headers: {}, data: {} }; };
  assert.equal(calls, 1);
  await apiClient.get('/inventory');
  assert.equal(calls, 2);
});

test('login cooldown leaves session checks, logout, and inventory requests usable', async () => {
  let calls = 0;
  apiClient.defaults.adapter = async (config) => {
    calls++;
    if (config.url === '/auth/login') return throw429(config, 'login', '900');
    return { config, status: 200, headers: {}, data: {} };
  };
  await assert.rejects(apiClient.post('/auth/login'), (error) => error.response.status === 429);
  await assert.rejects(apiClient.post('/auth/login'), (error) => error.isClientRateLimited === true);
  await apiClient.get('/auth/me');
  await apiClient.post('/auth/logout');
  await apiClient.get('/inventory');
  assert.equal(calls, 4);
  assert.equal(renderToStaticMarkup(createElement(RateLimitNotice)), '');
});

test('login cooldown renders a labeled countdown and disables submission while preserving editable fields', () => {
  const auth = { admin: null, isChecking: false, sessionError: '', signIn: async () => {} };
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: auth }, createElement(LoginPage))));
  assert.match(markup, /Sign-in attempts paused/);
  assert.match(markup, /role="timer" aria-live="off"/);
  assert.match(markup, /Try again in 900 seconds/);
  assert.match(markup, />15:00</);
  assert.match(markup, /type="submit" disabled=""/);
  assert.doesNotMatch(markup, /<input[^>]*disabled/);
});

test('global cooldown remains visible inside dialogs and disables sign-out without a misleading loading label', () => {
  rateLimitStore.block('api', '60');
  const dialog = renderToStaticMarkup(createElement(InventoryModal, { onClose: () => {}, onSave: () => {}, isSubmitDisabled: true }));
  assert.match(dialog, /Requests temporarily paused/);
  assert.match(dialog, />1:00</);
  assert.match(dialog, /type="submit" disabled=""/);
  assert.doesNotMatch(dialog, /type="button"[^>]*disabled/);
  const auth = { admin: { username: 'admin' }, signOut: async () => {} };
  const layout = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: auth }, createElement(AppLayout))));
  assert.match(layout, /class="sidebar-sign-out"[^>]*disabled=""/);
  assert.match(layout, />Sign out<\/button>/);
  assert.doesNotMatch(layout, /Signing out/);
});

test('locally blocked requests cannot extend the timer and controls recover after expiry', async () => {
  clock += 59001;
  await assert.rejects(apiClient.get('/inventory'), (error) => error.response.headers['retry-after'] === '1');
  clock += 1000;
  const unsubscribe = rateLimitStore.subscribe(() => {});
  assert.equal(renderToStaticMarkup(createElement(RateLimitNotice)), '');
  clock += 900000;
  unsubscribe();
  const stop = rateLimitStore.subscribe(() => {});
  const auth = { admin: null, isChecking: false, sessionError: '', signIn: async () => {} };
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: auth }, createElement(LoginPage))));
  assert.doesNotMatch(markup, /type="submit" disabled/);
  assert.doesNotMatch(markup, /role="timer"/);
  stop();
});

test('missing scope or delay headers safely pause all requests and non-429 failures leave them available', async () => {
  apiClient.defaults.adapter = async (config) => throw429(config);
  await assert.rejects(apiClient.post('/auth/login'));
  assert.equal(rateLimitStore.getCooldown('api').seconds, 60);
  clock += 60001;
  for (const status of [401, 403, 503]) {
    apiClient.defaults.adapter = async () => { throw { response: { status } }; };
    await assert.rejects(apiClient.get('/inventory'), (error) => error.response.status === status);
    assert.equal(rateLimitStore.getCooldown('api').seconds, 0);
  }
});
