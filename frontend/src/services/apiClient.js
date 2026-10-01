import axios from 'axios';
import { rateLimitStore } from './rateLimitStore.js';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api'),
  withCredentials: true,
  timeout: 10000,
});

const requestScope = (config) => /\/(?:api\/)?auth\/login\/?(?:\?|$)/.test(config.url || '') ? 'login' : 'api';

apiClient.interceptors.request.use((config) => {
  if (config.signal?.aborted) throw new axios.CanceledError();
  const cooldown = rateLimitStore.getCooldown(requestScope(config));
  if (cooldown.seconds) {
    const response = {
      status: 429, statusText: 'Too Many Requests', config,
      data: { message: 'Too many requests. Please try again later.' },
      headers: { 'retry-after': String(cooldown.seconds), 'x-ratelimit-scope': cooldown.scope },
    };
    const error = new axios.AxiosError(response.data.message, 'ERR_BAD_REQUEST', config, undefined, response);
    error.isClientRateLimited = true;
    throw error;
  }
  return config;
});

apiClient.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 429 && !error.isClientRateLimited) {
    // Older servers without a scope header pause all requests conservatively.
    const scope = error.response.headers?.['x-ratelimit-scope'] === 'login' ? 'login' : 'api';
    rateLimitStore.block(scope, error.response.headers?.['retry-after']);
  }
  return Promise.reject(error);
});

export default apiClient;
