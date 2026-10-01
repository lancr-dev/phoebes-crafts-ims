import { Redis } from '@upstash/redis';
import 'dotenv/config';

if (
  !process.env.UPSTASH_REDIS_REST_URL ||
  !process.env.UPSTASH_REDIS_REST_TOKEN
) {
  throw new Error(
    'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN before starting the server',
  );
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  retry: { retries: 1 },
  signal: () => AbortSignal.timeout(5000),
});

export default redis;
