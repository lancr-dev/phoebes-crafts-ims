import apiClient from './apiClient.js';
import { parseDashboard } from '../utils/dashboardData.js';
import { INVENTORY_PAGE_SIZE, parseInventoryPage, parseMaterial, parseInventoryCategories } from '../utils/inventoryData.js';

export const getInventoryDashboard = async (signal) => {
  const { data } = await apiClient.get('/inventory/dashboard', { signal });
  return parseDashboard(data);
};

export const getInventoryItems = async (page, signal, category = '') => {
  const { data } = await apiClient.get('/inventory', {
    params: { page, limit: INVENTORY_PAGE_SIZE, paginated: true, ...(category && { category }) }, signal,
  });
  return parseInventoryPage(data, page, category);
};

export const getInventoryCategories = async (signal) => {
  const { data } = await apiClient.get('/inventory/categories', { signal });
  return parseInventoryCategories(data);
};

export const createInventoryItem = async (input) => {
  const { data } = await apiClient.post('/inventory', input);
  return parseMaterial(data);
};

export const updateInventoryItem = async (id, input) => {
  const { data } = await apiClient.put(`/inventory/${id}`, input);
  return parseMaterial(data);
};

export const adjustInventoryStock = async (id, direction, quantity) => {
  if (!['increase', 'decrease'].includes(direction)) throw new Error('Invalid stock direction');
  const { data } = await apiClient.patch(`/inventory/${id}/${direction}`, { quantity });
  return parseMaterial(data);
};

export const deleteInventoryItem = async (id) => {
  await apiClient.delete(`/inventory/${id}`);
};
