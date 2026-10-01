import mongoose from 'mongoose';
import HttpError from './HttpError.js';
import { validateId } from './inventoryValidation.js';

export const parseLogBoundary = (input, { required = false } = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'A log boundary is required');
  }
  const { throughId, throughCreatedAt } = input;
  if (!required && throughId === undefined && throughCreatedAt === undefined) return {};
  validateId(throughId);
  const date = typeof throughCreatedAt === 'string' ? new Date(throughCreatedAt) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString() !== throughCreatedAt || date.getTime() > Date.now()) {
    throw new HttpError(400, 'Invalid log boundary date');
  }
  return { $or: [
    { createdAt: { $lt: date } },
    { createdAt: date, _id: { $lte: new mongoose.Types.ObjectId(throughId) } },
  ] };
};

export const parseClearLogsInput = (body) => {
  if (!body || body.confirm !== 'CLEAR') throw new HttpError(400, 'Explicit log clearing confirmation is required');
  return parseLogBoundary(body, { required: true });
};
