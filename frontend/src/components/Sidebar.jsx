import { History, LayoutDashboard, LogOut, Package, X } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import BrandLogo from './BrandLogo.jsx';
import RateLimitNotice from './RateLimitNotice.jsx';
import '../styles/sidebar.css';

const Sidebar = ({ onSignOut, isSigningOut, isSignOutDisabled, signOutError, isMobile = false, onClose, onNavigate }) => {
  return (
    <aside className="app-sidebar" aria-label="Workspace">
      <div className="sidebar-header">
        <Link className="sidebar-brand" to="/dashboard" aria-label="Phoebe's Crafts dashboard" onClick={onNavigate}>
          <BrandLogo className="sidebar-logo" />
          <span>
            <span className="sidebar-brand-name">Phoebe’s Crafts</span>
            <span className="sidebar-brand-label">Inventory management</span>
          </span>
        </Link>
        {isMobile && <button className="sidebar-close-button" type="button" onClick={onClose} aria-label="Close navigation menu"><X size={20} aria-hidden="true" /></button>}
      </div>
      {isMobile && <RateLimitNotice />}
      <nav className="sidebar-navigation" aria-label="Main navigation">
        <NavLink to="/dashboard" end onClick={onNavigate} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`}>
          <LayoutDashboard size={19} aria-hidden="true" />
          Dashboard
        </NavLink>
        <NavLink to="/inventory" onClick={onNavigate} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`}>
          <Package size={19} aria-hidden="true" />
          Inventory
        </NavLink>
        <NavLink to="/logs" onClick={onNavigate} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`}>
          <History size={19} aria-hidden="true" />
          Inventory logs
        </NavLink>
      </nav>
      <div className="sidebar-account-actions">
        {signOutError && <p className="sidebar-sign-out-error" role="alert">{signOutError}</p>}
        <button className="sidebar-sign-out" type="button" onClick={onSignOut} disabled={isSigningOut || isSignOutDisabled}>
          <LogOut size={18} aria-hidden="true" />
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
