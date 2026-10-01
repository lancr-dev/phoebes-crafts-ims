import Skeleton from './Skeleton.jsx';
import '../styles/recent-inventory.css';
import '../styles/inventory-table.css';
import '../styles/logs-table.css';

const tables = {
  recent: {
    tableClass: 'recent-inventory-table', rowClass: 'recent-inventory-row', label: 'Loading recent materials…', rowCount: 5,
    columns: [
      { label: 'Material', className: 'recent-material-name', shape: 'skeleton-line-long' },
      { label: 'Category', className: 'recent-material-category', shape: 'skeleton-line-short' },
      { label: 'Stock', className: 'recent-material-stock', headingClass: 'recent-stock-heading', shape: 'skeleton-number' },
      { label: 'Status', className: 'recent-material-status', shape: 'skeleton-badge' },
    ],
  },
  inventory: {
    tableClass: 'inventory-table', rowClass: 'inventory-row', label: 'Loading materials…',
    columns: [
      { label: 'Material', className: 'inventory-material-name', shape: 'skeleton-line-long' },
      { label: 'Category', className: 'inventory-material-category', shape: 'skeleton-line-short' },
      { label: 'Stock', className: 'inventory-material-stock', shape: 'skeleton-number' },
      { label: 'Status', className: 'inventory-material-status', shape: 'skeleton-badge' },
      { label: 'Actions', className: 'inventory-material-actions', actions: true },
    ],
  },
  logs: {
    tableClass: 'logs-table', rowClass: 'logs-row', label: 'Loading stock movements…',
    columns: [
      { label: 'Date & time', className: 'logs-timestamp', timestamp: true },
      { label: 'Material name', className: 'logs-material-name', shape: 'skeleton-line-long' },
      { label: 'Action', className: 'logs-action', shape: 'skeleton-badge' },
      { label: 'Quantity', className: 'logs-quantity', shape: 'skeleton-number', mobileLabel: true },
      { label: 'Before', className: 'logs-before', shape: 'skeleton-number', mobileLabel: true },
      { label: 'After', className: 'logs-after', shape: 'skeleton-number', mobileLabel: true },
    ],
  },
};

export default function TableSkeleton({ variant = 'inventory' }) {
  const { tableClass, rowClass, label, columns, rowCount = 6 } = tables[variant];
  return (
    <>
      <p className="visually-hidden" role="status">{label}</p>
      <table className={`${tableClass} skeleton-table`} aria-hidden="true">
        <thead>
          <tr>{columns.map((column) => <th key={column.label} scope="col" className={column.headingClass}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, row) => (
            <tr className={rowClass} key={row}>
              {columns.map((column) => (
                <td key={column.label} className={column.className}>
                  {column.mobileLabel && <span className="logs-mobile-label"><Skeleton className="skeleton-mobile-label" /></span>}
                  {column.actions ? (
                    <div className="inventory-row-actions">
                      {Array.from({ length: 4 }, (_, action) => <Skeleton key={action} className="skeleton-control" />)}
                    </div>
                  ) : column.timestamp ? (
                    <div className="skeleton-timestamp"><Skeleton className="skeleton-line-long" /><Skeleton className="skeleton-line-short" /></div>
                  ) : <Skeleton className={column.shape} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
