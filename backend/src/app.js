import express from 'express';
import inventoryRoutes from './routes/inventoryRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { requireAdmin, requireTrustedOrigin } from './middleware/auth.js';
import rateLimiter from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).json({
    message: "Phoebe's Crafts API is running...",
  });
});

app.use('/api', rateLimiter);
app.use('/api', requireTrustedOrigin);
app.use('/api/auth', authRoutes);
app.use('/api/inventory', requireAdmin, inventoryRoutes);
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

export default app;
