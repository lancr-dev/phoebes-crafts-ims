import { MAX_MATERIAL_TEXT_LENGTH, MAX_STOCK, isValidMaterialText, isStockValue, isWholeNumberInput } from '../../../shared/inputValidation.mjs';

export const INVENTORY_PAGE_SIZE = 20;

const statuses = ['In Stock', 'Low Stock', 'Out of Stock'];

export const parseMaterial = (item) => {
  if (!item || typeof item._id !== 'string' || !/^[a-f\d]{24}$/i.test(item._id) ||
    typeof item.itemName !== 'string' || !item.itemName.trim() ||
    typeof item.category !== 'string' || !item.category.trim() ||
    !Number.isSafeInteger(item.stock) || item.stock < 0 || !statuses.includes(item.status)) {
    throw new Error('Invalid inventory material');
  }
  return { _id: item._id, itemName: item.itemName, category: item.category, stock: item.stock, status: item.status };
};

export const parseInventoryPage = (data, requestedPage, category = '') => {
  if (!data || !Array.isArray(data.items) || data.currentPage !== requestedPage ||
    data.pageSize !== INVENTORY_PAGE_SIZE ||
    !Number.isSafeInteger(data.totalItems) || data.totalItems < 0 ||
    data.totalPages !== Math.ceil(data.totalItems / INVENTORY_PAGE_SIZE)) {
    throw new Error('Invalid inventory page');
  }
  const expectedLength = Math.min(INVENTORY_PAGE_SIZE, Math.max(0, data.totalItems - (requestedPage - 1) * INVENTORY_PAGE_SIZE));
  if (data.items.length !== expectedLength) throw new Error('Invalid inventory page size');
  const items = data.items.map(parseMaterial);
  if (category && items.some((item) => item.category !== category)) throw new Error('Invalid category filter response');
  if (new Set(items.map((item) => item._id)).size !== items.length) throw new Error('Duplicate inventory materials');
  return { ...data, items };
};

export const parseInventoryCategories = (data) => {
  const categories = data?.categories;
  if (!Array.isArray(categories) || categories.some((category) =>
    typeof category !== 'string' || !category.trim() || category !== category.trim()) ||
    new Set(categories).size !== categories.length) {
    throw new Error('Invalid inventory categories');
  }
  return categories;
};

export const validateMaterialForm = (values, isEditing = false) => {
  const errors = {};
  const itemName = typeof values?.itemName === 'string' ? values.itemName.trim() : '';
  const category = typeof values?.category === 'string' ? values.category.trim() : '';
  for (const [field, label, value] of [['itemName', 'material name', itemName], ['category', 'category', category]]) {
    if (!value) errors[field] = `Enter a ${label}.`;
    else if (value.length > MAX_MATERIAL_TEXT_LENGTH) errors[field] = `Use ${MAX_MATERIAL_TEXT_LENGTH} characters or fewer.`;
    else if (!isValidMaterialText(value)) errors[field] = `Enter a ${label} on one line without control characters.`;
  }
  const stock = isWholeNumberInput(values?.stock) ? Number(values.stock) : NaN;
  if (!isEditing && !isStockValue(stock)) errors.stock = `Enter a whole number from 0 to ${MAX_STOCK.toLocaleString('en-PH')}.`;
  return { errors, input: { itemName, category, ...(!isEditing && { stock }) } };
};

export const validateAdjustment = (value, item, direction) => {
  if (direction !== 'increase' && direction !== 'decrease') return 'Choose increase or decrease stock.';
  if (!Number.isSafeInteger(item?.stock) || item.stock < 0) return 'Close this dialog and refresh inventory.';
  if (!isWholeNumberInput(value) || Number(value) < 1 || Number(value) > MAX_STOCK) {
    return `Enter a whole number from 1 to ${MAX_STOCK.toLocaleString('en-PH')}.`;
  }
  const quantity = Number(value);
  if (direction === 'decrease' && quantity > item.stock) return 'Quantity exceeds the available stock.';
  const resultingStock = item.stock + (direction === 'increase' ? quantity : -quantity);
  if (resultingStock > MAX_STOCK) return `Stock cannot exceed ${MAX_STOCK.toLocaleString('en-PH')}.`;
  return '';
};

export const getInventoryError = (error, { mutation = false, offline = false } = {}) => {
  if (offline) return mutation ? "You're offline. Reconnect and refresh inventory before trying again." : "You're offline. Reconnect, then refresh inventory.";
  const status = error.response?.status;
  if (status === 429) return 'Too many requests. Please try again when the countdown finishes.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'This material no longer exists. Close this dialog and refresh inventory.';
  if (status === 409) return 'This material changed. Close this dialog and refresh before trying again.';
  if (status === 400 && error.response?.data?.message === 'Insufficient stock') return 'There is not enough stock. Close this dialog and refresh inventory.';
  if (status === 400 && error.response?.data?.message === 'Stock limit exceeded') return `Stock cannot exceed ${MAX_STOCK.toLocaleString('en-PH')}. Close this dialog and refresh inventory.`;
  if (status === 400) return 'The material data could not be accepted. Check your entries.';
  if (mutation && (!error.response || status >= 500 || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
    return 'The result could not be confirmed. Close this dialog and refresh inventory before trying again.';
  }
  return mutation ? "Couldn't save the change. Please try again." : "Couldn't load inventory. Please try again.";
};

export const requiresInventoryRefresh = (error) => {
  const status = error.response?.status;
  return !status || status >= 500 || status === 404 || status === 409 ||
    (status === 400 && ['Insufficient stock', 'Stock limit exceeded'].includes(error.response?.data?.message));
};
