import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useAuth from './useAuth.js';
import { getInventoryCategories } from '../services/inventoryApi.js';

export default function useInventoryCategories() {
  const { expireSession } = useAuth();
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const controllerRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        const result = await getInventoryCategories(controller.signal);
        if (controller.signal.aborted) return;
        setCategories(result);
        toast.dismiss('inventory-categories-error');
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure.response?.status === 401) {
          expireSession();
          toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' });
          return;
        }
        const message = 'Could not load categories. Try again.';
        setError(message);
        toast.error(message, { id: 'inventory-categories-error' });
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [expireSession, version]);

  const refresh = () => {
    controllerRef.current?.abort();
    setIsLoading(true);
    setError('');
    setVersion((current) => current + 1);
  };

  return { categories, isLoading, error, refresh };
}
