import HttpError from './HttpError.js';

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
  if (!Number.isSafeInteger(stock) || stock < 0) {
    throw new HttpError(400, 'Stock must be a nonnegative safe integer');
  }
  return stock;
};

export const parseInventoryInput = (body, { partial = false } = {}) => {
  validateBody(body);
  const input = {};
  for (const field of ['itemName', 'category']) {
    if (!partial || Object.hasOwn(body, field)) {
      if (typeof body[field] !== 'string' || !body[field].trim()) {
        throw new HttpError(400, `${field} must be a nonempty string`);
      }
      input[field] = body[field].trim();
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
  if (!Number.isSafeInteger(body.quantity) || body.quantity <= 0) {
    throw new HttpError(400, 'Quantity must be a positive safe integer');
  }
  return body.quantity;
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
