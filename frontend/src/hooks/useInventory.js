import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useAuth from './useAuth.js';
import { getInventoryItems } from '../services/inventoryApi.js';
import { getInventoryError } from '../utils/inventoryData.js';

export default function useInventory() {
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
        const result = await getInventoryItems(request.page, controller.signal);
        if (controller.signal.aborted) return;
        // A deletion (including one by another admin) can remove the final page.
        const lastPage = Math.max(1, result.totalPages);
        if (request.page > lastPage) {
          setRequest((current) => ({ ...current, page: lastPage }));
          return;
        }
        setData(result);
        setIsLoading(false);
        toast.dismiss('inventory-load-error');
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure.response?.status === 401) {
          expireSession();
          toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' });
          return;
        }
        const message = getInventoryError(failure, { offline: !navigator.onLine });
        setError(message);
        setIsLoading(false);
        toast.error(message, { id: 'inventory-load-error' });
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
