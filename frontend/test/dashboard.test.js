import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { parseDashboard, getDashboardError } from '../src/utils/dashboardData.js';

const summary = { totalMaterials: 26, inStockMaterials: 15, lowStockMaterials: 8, outOfStockMaterials: 3 };
const materials = [
  { _id: '0123456789abcdef01234567', itemName: 'Cotton yarn', category: 'Yarn', stock: 25, status: 'In Stock' },
  { _id: '0123456789abcdef01234568', itemName: 'Glass beads', category: 'Beads', stock: 4, status: 'Low Stock' },
  { _id: '0123456789abcdef01234569', itemName: 'Ribbon', category: 'Trim', stock: 0, status: 'Out of Stock' },
];
const data = { summary, recentMaterials: materials };

const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
after(() => vite.close());
const { default: apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js');
const { getInventoryDashboard } = await vite.ssrLoadModule('/src/services/inventoryApi.js');
const { default: DashboardCards } = await vite.ssrLoadModule('/src/components/DashboardCards.jsx');
const { default: RecentInventory } = await vite.ssrLoadModule('/src/components/RecentInventory.jsx');
const { default: DashboardPage } = await vite.ssrLoadModule('/src/pages/DashboardPage.jsx');
const { default: AuthContext } = await vite.ssrLoadModule('/src/auth/AuthContext.js');
const { default: Sidebar } = await vite.ssrLoadModule('/src/components/Sidebar.jsx');

test('dashboard accepts totals larger than an inventory page and a valid empty inventory', () => {
  assert.deepEqual(parseDashboard(data), data);
  const empty = { summary: { totalMaterials: 0, inStockMaterials: 0, lowStockMaterials: 0, outOfStockMaterials: 0 }, recentMaterials: [] };
  assert.deepEqual(parseDashboard(empty), empty);
});

test('dashboard rejects misleading counts and malformed material data', () => {
  for (const invalid of [
    {},
    { ...data, summary: { ...summary, totalMaterials: 25 } },
    { ...data, summary: { ...summary, lowStockMaterials: -1 } },
    { ...data, summary: { ...summary, inStockMaterials: 1.5 } },
    { ...data, recentMaterials: null },
    { ...data, recentMaterials: [{ ...materials[0], stock: -1 }] },
    { ...data, recentMaterials: [{ ...materials[0], _id: 'invalid' }] },
    { ...data, recentMaterials: [{ ...materials[0], status: 'Unknown' }] },
    { ...data, recentMaterials: [{ ...materials[0], itemName: '' }] },
  ]) assert.throws(() => parseDashboard(invalid));
});

test('dashboard request uses credentials and supports cancellation', async () => {
  let request;
  apiClient.defaults.adapter = async (config) => {
    request = config;
    return { data, status: 200, config, headers: {} };
  };
  const controller = new AbortController();
  assert.deepEqual(await getInventoryDashboard(controller.signal), data);
  assert.equal(request.url, '/inventory/dashboard');
  assert.equal(request.method, 'get');
  assert.equal(request.withCredentials, true);
  assert.equal(request.signal, controller.signal);
  controller.abort();
  await assert.rejects(getInventoryDashboard(controller.signal), (error) => error.code === 'ERR_CANCELED');
});

test('dashboard HTTP failures are not converted to successful or empty analytics', async () => {
  apiClient.defaults.adapter = async () => { throw { response: { status: 401 } }; };
  await assert.rejects(getInventoryDashboard(), (error) => error.response.status === 401);
  apiClient.defaults.adapter = async (config) => ({ data: {}, status: 200, config, headers: {} });
  await assert.rejects(getInventoryDashboard(), /Invalid dashboard response/);
});

test('all four requested totals render with their values', () => {
  const markup = renderToStaticMarkup(createElement(DashboardCards, { summary, isLoading: false }));
  for (const label of ['Total materials', 'In stock', 'Low stock', 'Out of stock']) assert.ok(markup.includes(label));
  for (const count of [26, 15, 8, 3]) assert.match(markup, new RegExp(`>${count}<`));
});

test('an empty inventory displays zero for every dashboard total', () => {
  const empty = { totalMaterials: 0, inStockMaterials: 0, lowStockMaterials: 0, outOfStockMaterials: 0 };
  const markup = renderToStaticMarkup(createElement(DashboardCards, { summary: empty, isLoading: false }));
  assert.equal((markup.match(/>0</g) || []).length, 4);
  assert.doesNotMatch(markup, /Unavailable|Loading/);
});

test('loading and failure totals remain distinct from actual zero totals', () => {
  const loading = renderToStaticMarkup(createElement(DashboardCards, { isLoading: true }));
  const failed = renderToStaticMarkup(createElement(DashboardCards, { isLoading: false }));
  assert.match(loading, /Loading/);
  assert.match(failed, /Unavailable/);
  assert.doesNotMatch(loading, />0</);
  assert.doesNotMatch(failed, />0</);
});

test('recent materials retain name, category, stock, and text status in an accessible table', () => {
  const markup = renderToStaticMarkup(createElement(RecentInventory, { materials, isLoading: false }));
  assert.match(markup, /role="table"/);
  for (const item of materials) {
    assert.ok(markup.includes(item.itemName));
    assert.ok(markup.includes(item.category));
    assert.ok(markup.includes(item.status));
  }
  assert.match(markup, /scope="col" role="columnheader"[^>]*>Stock</);
  assert.match(markup, /<caption[^>]*>Recently added inventory materials, newest first</);
});

test('recent materials handle empty, loading, unavailable, and stale states', () => {
  const render = (props) => renderToStaticMarkup(createElement(RecentInventory, props));
  assert.match(render({ materials: [] }), /No materials yet/);
  assert.match(render({ isLoading: true }), /Loading recent materials/);
  assert.match(render({ isLoading: false }), /Recent materials are unavailable/);
  assert.match(render({ materials, isUnavailable: true }), /Showing the last loaded materials/);
});

test('user-provided material names remain escaped', () => {
  const markup = renderToStaticMarkup(createElement(RecentInventory, {
    materials: [{ ...materials[0], itemName: '<script>alert(1)</script>' }],
  }));
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});

test('initial dashboard has one heading, a disabled refresh, and announces loading', () => {
  const auth = { expireSession: () => {} };
  const markup = renderToStaticMarkup(createElement(AuthContext.Provider, { value: auth }, createElement(DashboardPage)));
  assert.equal((markup.match(/<h1\b/g) || []).length, 1);
  assert.match(markup, />Dashboard<\/h1>/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /Loading your inventory/);
});

test('sidebar uses the dashboard route and keeps sign-out reachable', () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/dashboard'] },
    createElement(Sidebar, { onSignOut: () => {}, isSigningOut: false })));
  assert.match(markup, /aria-current="page"/);
  assert.match(markup, /href="\/dashboard"/);
  assert.match(markup, />Sign out<\/button>/);
});

test('dashboard failures have retryable messages without exposing server details', () => {
  assert.match(getDashboardError({}, true), /offline/);
  assert.match(getDashboardError({ response: { status: 429 } }), /Too many requests/);
  assert.match(getDashboardError({ response: { status: 403 } }), /permission/);
  assert.match(getDashboardError({ code: 'ECONNABORTED' }), /too long/);
  assert.doesNotMatch(getDashboardError(new Error('secret database URL')), /secret/);
});
