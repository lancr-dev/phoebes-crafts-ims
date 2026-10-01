import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Inventory from '../models/Inventory.js';
import InventoryLog from '../models/InventoryLog.js';
import {
  createItem,
  updateItem,
  adjustStock,
  deleteItem,
} from '../services/inventoryService.js';
import HttpError from '../utils/HttpError.js';
import {
  validateId,
  parseInventoryInput,
  parseQuantity,
  parsePagination,
} from '../utils/inventoryValidation.js';

export const createInventoryItem = async (req, res) => {
  const item = await createItem(parseInventoryInput(req.body));
  res.status(201).json(item);
};

export const getInventoryItems = async (req, res) => {
  const { skip, limit } = parsePagination(req.query);
  const items = await Inventory.find()
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit);
  res.status(200).json(items);
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
  res.status(200).json(await updateItem(req.params.id, input));
};

export const deleteInventoryItem = async (req, res) => {
  validateId(req.params.id);
  await deleteItem(req.params.id);
  res.status(200).json({ message: 'Inventory item deleted successfully' });
};

export const increaseStock = async (req, res) => {
  validateId(req.params.id);
  const quantity = parseQuantity(req.body);
  res.status(200).json(await adjustStock(req.params.id, quantity, 1));
};

export const decreaseStock = async (req, res) => {
  validateId(req.params.id);
  const quantity = parseQuantity(req.body);
  res.status(200).json(await adjustStock(req.params.id, quantity, -1));
};

export const getInventoryLogs = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
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

export const deleteInventoryLogs = (_req, _res) => {
  throw new HttpError(403, 'Bulk log deletion is disabled');
};

export const exportInventoryLogs = async (_req, res) => {
  const cursor = InventoryLog.find()
    .populate('inventoryId', 'itemName')
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
  } finally {
    await cursor.close();
  }
};
