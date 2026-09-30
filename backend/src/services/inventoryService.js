import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import InventoryLog from '../models/InventoryLog.js';
import HttpError from '../utils/HttpError.js';
import { validateStock } from '../utils/inventoryValidation.js';

const transactionOptions = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  timeoutMS: 10000,
};

const findItem = async (id, session) => {
  const item = await Inventory.findById(id).session(session);
  if (!item) throw new HttpError(404, 'Inventory item not found');
  return item;
};

const recordStockChange = async (item, previousStock, newStock, session) => {
  if (previousStock === newStock) return;
  await InventoryLog.create([{
    inventoryId: item._id,
    itemName: item.itemName,
    actionType: newStock > previousStock ? 'ADD' : 'REMOVE',
    quantity: Math.abs(newStock - previousStock),
    previousStock,
    newStock,
  }], { session });
};

export const createItem = (input) => mongoose.connection.transaction(async (session) => {
  const item = new Inventory(input);
  await item.save({ session });
  await recordStockChange(item, 0, item.stock, session);
  return item;
}, transactionOptions);

export const updateItem = (id, input) => mongoose.connection.transaction(async (session) => {
  const item = await findItem(id, session);
  const previousStock = item.stock;
  item.set(input);
  await item.save({ session });
  await recordStockChange(item, previousStock, item.stock, session);
  return item;
}, transactionOptions);

export const adjustStock = (id, quantity, direction) => mongoose.connection.transaction(async (session) => {
  // Re-read inside every transaction attempt so concurrent writes can be retried safely.
  const item = await findItem(id, session);
  const previousStock = item.stock;
  if (direction === -1 && previousStock < quantity) {
    throw new HttpError(400, 'Insufficient stock');
  }
  item.stock = validateStock(previousStock + direction * quantity);
  await item.save({ session });
  await recordStockChange(item, previousStock, item.stock, session);
  return item;
}, transactionOptions);

export const deleteItem = (id) => mongoose.connection.transaction(async (session) => {
  const item = await findItem(id, session);
  await recordStockChange(item, item.stock, 0, session);
  await item.deleteOne({ session });
}, transactionOptions);
