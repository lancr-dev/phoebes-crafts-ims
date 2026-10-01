import {
  frontendOrigin,
  sessionCookieName,
  sessionCookieOptions,
} from '../config/auth.js';
import { findSession, readSessionToken } from '../services/authService.js';
import HttpError from '../utils/HttpError.js';

export const requireAdmin = async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const admin = await findSession(readSessionToken(req));
  if (!admin) {
    res.clearCookie(sessionCookieName, sessionCookieOptions);
    throw new HttpError(401, 'Please log in to access the inventory system');
  }
  req.admin = admin;
  next();
};

export const requireTrustedOrigin = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const protocol =
    process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
  const apiOrigin = `${protocol}://${req.get('host')}`;

  // Browser mutations must come from this app; clients such as Postman omit Origin.
  if (
    (origin && origin !== apiOrigin && origin !== frontendOrigin) ||
    (!origin && req.get('sec-fetch-site') === 'cross-site')
  ) {
    throw new HttpError(403, 'Requests from this origin are not allowed');
  }
  next();
};
