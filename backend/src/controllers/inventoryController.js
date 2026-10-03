import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Inventory from '../models/Inventory.js';
import InventoryLog from '../models/InventoryLog.js';
import { getDashboard } from '../services/dashboardService.js';
import { getLogsPage, clearLogs } from '../services/logService.js';
import { parseLogBoundary, parseClearLogsInput } from '../utils/logValidation.js';
import {
  createItem,
  updateItem,
  adjustStock,
  deleteItem,
} from '../services/inventoryService.js';
import HttpError from '../utils/HttpError.js';
import logger from '../config/logger.js';
import {
  validateId,
  parseInventoryInput,
  parseQuantity,
  parsePagination,
  parseInventoryFilter,
} from '../utils/inventoryValidation.js';

export const createInventoryItem = async (req, res) => {
  const item = await createItem(parseInventoryInput(req.body));
  logger.info('Material created', { event: 'inventory.material_created', material_id: String(item._id), stock: item.stock });
  res.status(201).json(item);
};

export const getInventoryItems = async (req, res) => {
  const { page, skip, limit } = parsePagination(req.query);
  const filter = parseInventoryFilter(req.query);
  if (req.query.paginated !== undefined) {
    if (req.query.paginated !== 'true') {
      throw new HttpError(400, 'paginated must be true when provided');
    }
    // Count and select from the same aggregation; preserve the legacy array response below.
    const [result] = await Inventory.aggregate([
      ...(filter.category !== undefined ? [{ $match: filter }] : []),
      { $sort: { createdAt: -1, _id: -1 } },
      { $facet: {
        items: [
          { $skip: skip }, { $limit: limit },
          { $project: { itemName: 1, category: 1, stock: 1, status: 1 } },
        ],
        totals: [{ $count: 'totalItems' }],
      } },
    ]);
    const totalItems = result?.totals[0]?.totalItems ?? 0;
    return res.status(200).json({
      items: result?.items ?? [], currentPage: page, pageSize: limit,
      totalItems, totalPages: Math.ceil(totalItems / limit),
    });
  }
  const items = await Inventory.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit);
  res.status(200).json(items);
};

export const getInventoryCategories = async (_req, res) => {
  const categories = await Inventory.distinct('category');
  categories.sort((left, right) => left.localeCompare(right, 'en-PH'));
  res.status(200).json({ categories });
};

export const getInventoryDashboard = async (_req, res) => {
  res.status(200).json(await getDashboard());
};

export const getInventoryItem = async (req, res) => {
  validateId(req.params.id);
  const item = await Inventory.findById(req.params.id);
  if (!item) throw new HttpError(404, 'Inventory item not found');
  res.status(200).json(item);
};

export const updateInventoryItem = async (req, res) => {
  validateId(req.params.id);
  const input = parseInventoryInput(req.body, { partial: true });
  const item = await updateItem(req.params.id, input);
  logger.info('Material updated', { event: 'inventory.material_updated', material_id: String(item._id) });
  res.status(200).json(item);
};

export const deleteInventoryItem = async (req, res) => {
  validateId(req.params.id);
  await deleteItem(req.params.id);
  logger.info('Material deleted', { event: 'inventory.material_deleted', material_id: req.params.id });
  res.status(200).json({ message: 'Inventory item deleted successfully' });
};

export const increaseStock = async (req, res) => {
  validateId(req.params.id);
  const quantity = parseQuantity(req.body);
  const item = await adjustStock(req.params.id, quantity, 1);
  logger.info('Stock increased', { event: 'inventory.stock_increased', material_id: String(item._id), quantity, resulting_stock: item.stock });
  res.status(200).json(item);
};

export const decreaseStock = async (req, res) => {
  validateId(req.params.id);
  const quantity = parseQuantity(req.body);
  const item = await adjustStock(req.params.id, quantity, -1);
  logger.info('Stock decreased', { event: 'inventory.stock_decreased', material_id: String(item._id), quantity, resulting_stock: item.stock });
  res.status(200).json(item);
};

export const getInventoryLogs = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  if (req.query.paginated !== undefined) {
    if (req.query.paginated !== 'true') throw new HttpError(400, 'paginated must be true when provided');
    return res.status(200).json(await getLogsPage({ page, limit, skip }));
  }
  const totalLogs = await InventoryLog.countDocuments();
  const logs = await InventoryLog.find()
    .populate('inventoryId', 'itemName')
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit);
  res.status(200).json({
    logs,
    currentPage: page,
    totalPages: Math.ceil(totalLogs / limit),
    totalLogs,
  });
};

export const deleteInventoryLogs = async (req, res) => {
  const result = await clearLogs(parseClearLogsInput(req.body));
  logger.info('Inventory history cleared', { event: 'inventory.logs_cleared', deleted_count: result.deletedCount });
  res.status(200).json(result);
};

export const exportInventoryLogs = async (req, res) => {
  const filter = parseLogBoundary(req.query);
  const query = InventoryLog.find(filter);
  const cursor = (Object.keys(filter).length ? query.select('createdAt itemName actionType quantity previousStock newStock') : query.populate('inventoryId', 'itemName'))
    .sort({ createdAt: -1, _id: -1 })
    .lean()
    .cursor({ batchSize: 100 });

  try {
    // Fetch before sending headers so an initial database failure can return JSON.
    let log = await cursor.next();
    res.type('application/json');
    res.attachment('inventory-logs.json');
    async function* jsonLogs() {
      yield '[';
      let separator = '';
      while (log !== null) {
        yield separator + JSON.stringify(log);
        separator = ',';
        log = await cursor.next();
      }
      yield ']';
    }
    await pipeline(Readable.from(jsonLogs(), { objectMode: false }), res);
    logger.info('Inventory history exported', { event: 'inventory.logs_exported' });
  } finally {
    await cursor.close();
  }
};
