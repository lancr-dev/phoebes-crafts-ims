import mongoose from 'mongoose';
import HttpError from '../utils/HttpError.js';

export default function errorHandler(error, req, res, _next) {
  if (res.headersSent) {
    console.error('Inventory response interrupted', {
      method: req.method,
      name: error.name,
      code: error.code,
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
  console.error('Inventory request failed', {
    method: req.method,
    name: error.name,
    code: error.code,
  });
  res.status(500).json({ message: 'An unexpected server error occurred' });
}
