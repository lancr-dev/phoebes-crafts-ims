import { Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import '../styles/inventory-table.css';

const statusClasses = { 'In Stock': 'inventory-status-in', 'Low Stock': 'inventory-status-low', 'Out of Stock': 'inventory-status-out' };
const numberFormat = new Intl.NumberFormat('en-PH');
const actions = [
  { type: 'increase', label: 'Increase stock', Icon: Plus },
  { type: 'decrease', label: 'Decrease stock', Icon: Minus },
  { type: 'edit', label: 'Edit material', Icon: Pencil },
  { type: 'delete', label: 'Delete material', Icon: Trash2 },
];

export default function InventoryTable({ items, onAction, disabled }) {
  return (
    <table className="inventory-table" role="table">
      <caption className="visually-hidden">Inventory materials, newest first. Stock controls change quantities.</caption>
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">Material</th>
          <th scope="col" role="columnheader">Category</th>
          <th scope="col" role="columnheader">Stock</th>
          <th scope="col" role="columnheader">Status</th>
          <th scope="col" role="columnheader">Actions</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {items.map((item) => (
          <tr key={item._id} role="row" className="inventory-row">
            <th scope="row" role="rowheader" className="inventory-material-name">{item.itemName}</th>
            <td role="cell" className="inventory-material-category"><span className="inventory-mobile-label" aria-hidden="true">Category: </span>{item.category}</td>
            <td role="cell" className="inventory-material-stock"><span className="inventory-mobile-label" aria-hidden="true">Stock: </span>{numberFormat.format(item.stock)}</td>
            <td role="cell" className="inventory-material-status"><span className={`inventory-status ${statusClasses[item.status]}`}>{item.status}</span></td>
            <td role="cell" className="inventory-material-actions">
              <div className="inventory-row-actions">
                {actions.map(({ type, label, Icon }) => (
                  <button key={type} type="button" className={`inventory-icon-button${type === 'delete' ? ' inventory-icon-danger' : ''}`}
                    disabled={disabled || (type === 'decrease' && item.stock === 0) || (type === 'increase' && item.stock === Number.MAX_SAFE_INTEGER)}
                    title={label} aria-label={`${label}: ${item.itemName}`} onClick={() => onAction(type, item)}>
                    <Icon size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
