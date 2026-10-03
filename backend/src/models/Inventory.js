import mongoose from 'mongoose';
import { MAX_MATERIAL_TEXT_LENGTH, MAX_STOCK, isValidMaterialText } from '../../../shared/inputValidation.mjs';

const inventorySchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_MATERIAL_TEXT_LENGTH,
      validate: { validator: isValidMaterialText, message: 'Material name must be a valid single-line label' },
    },

    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_MATERIAL_TEXT_LENGTH,
      validate: { validator: isValidMaterialText, message: 'Category must be a valid single-line label' },
    },

    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: MAX_STOCK,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Stock must be a safe integer',
      },
    },

    status: {
      type: String,
      enum: ['In Stock', 'Low Stock', 'Out of Stock'],
      default: 'Out of Stock',
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

inventorySchema.index({ createdAt: -1, _id: -1 });
inventorySchema.index({ category: 1, createdAt: -1, _id: -1 });

inventorySchema.pre('save', function () {
  if (this.stock === 0) {
    this.status = 'Out of Stock';
  } else if (this.stock <= 10) {
    this.status = 'Low Stock';
  } else {
    this.status = 'In Stock';
  }
});

const Inventory = mongoose.model('Inventory', inventorySchema);

export default Inventory;
