import TableSkeleton from './TableSkeleton.jsx';
import '../styles/recent-inventory.css';

const statusClasses = {
  'In Stock': 'material-status-in',
  'Low Stock': 'material-status-low',
  'Out of Stock': 'material-status-out',
};

export default function RecentInventory({ materials, isLoading, isUnavailable }) {
  return (
    <section className="recent-inventory" aria-labelledby="recent-inventory-title" aria-busy={isLoading}>
      <header className="recent-inventory-header">
        <div>
          <h2 id="recent-inventory-title">Recently added materials</h2>
          <p>The latest materials added to your inventory.</p>
        </div>
        {materials?.length > 0 && <span className="recent-inventory-count">{materials.length} most recent</span>}
      </header>
      {!materials && isLoading ? <TableSkeleton variant="recent" /> : !materials ? (
        <div className="recent-inventory-state" role="status">
          <p>Recent materials are unavailable.</p>
        </div>
      ) : materials.length === 0 ? (
        <div className="recent-inventory-state">
          <h3>No materials yet.</h3>
          <p>Materials will appear here when they’re added to inventory.</p>
        </div>
      ) : (
        // Explicit roles retain table semantics when rows stack on mobile.
        <table className="recent-inventory-table" role="table">
          <caption className="visually-hidden">Recently added inventory materials, newest first</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Material</th>
              <th scope="col" role="columnheader">Category</th>
              <th scope="col" role="columnheader" className="recent-stock-heading">Stock</th>
              <th scope="col" role="columnheader">Status</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {materials.map((item) => (
              <tr key={item._id} className="recent-inventory-row" role="row">
                <th scope="row" role="rowheader" className="recent-material-name">{item.itemName}</th>
                <td role="cell" className="recent-material-category">{item.category}</td>
                <td role="cell" className="recent-material-stock">
                  <span className="recent-mobile-label" aria-hidden="true">Stock: </span>
                  {new Intl.NumberFormat('en-PH').format(item.stock)}
                </td>
                <td role="cell" className="recent-material-status">
                  <span className={`material-status ${statusClasses[item.status]}`}>{item.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isUnavailable && materials && <p className="recent-inventory-stale-note">Showing the last loaded materials.</p>}
    </section>
  );
}
