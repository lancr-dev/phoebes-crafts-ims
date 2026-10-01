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

export const login = async (req, res) => {
  const body = req.body;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof body.username !== 'string' ||
    !body.username.trim() ||
    body.username.length > 100 ||
    typeof body.password !== 'string' ||
    !body.password ||
    Buffer.byteLength(body.password, 'utf8') > 1024
  ) {
    throw new HttpError(400, 'Provide a valid username and password');
  }

  if (!(await verifyCredentials(body.username.trim(), body.password))) {
    throw new HttpError(401, 'Invalid username or password');
  }

  await revokeSession(readSessionToken(req));
  const { token, expiresAt } = await createSession();
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
  res.status(200).json({ message: 'Logged out successfully' });
};

export const getCurrentAdmin = (req, res) => {
  res.status(200).json({ admin: req.admin });
};
