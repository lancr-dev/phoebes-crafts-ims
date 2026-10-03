const sensitiveKey = /password|token|secret|authorization|cookie|session|username|email|headers|body|query|stack|connection|string_uri|mongo.*uri|redis.*url/i;

export const describeError = (error) => {
  const configurationErrors = {
    'Configure ADMIN_USERNAME and a valid ADMIN_PASSWORD_HASH before starting the server': 'admin_credentials_invalid',
    'FRONTEND_ORIGIN must be an exact HTTP origin (HTTPS in production)': 'frontend_origin_invalid',
    'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN before starting the server': 'redis_configuration_missing',
  };
  // Preserve application file/line locations without raw error messages,
  // absolute filesystem paths, or stack frames from external dependencies.
  const frames = typeof error?.stack === 'string'
    ? [...error.stack.matchAll(/backend[\\/](src[\\/][A-Za-z0-9_./\\-]+:\d+:\d+)/g)]
      .slice(0, 8).map((match) => match[1].replaceAll('\\', '/')) : [];
  return {
    error_type: typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
      ? error.name : 'Error',
    ...(Number.isSafeInteger(error?.code) ||
      (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code))
      ? { error_code: error.code } : {}),
    ...(Object.hasOwn(configurationErrors, error?.message ?? '') ? { error_reason: configurationErrors[error.message] } : {}),
    ...(frames.length ? { error_frames: frames } : {}),
  };
};

export const createLogSanitizer = (env) => {
  const secrets = Object.entries(env)
    .filter(([key, value]) => /password|token|secret|username|mongo.*uri|redis.*url/i.test(key) && typeof value === 'string' && value.length >= 3)
    .flatMap(([, value]) => [value, value.trim()]).filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);

  const cleanString = (input) => {
    let value = input;
    for (const secret of secrets) value = value.split(secret).join('[REDACTED]');
    return value
      .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, '[REDACTED]')
      .replace(/https?:\/\/[^\s/@]+@[^\s"']+/gi, '[REDACTED]')
      .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
      .replace(/scrypt\$[^\s"']+/g, '[REDACTED]')
      .replace(/\b(password|token|secret|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
      .slice(0, 1024);
  };

  const sanitize = (value, depth = 0, visited = new WeakSet()) => {
    if (typeof value === 'string') return cleanString(value);
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value instanceof Error) return describeError(value);
    if (typeof value !== 'object') return undefined;
    if (depth >= 5) return '[OMITTED]';
    if (visited.has(value)) return '[CIRCULAR]';
    visited.add(value);
    const result = Array.isArray(value)
      ? value.slice(0, 20).map((entry) => sanitize(entry, depth + 1, visited))
      : Object.fromEntries(Object.entries(value).slice(0, 40)
        .filter(([key]) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key))
        .map(([key, entry]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : sanitize(entry, depth + 1, visited)]));
    visited.delete(value);
    return result;
  };
  return sanitize;
};
