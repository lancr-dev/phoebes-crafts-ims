import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import redis from '../config/upstash.js';
import {
  adminUsername,
  credentialVersion,
  passwordHash,
  passwordSalt,
  scryptOptions,
  sessionCookieName,
  sessionLifetimeSeconds,
} from '../config/auth.js';
import HttpError from '../utils/HttpError.js';
import logger from '../config/logger.js';
import { describeError } from '../utils/logSanitization.js';

const deriveKey = promisify(scrypt);
const sessionKey = (token) => `phoebes:session:${createHash('sha256').update(token).digest('hex')}`;

export const readSessionToken = (req) => {
  const matches = (req.headers.cookie ?? '').split(';')
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${sessionCookieName}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(sessionCookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
};

const sessionStorage = async (operation) => {
  try {
    return await operation();
  } catch (error) {
    logger.error('Session storage unavailable', { event: 'auth.storage_unavailable', ...describeError(error) });
    throw new HttpError(503, 'Authentication is temporarily unavailable');
  }
};

export const verifyCredentials = async (username, password) => {
  // Always derive the password, including for an incorrect username.
  const candidate = await deriveKey(password, passwordSalt, passwordHash.length, scryptOptions);
  const passwordMatches = timingSafeEqual(candidate, passwordHash);
  return passwordMatches && username === adminUsername;
};

export const createSession = async () => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
  await sessionStorage(async () => {
    const result = await redis.set(sessionKey(token), { credentialVersion, expiresAt }, {
      ex: sessionLifetimeSeconds,
    });
    if (result !== 'OK') throw new Error('Session was not saved');
  });
  return { token, expiresAt };
};

export const findSession = async (token) => {
  if (!token) return null;
  const session = await sessionStorage(() => redis.get(sessionKey(token)));
  if (!session || session.credentialVersion !== credentialVersion
    || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= Date.now()) {
    return null;
  }
  return { username: adminUsername };
};

export const revokeSession = async (token) => {
  if (token) await sessionStorage(() => redis.del(sessionKey(token)));
};
