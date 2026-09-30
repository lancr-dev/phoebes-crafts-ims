import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
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
