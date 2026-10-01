import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { parseLog, parseLogsPage, parseExportedLogs, formatLogDateTime, getLogsError } from '../src/utils/logData.js';
import { buildLogsPdf } from '../src/utils/exportLogsPdf.js';

const boundary = { throughId: '0123456789abcdef01234567', throughCreatedAt: '2025-10-01T18:05:06.000Z' };
const log = { _id: boundary.throughId, createdAt: boundary.throughCreatedAt, itemName: 'Piña thread', actionType: 'ADD', quantity: 12, previousStock: 0, newStock: 12 };
const pageData = { logs: [log], currentPage: 2, pageSize: 20, totalLogs: 21, totalPages: 2, clearThrough: boundary };
const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
after(() => vite.close());
const { default: apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js');
const api = await vite.ssrLoadModule('/src/services/logApi.js');
const { default: LogsTable } = await vite.ssrLoadModule('/src/components/LogsTable.jsx');
const { default: LogsPage } = await vite.ssrLoadModule('/src/pages/LogsPage.jsx');
const { default: Pagination } = await vite.ssrLoadModule('/src/components/InventoryPagination.jsx');
const { default: ClearLogsModal } = await vite.ssrLoadModule('/src/components/ClearLogsModal.jsx');
const { default: AuthContext } = await vite.ssrLoadModule('/src/auth/AuthContext.js');
const { default: Sidebar } = await vite.ssrLoadModule('/src/components/Sidebar.jsx');
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test('logs accept valid movement history, empty history, and a removed final page', () => {
  assert.deepEqual(parseLogsPage(pageData, 2), pageData);
  const empty = { logs: [], currentPage: 1, pageSize: 20, totalLogs: 0, totalPages: 0, clearThrough: null };
  assert.deepEqual(parseLogsPage(empty, 1), empty);
  const removed = { ...pageData, logs: [], totalLogs: 20, totalPages: 1 };
  assert.deepEqual(parseLogsPage(removed, 2), removed);
});

test('bad dates, stock calculations, actions, and negative quantities are rejected', () => {
  for (const invalid of [{ ...log, createdAt: 'invalid' }, { ...log, newStock: 11 }, { ...log, actionType: 'EDIT' },
    { ...log, quantity: -1 }, { ...log, previousStock: -1 }, { ...log, itemName: '' }]) assert.throws(() => parseLog(invalid));
  assert.deepEqual(parseLog({ ...log, actionType: 'REMOVE', previousStock: 12, newStock: 0 }), { ...log, actionType: 'REMOVE', previousStock: 12, newStock: 0 });
});

test('bad page metadata or missing boundary never becomes empty or successful history', () => {
  for (const invalid of [{}, { ...pageData, pageSize: 100 }, { ...pageData, currentPage: 1 },
    { ...pageData, totalPages: 3 }, { ...pageData, logs: [] }, { ...pageData, clearThrough: null }]) {
    assert.throws(() => parseLogsPage(invalid, 2));
  }
  assert.throws(() => parseExportedLogs([log], 21), /history changed/);
  assert.throws(() => parseExportedLogs([log, log], 2), /Invalid exported logs/);
});

test('dates use Manila time including the next-day rollover', () => {
  const timestamp = formatLogDateTime(log.createdAt);
  assert.match(timestamp.date, /02.*Oct.*2025|Oct.*02.*2025/);
  assert.match(timestamp.time, /2:05:06/);
});

test('list uses twenty rows, credentials, opt-in metadata, and cancellation', async () => {
  let request;
  apiClient.defaults.adapter = async (config) => { request = config; return { data: pageData, status: 200, config, headers: {} }; };
  const controller = new AbortController();
  assert.deepEqual(await api.getInventoryLogs(2, controller.signal), pageData);
  assert.equal(request.url, '/inventory/logs/all');
  assert.deepEqual(request.params, { page: 2, limit: 20, paginated: true });
  assert.equal(request.withCredentials, true);
  controller.abort();
  await assert.rejects(api.getInventoryLogs(2, controller.signal), (error) => error.code === 'ERR_CANCELED');
});

test('clear sends explicit confirmation and preserves the captured boundary', async () => {
  let request;
  apiClient.defaults.adapter = async (config) => { request = config; return { data: { deletedCount: 21 }, status: 200, config, headers: {} }; };
  assert.equal(await api.clearInventoryLogs(boundary), 21);
  assert.equal(request.method, 'delete');
  assert.equal(request.url, '/inventory/logs/all');
  assert.equal(request.withCredentials, true);
  assert.deepEqual(JSON.parse(request.data), { confirm: 'CLEAR', ...boundary });
  apiClient.defaults.adapter = async (config) => ({ data: {}, status: 200, config, headers: {} });
  await assert.rejects(api.clearInventoryLogs(boundary), /Invalid clearing response/);
});

test('export fetches the captured history beyond the currently displayed page', async () => {
  let request;
  const all = Array.from({ length: 21 }, (_, index) => ({ ...log, _id: (index + 1).toString(16).padStart(24, '0') }));
  apiClient.defaults.adapter = async (config) => { request = config; return { data: all, status: 200, config, headers: {} }; };
  const result = await api.exportInventoryLogs(boundary, 21);
  assert.equal(result.length, 21);
  assert.equal(request.url, '/inventory/logs/export');
  assert.deepEqual(request.params, boundary);
  assert.equal(request.withCredentials, true);
  assert.equal(request.timeout, 60000);
});

test('expired sessions propagate and log errors do not leak server details', async () => {
  apiClient.defaults.adapter = async () => { throw { response: { status: 401 } }; };
  await assert.rejects(api.getInventoryLogs(1), (error) => error.response.status === 401);
  assert.match(getLogsError({}, { action: 'clear' }), /could not be confirmed/);
  assert.match(getLogsError({}, { action: 'export' }), /History may have changed/);
  assert.doesNotMatch(getLogsError(new Error('private connection string')), /private connection/);
});

test('table displays every requested column, text actions, and historical material names', () => {
  const markup = render(LogsTable, { logs: [log, { ...log, _id: '0123456789abcdef01234568', actionType: 'REMOVE', previousStock: 12, newStock: 0 }] });
  for (const text of ['Date &amp; time', 'Material name', 'Action', 'Quantity', 'Before', 'After', 'Stock in', 'Stock out', 'Piña thread']) assert.ok(markup.includes(text));
  assert.match(markup, /role="table"/);
  assert.match(markup, /datetime="2025-10-01T18:05:06.000Z"/i);
  assert.match(markup, /Manila time/);
});

test('material names remain escaped and labels are retained for stacked mobile rows', () => {
  const markup = render(LogsTable, { logs: [{ ...log, itemName: '<script>alert(1)</script>' }] });
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
  assert.match(markup, /logs-mobile-label/);
  assert.match(markup, /scope="row" role="rowheader"/);
});

test('logs pagination has accurate ranges and the last-page control is disabled', () => {
  const markup = render(Pagination, { data: { ...pageData, totalItems: 21 }, page: 2, label: 'Logs', noun: 'logs' });
  assert.match(markup, /aria-label="Logs pagination"/);
  assert.match(markup, /Showing 21–21 of 21 logs/);
  assert.match(markup, /20 per page/);
  assert.match(markup, /disabled=""[^>]*aria-label="Next logs page"/);
});

test('clearing confirmation explains scope and pending or failed submissions cannot be repeated', () => {
  const pending = render(ClearLogsModal, { totalLogs: 21, isPending: true });
  assert.match(pending, /This cannot be undone/);
  assert.match(pending, /stock quantities stay unchanged/);
  assert.match(pending, /Newer records are kept/);
  assert.equal((pending.match(/disabled=""/g) || []).length, 3);
  const failed = render(ClearLogsModal, { totalLogs: 21, error: 'Refresh required.' });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /disabled="">Clear logs/);
  assert.match(failed, /type="button">Cancel/);
});

test('initial logs page announces loading and keeps export and clear unavailable', () => {
  const markup = renderToStaticMarkup(createElement(AuthContext.Provider, { value: { expireSession: () => {} } }, createElement(LogsPage)));
  assert.match(markup, />Inventory logs<\/h1>/);
  assert.match(markup, /Loading stock movements/);
  assert.match(markup, /Download PDF/);
  assert.match(markup, /Clear logs/);
  const sidebar = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/logs'] }, createElement(Sidebar, {})));
  assert.match(sidebar, /href="\/logs"/);
  assert.match(sidebar, /aria-current="page"/);
});

test('real PDF generation embeds the report font, paginates long history, and includes the final record', () => {
  const fontBase64 = readFileSync(new URL('../src/assets/NotoSans-Regular.ttf', import.meta.url)).toString('base64');
  const history = Array.from({ length: 75 }, (_, index) => ({ ...log, itemName: `Piña material ${index + 1} with a long descriptive name that should wrap across lines` }));
  const doc = buildLogsPdf(history, { fontBase64, boundary, generatedAt: new Date('2025-10-02T03:00:00Z') });
  assert.ok(doc.getNumberOfPages() > 1);
  assert.equal(doc.lastAutoTable.body.length, 75);
  assert.match(doc.lastAutoTable.body.at(-1).cells[1].raw, /material 75/);
  assert.ok(doc.output('arraybuffer').byteLength > 10000);
  assert.ok(doc.getFontList().NotoSans.includes('normal'));
});
