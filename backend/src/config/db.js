import mongoose from 'mongoose';
import logger from './logger.js';
import { describeError } from '../utils/logSanitization.js';

const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    logger.info('MongoDB connected', { event: 'database.connected' });
  } catch (error) {
    logger.error('MongoDB connection failed', {
      event: 'database.connection_failed',
      ...describeError(error),
    });
    throw error;
  }
};

export default connectMongoDB;
