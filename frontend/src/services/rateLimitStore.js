const fallbackSeconds = { api: 60, login: 15 * 60 };

export function getRetryDeadline(value, scope, now) {
  const header = typeof value === 'string' ? value.trim() : '';
  if (/^\d+$/.test(header)) {
    const seconds = Number(header);
    const deadline = now + Math.max(1, seconds) * 1000;
    if (Number.isSafeInteger(seconds) && deadline <= 8.64e15) return deadline;
  } else if (/^[A-Za-z]{3}, /.test(header)) {
    const deadline = Date.parse(header);
    if (Number.isFinite(deadline)) return Math.max(now + 1000, deadline);
  }
  return now + fallbackSeconds[scope] * 1000;
}

export function createRateLimitStore({ now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
  const deadlines = { api: 0, login: 0 };
  const listeners = new Set();
  let snapshot = { api: 0, login: 0 };
  let timer;

  const secondsLeft = (scope) => Math.max(0, Math.ceil((deadlines[scope] - now()) / 1000));
  const update = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    const next = { api: secondsLeft('api'), login: secondsLeft('login') };
    if (next.api !== snapshot.api || next.login !== snapshot.login) {
      snapshot = next;
      for (const listener of listeners) listener();
    }
    // Recalculate from deadlines so a suspended/background tab cannot extend a cooldown.
    if (listeners.size && (next.api || next.login)) timer = schedule(update, 1000);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      update();
      return () => {
        listeners.delete(listener);
        if (!listeners.size && timer !== undefined) { cancel(timer); timer = undefined; }
      };
    },
    block(scope, retryAfter) {
      deadlines[scope] = Math.max(deadlines[scope], getRetryDeadline(retryAfter, scope, now()));
      update();
    },
    getCooldown(scope) {
      const api = secondsLeft('api');
      const login = scope === 'login' ? secondsLeft('login') : 0;
      return login > api ? { scope: 'login', seconds: login } : { scope: 'api', seconds: api };
    },
  };
}

export const rateLimitStore = createRateLimitStore();
