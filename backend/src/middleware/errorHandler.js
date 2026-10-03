import mongoose from 'mongoose';
import HttpError from '../utils/HttpError.js';
import logger from '../config/logger.js';
import { describeError } from '../utils/logSanitization.js';

export default function errorHandler(error, req, res, _next) {
  if (res.headersSent) {
    logger.error('Inventory response interrupted', {
      event: 'http.response_interrupted',
      request_id: req.requestId,
      method: req.method,
      ...describeError(error),
    });
    res.destroy();
    return;
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large' });
  }
  if (
    error instanceof mongoose.Error.ValidationError ||
    error instanceof mongoose.Error.CastError
  ) {
    return res.status(400).json({ message: 'Invalid inventory data' });
  }
  if (error instanceof mongoose.Error.VersionError) {
    return res.status(409).json({
      message: 'The inventory item changed. Refresh before trying again.',
    });
  }
  // Avoid logging request bodies, connection strings, or database error messages.
  logger.error('Inventory request failed', {
    event: 'http.request_failed',
    request_id: req.requestId,
    method: req.method,
    ...describeError(error),
  });
  res.status(500).json({ message: 'An unexpected server error occurred' });
}
