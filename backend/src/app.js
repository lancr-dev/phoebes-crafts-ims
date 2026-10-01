import express from 'express';
import cors from 'cors';
import inventoryRoutes from './routes/inventoryRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { frontendOrigin } from './config/auth.js';
import { requireAdmin, requireTrustedOrigin } from './middleware/auth.js';
import rateLimiter from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

// Handle preflight before authentication/rate limiting and include CORS on errors.
app.use(
  cors({
    origin: frontendOrigin ? [frontendOrigin] : false,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Content-Disposition', 'Retry-After'],
  }),
);
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
