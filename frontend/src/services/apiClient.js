import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api'),
  withCredentials: true,
  timeout: 10000,
});

export default apiClient;
