import Inventory from '../models/Inventory.js';

const emptySummary = {
  totalMaterials: 0,
  inStockMaterials: 0,
  lowStockMaterials: 0,
  outOfStockMaterials: 0,
};

export const getDashboard = async () => {
  // One aggregation keeps the totals and recent items in the same read.
  // Sorting before the facet can use the existing createdAt/_id index.
  const [result] = await Inventory.aggregate([
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalMaterials: { $sum: 1 },
              inStockMaterials: { $sum: { $cond: [{ $eq: ['$status', 'In Stock'] }, 1, 0] } },
              lowStockMaterials: { $sum: { $cond: [{ $eq: ['$status', 'Low Stock'] }, 1, 0] } },
              outOfStockMaterials: { $sum: { $cond: [{ $eq: ['$status', 'Out of Stock'] }, 1, 0] } },
            },
          },
          { $project: { _id: 0 } },
        ],
        recentMaterials: [
          { $limit: 5 },
          { $project: { itemName: 1, category: 1, stock: 1, status: 1, createdAt: 1 } },
        ],
      },
    },
  ]);

  return {
    summary: result?.summary[0] ?? { ...emptySummary },
    recentMaterials: result?.recentMaterials ?? [],
  };
};
