import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useAuth from './useAuth.js';
import { getInventoryLogs } from '../services/logApi.js';
import { getLogsError } from '../utils/logData.js';

export default function useLogs() {
  const { expireSession } = useAuth();
  const [request, setRequest] = useState({ page: 1, version: 0 });
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const controllerRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        const result = await getInventoryLogs(request.page, controller.signal);
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, result.totalPages);
        if (request.page > lastPage) { setRequest((current) => ({ ...current, page: lastPage })); return; }
        setData(result);
        setIsLoading(false);
        toast.dismiss('logs-load-error');
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure.response?.status === 401) {
          expireSession();
          toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' });
          return;
        }
        const message = getLogsError(failure, { offline: !navigator.onLine });
        setError(message);
        setIsLoading(false);
        toast.error(message, { id: 'logs-load-error' });
      }
    };
    load();
    return () => controller.abort();
  }, [expireSession, request]);

  const loadPage = (page = request.page) => {
    controllerRef.current?.abort();
    setIsLoading(true);
    setError('');
    setData(null);
    setRequest((current) => ({ page, version: current.version + 1 }));
  };
  return { data, page: request.page, isLoading, error, loadPage };
}
