import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { parseInventoryPage, parseInventoryCategories, validateMaterialForm, validateAdjustment, getInventoryError, requiresInventoryRefresh } from '../src/utils/inventoryData.js';
import { MAX_STOCK } from '../../shared/inputValidation.mjs';

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
const { default: CategoryFilter } = await vite.ssrLoadModule('/src/components/CategoryFilter.jsx');
const { default: AuthContext } = await vite.ssrLoadModule('/src/auth/AuthContext.js');
const { default: Sidebar } = await vite.ssrLoadModule('/src/components/Sidebar.jsx');
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test('Vite serves the shared public validation module in local development', async () => {
  const server = createHttpServer(vite.middlewares);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${origin}/src/utils/inventoryData.js`);
    assert.equal(response.status, 200);
    const source = await response.text();
    const sharedImport = /from\s+"([^"]*shared\/inputValidation\.mjs[^"]*)"/.exec(source);
    assert.ok(sharedImport, 'The client transform should resolve the shared module');
    const sharedResponse = await fetch(`${origin}${sharedImport[1]}`);
    assert.equal(sharedResponse.status, 200);
    assert.match(await sharedResponse.text(), /MAX_MATERIAL_TEXT_LENGTH/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

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

test('create and edit forms enforce label limits and reject malformed values without crashing', () => {
  for (const editing of [false, true]) {
    assert.deepEqual(validateMaterialForm({ itemName: 'a'.repeat(50), category: 'b'.repeat(50), stock: String(MAX_STOCK) }, editing).errors, {});
    for (const field of ['itemName', 'category']) {
      for (const value of ['a'.repeat(51), 'Yarn\nThread', '\u200b', null, {}, 42]) {
        assert.ok(validateMaterialForm({ itemName: 'Yarn', category: 'Thread', stock: '0', [field]: value }, editing).errors[field]);
      }
    }
  }
  assert.ok(validateMaterialForm(null).errors.itemName);
  for (const stock of ['1000001', '10000000', '1,000', '1e6', '0x10', '+1', '12 34', '1.0', null, 12]) {
    assert.ok(validateMaterialForm({ itemName: 'Yarn', category: 'Thread', stock }).errors.stock);
  }
  assert.equal(validateMaterialForm({ itemName: 'Yarn', category: 'Thread', stock: ' 00012 ' }).input.stock, 12);
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

test('adjustments honor the quantity cap, remaining capacity, available stock, and valid direction', () => {
  assert.equal(validateAdjustment(String(MAX_STOCK), { ...item, stock: 0 }, 'increase'), '');
  assert.equal(validateAdjustment(String(MAX_STOCK), { ...item, stock: MAX_STOCK }, 'decrease'), '');
  assert.equal(validateAdjustment('1', { ...item, stock: MAX_STOCK - 1 }, 'increase'), '');
  assert.match(validateAdjustment('2', { ...item, stock: MAX_STOCK - 1 }, 'increase'), /1,000,000/);
  for (const value of ['1000001', '1e3', '1,000', '1.0', '-1', '+1', null, 12]) assert.ok(validateAdjustment(value, item, 'increase'));
  assert.ok(validateAdjustment('1', item, 'invalid'));
  assert.ok(validateAdjustment('1', null, 'increase'));
  assert.ok(validateAdjustment('1', { ...item, stock: NaN }, 'increase'));
  assert.match(validateAdjustment('1', { ...item, stock: MAX_STOCK + 10 }, 'decrease'), /1,000,000/);
  assert.equal(validateAdjustment('10', { ...item, stock: MAX_STOCK + 10 }, 'decrease'), '');
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
  assert.equal((add.match(/maxLength="50"/g) || []).length, 2);
  assert.match(add, /Whole numbers from 0 to 1,000,000/);
  assert.match(add, /inputMode="numeric"/);
  assert.match(add, /aria-describedby=/);
  const edit = render(InventoryModal, { item });
  assert.match(edit, /value="Cotton yarn"/);
  assert.doesNotMatch(edit, /name="stock"/);
  assert.match(edit, /Save changes/);
});

test('stock and deletion dialogs explain their action and preserve visible errors', () => {
  const stock = render(StockAdjustmentModal, { item, direction: 'decrease', error: 'Please refresh.' });
  assert.match(stock, /Quantity to decrease/);
  assert.match(stock, /Enter 1 to 12 units/);
  assert.match(stock, /type="text" inputMode="numeric"/);
  assert.match(stock, /role="alert"/);
  const deletion = render(DeleteMaterialModal, { item, isPending: true });
  assert.match(deletion, /This cannot be undone/);
  assert.match(deletion, /stock history is retained/);
  assert.match(deletion, /Deleting/);
  assert.equal((deletion.match(/disabled=""/g) || []).length, 3);
});

test('full or empty stock disables impossible actions and dialogs explain the bounds', () => {
  const full = { ...item, stock: MAX_STOCK };
  const markup = render(InventoryTable, { items: [full], onAction: () => {} });
  assert.match(markup, /disabled=""[^>]*aria-label="Increase stock:/);
  const atCapacity = render(StockAdjustmentModal, { item: full, direction: 'increase' });
  assert.match(atCapacity, /Stock is at the 1,000,000 unit limit/);
  assert.match(atCapacity, /type="submit" disabled=""/);
  assert.match(atCapacity, /type="button">Cancel/);
  const empty = render(StockAdjustmentModal, { item: { ...item, stock: 0 }, direction: 'decrease' });
  assert.match(empty, /There is no stock to decrease/);
  assert.match(empty, /type="submit" disabled=""/);
  assert.match(render(StockAdjustmentModal, { item: { ...item, stock: MAX_STOCK - 3 }, direction: 'increase' }), /Enter 1 to 3 units/);
});

test('uncertain results and changed stock require refresh before resubmission', () => {
  const timeout = { code: 'ECONNABORTED' };
  assert.match(getInventoryError(timeout, { mutation: true }), /could not be confirmed/);
  assert.equal(requiresInventoryRefresh(timeout), true);
  assert.equal(requiresInventoryRefresh({ response: { status: 500 } }), true);
  assert.equal(requiresInventoryRefresh({ response: { status: 409 } }), true);
  assert.equal(requiresInventoryRefresh({ response: { status: 429 } }), false);
  assert.equal(requiresInventoryRefresh({ response: { status: 400, data: { message: 'Stock limit exceeded' } } }), true);
  assert.match(getInventoryError({ response: { status: 400, data: { message: 'Stock limit exceeded' } } }), /1,000,000.*refresh inventory/);
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

test('category options reject malformed and duplicate labels while allowing punctuation', () => {
  assert.deepEqual(parseInventoryCategories({ categories: [] }), []);
  assert.deepEqual(parseInventoryCategories({ categories: ['Beads.* (small)', 'Yarn'] }), ['Beads.* (small)', 'Yarn']);
  for (const invalid of [{}, { categories: null }, { categories: [''] }, { categories: [42] },
    { categories: [' Yarn '] }, { categories: ['Yarn', 'Yarn'] }]) assert.throws(() => parseInventoryCategories(invalid));
});

test('selected category is sent on every paginated request and unfiltered responses are rejected', async () => {
  const requests = [];
  const firstPage = { ...pageData, currentPage: 1, items: Array.from({ length: 20 }, (_, index) => ({ ...item, _id: (index + 1).toString(16).padStart(24, '0') })) };
  apiClient.defaults.adapter = async (config) => {
    requests.push(config);
    return { data: config.params.page === 1 ? firstPage : pageData, status: 200, config, headers: {} };
  };
  assert.deepEqual(await api.getInventoryItems(1, undefined, 'Yarn'), firstPage);
  // The final page contains one matching item and still counts twenty-one globally in the category.
  assert.deepEqual(await api.getInventoryItems(2, undefined, 'Yarn'), pageData);
  assert.ok(requests.every((request) => request.params.category === 'Yarn' && request.params.limit === 20));
  await assert.rejects(api.getInventoryItems(2, undefined, 'Beads'), /Invalid category filter response/);
});

test('category API fetches global labels using credentials and supports cancellation', async () => {
  let request;
  apiClient.defaults.adapter = async (config) => { request = config; return { data: { categories: ['Beads', 'Yarn'] }, status: 200, config, headers: {} }; };
  const controller = new AbortController();
  assert.deepEqual(await api.getInventoryCategories(controller.signal), ['Beads', 'Yarn']);
  assert.equal(request.url, '/inventory/categories');
  assert.equal(request.withCredentials, true);
  assert.equal(request.signal, controller.signal);
  controller.abort();
  await assert.rejects(api.getInventoryCategories(controller.signal), (error) => error.code === 'ERR_CANCELED');
});

test('category filter has a named disclosure, native labeled select, and a clear action', () => {
  const markup = render(CategoryFilter, { category: 'Yarn', categories: ['Beads', 'Yarn'], onChange: () => {} });
  assert.match(markup, /Filter by category/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-controls=/);
  assert.match(markup, /hidden=""/);
  assert.match(markup, /<label[^>]*>Category<\/label>/);
  assert.match(markup, /<option value="">All categories<\/option>/);
  assert.match(markup, /<option value="Yarn" selected="">Yarn<\/option>/);
  assert.match(markup, /Clear filter/);
});

test('filter retains a removed selected category and escapes stored labels', () => {
  const markup = render(CategoryFilter, { category: 'Removed category', categories: ['<script>'], onChange: () => {} });
  assert.match(markup, /value="Removed category" selected=""/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
});

test('categories distinguish loading, empty, failure, and pending-save controls', () => {
  assert.match(render(CategoryFilter, { category: '', categories: [], isLoading: true }), /Loading categories/);
  assert.match(render(CategoryFilter, { category: '', categories: [], isLoading: false }), /No categories yet/);
  const failed = render(CategoryFilter, { category: '', categories: [], error: 'Unable to load.' });
  assert.match(failed, /Retry categories/);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /<select[^>]*disabled=""/);
  const saving = render(CategoryFilter, { category: 'Yarn', categories: ['Yarn'], disabled: true });
  assert.equal((saving.match(/disabled=""/g) || []).length, 3);
});
