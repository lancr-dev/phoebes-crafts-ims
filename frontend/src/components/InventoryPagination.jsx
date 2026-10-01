import { ChevronLeft, ChevronRight } from 'lucide-react';
import { INVENTORY_PAGE_SIZE } from '../utils/inventoryData.js';

export default function InventoryPagination({ data, page, isLoading, onPageChange, disabled }) {
  const totalPages = Math.max(1, data?.totalPages ?? page);
  const first = data?.totalItems ? (page - 1) * INVENTORY_PAGE_SIZE + 1 : 0;
  const last = data ? Math.min(page * INVENTORY_PAGE_SIZE, data.totalItems) : 0;
  const format = new Intl.NumberFormat('en-PH');

  return (
    <nav className="inventory-pagination" aria-label="Inventory pagination">
      <p className="inventory-page-summary" role="status">
        {isLoading ? `Loading page ${page}…` : data ? `Showing ${format.format(first)}–${format.format(last)} of ${format.format(data.totalItems)} materials` : 'Inventory unavailable'}
        <span>20 per page</span>
      </p>
      <div className="inventory-page-controls">
        <button type="button" className="inventory-button" disabled={disabled || !data || page <= 1}
          onClick={() => onPageChange(page - 1)} aria-label="Previous inventory page">
          <ChevronLeft size={16} aria-hidden="true" /><span>Previous</span>
        </button>
        <span className="inventory-page-number">Page {page}{data && ` of ${totalPages}`}</span>
        <button type="button" className="inventory-button" disabled={disabled || !data || page >= totalPages}
          onClick={() => onPageChange(page + 1)} aria-label="Next inventory page">
          <span>Next</span><ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
