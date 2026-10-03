import HttpError from './HttpError.js';
import { MAX_MATERIAL_TEXT_LENGTH, MAX_STOCK, isValidMaterialText, isStockValue, isQuantityValue } from '../../../shared/inputValidation.mjs';

export const validateId = (id) => {
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
    throw new HttpError(400, 'Invalid inventory item ID');
  }
};

const validateBody = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'A JSON object body is required');
  }
};

export const validateStock = (stock) => {
  if (!isStockValue(stock)) {
    throw new HttpError(400, `Stock must be a whole number between 0 and ${MAX_STOCK.toLocaleString('en-PH')}`);
  }
  return stock;
};

export const validateQuantity = (quantity) => {
  if (!isQuantityValue(quantity)) {
    throw new HttpError(400, `Quantity must be a whole number between 1 and ${MAX_STOCK.toLocaleString('en-PH')}`);
  }
  return quantity;
};

const validateMaterialText = (value, field) => {
  if (!isValidMaterialText(value)) {
    throw new HttpError(400, `${field} must contain 1 to ${MAX_MATERIAL_TEXT_LENGTH} characters without control characters`);
  }
  return value.trim();
};

export const parseInventoryInput = (body, { partial = false } = {}) => {
  validateBody(body);
  const input = {};
  for (const field of ['itemName', 'category']) {
    if (!partial || Object.hasOwn(body, field)) {
      input[field] = validateMaterialText(body[field], field === 'itemName' ? 'Material name' : 'Category');
    }
  }
  if (Object.hasOwn(body, 'stock')) {
    input.stock = validateStock(body.stock);
  } else if (!partial) {
    input.stock = 0;
  }
  if (partial && Object.keys(input).length === 0) {
    throw new HttpError(400, 'Provide itemName, category, or stock to update');
  }
  return input;
};

export const parseQuantity = (body) => {
  validateBody(body);
  return validateQuantity(body.quantity);
};

export const parseInventoryFilter = (query) => {
  if (query.category === undefined) return {};
  return { category: validateMaterialText(query.category, 'Category') };
};

export const parsePagination = (query) => {
  const parse = (value, fallback, field) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
      throw new HttpError(400, `${field} must be a positive integer`);
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw new HttpError(400, `${field} is too large`);
    return number;
  };
  const page = parse(query.page, 1, 'page');
  const limit = parse(query.limit, 20, 'limit');
  if (limit > 100) throw new HttpError(400, 'limit must not exceed 100');
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip))
    throw new HttpError(400, 'page is too large');
  return { page, limit, skip };
};
