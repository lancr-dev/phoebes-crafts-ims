import apiClient from './apiClient.js';
import { parseDashboard } from '../utils/dashboardData.js';

export const getInventoryDashboard = async (signal) => {
  const { data } = await apiClient.get('/inventory/dashboard', { signal });
  return parseDashboard(data);
};
