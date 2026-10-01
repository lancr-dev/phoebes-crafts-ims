import apiClient from './apiClient.js';
import { LOGS_PAGE_SIZE, parseLogsPage, parseExportedLogs } from '../utils/logData.js';

export const getInventoryLogs = async (page, signal) => {
  const { data } = await apiClient.get('/inventory/logs/all', {
    params: { page, limit: LOGS_PAGE_SIZE, paginated: true }, signal,
  });
  return parseLogsPage(data, page);
};

export const clearInventoryLogs = async (boundary) => {
  const { data } = await apiClient.delete('/inventory/logs/all', { data: { confirm: 'CLEAR', ...boundary } });
  if (!Number.isSafeInteger(data?.deletedCount) || data.deletedCount < 0) throw new Error('Invalid clearing response');
  return data.deletedCount;
};

export const exportInventoryLogs = async (boundary, totalLogs, signal) => {
  const { data } = await apiClient.get('/inventory/logs/export', { params: boundary, signal, timeout: 60000 });
  return parseExportedLogs(data, totalLogs);
};
