export const getAuthError = (error, { action = 'sign in', offline = false } = {}) => {
  if (offline) return "You're offline. Reconnect and try again.";
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return 'The request took too long. Please try again.';
  }
  if (error.response?.status === 429) {
    const seconds = Number(error.response.headers?.['retry-after']);
    if (Number.isFinite(seconds) && seconds > 0) {
      const minutes = Math.ceil(seconds / 60);
      return `Too many requests. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    }
    return 'Too many requests. Please wait before trying again.';
  }
  if (error.response?.status === 401) return 'The username or password is incorrect.';
  if (error.response?.status === 403) {
    return 'Access from this address is unavailable. Please contact your administrator.';
  }
  if (error.response?.status === 503) {
    return 'Sign-in is temporarily unavailable. Please try again shortly.';
  }
  if (error.code === 'ERR_NETWORK') {
    return "Can't reach the server. Check your connection and try again.";
  }
  return `Couldn't ${action}. Please try again.`;
};
