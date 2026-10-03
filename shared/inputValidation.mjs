export const MAX_MATERIAL_TEXT_LENGTH = 50;
export const MAX_STOCK = 1_000_000;
export const MAX_USERNAME_LENGTH = 100;
export const MAX_PASSWORD_BYTES = 1024;

// Keep labels on one line while allowing Unicode, punctuation, and emoji.
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;
const encoder = new TextEncoder();

export const isSingleLineText = (value) => typeof value === 'string' && !controlCharacters.test(value);

export const isValidMaterialText = (value) => {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_MATERIAL_TEXT_LENGTH &&
    isSingleLineText(text) && /[^\s\p{Cf}]/u.test(text);
};

export const isStockValue = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_STOCK;
export const isQuantityValue = (value) => isStockValue(value) && value > 0;

// Do not coerce empty strings, decimals, exponents, or pasted separators.
export const isWholeNumberInput = (value) => typeof value === 'string' &&
  /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));

export const isValidUsername = (value) => typeof value === 'string' &&
  value.trim().length > 0 && value.length <= MAX_USERNAME_LENGTH && isSingleLineText(value);

// Password whitespace is significant and must never be trimmed.
export const isValidPassword = (value) => typeof value === 'string' && value.length > 0 &&
  encoder.encode(value).byteLength <= MAX_PASSWORD_BYTES;
