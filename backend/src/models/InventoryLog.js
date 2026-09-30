import mongoose from 'mongoose';

const inventoryLogSchema = new mongoose.Schema(
  {
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
    },

    actionType: {
      type: String,
      enum: ['ADD', 'REMOVE'],
      required: true,
    },

    itemName: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },

    previousStock: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },

    newStock: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
  },
  {
    timestamps: true,
  },
);

inventoryLogSchema.index({ createdAt: -1, _id: -1 });

inventoryLogSchema.pre('validate', function () {
  const expectedStock = this.actionType === 'ADD'
    ? this.previousStock + this.quantity
    : this.previousStock - this.quantity;
  if (this.newStock !== expectedStock) {
    this.invalidate('newStock', 'Stock values must match the logged adjustment');
  }
});

const InventoryLog = mongoose.model('InventoryLog', inventoryLogSchema);

export default InventoryLog;
