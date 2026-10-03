import {
  adminUsername,
  sessionCookieName,
  sessionCookieOptions,
} from '../config/auth.js';
import {
  createSession,
  readSessionToken,
  revokeSession,
  verifyCredentials,
} from '../services/authService.js';
import HttpError from '../utils/HttpError.js';
import logger from '../config/logger.js';
import { isValidUsername, isValidPassword } from '../../../shared/inputValidation.mjs';

export const login = async (req, res) => {
  const body = req.body;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !isValidUsername(body.username) ||
    !isValidPassword(body.password)
  ) {
    throw new HttpError(400, 'Provide a valid username and password');
  }

  if (!(await verifyCredentials(body.username.trim(), body.password))) {
    logger.warn('Admin sign-in rejected', { event: 'auth.login_rejected' });
    throw new HttpError(401, 'Invalid username or password');
  }

  await revokeSession(readSessionToken(req));
  const { token, expiresAt } = await createSession();
  logger.info('Admin signed in', { event: 'auth.login_succeeded' });
  res.cookie(sessionCookieName, token, {
    ...sessionCookieOptions,
    expires: new Date(expiresAt),
  });
  res
    .status(200)
    .json({
      message: 'Logged in successfully',
      admin: { username: adminUsername },
    });
};

export const logout = async (req, res) => {
  await revokeSession(readSessionToken(req));
  res.clearCookie(sessionCookieName, sessionCookieOptions);
  logger.info('Admin signed out', { event: 'auth.logout_succeeded' });
  res.status(200).json({ message: 'Logged out successfully' });
};

export const getCurrentAdmin = (req, res) => {
  res.status(200).json({ admin: req.admin });
};
