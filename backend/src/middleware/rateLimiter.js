import redis from '../config/upstash.js';
import HttpError from '../utils/HttpError.js';
import logger from '../config/logger.js';
import { describeError } from '../utils/logSanitization.js';

// Increment and expiry must happen together so a failed request cannot leave a permanent counter.
const counterScript = `
  local requests = redis.call('INCR', KEYS[1])
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return {requests, ttl}
`;

const createRateLimiter = ({ prefix, windowSeconds, maxRequests }) => async (req, res, next) => {
  let counter;
  try {
    counter = await redis.eval(counterScript, [`phoebes:rate-limit:${prefix}:${req.ip}`], [windowSeconds]);
    if (!Array.isArray(counter) || !Number.isSafeInteger(counter[0]) || !Number.isSafeInteger(counter[1])) {
      throw new Error('Invalid rate limit counter');
    }
  } catch (error) {
    logger.error('Rate limiting unavailable', { event: 'rate_limit.unavailable', ...describeError(error) });
    throw new HttpError(503, 'The service is temporarily unavailable. Please try again later.');
  }

  const [requests, ttl] = counter;
  if (requests > maxRequests) {
    res.set('Retry-After', String(Math.max(ttl, 1)));
    res.set('X-RateLimit-Scope', prefix);
    res.set('Cache-Control', 'no-store');
    return res.status(429).json({
      message: 'Too many requests. Please try again later.',
    });
  }
  next();
};

export const loginRateLimiter = createRateLimiter({ prefix: 'login', windowSeconds: 15 * 60, maxRequests: 5 });
const rateLimiter = createRateLimiter({ prefix: 'api', windowSeconds: 60, maxRequests: 100 });

export default rateLimiter;
