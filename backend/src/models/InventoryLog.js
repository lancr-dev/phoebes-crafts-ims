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

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    previousStock: {
      type: Number,
      required: true,
    },

    newStock: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const InventoryLog = mongoose.model('InventoryLog', inventoryLogSchema);

export default InventoryLog;
