import express from 'express';
import {
  login,
  logout,
  getCurrentAdmin,
} from '../controllers/authController.js';
import { requireAdmin } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.post('/login', loginRateLimiter, login);
router.post('/logout', logout);
router.get('/me', requireAdmin, getCurrentAdmin);

export default router;
