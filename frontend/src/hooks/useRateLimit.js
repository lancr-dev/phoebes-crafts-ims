import { useSyncExternalStore } from 'react';
import { rateLimitStore } from '../services/rateLimitStore.js';

export default function useRateLimit(scope = 'api') {
  const snapshot = useSyncExternalStore(rateLimitStore.subscribe, rateLimitStore.getSnapshot, rateLimitStore.getSnapshot);
  const isLogin = scope === 'login' && snapshot.login > snapshot.api;
  const seconds = isLogin ? snapshot.login : snapshot.api;
  return { seconds, scope: isLogin ? 'login' : 'api', isRateLimited: seconds > 0 };
}
