import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getInventoryDashboard } from '../services/inventoryApi.js';
import { getDashboardError } from '../utils/dashboardData.js';
import useAuth from './useAuth.js';

export default function useDashboard() {
  const { expireSession } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    requestRef.current = controller;
    const load = async () => {
      try {
        const result = await getInventoryDashboard(controller.signal);
        if (controller.signal.aborted) return;
        setData(result);
        setUpdatedAt(new Date());
        toast.dismiss('dashboard-error');
        if (refreshVersion > 0) toast.success('Dashboard updated.', { id: 'dashboard-refresh' });
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure.response?.status === 401) {
          expireSession();
          toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' });
          return;
        }
        const message = getDashboardError(failure, !navigator.onLine);
        setError(message);
        toast.error(message, { id: 'dashboard-error' });
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [expireSession, refreshVersion]);

  const refresh = () => {
    requestRef.current?.abort();
    setIsLoading(true);
    setError('');
    setRefreshVersion((version) => version + 1);
  };

  return { data, isLoading, error, updatedAt, refresh };
}
