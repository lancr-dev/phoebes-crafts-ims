import express from 'express';

import {
  createInventoryItem,
  getInventoryItems,
  getInventoryDashboard,
  getInventoryCategories,
  getInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  increaseStock,
  decreaseStock,
  getInventoryLogs,
  deleteInventoryLogs,
  exportInventoryLogs,
} from '../controllers/inventoryController.js';

const router = express.Router();

router.post('/', createInventoryItem);
router.get('/', getInventoryItems);
router.get('/dashboard', getInventoryDashboard);
router.get('/categories', getInventoryCategories);

router.get('/:id', getInventoryItem);
router.put('/:id', updateInventoryItem);
router.delete('/:id', deleteInventoryItem);

router.get('/logs/all', getInventoryLogs);
router.delete('/logs/all', deleteInventoryLogs);
router.get('/logs/export', exportInventoryLogs);

router.patch('/:id/increase', increaseStock);
router.patch('/:id/decrease', decreaseStock);

export default router;
