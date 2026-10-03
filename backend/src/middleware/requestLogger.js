import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import logger from '../config/logger.js';
import { requestContext } from '../utils/requestContext.js';

export default function requestLogger(req, res, next) {
  const requestId = randomUUID();
  const started = performance.now();
  const apiRequest = /^\/api(?:\/|$)/.test(req.path);
  const prefix = /^\/api\/auth(?:\/|$)/.test(req.path) ? '/api/auth'
    : /^\/api\/inventory(?:\/|$)/.test(req.path) ? '/api/inventory' : '';
  req.requestId = requestId;
  res.set('X-Request-ID', requestId);
  let recorded = false;
  const record = (aborted) => {
    if (recorded) return;
    recorded = true;
    const status = aborted ? 499 : res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : apiRequest ? 'info' : 'debug';
    logger.log(level, aborted ? 'HTTP request aborted' : 'HTTP request completed', {
      event: aborted ? 'http.request.aborted' : 'http.request.completed',
      request_id: requestId,
      method: req.method,
      // Log only server-defined route templates; never raw URLs, query strings,
      // identifiers, IP addresses, headers, or request/response bodies.
      route: typeof req.route?.path === 'string'
        ? (req.route.path.startsWith(`${prefix}/`) ? req.route.path : prefix + req.route.path) : 'unmatched',
      status_code: status,
      duration_ms: Math.round((performance.now() - started) * 100) / 100,
      authenticated: Boolean(req.admin),
      ...(res.get('X-RateLimit-Scope') ? { rate_limit_scope: res.get('X-RateLimit-Scope') } : {}),
    });
  };
  res.once('finish', () => record(false));
  res.once('close', () => { if (!res.writableFinished) record(true); });
  requestContext.run({ requestId }, next);
}
