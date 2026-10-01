export const LOGS_PAGE_SIZE = 20;

const validId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const validDate = (value) => typeof value === 'string' && Number.isFinite(new Date(value).getTime());

export const parseLog = (log) => {
  if (!log || !validId(log._id) || !validDate(log.createdAt) ||
    typeof log.itemName !== 'string' || !log.itemName.trim() || !['ADD', 'REMOVE'].includes(log.actionType) ||
    !Number.isSafeInteger(log.quantity) || log.quantity <= 0 ||
    !Number.isSafeInteger(log.previousStock) || log.previousStock < 0 ||
    !Number.isSafeInteger(log.newStock) || log.newStock < 0 ||
    log.newStock !== log.previousStock + (log.actionType === 'ADD' ? log.quantity : -log.quantity)) {
    throw new Error('Invalid inventory log');
  }
  return { _id: log._id, createdAt: log.createdAt, itemName: log.itemName, actionType: log.actionType,
    quantity: log.quantity, previousStock: log.previousStock, newStock: log.newStock };
};

export const parseLogsPage = (data, page) => {
  if (!data || !Array.isArray(data.logs) || data.currentPage !== page || data.pageSize !== LOGS_PAGE_SIZE ||
    !Number.isSafeInteger(data.totalLogs) || data.totalLogs < 0 || data.totalPages !== Math.ceil(data.totalLogs / LOGS_PAGE_SIZE)) {
    throw new Error('Invalid logs page');
  }
  const boundary = data.clearThrough;
  if (data.totalLogs > 0 ? !boundary || !validId(boundary.throughId) || !validDate(boundary.throughCreatedAt) : boundary !== null) {
    throw new Error('Invalid log boundary');
  }
  const expectedLength = Math.min(LOGS_PAGE_SIZE, Math.max(0, data.totalLogs - (page - 1) * LOGS_PAGE_SIZE));
  if (data.logs.length !== expectedLength) throw new Error('Invalid logs page size');
  const logs = data.logs.map(parseLog);
  if (new Set(logs.map((log) => log._id)).size !== logs.length) throw new Error('Duplicate logs');
  return { ...data, logs };
};

export const parseExportedLogs = (data, expectedCount) => {
  if (!Array.isArray(data) || data.length !== expectedCount) throw new Error('Log history changed. Refresh and try again.');
  const logs = data.map(parseLog);
  if (new Set(logs.map((log) => log._id)).size !== logs.length) throw new Error('Invalid exported logs');
  return logs;
};

const dateFormat = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'Asia/Manila' });
const timeFormat = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Manila' });
export const formatLogDateTime = (value) => ({ date: dateFormat.format(new Date(value)), time: timeFormat.format(new Date(value)) });
export const logActionLabel = (actionType) => actionType === 'ADD' ? 'Stock in' : 'Stock out';

export const getLogsError = (error, { action = 'load', offline = false } = {}) => {
  if (offline) return "You're offline. Reconnect, then refresh logs.";
  const status = error.response?.status;
  if (status === 429) return 'Too many requests. Please try again when the countdown finishes.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 400) return 'This log selection could not be accepted. Refresh and try again.';
  if (action === 'clear') return 'The clearing result could not be confirmed. Close this dialog to refresh logs before trying again.';
  if (action === 'export') return "Couldn't download the report. History may have changed. Refresh and try again.";
  return "Couldn't load inventory logs. Please try again.";
};
