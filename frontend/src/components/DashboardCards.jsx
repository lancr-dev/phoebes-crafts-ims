import Skeleton from './Skeleton.jsx';
import '../styles/dashboard-card.css';

const metrics = [
  { key: 'totalMaterials', label: 'Total materials', description: 'Distinct materials', className: 'dashboard-stat-total' },
  { key: 'inStockMaterials', label: 'In stock', description: 'Ready to use', className: 'dashboard-stat-in' },
  { key: 'lowStockMaterials', label: 'Low stock', description: 'Running low', className: 'dashboard-stat-low' },
  { key: 'outOfStockMaterials', label: 'Out of stock', description: 'Needs restocking', className: 'dashboard-stat-out' },
];

const DashboardCards = ({ summary, isLoading }) => {
  return (
    <dl className="dashboard-stats" aria-label="Material totals" aria-busy={isLoading}>
      {metrics.map(({ key, label, description, className }) => (
        <div className={`dashboard-stat ${className}`} key={key}>
          <dt className="dashboard-stat-label">{label}</dt>
          <dd className="dashboard-stat-value">
            {summary ? new Intl.NumberFormat('en-PH').format(summary[key]) : isLoading ? (
              <><Skeleton className="skeleton-stat" /><span className="visually-hidden">Loading</span></>
            ) : (
              <><span aria-hidden="true">—</span><span className="visually-hidden">Unavailable</span></>
            )}
          </dd>
          <dd className="dashboard-stat-description">{description}</dd>
        </div>
      ))}
    </dl>
  );
};

export default DashboardCards;
