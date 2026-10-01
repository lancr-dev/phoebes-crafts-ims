import { History, LayoutDashboard, LogOut, Package } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import '../styles/sidebar.css';

const Sidebar = ({ onSignOut, isSigningOut }) => {
  return (
    <aside className="app-sidebar" aria-label="Workspace">
      <Link className="sidebar-brand" to="/dashboard" aria-label="Phoebe's Crafts dashboard">
        <span className="sidebar-monogram" aria-hidden="true">p.</span>
        <span>
          <span className="sidebar-brand-name">Phoebe’s Crafts</span>
          <span className="sidebar-brand-label">Inventory management</span>
        </span>
      </Link>
      <nav className="sidebar-navigation" aria-label="Main navigation">
        <NavLink to="/dashboard" end className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`}>
          <LayoutDashboard size={19} aria-hidden="true" />
          Dashboard
        </NavLink>
        <NavLink to="/inventory" className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`}>
          <Package size={19} aria-hidden="true" />
          Inventory
        </NavLink>
        <NavLink to="/logs" className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`}>
          <History size={19} aria-hidden="true" />
          Inventory logs
        </NavLink>
      </nav>
      <button className="sidebar-sign-out" type="button" onClick={onSignOut} disabled={isSigningOut}>
        <LogOut size={18} aria-hidden="true" />
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </button>
    </aside>
  );
};

export default Sidebar;
