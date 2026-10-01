import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { parseInventoryPage, validateMaterialForm, validateAdjustment, getInventoryError, requiresInventoryRefresh } from '../src/utils/inventoryData.js';

const item = { _id: '0123456789abcdef01234567', itemName: 'Cotton yarn', category: 'Yarn', stock: 12, status: 'In Stock' };
const pageData = { items: [item], currentPage: 2, pageSize: 20, totalItems: 21, totalPages: 2 };
const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
after(() => vite.close());
const { default: apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js');
const api = await vite.ssrLoadModule('/src/services/inventoryApi.js');
const { default: InventoryTable } = await vite.ssrLoadModule('/src/components/InventoryTable.jsx');
const { default: InventoryPagination } = await vite.ssrLoadModule('/src/components/InventoryPagination.jsx');
const { default: InventoryModal } = await vite.ssrLoadModule('/src/components/InventoryModal.jsx');
const { default: StockAdjustmentModal } = await vite.ssrLoadModule('/src/components/StockAdjustmentModal.jsx');
const { default: DeleteMaterialModal } = await vite.ssrLoadModule('/src/components/DeleteMaterialModal.jsx');
const { default: InventoryPage } = await vite.ssrLoadModule('/src/pages/InventoryPage.jsx');
const { default: AuthContext } = await vite.ssrLoadModule('/src/auth/AuthContext.js');
const { default: Sidebar } = await vite.ssrLoadModule('/src/components/Sidebar.jsx');
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test('pagination accepts a partial final page, empty collection, and removed last page', () => {
  assert.deepEqual(parseInventoryPage(pageData, 2), pageData);
  const empty = { items: [], currentPage: 1, pageSize: 20, totalItems: 0, totalPages: 0 };
  assert.deepEqual(parseInventoryPage(empty, 1), empty);
  const removed = { items: [], currentPage: 2, pageSize: 20, totalItems: 20, totalPages: 1 };
  assert.deepEqual(parseInventoryPage(removed, 2), removed);
});

test('malformed counts, wrong pages, incomplete results, and invalid items fail visibly', () => {
  for (const invalid of [
    {}, { ...pageData, pageSize: 100 }, { ...pageData, currentPage: 1 },
    { ...pageData, totalItems: -1 }, { ...pageData, totalPages: 3 },
    { ...pageData, items: [] }, { ...pageData, items: [{ ...item, stock: 1.5 }] },
    { ...pageData, items: [{ ...item, _id: '../private' }] },
    { ...pageData, items: [{ ...item, status: 'Unknown' }] },
  ]) assert.throws(() => parseInventoryPage(invalid, 2));
  assert.throws(() => parseInventoryPage({ ...pageData, items: [item, item], totalItems: 22 }, 2), /Duplicate/);
});

test('create form trims details, permits zero, and rejects invalid whole stock values', () => {
  assert.deepEqual(validateMaterialForm({ itemName: ' Yarn ', category: ' Thread ', stock: '0' }), {
    errors: {}, input: { itemName: 'Yarn', category: 'Thread', stock: 0 },
  });
  for (const stock of ['', ' ', '-1', '1.5', '1e3', '9007199254740992']) {
    assert.ok(validateMaterialForm({ itemName: 'Yarn', category: 'Thread', stock }).errors.stock);
  }
  const result = validateMaterialForm({ itemName: ' ', category: '', stock: '0' });
  assert.ok(result.errors.itemName);
  assert.ok(result.errors.category);
});

test('editing excludes stale stock and status from the request payload', () => {
  const result = validateMaterialForm({ itemName: 'Yarn', category: 'Thread', stock: '500', status: 'In Stock' }, true);
  assert.deepEqual(result, { errors: {}, input: { itemName: 'Yarn', category: 'Thread' } });
});

test('stock changes reject zero, fractions, insufficient stock, and overflow', () => {
  for (const value of ['', '0', '-1', '1.5', '9007199254740992']) assert.ok(validateAdjustment(value, item, 'increase'));
  assert.ok(validateAdjustment('13', item, 'decrease'));
  assert.equal(validateAdjustment('12', item, 'decrease'), '');
  assert.equal(validateAdjustment('2', item, 'increase'), '');
  assert.ok(validateAdjustment('1', { ...item, stock: Number.MAX_SAFE_INTEGER }, 'increase'));
});

test('list requests use twenty-per-page metadata, credentials, and cancellation', async () => {
  let request;
  apiClient.defaults.adapter = async (config) => { request = config; return { data: pageData, status: 200, config, headers: {} }; };
  const controller = new AbortController();
  assert.deepEqual(await api.getInventoryItems(2, controller.signal), pageData);
  assert.equal(request.url, '/inventory');
  assert.deepEqual(request.params, { page: 2, limit: 20, paginated: true });
  assert.equal(request.withCredentials, true);
  assert.equal(request.signal, controller.signal);
  controller.abort();
  await assert.rejects(api.getInventoryItems(2, controller.signal), (error) => error.code === 'ERR_CANCELED');
});

test('all mutations use authenticated endpoints and the expected payload', async () => {
  const requests = [];
  apiClient.defaults.adapter = async (config) => { requests.push(config); return { data: item, status: 200, config, headers: {} }; };
  await api.createInventoryItem({ itemName: 'Yarn', category: 'Thread', stock: 0 });
  await api.updateInventoryItem(item._id, { itemName: 'Yarn', category: 'Thread' });
  await api.adjustInventoryStock(item._id, 'increase', 3);
  await api.adjustInventoryStock(item._id, 'decrease', 2);
  await api.deleteInventoryItem(item._id);
  assert.deepEqual(requests.map(({ method, url }) => [method, url]), [
    ['post', '/inventory'], ['put', `/inventory/${item._id}`],
    ['patch', `/inventory/${item._id}/increase`], ['patch', `/inventory/${item._id}/decrease`], ['delete', `/inventory/${item._id}`],
  ]);
  assert.deepEqual(JSON.parse(requests[2].data), { quantity: 3 });
  assert.deepEqual(JSON.parse(requests[3].data), { quantity: 2 });
  assert.ok(requests.every((request) => request.withCredentials));
  await assert.rejects(api.adjustInventoryStock(item._id, 'invalid', 1), /Invalid stock direction/);
  assert.equal(requests.length, 5);
});

test('API failures and malformed success responses are never converted into success', async () => {
  apiClient.defaults.adapter = async () => { throw { response: { status: 401 } }; };
  await assert.rejects(api.getInventoryItems(1), (error) => error.response.status === 401);
  await assert.rejects(api.createInventoryItem({}), (error) => error.response.status === 401);
  apiClient.defaults.adapter = async (config) => ({ data: {}, status: 200, config, headers: {} });
  await assert.rejects(api.createInventoryItem({}), /Invalid inventory material/);
});

test('table retains all requested fields and provides named icon actions', () => {
  const markup = render(InventoryTable, { items: [item], onAction: () => {} });
  assert.match(markup, /role="table"/);
  for (const label of ['Material', 'Category', 'Stock', 'Status', 'Actions', item.itemName, item.category, item.status]) assert.ok(markup.includes(label));
  for (const label of ['Increase stock', 'Decrease stock', 'Edit material', 'Delete material']) assert.ok(markup.includes(`aria-label="${label}: ${item.itemName}"`));
});

test('zero stock disables decrease and user-provided material content is escaped', () => {
  const markup = render(InventoryTable, { items: [{ ...item, itemName: '<script>alert(1)</script>', stock: 0, status: 'Out of Stock' }], onAction: () => {} });
  assert.match(markup, /disabled=""[^>]*aria-label="Decrease stock:/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});

test('pagination announces ranges, limits, and disabled first and last page controls', () => {
  const last = render(InventoryPagination, { data: pageData, page: 2, onPageChange: () => {} });
  assert.match(last, /Showing 21–21 of 21 materials/);
  assert.match(last, /20 per page/);
  assert.match(last, /disabled=""[^>]*aria-label="Next inventory page"/);
  const empty = render(InventoryPagination, { data: { items: [], currentPage: 1, totalPages: 0, totalItems: 0 }, page: 1 });
  assert.match(empty, /Page 1 of 1/);
  assert.equal((empty.match(/disabled=""/g) || []).length, 2);
  const loading = render(InventoryPagination, { page: 3, isLoading: true, disabled: true });
  assert.match(loading, /Loading page 3/);
});

test('add and edit dialogs have persistent labels and edit does not offer absolute stock overwrite', () => {
  const add = render(InventoryModal, {});
  assert.match(add, /<dialog[^>]*aria-labelledby=/);
  for (const label of ['Material name', 'Category', 'Initial stock']) assert.ok(add.includes(label));
  const edit = render(InventoryModal, { item });
  assert.match(edit, /value="Cotton yarn"/);
  assert.doesNotMatch(edit, /name="stock"/);
  assert.match(edit, /Save changes/);
});

test('stock and deletion dialogs explain their action and preserve visible errors', () => {
  const stock = render(StockAdjustmentModal, { item, direction: 'decrease', error: 'Please refresh.' });
  assert.match(stock, /Quantity to decrease/);
  assert.match(stock, /max="12"/);
  assert.match(stock, /role="alert"/);
  const deletion = render(DeleteMaterialModal, { item, isPending: true });
  assert.match(deletion, /This cannot be undone/);
  assert.match(deletion, /stock history is retained/);
  assert.match(deletion, /Deleting/);
  assert.equal((deletion.match(/disabled=""/g) || []).length, 3);
});

test('uncertain results and changed stock require refresh before resubmission', () => {
  const timeout = { code: 'ECONNABORTED' };
  assert.match(getInventoryError(timeout, { mutation: true }), /could not be confirmed/);
  assert.equal(requiresInventoryRefresh(timeout), true);
  assert.equal(requiresInventoryRefresh({ response: { status: 500 } }), true);
  assert.equal(requiresInventoryRefresh({ response: { status: 409 } }), true);
  assert.equal(requiresInventoryRefresh({ response: { status: 429 } }), false);
  assert.match(getInventoryError({ response: { status: 400, data: { message: 'Insufficient stock' } } }), /not enough stock/);
  assert.doesNotMatch(getInventoryError(new Error('database secret')), /database secret/);
});

test('blocked resubmission keeps cancel available so inventory can refresh', () => {
  const markup = render(InventoryModal, { error: 'Refresh required.', isSubmitDisabled: true });
  assert.match(markup, /type="submit" disabled=""/);
  assert.match(markup, /type="button">Cancel/);
});

test('inventory route starts in a loading state and sidebar highlights the inventory tab', () => {
  const auth = { expireSession: () => {} };
  const markup = renderToStaticMarkup(createElement(AuthContext.Provider, { value: auth }, createElement(InventoryPage)));
  assert.equal((markup.match(/<h1\b/g) || []).length, 1);
  assert.match(markup, />Inventory<\/h1>/);
  assert.match(markup, /Loading materials/);
  assert.match(markup, /Add new material/);
  const sidebar = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/inventory'] }, createElement(Sidebar, {})));
  assert.match(sidebar, /href="\/inventory"/);
  assert.match(sidebar, /aria-current="page"/);
});
