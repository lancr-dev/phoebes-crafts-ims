import { useEffect, useRef, useState } from 'react';
import { PackageOpen, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import InventoryTable from '../components/InventoryTable.jsx';
import InventoryPagination from '../components/InventoryPagination.jsx';
import InventoryModal from '../components/InventoryModal.jsx';
import StockAdjustmentModal from '../components/StockAdjustmentModal.jsx';
import DeleteMaterialModal from '../components/DeleteMaterialModal.jsx';
import CategoryFilter from '../components/CategoryFilter.jsx';
import useInventory from '../hooks/useInventory.js';
import useInventoryCategories from '../hooks/useInventoryCategories.js';
import useAuth from '../hooks/useAuth.js';
import { createInventoryItem, updateInventoryItem, adjustInventoryStock, deleteInventoryItem } from '../services/inventoryApi.js';
import { getInventoryError, requiresInventoryRefresh } from '../utils/inventoryData.js';
import '../styles/inventory-page.css';

export default function InventoryPage() {
  const { data, page, category, isLoading, error, loadPage, changeCategory } = useInventory();
  const categoryData = useInventoryCategories();
  const { expireSession } = useAuth();
  const [dialog, setDialog] = useState(null);
  const [isPending, setIsPending] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [mustRefresh, setMustRefresh] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const openDialog = (type, item = null) => {
    if (pendingRef.current) return;
    setMutationError('');
    setMustRefresh(false);
    setDialog({ type, item });
  };

  const closeDialog = () => {
    if (pendingRef.current) return;
    setDialog(null);
    if (mustRefresh) {
      loadPage(dialog?.type === 'add' ? 1 : page);
      categoryData.refresh();
    }
  };

  const saveChange = async (input) => {
    if (pendingRef.current || mustRefresh || !dialog) return;
    pendingRef.current = true;
    setIsPending(true);
    setMutationError('');
    const { type, item } = dialog;
    try {
      if (type === 'add') await createInventoryItem(input);
      else if (type === 'edit') await updateInventoryItem(item._id, input);
      else if (type === 'delete') await deleteInventoryItem(item._id);
      else await adjustInventoryStock(item._id, type, input);
      if (!mountedRef.current) return;
      const messages = { add: 'Material added.', edit: 'Material updated.', delete: 'Material deleted.', increase: 'Stock increased.', decrease: 'Stock decreased.' };
      const outsideFilter = category && ['add', 'edit'].includes(type) && input.category !== category;
      toast.success(`${messages[type]}${outsideFilter ? ' Clear the category filter to see this material.' : ''}`, { id: 'inventory-change' });
      setDialog(null);
      loadPage(type === 'add' ? 1 : page);
      if (['add', 'edit', 'delete'].includes(type)) categoryData.refresh();
    } catch (failure) {
      if (!mountedRef.current) return;
      if (failure.response?.status === 401) {
        expireSession();
        toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' });
        return;
      }
      const blocked = requiresInventoryRefresh(failure);
      const message = getInventoryError(failure, { mutation: true, offline: !navigator.onLine });
      setMustRefresh(blocked);
      setMutationError(blocked ? `${message} Inventory will refresh when you close this dialog.` : message);
      toast.error(message, { id: 'inventory-change' });
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setIsPending(false);
    }
  };

  const modalProps = { onClose: closeDialog, isPending, error: mutationError, isSubmitDisabled: mustRefresh };

  return (
    <div className="inventory-page">
      <header className="inventory-heading">
        <div>
          <p className="inventory-eyebrow">Materials & supplies</p>
          <h1>Inventory</h1>
          <p className="inventory-introduction">Manage your materials, one stock change at a time.</p>
        </div>
        <div className="inventory-heading-actions">
          <button className="inventory-button" type="button" onClick={() => { loadPage(); categoryData.refresh(); }} disabled={isLoading || isPending}>
            <RefreshCw size={16} aria-hidden="true" />Refresh
          </button>
          <button className="inventory-button inventory-button-primary" type="button" onClick={() => openDialog('add')} disabled={isLoading || isPending || Boolean(error)}>
            <Plus size={18} aria-hidden="true" />Add new material
          </button>
        </div>
      </header>

      <CategoryFilter category={category} categories={categoryData.categories} isLoading={categoryData.isLoading}
        error={categoryData.error} onChange={changeCategory} onRetry={categoryData.refresh} disabled={isPending} />

      {error && <div className="inventory-page-error" role="alert"><p>{error}</p><p>Use Refresh to try again.</p></div>}

      <section className="inventory-list" aria-label="Inventory materials" aria-busy={isLoading}>
        {!data ? (
          <div className="inventory-state" role="status"><p>{isLoading ? 'Loading materials…' : 'Materials are unavailable.'}</p></div>
        ) : data.items.length === 0 ? (
          <div className="inventory-state">
            <PackageOpen size={28} aria-hidden="true" />
            <h2>{category ? 'No materials in this category.' : 'No materials yet.'}</h2>
            <p>{category ? 'Choose another category or clear the filter to see all materials.' : 'Add your first material to start tracking stock.'}</p>
          </div>
        ) : <InventoryTable items={data.items} onAction={openDialog} disabled={isPending || isLoading} />}
      </section>

      <InventoryPagination data={data} page={page} isLoading={isLoading} onPageChange={loadPage} disabled={isPending || isLoading} />

      {dialog && ['add', 'edit'].includes(dialog.type) && <InventoryModal item={dialog.item} onSave={saveChange} {...modalProps} />}
      {dialog && ['increase', 'decrease'].includes(dialog.type) && <StockAdjustmentModal item={dialog.item} direction={dialog.type} onSave={saveChange} {...modalProps} />}
      {dialog?.type === 'delete' && <DeleteMaterialModal item={dialog.item} onConfirm={() => saveChange()} {...modalProps} />}
    </div>
  );
}
