const summaryFields = ['totalMaterials', 'inStockMaterials', 'lowStockMaterials', 'outOfStockMaterials'];
const statuses = ['In Stock', 'Low Stock', 'Out of Stock'];

export const parseDashboard = (data) => {
  const summary = data?.summary;
  if (!summary || summaryFields.some((field) => !Number.isSafeInteger(summary[field]) || summary[field] < 0)) {
    throw new Error('Invalid dashboard response');
  }
  if (summary.inStockMaterials + summary.lowStockMaterials + summary.outOfStockMaterials !== summary.totalMaterials) {
    throw new Error('Invalid dashboard totals');
  }
  if (!Array.isArray(data.recentMaterials) || data.recentMaterials.length > summary.totalMaterials || data.recentMaterials.some((item) =>
    !item || typeof item._id !== 'string' || !/^[a-f\d]{24}$/i.test(item._id) ||
    typeof item.itemName !== 'string' || !item.itemName.trim() ||
    typeof item.category !== 'string' || !item.category.trim() ||
    !Number.isSafeInteger(item.stock) || item.stock < 0 || !statuses.includes(item.status))) {
    throw new Error('Invalid recent materials');
  }
  return { summary, recentMaterials: data.recentMaterials };
};

export const getDashboardError = (error, offline = false) => {
  if (offline) return "You're offline. Reconnect, then refresh the dashboard.";
  if (error.response?.status === 429) return 'Too many requests. Wait a moment, then try again.';
  if (error.response?.status === 403) return 'You do not have permission to view the dashboard.';
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return 'The dashboard took too long to load. Please try again.';
  }
  return "Couldn't load the dashboard. Please try again.";
};
