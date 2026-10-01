import { RefreshCw } from 'lucide-react';
import DashboardCards from '../components/DashboardCards.jsx';
import RecentInventory from '../components/RecentInventory.jsx';
import useDashboard from '../hooks/useDashboard.js';
import useRateLimit from '../hooks/useRateLimit.js';
import '../styles/dashboard-page.css';

const DashboardPage = () => {
  const { data, isLoading, error, updatedAt, refresh } = useDashboard();
  const { isRateLimited } = useRateLimit();
  const updatedTime = updatedAt && new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(updatedAt);

  return (
    <div className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <p className="dashboard-eyebrow">Inventory overview</p>
          <h1>Dashboard</h1>
          <p className="dashboard-introduction">A clear view of your materials and stock.</p>
        </div>
        <div className="dashboard-refresh-controls">
          <button className="dashboard-refresh" type="button" onClick={refresh} disabled={isLoading || isRateLimited}>
            <RefreshCw size={16} aria-hidden="true" />
            {isLoading ? 'Updating…' : 'Refresh'}
          </button>
          <p className="dashboard-update-time" role="status">
            {isLoading ? (data ? 'Refreshing your inventory…' : 'Loading your inventory…') : updatedTime ? `Updated ${updatedTime} · Manila` : 'Not updated yet'}
          </p>
        </div>
      </header>

      {error && (
        <div className="dashboard-error" role="alert">
          <p>{error}</p>
          {data && <p className="dashboard-error-detail">Showing the last loaded values. Use Refresh to try again.</p>}
        </div>
      )}

      <DashboardCards summary={data?.summary} isLoading={isLoading} />
      <RecentInventory materials={data?.recentMaterials} isLoading={isLoading} isUnavailable={Boolean(error)} />
    </div>
  );
};

export default DashboardPage;
