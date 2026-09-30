import express from 'express';

import {
  createInventoryItem,
  getInventoryItems,
  getInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  increaseStock,
  decreaseStock,
} from '../controllers/inventoryController.js';

const router = express.Router();

router.post('/', createInventoryItem);
router.get('/', getInventoryItems);
router.get('/:id', getInventoryItem);
router.put('/:id', updateInventoryItem);
router.delete('/:id', deleteInventoryItem);
router.patch('/:id/increase', increaseStock);
router.patch('/:id/decrease', decreaseStock);

export default router;
