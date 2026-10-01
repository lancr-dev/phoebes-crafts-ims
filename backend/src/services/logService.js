import InventoryLog from '../models/InventoryLog.js';

export const getLogsPage = async ({ page, limit, skip }) => {
  const [result] = await InventoryLog.aggregate([
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        logs: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              createdAt: 1,
              itemName: 1,
              actionType: 1,
              quantity: 1,
              previousStock: 1,
              newStock: 1,
            },
          },
        ],
        totals: [{ $count: 'totalLogs' }],
        latest: [{ $limit: 1 }, { $project: { createdAt: 1 } }],
      },
    },
  ]);
  const totalLogs = result?.totals[0]?.totalLogs ?? 0;
  const latest = result?.latest[0];
  return {
    logs: result?.logs ?? [],
    currentPage: page,
    pageSize: limit,
    totalLogs,
    totalPages: Math.ceil(totalLogs / limit),
    clearThrough: latest
      ? { throughId: latest._id, throughCreatedAt: latest.createdAt }
      : null,
  };
};

// Clearing history has no effect on inventory quantities. The boundary preserves newer records.
export const clearLogs = async (filter) => {
  const { deletedCount } = await InventoryLog.deleteMany(filter);
  return { message: 'Inventory logs cleared successfully', deletedCount };
};
