import { useEffect, useRef, useState } from 'react';
import { Download, History, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import useLogs from '../hooks/useLogs.js';
import useAuth from '../hooks/useAuth.js';
import useRateLimit from '../hooks/useRateLimit.js';
import LogsTable from '../components/LogsTable.jsx';
import TableSkeleton from '../components/TableSkeleton.jsx';
import InventoryPagination from '../components/InventoryPagination.jsx';
import ClearLogsModal from '../components/ClearLogsModal.jsx';
import { clearInventoryLogs, exportInventoryLogs } from '../services/logApi.js';
import { getLogsError, LOGS_PAGE_SIZE } from '../utils/logData.js';
import '../styles/inventory-page.css';
import '../styles/inventory-table.css';
import '../styles/logs-page.css';

export default function LogsPage() {
  const { data, page, isLoading, error, loadPage } = useLogs();
  const { expireSession } = useAuth();
  const { isRateLimited } = useRateLimit();
  const [operation, setOperation] = useState('');
  const [isClearOpen, setIsClearOpen] = useState(false);
  const [clearError, setClearError] = useState('');
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const exportControllerRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; exportControllerRef.current?.abort(); };
  }, []);

  const handleFailure = (failure, action) => {
    if (failure.response?.status === 401) {
      expireSession();
      toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' });
      return;
    }
    const message = getLogsError(failure, { action, offline: !navigator.onLine });
    if (action === 'clear') setClearError(message);
    if (failure.response?.status !== 429) toast.error(message, { id: 'logs-operation' });
  };

  const downloadPdf = async () => {
    if (busyRef.current || !data?.totalLogs || isRateLimited) return;
    busyRef.current = true;
    setOperation('export');
    const controller = new AbortController();
    exportControllerRef.current = controller;
    try {
      const logs = await exportInventoryLogs(data.clearThrough, data.totalLogs, controller.signal);
      const { exportLogsPdf } = await import('../utils/exportLogsPdf.js');
      if (controller.signal.aborted) return;
      await exportLogsPdf(logs, { boundary: data.clearThrough, signal: controller.signal });
      if (mountedRef.current) toast.success('PDF report downloaded.', { id: 'logs-operation' });
    } catch (failure) {
      if (mountedRef.current && !controller.signal.aborted) handleFailure(failure, 'export');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setOperation('');
    }
  };

  const confirmClear = async () => {
    if (busyRef.current || clearError || !isClearOpen || !data?.clearThrough || isRateLimited) return;
    busyRef.current = true;
    setOperation('clear');
    try {
      const count = await clearInventoryLogs(data.clearThrough);
      if (!mountedRef.current) return;
      setIsClearOpen(false);
      toast.success(`${new Intl.NumberFormat('en-PH').format(count)} logs cleared.`, { id: 'logs-operation' });
      loadPage(1);
    } catch (failure) {
      if (mountedRef.current) handleFailure(failure, 'clear');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setOperation('');
    }
  };

  const closeClear = () => {
    if (busyRef.current) return;
    setIsClearOpen(false);
    if (clearError) loadPage(1);
  };
  const isBusy = Boolean(operation);
  const hasLogs = Boolean(data?.totalLogs);

  return (
    <div className="logs-page">
      <header className="logs-heading">
        <div>
          <p className="inventory-eyebrow">Stock movement history</p>
          <h1>Inventory logs</h1>
          <p className="inventory-introduction">Every stock change, with quantities before and after.</p>
        </div>
        <div className="logs-heading-actions">
          <button className="inventory-button" type="button" onClick={() => loadPage()} disabled={isLoading || isBusy || isRateLimited}>
            <RefreshCw size={16} aria-hidden="true" />Refresh
          </button>
          <button className="inventory-button inventory-button-primary" type="button" onClick={downloadPdf} disabled={isLoading || isBusy || isRateLimited || !hasLogs}>
            <Download size={17} aria-hidden="true" />{operation === 'export' ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <button className="inventory-button logs-clear-button" type="button" onClick={() => { setClearError(''); setIsClearOpen(true); }} disabled={isLoading || isBusy || isRateLimited || !hasLogs}>
            <Trash2 size={16} aria-hidden="true" />Clear logs
          </button>
        </div>
      </header>

      {error && <div className="inventory-page-error" role="alert"><p>{error}</p><p>Use Refresh to try again.</p></div>}
      <div className="logs-table-note">
        <p>Dates & times shown in Manila (UTC+08:00).</p>
        <p role="status">{operation === 'export' ? 'Preparing the captured history across all pages…' : 'Newest movements first'}</p>
      </div>
      <section className="logs-list" aria-label="Stock movement logs" aria-busy={isLoading}>
        {isLoading ? <TableSkeleton variant="logs" /> : !data ? <div className="inventory-state" role="status"><p>Stock movements are unavailable.</p></div>
          : data.logs.length === 0 ? <div className="inventory-state"><History size={28} aria-hidden="true" /><h2>No stock movements yet.</h2><p>Stock changes will appear here when materials are added or quantities change.</p></div>
            : <LogsTable logs={data.logs} />}
      </section>
      <InventoryPagination data={data ? { ...data, totalItems: data.totalLogs } : null} page={page} isLoading={isLoading}
        onPageChange={loadPage} disabled={isLoading || isBusy || isRateLimited} label="Logs" noun="logs" pageSize={LOGS_PAGE_SIZE} />
      {isClearOpen && <ClearLogsModal totalLogs={data.totalLogs} onClose={closeClear} onConfirm={confirmClear} isPending={operation === 'clear'} error={clearError} isSubmitDisabled={isRateLimited} />}
    </div>
  );
}
