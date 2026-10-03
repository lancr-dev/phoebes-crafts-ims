import 'dotenv/config';
import { createHash } from 'node:crypto';
import { isValidUsername } from '../../../shared/inputValidation.mjs';

export const adminUsername = process.env.ADMIN_USERNAME;
const encodedHash = process.env.ADMIN_PASSWORD_HASH;
const hashParts = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
  encodedHash ?? '',
);

if (!isValidUsername(adminUsername) || adminUsername !== adminUsername.trim() || !hashParts) {
  throw new Error(
    'Configure ADMIN_USERNAME and a valid ADMIN_PASSWORD_HASH before starting the server',
  );
}

export const passwordSalt = Buffer.from(hashParts[1], 'hex');
export const passwordHash = Buffer.from(hashParts[2], 'hex');
export const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

// Changing either credential invalidates sessions created with the old configuration.
export const credentialVersion = createHash('sha256')
  .update(adminUsername)
  .update('\0')
  .update(encodedHash)
  .digest('hex');

export const sessionLifetimeSeconds = 8 * 60 * 60;
const production = process.env.NODE_ENV === 'production';
export const sessionCookieName = production
  ? '__Host-phoebes_admin_session'
  : 'phoebes_admin_session';
export const sessionCookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: 'strict',
  path: '/',
};

export const frontendOrigin = process.env.FRONTEND_ORIGIN || null;
if (frontendOrigin) {
  const parsedOrigin = new URL(frontendOrigin);
  if (
    parsedOrigin.origin !== frontendOrigin ||
    !['http:', 'https:'].includes(parsedOrigin.protocol) ||
    (production && parsedOrigin.protocol !== 'https:')
  ) {
    throw new Error(
      'FRONTEND_ORIGIN must be an exact HTTP origin (HTTPS in production)',
    );
  }
}
