import redis from '../config/upstash.js';

const WINDOW_SIZE_IN_SECONDS = 60;
const MAX_REQUESTS = 100;

const rateLimiter = async (req, res, next) => {
  try {
    const ip = req.ip;

    const redisKey = `rate-limit:${ip}`;

    const requests = await redis.incr(redisKey);

    if (requests === 1) {
      await redis.expire(redisKey, WINDOW_SIZE_IN_SECONDS);
    }

    if (requests > MAX_REQUESTS) {
      return res.status(429).json({
        message: 'Too many requests. Please try again later.',
      });
    }

    next();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Server Error',
    });
  }
};

export default rateLimiter;
