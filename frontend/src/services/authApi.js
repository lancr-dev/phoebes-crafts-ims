import apiClient from './apiClient.js';

const readAdmin = (data) => {
  if (typeof data?.admin?.username !== 'string' || !data.admin.username.trim()) {
    throw new Error('Invalid authentication response');
  }
  return { username: data.admin.username };
};

export const getCurrentAdmin = async (signal) => {
  const { data } = await apiClient.get('/auth/me', { signal });
  return readAdmin(data);
};

export const loginAdmin = async (credentials) => {
  const { data } = await apiClient.post('/auth/login', credentials);
  return readAdmin(data);
};

export const logoutAdmin = () => apiClient.post('/auth/logout');
