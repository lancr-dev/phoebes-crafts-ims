import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'node:url';
import inventoryRoutes from './routes/inventoryRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { frontendOrigin } from './config/auth.js';
import { requireAdmin, requireTrustedOrigin } from './middleware/auth.js';
import rateLimiter from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();
const production = process.env.NODE_ENV === 'production';
const frontendDist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const notFound = (_req, res) => res.status(404).json({ message: 'Route not found' });

// Render terminates HTTPS and forwards requests through its proxy.
// Trust the nearest hop rather than arbitrary client-supplied forwarded entries.
if (production) app.set('trust proxy', 1);

// Handle preflight before authentication/rate limiting and include CORS on errors.
if (!production) {
  app.use(
    cors({
      origin: frontendOrigin ? [frontendOrigin] : false,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type'],
      exposedHeaders: [
        'Content-Disposition',
        'Retry-After',
        'X-RateLimit-Scope',
      ],
    }),
  );
}

app.use(express.json());

// Liveness must remain available without a session or a Redis rate-limit lookup.
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

if (!production) {
  app.get('/', (_req, res) => {
    res.status(200).json({
      message: "Phoebe's Crafts API is running...",
    });
  });
}

app.use('/api', rateLimiter);
app.use('/api', requireTrustedOrigin);
app.use('/api/auth', authRoutes);
app.use('/api/inventory', requireAdmin, inventoryRoutes);
app.use('/api', notFound);

if (production) {
  app.use(express.static(frontendDist));

  app.get('/{*splat}', (req, res, next) => {
    // Missing assets and non-HTML requests should return 404 rather than the SPA.
    if (
      !req.accepts('html') ||
      path.extname(req.path) ||
      req.params.splat?.some((segment) => segment.startsWith('.')) ||
      req.path === '/assets' ||
      req.path.startsWith('/assets/')
    ) return next();
    res.sendFile('index.html', { root: frontendDist });
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
